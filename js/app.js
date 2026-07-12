// ============================================================
// app.js — Morning Circuit · Main orchestrator  v0.4.1
// ============================================================

import { loadState, saveState, getDefaultState, clearState, importStateJSON } from './storage.js';
import { loadAllData } from './data.js';
import { unlockAudio, playSessionComplete, playMeditation, stopMeditation, playTimerComplete, playButtonClick } from './audio.js';
import { initCycleFromLaunchDate, startNewCycle, isCycleExpired, updateCycleAfterSession, getCycleProgressionSuggestions } from './cycles.js';
import { getEliReadiness } from './reports.js';
import { getEliSuggestion, getChristinaSuggestion, getMissedDays } from './rotation.js';
import { adaptChristinaExercises, adaptWorkoutToCapacity, annotateSymptomConflicts } from './adaptation.js';
import { analyzePairedConflicts, getConflictingItems } from './equipment.js';
import { buildExercisePlan, createSession, logSet, skipExercise,
         completeSession, abandonSession, getTemplateAnchors,
         adjustWeight, weightLabel, adjustReps, repsLabel, swapExercise } from './workout.js';
import { startTimer, stopTimer, pauseTimer, resumeTimer, isTimerPaused, skipTimer } from './timer.js';
import { exportFullBackupJSON, exportMonthCSV, exportMonthMarkdown, exportCycleMarkdown } from './exports.js';
import { today, showToast, formatTime, addDays, getTomorrowDate, safeSpotifyUrl } from './utils.js';
import { DEFAULT_REST_SECONDS, ELI_HEAVY_SEQUENCE, CHRISTINA_SEQUENCE } from './config.js';

import {
  renderFirstLaunch, renderHello, renderMissedDays, renderLogToday, renderSymptomCheck,
  renderRoutineSuggestion, renderWarmup, renderWorkoutRunner, renderRestOverlay, updateRestOverlayDOM,
  renderEndCheckin, renderMeditation, renderSessionSummary, renderReports,
  initReportCharts, renderSettings, renderCycleReview, initCycleReviewCards
} from './screens.js';

// ============================================================
// Global App object
// ============================================================
window.App = {
  state:          null,
  data:           null,
  ui: {
    currentScreen:          null,
    selectedUsers:          [],
    christinaSymptoms:      null,
    symptomsByUser:         {},
    pendingSymptomUsers:    [],
    activeSymptomUser:      null,
    capacityChoiceByUser:   {},
    eliSuggestion:          null,
    christinaSuggestion:    null,
    selectedEliRoutine:     null,
    selectedChristinaRoutine: null,
    eliAnchors:             [],
    conflicts:              [],
    eliCheckin:             null,
    christinaCheckin:       null,
    meditationChoice:       null,
    missedDayChoices:       {},
    calYear:                null,
    calMonth:               null,
    lastSessionSummary:     null,  // snapshot for session_summary screen
    backupNudgeDismissed:   false  // session-only; "Later" returns next app load
  },
  workoutState:   null,
  currentSession: null
};

const App = window.App;

// ============================================================
// Bootstrap
// ============================================================
// ---- Button tap sound ----------------------------------------
// One central listener rather than wiring sound into every button
// individually. Registered once below, outside setupListeners()
// (which re-runs on every screen render and would otherwise
// duplicate this listener on every navigation).
function shouldPlayButtonClick(target) {
  const btn = target.closest('button');
  if (!btn) return false;
  if (btn.disabled) return false;
  if (btn.dataset.noClickSound === 'true') return false;
  if (btn.closest('[data-no-click-sound="true"]')) return false;

  // Workout runner stays silent in Spotify mode — button taps during
  // active workout flow shouldn't compete with the user's music.
  const settings = App.state?.settings ?? {};
  if (App.ui?.currentScreen === 'workout_runner' && settings.musicMode === 'spotify') {
    return false;
  }

  return true;
}

document.addEventListener('click', (e) => {
  if (!shouldPlayButtonClick(e.target)) return;
  playButtonClick(App.state?.settings?.audioEnabled ?? true);
}, true);

window.addEventListener('morning-circuit:save-error', () => {
  showToast('Changes could not be saved. Check browser storage permissions or available space.', 'error', 6000);
});

// Apply the saved appearance theme by setting <html data-theme>. Night is the
// default, so we only need the attribute set for day (kept explicit for clarity).
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'day' ? 'day' : 'night');
}

async function init() {
  try {
    App.data  = await loadAllData();
    App.state = loadState() ?? getDefaultState();
    applyTheme(App.state.settings.theme ?? 'night');

    const now = new Date();
    App.ui.calYear  = now.getFullYear();
    App.ui.calMonth = now.getMonth();

    if (!App.state.settings.launchDate) {
      navigate('first_launch');
    } else {
      if (App.state.cycleState?.endDate && isCycleExpired(App.state.cycleState)) {
        // Cycle has ended — show the review screen instead of rolling over
        // silently. The actual rollover happens when the user taps
        // "Start New Cycle" on that screen.
        navigate('cycle_review');
      } else {
        navigate('hello');
      }
    }
  } catch (err) {
    console.error('[app] Init failed:', err);
    document.getElementById('app').innerHTML = `
      <div style="padding:32px;color:#ef4444;font-family:sans-serif;">
        <h2>Failed to load</h2>
        <p style="margin-top:8px;color:#94a3b8;">
          Make sure you're running the local server: double-click <code>start-app.command</code> (serves on port 8001).
        </p>
        <pre style="margin-top:16px;font-size:0.8rem;color:#94a3b8;">${err.message}</pre>
      </div>
    `;
  }
}

// ============================================================
// Navigation
// ============================================================
function navigate(screen) {
  App.ui.currentScreen = screen;
  const appEl = document.getElementById('app');
  let html = '';

  switch (screen) {

    case 'first_launch':
      html = renderFirstLaunch(App);
      break;

    case 'log_today':
      html = renderLogToday(App);
      break;

    case 'hello':
      html = renderHello(App.state, App.ui.backupNudgeDismissed);
      break;

    case 'missed_days': {
      const users  = App.ui.selectedUsers;
      const missed = getMissedDays(
        App.state.sessions, App.state.missedDays,
        App.state.settings.launchDate, users
      );
      App.ui.pendingMissedDates = missed;
      App.ui.missedDayChoices   = {};
      const rendered = renderMissedDays(missed);
      if (!rendered) { afterMissedDays(); return; }
      html = rendered;
      break;
    }

    case 'symptom_check':
      html = renderSymptomCheck(App, App.ui.activeSymptomUser ?? 'christina');
      break;

    case 'routine_suggestion': {
      const users    = App.ui.selectedUsers;
      const cycleNum = App.state.cycleState?.cycleNumber ?? 1;

      if (!App.ui.routineSuggestionBuilt) {
        let eliPlan = [], cPlan = [];

        if (users.includes('eli')) {
          const style = 'progressive';
          if (style === 'progressive') {
            App.ui.eliSuggestion = getEliSuggestion(App.state.cycleState, App.state.sessions, App.state.missedDays);
          } else {
            const proxy = { ...App.state.cycleState, christinaSequencePointer: App.state.cycleState.eliSequencePointer };
            const adaptive = getChristinaSuggestion(proxy, App.ui.symptomsByUser.eli);
            const trackingId = ELI_HEAVY_SEQUENCE[App.state.cycleState.eliSequencePointer % ELI_HEAVY_SEQUENCE.length];
            App.ui.eliSuggestion = {
              primary: { ...adaptive.primary, id: trackingId,
                templateId: adaptive.primary.templateId ?? adaptive.primary.id,
                type: 'heavy_weight' },
              alternatives: adaptive.alternatives,
              heavyBlocked: adaptive.heavyBlocked,
              heavyBlockedReason: adaptive.heavyBlockedReason
            };
          }
          App.ui.selectedEliRoutine = {
            id:    App.ui.eliSuggestion.primary.id,
            templateId: App.ui.eliSuggestion.primary.templateId,
            type:  App.ui.eliSuggestion.primary.type,
            label: App.ui.eliSuggestion.primary.label
          };
          if (App.ui.selectedEliRoutine.id !== 'skip_rest') {
            const tmpl = App.data.routineTemplates.find(t => t.id === (App.ui.selectedEliRoutine.templateId ?? App.ui.selectedEliRoutine.id));
            if (tmpl) {
              eliPlan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('eli')).length, cycleNum,
                App.state.cycleState?.eliExerciseWeights ?? {},
                App.state.cycleState?.eliExerciseRepsTarget ?? {},
                App.state.settings.profiles.eli,
                App.state.settings.unavailableEquipmentIds);
              if (style === 'pain_adaptive') {
                eliPlan = adaptChristinaExercises(eliPlan, App.ui.symptomsByUser.eli);
                eliPlan = annotateSymptomConflicts(eliPlan, App.ui.symptomsByUser.eli);
              }
              const adjustment = adaptWorkoutToCapacity(eliPlan, App.ui.symptomsByUser.eli, App.state.settings.profiles.eli);
              App.ui.eliOriginalPlan = eliPlan;
              App.ui.eliCapacityAdjustment = adjustment;
              App.ui.eliRecommendedPlan = adjustment.plan;
              eliPlan = adjustment.plan;
              App.ui.eliAnchors = App.ui.eliSuggestion.primary.type === 'heavy_weight'
                ? getTemplateAnchors(tmpl, App.data.exercises, cycleNum) : [];
            }
          } else {
            App.ui.eliAnchors = [];
          }
          App.ui.eliExercisePlan = eliPlan;
        }

        if (users.includes('christina')) {
          const style = 'progressive';
          if (style === 'pain_adaptive') {
            App.ui.christinaSuggestion = getChristinaSuggestion(App.state.cycleState, App.ui.symptomsByUser.christina);
          } else {
            const proxy = { ...App.state.cycleState,
              eliSequencePointer: App.state.cycleState.christinaSequencePointer,
              eliLastHeavyDate: App.state.cycleState.christinaLastActivityDate };
            const mappedSessions = App.state.sessions.map(s => ({ ...s,
              users: s.users.includes('christina') ? [...new Set([...s.users, 'eli'])] : s.users }));
            const strength = getEliSuggestion(proxy, mappedSessions, App.state.missedDays);
            const trackingId = CHRISTINA_SEQUENCE[App.state.cycleState.christinaSequencePointer % CHRISTINA_SEQUENCE.length];
            App.ui.christinaSuggestion = {
              primary: { ...strength.primary, id: trackingId, templateId: strength.primary.id,
                adaptationLevel: 'normal' },
              alternatives: strength.alternatives.map(alt => ({ ...alt, adaptationLevel: 'normal' })),
              heavyBlocked: strength.heavyBlocked,
              heavyBlockedReason: strength.heavyBlockedReason
            };
          }
          App.ui.selectedChristinaRoutine = {
            id:    App.ui.christinaSuggestion.primary.id,
            templateId: App.ui.christinaSuggestion.primary.templateId,
            level: App.ui.christinaSuggestion.primary.adaptationLevel
          };
          if (App.ui.selectedChristinaRoutine.id !== 'skip_rest') {
            const tmplId = App.ui.selectedChristinaRoutine.templateId ?? App.ui.selectedChristinaRoutine.id;
            const tmpl = App.data.routineTemplates.find(t => t.id === tmplId);
            if (tmpl) {
              let plan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('christina')).length, cycleNum,
                {}, {}, App.state.settings.profiles.christina,
                App.state.settings.unavailableEquipmentIds);
              if (style === 'pain_adaptive') plan = adaptChristinaExercises(plan, App.ui.symptomsByUser.christina);
              const adjustment = adaptWorkoutToCapacity(plan, App.ui.symptomsByUser.christina, App.state.settings.profiles.christina);
              App.ui.christinaOriginalPlan = plan;
              App.ui.christinaCapacityAdjustment = adjustment;
              App.ui.christinaRecommendedPlan = adjustment.plan;
              plan = adjustment.plan;
              // Advisory: flag exercises that conflict with today's active symptoms (no removal).
              plan = annotateSymptomConflicts(plan, App.ui.symptomsByUser.christina);
              cPlan = plan;
            }
          }
          App.ui.christinaExercisePlan = cPlan;
        }

        if (users.length === 2 && eliPlan.length && cPlan.length) {
          cPlan = reorderToReduceConflicts(eliPlan, cPlan, App.data.exercises);
          App.ui.christinaExercisePlan = cPlan;
          App.ui.conflicts = analyzePairedConflicts(eliPlan, cPlan, App.data.exercises);
        } else {
          App.ui.conflicts = [];
        }

        App.ui.routineSuggestionBuilt = true;
      }

      html = renderRoutineSuggestion(App);
      break;
    }

    case 'warmup':
      html = renderWarmup();
      break;

    case 'workout_runner': {
      // Guard: only build state at session start. Re-renders (skip, rest end,
      // exercise advance) reuse existing state so progress is preserved.
      if (!App.workoutState) buildWorkoutState();
      html = renderWorkoutRunner(App);
      break;
    }

    case 'end_checkin':
      stopTimer();
      html = renderEndCheckin(App);
      break;

    case 'meditation':
      html = renderMeditation();
      break;

    case 'session_summary': {
      finalizeSession();    // saves state, stores lastSessionSummary, nulls currentSession
      html = renderSessionSummary(App);
      break;
    }

    case 'cycle_review': {
      App.ui.cycleReviewSnapshot = {
        cycleState: App.state.cycleState,
        sessions:   App.state.sessions
      };
      const heavyTemplates = App.data.routineTemplates.filter(t => ELI_HEAVY_SEQUENCE.includes(t.id));
      const eliReadiness   = getEliReadiness(App.state.sessions, App.state.cycleState);
      App.ui.cycleProgressionSuggestions = getCycleProgressionSuggestions(
        App.state.cycleState, App.data.exercises, heavyTemplates, eliReadiness.overall,
        App.state.settings.profiles.eli
      );
      // Pre-accept the single baseline bump when recommended — reps suggestions
      // aren't toggleable, they carry over automatically.
      App.ui.acceptedProgressionIds = new Set(
        App.ui.cycleProgressionSuggestions
          .filter(s => s.type === 'baseline' && s.recommended)
          .map(s => s.exerciseId)   // 'baseline'
      );
      html = renderCycleReview(App);
      setTimeout(() => initCycleReviewCards(App), 50);
      break;
    }

    case 'reports':
      html = renderReports(App);
      setTimeout(() => initReportCharts(App), 50);
      break;

    case 'settings':
      html = renderSettings(App);
      break;

    default:
      html = `<div class="page"><p>Unknown screen: ${screen}</p></div>`;
  }

  appEl.innerHTML = html;
  setupListeners(screen);

  // Announce the new screen to screen readers via the shared live region, and
  // move focus to the screen's heading so keyboard/AT users land in context.
  const announce = document.getElementById('sr-announce');
  const heading = appEl.querySelector('h1, h2, .page-title');
  if (announce) announce.textContent = heading ? heading.textContent.trim() : screen.replace(/_/g, ' ');
  if (heading && !heading.hasAttribute('tabindex')) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: false });
  }

  // Re-sync timers after every workout_runner render.
  // The guard above ensures workoutState is preserved, so restRemaining and
  // exerciseTimerRemaining are correct — we just need fresh DOM references.
  if (screen === 'workout_runner' && App.workoutState) {
    const ws = App.workoutState;
    if (ws.mode === 'both') {
      ['eli', 'christina'].forEach(u => {
        if (ws[u].restRemaining > 0) {
          // User is mid-rest — restart interval with saved countdown
          startUserRestTimer(u, ws[u].restRemaining);
        } else {
          // User is active — restart exercise timer only if not already tracked
          // (avoids resetting the other user's in-progress timed exercise)
          startExerciseTimer(u);
        }
      });
    } else {
      const user = ws.mode === 'eli_only' ? 'eli' : 'christina';
      startExerciseTimer(user);
    }
  }
}

// ============================================================
// Setup event listeners per screen
// ============================================================
function setupListeners(screen) {
  const get = id => document.getElementById(id);
  const on  = (id, ev, fn) => { const el = get(id); if (el) el.addEventListener(ev, fn); };

  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', e => {
      const dest = e.currentTarget.dataset.nav;
      if (dest) navigate(dest);
    });
  });

  switch (screen) {

    case 'first_launch':
      on('btn-launch', 'click', () => {
        const dateEl = get('launch-date');
        const launch = dateEl?.value || getTomorrowDate();
        App.state.settings.launchDate        = launch;
        App.state.settings.currentCycleStart = launch;
        App.state.cycleState = initCycleFromLaunchDate(launch);
        App.state.cycleState.startDate = launch;
        saveState(App.state);
        navigate('hello');
      });
      break;

    case 'hello':
      document.querySelectorAll('[data-who]').forEach(btn => {
        btn.addEventListener('click', e => {
          const who = e.currentTarget.dataset.who;
          App.ui.selectedUsers = who === 'both' ? ['eli','christina'] : [who];
          navigate('missed_days');
        });
      });
      on('btn-skip-today', 'click', () => {
        App.ui.selectedUsers = ['eli','christina'];
        navigate('log_today');
      });
      on('btn-hello-backup', 'click', () => {
        markBackedUp();
        showToast(`Backup saved: ${exportFullBackupJSON(App.state)}`, 'success');
        navigate('hello');   // re-render; banner now gone
      });
      on('btn-hello-backup-later', 'click', () => {
        App.ui.backupNudgeDismissed = true;
        navigate('hello');
      });
      break;

    case 'log_today': {
      let logUsers = ['eli','christina'];

      // Apply initial selected state to Both button via inline style
      const _initWhoBtn = document.getElementById('log-who-both');
      if (_initWhoBtn) {
        _initWhoBtn.style.border = '2px solid var(--eli)';
        _initWhoBtn.style.background = 'var(--eli-dim)';
        _initWhoBtn.style.color = 'var(--eli)';
        _initWhoBtn.style.fontWeight = '700';
      }

      document.querySelectorAll('[data-log-who]').forEach(btn => {
        btn.addEventListener('click', e => {
          // Reset all who-buttons to unselected inline style
          document.querySelectorAll('[data-log-who]').forEach(b => {
            b.style.border = '1px solid var(--border)';
            b.style.background = 'var(--surface)';
            b.style.color = 'var(--text-2)';
            b.style.fontWeight = '400';
          });
          // Highlight the tapped button
          const t = e.currentTarget;
          t.style.border = '2px solid var(--eli)';
          t.style.background = 'var(--eli-dim)';
          t.style.color = 'var(--eli)';
          t.style.fontWeight = '700';
          const who = t.dataset.logWho;
          logUsers = who === 'both' ? ['eli','christina'] : [who];
        });
      });

      document.querySelectorAll('[data-log]').forEach(btn => {
        btn.addEventListener('click', e => {
          const cat  = e.currentTarget.dataset.log;
          const date = document.getElementById('log-date')?.value || today();

          if (date > today()) {
            showToast('Cannot log a future date.', 'error');
            return;
          }

          // Update existing entry for same date + same user combo, or add new
          const usersKey = [...logUsers].sort().join(',');
          const existing = App.state.missedDays.find(m =>
            m.date === date && [...(m.users ?? [])].sort().join(',') === usersKey
          );
          if (existing) {
            existing.category = cat;
          } else {
            App.state.missedDays.push({ date, category: cat, users: logUsers, notes: '' });
          }

          saveState(App.state);
          const whoLabel = logUsers.length === 2 ? 'Both' : App.state.settings.profiles[logUsers[0]].displayName;
          showToast(`${whoLabel} — ${date} logged.`, 'success');
          navigate('hello');
        });
      });

      on('btn-log-cancel', 'click', () => navigate('hello'));
      break;
    }

    case 'missed_days':
      document.querySelectorAll('.miss-cat-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const { cat, date } = e.currentTarget.dataset;
          App.ui.missedDayChoices[date] = cat;
          const parent = e.currentTarget.closest('[data-date]');
          parent?.querySelectorAll('.miss-cat-btn').forEach(b => b.classList.remove('selected'));
          e.currentTarget.classList.add('selected');
        });
      });
      on('btn-missed-done', 'click', saveMissedDaysAndContinue);
      // Compact welcome-back card (long gaps): no per-day choices were made,
      // so saveMissedDaysAndContinue's default fills the whole gap as skip_rest.
      on('btn-missed-bulk-rest', 'click', saveMissedDaysAndContinue);
      on('btn-missed-skip', 'click', afterMissedDays);
      break;

    case 'symptom_check': {
      let currentPainDay = 'low';
      let currentEnergy = 'medium';
      let currentSoreness = 'low';
      const activeSymptoms = new Set();

      document.querySelectorAll('#pain-picker .pain-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          document.querySelectorAll('#pain-picker .pain-btn').forEach(b => b.classList.remove('selected'));
          e.currentTarget.classList.add('selected');
          currentPainDay = e.currentTarget.dataset.value;
        });
      });

      document.querySelectorAll('.symptom-cluster-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.currentTarget.dataset.symptom;
          if (activeSymptoms.has(id)) {
            activeSymptoms.delete(id);
            e.currentTarget.classList.remove('active');
          } else {
            activeSymptoms.add(id);
            e.currentTarget.classList.add('active');
          }
        });
      });

      document.querySelectorAll('[data-energy]').forEach(btn => btn.addEventListener('click', e => {
        document.querySelectorAll('[data-energy]').forEach(b => b.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        currentEnergy = e.currentTarget.dataset.energy;
      }));
      document.querySelectorAll('[data-soreness]').forEach(btn => btn.addEventListener('click', e => {
        document.querySelectorAll('[data-soreness]').forEach(b => b.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        currentSoreness = e.currentTarget.dataset.soreness;
      }));

      const finishCapacity = (useDefaults = false) => {
        const symptoms = {};
        activeSymptoms.forEach(id => { symptoms[id] = 5; });
        const userId = App.ui.activeSymptomUser ?? 'christina';
        App.ui.symptomsByUser[userId] = {
          painDay: useDefaults ? 'low' : currentPainDay,
          energy: useDefaults ? 'medium' : currentEnergy,
          soreness: useDefaults ? 'low' : currentSoreness,
          symptoms: useDefaults ? {} : symptoms
        };
        if (userId === 'christina') App.ui.christinaSymptoms = App.ui.symptomsByUser[userId];
        App.ui.activeSymptomUser = App.ui.pendingSymptomUsers.shift() ?? null;
        if (App.ui.activeSymptomUser) navigate('symptom_check');
        else {
          App.ui.routineSuggestionBuilt = false;
          navigate('routine_suggestion');
        }
      };
      on('btn-symptoms-done', 'click', () => finishCapacity(false));
      on('btn-capacity-skip', 'click', () => finishCapacity(true));
      break;
    }

    case 'routine_suggestion': {
      const cycleNum = App.state.cycleState?.cycleNumber ?? 1;

      const refreshConflicts = () => {
        if (App.ui.selectedUsers?.length === 2 && App.ui.eliExercisePlan?.length && App.ui.christinaExercisePlan?.length) {
          App.ui.christinaExercisePlan = reorderToReduceConflicts(App.ui.eliExercisePlan, App.ui.christinaExercisePlan, App.data.exercises);
          App.ui.conflicts = analyzePairedConflicts(App.ui.eliExercisePlan, App.ui.christinaExercisePlan, App.data.exercises);
        }
      };
      const chooseCapacityPlan = (userId, useOriginal) => {
        const key = userId === 'eli' ? 'eliExercisePlan' : 'christinaExercisePlan';
        const source = useOriginal
          ? App.ui[`${userId}OriginalPlan`]
          : App.ui[`${userId}RecommendedPlan`];
        if (source) App.ui[key] = source.map(ex => ({ ...ex }));
        App.ui.capacityChoiceByUser[userId] = useOriginal ? 'original' : 'recommended';
        refreshConflicts();
        navigate('routine_suggestion');
      };
      on('btn-eli-original', 'click', () => chooseCapacityPlan('eli', true));
      on('btn-eli-recommended', 'click', () => chooseCapacityPlan('eli', false));
      on('btn-christina-original', 'click', () => chooseCapacityPlan('christina', true));
      on('btn-christina-recommended', 'click', () => chooseCapacityPlan('christina', false));

      on('eli-alt-toggle', 'click', () => {
        get('eli-alternatives')?.classList.toggle('hidden');
      });
      on('christina-alt-toggle', 'click', () => {
        get('christina-alternatives')?.classList.toggle('hidden');
      });

      document.querySelectorAll('[data-swap-user]').forEach(row => {
        row.addEventListener('click', e => {
          const user = e.currentTarget.dataset.swapUser;
          const idx  = parseInt(e.currentTarget.dataset.swapIndex, 10);
          const plan = user === 'eli' ? App.ui.eliExercisePlan : App.ui.christinaExercisePlan;
          if (!plan) return;
          // Eli's swaps carry forward any progressed weight for the new exercise.
          const weightOverrides = user === 'eli' ? (App.state.cycleState?.eliExerciseWeights ?? {}) : {};
          swapExercise(plan, App.data.exercises, idx, weightOverrides, App.state.settings.profiles[user]);
          // A swap changes the exercise (and its attributes) — re-flag symptom
          // conflicts on Christina's plan so the advisory badges stay correct.
          if (user === 'christina') {
            App.ui.christinaExercisePlan = annotateSymptomConflicts(
              App.ui.christinaExercisePlan, App.ui.christinaSymptoms);
          }
          // Re-derive conflicts if both users are in this session — a swap
          // can change equipment overlap between the two panels.
          if (App.ui.selectedUsers?.length === 2 &&
              App.ui.eliExercisePlan?.length && App.ui.christinaExercisePlan?.length) {
            App.ui.conflicts = analyzePairedConflicts(
              App.ui.eliExercisePlan, App.ui.christinaExercisePlan, App.data.exercises);
          }
          navigate('routine_suggestion');
        });
      });

      document.querySelectorAll('[data-user="eli"]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id   = e.currentTarget.dataset.id;
          const type = e.currentTarget.dataset.type;
          App.ui.selectedEliRoutine = { id, type, label: e.currentTarget.textContent.trim() };
          if (id !== 'skip_rest') {
            const tmpl = App.data.routineTemplates.find(t => t.id === id);
            if (tmpl) {
              App.ui.eliExercisePlan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('eli')).length, cycleNum,
                App.state.cycleState?.eliExerciseWeights ?? {},
                App.state.cycleState?.eliExerciseRepsTarget ?? {},
                App.state.settings.profiles.eli,
                App.state.settings.unavailableEquipmentIds);
              App.ui.eliAnchors = type === 'heavy_weight'
                ? getTemplateAnchors(tmpl, App.data.exercises, cycleNum) : [];
            }
          } else {
            App.ui.eliExercisePlan = [];
            App.ui.eliAnchors = [];
          }
          document.querySelectorAll('[data-user="eli"]').forEach(b => b.classList.remove('selected'));
          e.currentTarget.classList.add('selected');
          showToast(`Eli: ${e.currentTarget.textContent.trim().replace('›','').trim()}`);
        });
      });

      document.querySelectorAll('[data-user="christina"]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id    = e.currentTarget.dataset.id;
          const level = e.currentTarget.dataset.adaptation;
          App.ui.selectedChristinaRoutine = { id, level };

          // Rebuild Christina's plan for the chosen routine (mirrors Eli's handler).
          // Previously this was skipped, so the shown exercise list, swap rows, and
          // conflict banner kept operating on the prior routine's plan until the
          // workout actually started — audit B4.
          if (id !== 'skip_rest') {
            const tmpl = App.data.routineTemplates.find(t => t.id === id);
            if (tmpl) {
              let plan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('christina')).length, cycleNum,
                {}, {}, App.state.settings.profiles.christina,
                App.state.settings.unavailableEquipmentIds);
              if (App.ui.christinaSymptoms) plan = adaptChristinaExercises(plan, App.ui.christinaSymptoms);
              App.ui.christinaExercisePlan = annotateSymptomConflicts(plan, App.ui.christinaSymptoms);
            }
          } else {
            App.ui.christinaExercisePlan = [];
          }

          // A routine change can alter equipment overlap with Eli's plan.
          if (App.ui.selectedUsers?.length === 2 &&
              App.ui.eliExercisePlan?.length && App.ui.christinaExercisePlan?.length) {
            App.ui.christinaExercisePlan = reorderToReduceConflicts(
              App.ui.eliExercisePlan, App.ui.christinaExercisePlan, App.data.exercises);
            App.ui.conflicts = analyzePairedConflicts(
              App.ui.eliExercisePlan, App.ui.christinaExercisePlan, App.data.exercises);
          }

          document.querySelectorAll('[data-user="christina"]').forEach(b => b.classList.remove('selected','selected--indigo'));
          e.currentTarget.classList.add('selected--indigo');
          showToast(`Christina: ${e.currentTarget.textContent.trim().replace('›','').trim()}`);
        });
      });

      on('btn-start-workout', 'click', () => {
        const eliR  = App.ui.selectedEliRoutine;
        const cR    = App.ui.selectedChristinaRoutine;
        const users = [...App.ui.selectedUsers];

        const missingPlan = users.find(userId => {
          const routine = userId === 'eli' ? eliR : cR;
          const plan = userId === 'eli' ? App.ui.eliExercisePlan : App.ui.christinaExercisePlan;
          return routine?.id !== 'skip_rest' && !plan?.length;
        });
        if (missingPlan) {
          const name = App.state.settings.profiles[missingPlan].displayName;
          showToast(`No compatible exercises for ${name}. Enable more equipment or exercises in Settings.`, 'error', 6000);
          return;
        }

        const skipping = users.filter(u =>
          (u === 'eli'       && eliR?.id === 'skip_rest') ||
          (u === 'christina' && cR?.id   === 'skip_rest')
        );
        if (skipping.length) {
          const t = today();
          if (!App.state.missedDays.find(m => m.date === t)) {
            App.state.missedDays.push({ date: t, category: 'skip_rest', users: skipping, notes: '' });
          }
          saveState(App.state);
        }

        const activeUsers = users.filter(u =>
          !(u === 'eli'       && eliR?.id === 'skip_rest') &&
          !(u === 'christina' && cR?.id   === 'skip_rest')
        );

        if (!activeUsers.length) {
          showToast('Day logged as rest.', 'success');
          navigate('hello');
          return;
        }
        App.ui.selectedUsers = activeUsers;
        App.workoutState = null;   // force fresh build
        navigate('warmup');
      });
      break;
    }

    case 'warmup': {
      const WARMUP_SECONDS = 300;
      let warmupInterval = null;

      const finish = (withChime) => {
        clearInterval(warmupInterval);
        stopMeditation();
        if (withChime) playTimerComplete(App.state.settings.audioEnabled);
        navigate('workout_runner');
      };

      on('btn-warmup-skip', 'click', () => {
        unlockAudio();
        navigate('workout_runner');
      });

      on('btn-warmup-begin', 'click', () => {
        unlockAudio();
        playMeditation(5, App.state.settings.audioEnabled);

        get('warmup-start-wrap')?.style.setProperty('display','none');
        const wrap = get('warmup-timer-wrap');
        if (wrap) wrap.style.display = 'block';

        let remaining = WARMUP_SECONDS;
        const el  = get('warmup-timer');
        const tick = () => { if (el) el.textContent = formatTime(remaining); };
        tick();

        warmupInterval = setInterval(() => {
          remaining--;
          tick();
          if (remaining <= 0) finish(true);
        }, 1000);

        on('btn-warmup-end', 'click', () => finish(false));
      });
      break;
    }

    case 'workout_runner':
      setupWorkoutListeners();
      break;

    case 'end_checkin': {
      const checkins = {};
      App.ui.selectedUsers.forEach(userId => { checkins[userId] = { effort: null, jointPain: 'no', notes: '' }; });

      document.querySelectorAll('[data-effort-user]').forEach(btn => {
        btn.addEventListener('click', e => {
          const userId = e.currentTarget.dataset.effortUser;
          document.querySelectorAll(`[data-effort-user="${userId}"]`).forEach(b => b.classList.remove('selected'));
          e.currentTarget.classList.add('selected');
          checkins[userId].effort = parseInt(e.currentTarget.dataset.value);
        });
      });

      document.querySelectorAll('[data-joint-pain-user]').forEach(btn => {
        btn.addEventListener('click', e => {
          const userId = e.currentTarget.dataset.jointPainUser;
          document.querySelectorAll(`[data-joint-pain-user="${userId}"]`).forEach(b => b.classList.remove('selected','selected--none'));
          const pain = e.currentTarget.dataset.value;
          e.currentTarget.classList.add(pain === 'no' ? 'selected--none' : 'selected');
          checkins[userId].jointPain = pain;
        });
      });

      on('btn-checkin-done', 'click', () => {
        const users = App.ui.selectedUsers;
        users.forEach(userId => {
          checkins[userId].notes = get(`notes-${userId}`)?.value ?? '';
          App.currentSession.profileCheckins[userId] = {
            ...(App.currentSession.profileCheckins[userId] ?? {}), ...checkins[userId]
          };
        });
        if (users.includes('eli')) App.ui.eliCheckin = {
          formFatigue: checkins.eli.effort, jointPain: checkins.eli.jointPain,
          jointLocations: [], notes: checkins.eli.notes
        };
        if (users.includes('christina')) {
          App.ui.christinaCheckin = {
            notes: checkins.christina.notes,
            painDay: App.ui.symptomsByUser.christina?.painDay ?? 'low',
            symptoms: App.ui.symptomsByUser.christina?.symptoms ?? {}
          };
        }
        navigate('meditation');
      });
      break;
    }

    case 'meditation': {
      let medTimerInterval = null;

      document.querySelectorAll('[data-med]').forEach(btn => {
        btn.addEventListener('click', e => {
          unlockAudio();
          const choice = e.currentTarget.dataset.med;

          if (choice === 'skip') {
            App.ui.meditationChoice = { completed: false };
            navigate('session_summary');
            return;
          }

          const minutes = parseInt(choice);
          App.ui.meditationChoice = { completed: true, durationMinutes: minutes };
          playMeditation(minutes, App.state.settings.audioEnabled);

          document.querySelectorAll('[data-med]').forEach(b => {
            b.closest('.choice-btn')?.style.setProperty('display','none');
          });
          const timerWrap = get('med-timer-wrap');
          if (timerWrap) timerWrap.style.display = 'block';

          let remaining = minutes * 60;
          const timerEl = get('med-timer');
          const update  = () => { if (timerEl) timerEl.textContent = formatTime(remaining); };
          update();

          medTimerInterval = setInterval(() => {
            remaining--;
            update();
            if (remaining <= 0) {
              clearInterval(medTimerInterval);
              stopMeditation();
              playTimerComplete(App.state.settings.audioEnabled);   // chime on natural end
              navigate('session_summary');
            }
          }, 1000);

          get('btn-end-meditation')?.addEventListener('click', () => {
            clearInterval(medTimerInterval);
            stopMeditation();
            navigate('session_summary');   // no chime on manual end
          });
        });
      });
      break;
    }

    case 'session_summary': {
      get('cal-prev')?.addEventListener('click', () => {
        App.ui.calMonth--;
        if (App.ui.calMonth < 0) { App.ui.calMonth = 11; App.ui.calYear--; }
        navigate('session_summary');
      });
      get('cal-next')?.addEventListener('click', () => {
        App.ui.calMonth++;
        if (App.ui.calMonth > 11) { App.ui.calMonth = 0; App.ui.calYear++; }
        navigate('session_summary');
      });
      get('btn-to-reports')?.addEventListener('click', () => navigate('reports'));
      break;
    }

    case 'cycle_review': {
      document.querySelectorAll('[data-exercise-id]').forEach(btn => {
        btn.addEventListener('click', e => {
          const exId = e.currentTarget.dataset.exerciseId;
          const sugg = App.ui.cycleProgressionSuggestions.find(s => s.exerciseId === exId);
          if (!sugg || sugg.type !== 'baseline') return; // only the baseline bump is toggleable

          const nowAccepted = !App.ui.acceptedProgressionIds.has(exId);
          if (nowAccepted) App.ui.acceptedProgressionIds.add(exId);
          else             App.ui.acceptedProgressionIds.delete(exId);

          e.currentTarget.dataset.accepted = nowAccepted ? 'true' : 'false';
          e.currentTarget.textContent = nowAccepted ? 'Accept' : 'Hold';
          e.currentTarget.classList.toggle('btn--eli', nowAccepted);
          e.currentTarget.classList.toggle('btn--ghost', !nowAccepted);

          const arrow = get(`progression-arrow-${exId}`);
          if (arrow) {
            arrow.innerHTML = nowAccepted
              ? `→ <strong style="color:var(--eli);">${sugg.suggestedKg}kg</strong> across all lifts, reps restart`
              : `(holding at ${sugg.currentKg}kg)`;
          }
        });
      });

      on('btn-start-new-cycle', 'click', () => {
        const cycleState = App.state.cycleState;

        // An accepted baseline bump raises the profile's single working weight
        // (every non-overridden lift moves together) and clears the rep targets
        // so the rep climb restarts at the new load. startNewCycle() already
        // resets eliExerciseWeights to {}, so next cycle's lifts pick up the new
        // baseline automatically. Reps still climbing / held weight need no write.
        const baselineAccepted = App.ui.acceptedProgressionIds.has('baseline');
        if (baselineAccepted) {
          const sugg = App.ui.cycleProgressionSuggestions.find(s => s.type === 'baseline');
          if (sugg) {
            App.state.settings.profiles.eli.baselineWeightKg = sugg.suggestedKg;
            cycleState.eliExerciseRepsTarget = {};   // re-climb reps at the new weight
          }
        }

        App.state.cycleReviews = App.state.cycleReviews ?? [];
        App.state.cycleReviews.push({
          cycleNumber: cycleState.cycleNumber,
          startDate:   cycleState.startDate,
          endDate:     cycleState.endDate,
          baselineAccepted,
          progressions: App.ui.cycleProgressionSuggestions.map(s => ({
            exerciseId:   s.exerciseId,
            exerciseName: s.exerciseName,
            type:         s.type,
            fromKg:       s.currentKg,
            toKg:         s.type === 'baseline' && baselineAccepted ? s.suggestedKg : s.currentKg,
            fromReps:     s.currentReps,
            accepted:     s.type === 'baseline' ? baselineAccepted : null
          })),
          reviewedAt: new Date().toISOString()
        });

        App.state.cycleState = startNewCycle(cycleState);
        saveState(App.state);
        showToast(`Cycle ${cycleState.cycleNumber} complete — Cycle ${App.state.cycleState.cycleNumber} started!`, 'success');
        navigate('hello');
      });
      break;
    }

    case 'reports': {
      get('cal-prev')?.addEventListener('click', () => {
        App.ui.calMonth--;
        if (App.ui.calMonth < 0) { App.ui.calMonth = 11; App.ui.calYear--; }
        navigate('reports');
      });
      get('cal-next')?.addEventListener('click', () => {
        App.ui.calMonth++;
        if (App.ui.calMonth > 11) { App.ui.calMonth = 0; App.ui.calYear++; }
        navigate('reports');
      });
      get('btn-export-month-csv')?.addEventListener('click', () => {
        showToast(`Exported ${exportMonthCSV(App.state.sessions, App.state.missedDays, App.ui.calYear, App.ui.calMonth)}`, 'success');
      });
      get('btn-export-month-md')?.addEventListener('click', () => {
        showToast(`Exported ${exportMonthMarkdown(App.state.sessions, App.state.missedDays, App.ui.calYear, App.ui.calMonth)}`, 'success');
      });
      get('btn-export-cycle')?.addEventListener('click', () => {
        showToast(`Exported ${exportCycleMarkdown(App.state.cycleState, App.state.sessions)}`, 'success');
      });
      get('btn-export-json')?.addEventListener('click', () => {
        markBackedUp();
        showToast(`Backup saved: ${exportFullBackupJSON(App.state)}`, 'success');
      });
      break;
    }

    case 'settings': {
      // ---- Profiles ----
      ['eli', 'christina'].forEach(uid => {
        const prof = () => App.state.settings.profiles[uid];

        get(`profile-name-${uid}`)?.addEventListener('change', e => {
          const name = e.target.value.trim();
          if (name) { prof().displayName = name; saveState(App.state); showToast('Profile name saved', 'success'); }
        });

        document.querySelectorAll(`[data-profile-icon="${uid}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            prof().icon = btn.dataset.icon;
            saveState(App.state);
            navigate('settings');
          });
        });

        document.querySelectorAll(`[data-baseline="${uid}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            const p = prof();
            const step = 0.5;
            p.baselineWeightKg = btn.dataset.dir === 'up'
              ? Math.round((p.baselineWeightKg + step) * 10) / 10
              : Math.max(step, Math.round((p.baselineWeightKg - step) * 10) / 10);
            saveState(App.state);
            const el = get(`baseline-value-${uid}`);
            if (el) el.textContent = `${p.baselineWeightKg} kg`;
          });
        });

        document.querySelectorAll(`[data-prog="${uid}"]`).forEach(btn => {
          btn.addEventListener('click', () => {
            prof().progressionMode = btn.dataset.mode;
            saveState(App.state);
            navigate('settings');
          });
        });

        get(`primary-goal-${uid}`)?.addEventListener('change', e => {
          prof().primaryGoal = e.target.value;
          prof().secondaryGoals = (prof().secondaryGoals ?? []).filter(x => x !== e.target.value);
          saveState(App.state); navigate('settings');
        });
        document.querySelectorAll(`[data-secondary-goal="${uid}"]`).forEach(cb => cb.addEventListener('change', () => {
          const goals = new Set(prof().secondaryGoals ?? []);
          cb.checked ? goals.add(cb.value) : goals.delete(cb.value);
          prof().secondaryGoals = [...goals]; saveState(App.state);
        }));
        document.querySelectorAll(`[data-experience="${uid}"]`).forEach(btn => btn.addEventListener('click', () => {
          prof().experienceLevel = btn.dataset.value; saveState(App.state); navigate('settings');
        }));
        document.querySelectorAll(`[data-adaptation="${uid}"]`).forEach(btn => btn.addEventListener('click', () => {
          prof().adaptationPreference = btn.dataset.value;
          prof().progressionMode = btn.dataset.value === 'daily_capacity' ? 'fixed' : 'cycle_review';
          saveState(App.state); navigate('settings');
        }));

        document.querySelectorAll(`[data-ex-toggle="${uid}"]`).forEach(cb => {
          cb.addEventListener('change', () => {
            const p = prof();
            const set = new Set(p.disabledExerciseIds ?? []);
            if (cb.checked) set.delete(cb.value); else set.add(cb.value);
            p.disabledExerciseIds = [...set];
            saveState(App.state);
            // Live-update the "N of M on" count.
            const all = document.querySelectorAll(`[data-ex-toggle="${uid}"]`);
            const on = [...all].filter(x => x.checked).length;
            const label = get(`ex-count-${uid}`);
            if (label) label.textContent = `${on} of ${all.length} on`;
          });
        });
      });

      document.querySelectorAll('[data-equipment-toggle]').forEach(cb => cb.addEventListener('change', () => {
        const unavailable = new Set(App.state.settings.unavailableEquipmentIds ?? []);
        cb.checked ? unavailable.delete(cb.value) : unavailable.add(cb.value);
        App.state.settings.unavailableEquipmentIds = [...unavailable];
        saveState(App.state);
      }));
      get('btn-equipment-bodyweight')?.addEventListener('click', () => {
        const keep = new Set(['open_space', 'yoga_mats', 'adjustable_bench']);
        App.state.settings.unavailableEquipmentIds = App.data.equipment.map(item => item.id).filter(id => !keep.has(id));
        saveState(App.state); navigate('settings');
      });
      get('btn-equipment-all')?.addEventListener('click', () => {
        App.state.settings.unavailableEquipmentIds = [];
        saveState(App.state); navigate('settings');
      });

      // Music mode toggle
      get('btn-theme-day')?.addEventListener('click', () => {
        App.state.settings.theme = 'day';
        applyTheme('day');
        saveState(App.state);
        navigate('settings');
        showToast('Day theme on');
      });
      get('btn-theme-night')?.addEventListener('click', () => {
        App.state.settings.theme = 'night';
        applyTheme('night');
        saveState(App.state);
        navigate('settings');
        showToast('Night theme on');
      });

      get('btn-mode-spotify')?.addEventListener('click', () => {
        App.state.settings.musicMode = 'spotify';
        saveState(App.state);
        navigate('settings');
      });
      get('btn-mode-chimes')?.addEventListener('click', () => {
        App.state.settings.musicMode = 'chimes';
        saveState(App.state);
        navigate('settings');
      });

      get('audio-toggle')?.addEventListener('change', e => {
        App.state.settings.audioEnabled = e.target.checked;
        saveState(App.state);
        showToast(e.target.checked ? 'Chimes on' : 'Chimes off');
      });

      get('spotify-url')?.addEventListener('blur', e => {
        const raw = e.target.value.trim();
        const url = safeSpotifyUrl(raw);
        if (raw && !url) { showToast('Use an https://open.spotify.com URL.', 'error'); return; }
        App.state.settings.spotifyUrl = url;
        if (saveState(App.state)) showToast('Spotify URL saved', 'success');
      });

      get('btn-rest-minus')?.addEventListener('click', () => {
        const cur = App.state.settings.defaultRestSeconds;
        if (cur > 30) {
          App.state.settings.defaultRestSeconds = cur - 15;
          saveState(App.state);
          const el = get('rest-value');
          if (el) el.textContent = `${App.state.settings.defaultRestSeconds}s`;
        }
      });
      get('btn-rest-plus')?.addEventListener('click', () => {
        const cur = App.state.settings.defaultRestSeconds;
        if (cur < 300) {
          App.state.settings.defaultRestSeconds = cur + 15;
          saveState(App.state);
          const el = get('rest-value');
          if (el) el.textContent = `${App.state.settings.defaultRestSeconds}s`;
        }
      });

      get('btn-change-launch')?.addEventListener('click', () => {
        const newDate = prompt('Enter new launch date (YYYY-MM-DD):', App.state.settings.launchDate ?? today());
        if (newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          App.state.settings.launchDate        = newDate;
          App.state.settings.currentCycleStart = newDate;
          App.state.cycleState = initCycleFromLaunchDate(newDate);
          saveState(App.state);
          navigate('settings');
          showToast('Launch date updated', 'success');
        }
      });

      get('btn-export-json-settings')?.addEventListener('click', () => {
        markBackedUp();
        showToast(`Backup saved: ${exportFullBackupJSON(App.state)}`, 'success');
      });

      get('btn-restore')?.addEventListener('click', () => {
        get('restore-input')?.click();
      });

      get('restore-input')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          showToast('Restore failed: backup is larger than 5 MB.', 'error');
          e.target.value = '';
          return;
        }
        if (!confirm(`Restore backup "${file.name}"? This replaces ALL current data on this device.`)) {
          e.target.value = '';
          return;
        }
        const text   = await file.text();
        const result = importStateJSON(text);
        if (result.success) {
          App.state = result.state;
          saveState(App.state);
          navigate('hello');
          showToast('Backup restored!', 'success');
        } else {
          showToast('Restore failed: ' + result.error, 'error');
          e.target.value = '';
        }
      });

      get('btn-reset-data')?.addEventListener('click', () => {
        if (confirm('Reset ALL data? This cannot be undone.')) {
          clearState();
          App.state = getDefaultState();
          navigate('first_launch');
        }
      });
      break;
    }
  }
}

// ============================================================
// Equipment Scheduling
// ============================================================
function reorderToReduceConflicts(eliPlan, christinaPlan, allExercises) {
  const result = [...christinaPlan];
  for (let i = 0; i < Math.min(eliPlan.length, result.length); i++) {
    const eDef = allExercises.find(e => e.id === eliPlan[i].id);
    const cDef = allExercises.find(e => e.id === result[i].id);
    if (!eDef || !cDef) continue;
    if (getConflictingItems(eDef, cDef).length > 0) {
      for (let j = i + 1; j < result.length; j++) {
        const swapDef = allExercises.find(e => e.id === result[j].id);
        if (!swapDef) continue;
        if (getConflictingItems(eDef, swapDef).length === 0) {
          [result[i], result[j]] = [result[j], result[i]];
          break;
        }
      }
    }
  }
  return result;
}

// ============================================================
// Backup Nudge
// ============================================================
// Stamp before exporting so the downloaded file records its own creation time
// (lastBackupAt rides along in the JSON, so a restored backup carries its age).
function markBackedUp() {
  App.state.settings.lastBackupAt = new Date().toISOString();
  saveState(App.state);
}

// ============================================================
// Missed Days Logic
// ============================================================
function saveMissedDaysAndContinue() {
  const choices = App.ui.missedDayChoices;
  const users   = App.ui.selectedUsers;
  for (const [date, category] of Object.entries(choices)) {
    if (!App.state.missedDays.find(m => m.date === date)) {
      App.state.missedDays.push({ date, category, users, notes: '' });
    }
  }
  for (const date of (App.ui.pendingMissedDates ?? [])) {
    if (!choices[date] && !App.state.missedDays.find(m => m.date === date)) {
      App.state.missedDays.push({ date, category: 'skip_rest', users, notes: '' });
    }
  }
  saveState(App.state);
  afterMissedDays();
}

function afterMissedDays() {
  const adaptiveUsers = [...App.ui.selectedUsers];
  App.ui.symptomsByUser = {};
  App.ui.capacityChoiceByUser = {};
  App.ui.activeSymptomUser = adaptiveUsers.shift() ?? null;
  App.ui.pendingSymptomUsers = adaptiveUsers;
  if (App.ui.activeSymptomUser) {
    navigate('symptom_check');
  } else {
    App.ui.routineSuggestionBuilt = false;
    navigate('routine_suggestion');
  }
}

// ============================================================
// Build Workout State
// ============================================================
function buildWorkoutState() {
  const users    = App.ui.selectedUsers;
  const eliR     = App.ui.selectedEliRoutine;
  const christR  = App.ui.selectedChristinaRoutine;
  const cycleNum = App.state.cycleState?.cycleNumber ?? 1;

  const eliSessionCount = App.state.sessions.filter(s => s.users.includes('eli')).length;
  const cSessionCount   = App.state.sessions.filter(s => s.users.includes('christina')).length;

  let eliExercises = [], christinaExercises = [];

  if (users.includes('eli') && eliR?.id && eliR.id !== 'skip_rest') {
    const tmpl = App.data.routineTemplates.find(t => t.id === (eliR.templateId ?? eliR.id));
    if (tmpl) {
      eliExercises = buildExercisePlan(tmpl, App.data.exercises, eliSessionCount, cycleNum, App.state.cycleState?.eliExerciseWeights ?? {}, App.state.cycleState?.eliExerciseRepsTarget ?? {}, App.state.settings.profiles.eli, App.state.settings.unavailableEquipmentIds);
      if (App.ui.capacityChoiceByUser.eli !== 'original') {
        eliExercises = adaptWorkoutToCapacity(eliExercises, App.ui.symptomsByUser.eli, App.state.settings.profiles.eli).plan;
      }
      eliExercises = annotateSymptomConflicts(eliExercises, App.ui.symptomsByUser.eli);
    }
  }

  if (users.includes('christina') && christR?.id && christR.id !== 'skip_rest') {
    const tmpl = App.data.routineTemplates.find(t => t.id === (christR.templateId ?? christR.id));
    if (tmpl) {
      let plan = buildExercisePlan(tmpl, App.data.exercises, cSessionCount, cycleNum, {}, {}, App.state.settings.profiles.christina, App.state.settings.unavailableEquipmentIds);
      if (App.ui.capacityChoiceByUser.christina !== 'original') {
        plan = adaptWorkoutToCapacity(plan, App.ui.symptomsByUser.christina, App.state.settings.profiles.christina).plan;
      }
      christinaExercises = annotateSymptomConflicts(plan, App.ui.symptomsByUser.christina);
    }
  }

  const mode = users.length === 2 ? 'both'
    : users[0] === 'eli' ? 'eli_only' : 'christina_only';

  function userState(exercises, routineId) {
    return {
      exercises,
      workoutStructure: routineId && routineId !== 'skip_rest'
        ? (App.data.routineTemplates.find(t => t.id === routineId)?.workoutStructure ?? 'straight_sets')
        : 'straight_sets',
      exerciseIdx:           0,
      setIdx:                0,
      circuitRound:          0,
      restRemaining:         0,
      restTotal:             0,
      restInterval:          null,
      exerciseTimerInterval: null,
      exerciseTimerRemaining:null,   // preserves position across navigates
      completed: exercises.length === 0
    };
  }

  App.workoutState = {
    mode,
    activeUser: users[0],
    eli:      userState(eliExercises,      eliR?.templateId ?? eliR?.id),
    christina:userState(christinaExercises, christR?.templateId ?? christR?.id),
    restActive:      false,
    restTotalSeconds:0
  };

  App.currentSession = createSession(
    users,
    eliR?.id   !== 'skip_rest' ? eliR?.id   : null,
    eliR?.id   !== 'skip_rest' ? eliR?.type  : null,
    christR?.id !== 'skip_rest' ? christR?.id : null,
    christR?.level ?? null,
    App.state.cycleState?.cycleId ?? null
  );
  App.currentSession.profileCheckins = Object.fromEntries(users.map(userId => [userId, {
    trainingStyle: App.state.settings.profiles[userId].trainingStyle,
    ...(App.ui.symptomsByUser[userId] ?? {})
  }]));

  // Capture advisory symptom conflicts on the session for later visibility
  // (rides along in the JSON backup; lets us see how often conflicts occur).
  App.currentSession.christinaSymptomConflicts = christinaExercises
    .filter(e => e.symptomConflicts?.length)
    .map(e => ({ exerciseId: e.id, exerciseName: e.name, conflicts: [...e.symptomConflicts] }));
}

// ============================================================
// Workout Runner Listeners
// ============================================================
function setupWorkoutListeners() {
  const ws = App.workoutState;
  if (!ws) return;

  document.getElementById('btn-end-workout-early')?.addEventListener('click', () => {
    if (confirm('End the workout now?')) {
      clearAllRestTimers();
      navigate('end_checkin');
    }
  });

  document.getElementById('btn-finish-workout')?.addEventListener('click', () => {
    clearAllRestTimers();
    navigate('end_checkin');
  });

  // Single-user: complete set
  document.getElementById('btn-complete-set')?.addEventListener('click', () => {
    unlockAudio();
    const user = ws.mode === 'eli_only' ? 'eli' : 'christina';
    advanceSet(user);
  });

  // Single-user: skip exercise
  document.getElementById('btn-skip-exercise')?.addEventListener('click', () => {
    const user = ws.mode === 'eli_only' ? 'eli' : 'christina';
    const us   = ws[user];
    const ex   = us.exercises[us.exerciseIdx];
    if (ex) skipExercise(App.currentSession, user, ex.id, ex.name);
    us.exerciseTimerRemaining = null;   // new exercise = fresh timer
    us.exerciseIdx++;
    us.setIdx = 0;
    if (us.exerciseIdx >= us.exercises.length) us.completed = true;
    navigate('workout_runner');
  });

  // Paired: complete set buttons
  document.querySelectorAll('[data-user]').forEach(btn => {
    if (btn.classList.contains('paired-complete-btn')) {
      btn.addEventListener('click', e => {
        unlockAudio();
        const user = e.currentTarget.dataset.user;
        if (user === 'eli' || user === 'christina') advanceSet(user);
      });
    }
  });

  // Paired: skip buttons — fully independent, never touch the other user
  document.querySelectorAll('[data-skip]').forEach(btn => {
    btn.addEventListener('click', e => {
      const user = e.currentTarget.dataset.skip;
      const us   = ws[user];
      if (!us) return;
      const ex = us.exercises[us.exerciseIdx];
      if (ex) skipExercise(App.currentSession, user, ex.id, ex.name);
      clearRestTimer(user);
      us.exerciseTimerRemaining = null;   // new exercise = fresh timer
      us.exerciseIdx++;
      us.setIdx        = 0;
      us.restRemaining = 0;
      if (us.exerciseIdx >= us.exercises.length) us.completed = true;
      // navigate re-renders both panels from current state.
      // The other user's restRemaining and exerciseTimerRemaining are preserved
      // and re-synced in the post-navigate block.
      navigate('workout_runner');
    });
  });

  // Weight adjustment buttons
  document.querySelectorAll('[data-weight-adj]').forEach(btn => {
    btn.addEventListener('click', e => {
      const user = e.currentTarget.dataset.weightAdj;
      const dir  = e.currentTarget.dataset.dir;
      const us   = ws[user];
      if (!us) return;
      const ex = us.exercises[us.exerciseIdx];
      if (!ex) return;
      adjustWeight(ex, dir);
      const display = document.getElementById(`${user}-weight-display`);
      if (display) display.textContent = weightLabel(ex);
    });
  });

  document.querySelectorAll('[data-reps-adj]').forEach(btn => {
    btn.addEventListener('click', e => {
      const user = e.currentTarget.dataset.repsAdj;
      const dir  = e.currentTarget.dataset.dir;
      const us   = ws?.[user];
      const ex   = us?.exercises[us.exerciseIdx];
      if (!ex) return;
      adjustReps(ex, dir);
      const display = document.getElementById(`${user}-reps-display`);
      if (display) display.textContent = repsLabel(ex);
    });
  });
}

// ---- advanceSet -------------------------------------------

function advanceSet(user) {
  const ws = App.workoutState;
  const us = ws[user];
  const ex = us.exercises[us.exerciseIdx];
  if (!ex) return;

  // Each set completion = fresh exercise timer next time
  us.exerciseTimerRemaining = null;
  stopExerciseTimer(user);

  const setNumber = us.workoutStructure === 'circuit'
    ? us.circuitRound + 1
    : us.setIdx + 1;

  const loggedWeight = weightLabel(ex) ?? ex.defaultWeight;
  const loggedReps   = ex.durationSeconds ? null : (ex.currentReps != null ? String(ex.currentReps) : ex.reps);
  logSet(App.currentSession, user, ex.id, ex.name, setNumber,
         loggedReps, ex.durationSeconds, loggedWeight);

  if (us.workoutStructure === 'circuit') {
    us.exerciseIdx++;
    if (us.exerciseIdx >= us.exercises.length) {
      us.circuitRound++;
      us.exerciseIdx = 0;
      const totalRounds = us.exercises[0]?.sets ?? 3;
      if (us.circuitRound >= totalRounds) {
        us.completed = true;
        navigate('workout_runner');
        return;
      }
    }
    us.setIdx = us.circuitRound;
  } else {
    us.setIdx++;
    if (us.setIdx >= ex.sets) {
      us.exerciseIdx++;
      us.setIdx = 0;
      if (us.exerciseIdx >= us.exercises.length) {
        us.completed = true;
        navigate('workout_runner');
        return;
      }
    }
  }

  const restSecs = App.state.settings.defaultRestSeconds ?? ex.restSeconds ?? DEFAULT_REST_SECONDS;

  if (ws.mode === 'both') {
    startUserRestTimer(user, restSecs);
    // Navigate immediately so the resting-state panel (big countdown) appears
    // right away. The guard preserves workoutState; the post-navigate re-sync
    // will call startUserRestTimer again from the saved restRemaining value —
    // the old interval is cleared first so there's no double-counting.
    navigate('workout_runner');
  } else {
    showRestTimer(restSecs, ws[user]);
  }
}

// ---- Paired rest timer ------------------------------------

function startUserRestTimer(user, seconds) {
  const ws = App.workoutState;
  const us = ws[user];

  clearRestTimer(user);
  us.restRemaining = seconds;
  us.restTotal     = seconds;

  // Initial button state
  const btn = document.getElementById(`${user}-complete-btn`);
  if (btn) { btn.disabled = true; btn.textContent = 'Resting…'; }

  us.restInterval = setInterval(() => {
    us.restRemaining--;

    // Update the countdown in the resting panel (the big number)
    const display = document.getElementById(`${user}-rest-display`);
    if (display) {
      const m = String(Math.floor(us.restRemaining / 60)).padStart(2,'0');
      const s = String(us.restRemaining % 60).padStart(2,'0');
      display.textContent = `${m}:${s}`;
    }

    if (us.restRemaining <= 0) {
      clearRestTimer(user);

      // Chime in chimes mode
      if (App.state.settings.musicMode === 'chimes') {
        playTimerComplete(App.state.settings.audioEnabled);
      }

      // Re-render the full paired screen so both panels reflect current state.
      // The workout_runner guard preserves workoutState; post-render re-sync
      // will call startExerciseTimer for this user since restRemaining is now 0.
      navigate('workout_runner');
    }
  }, 1000);
}

// ---- Exercise duration timer (timed exercises) ------------

export function startExerciseTimer(user) {
  const ws = App.workoutState;
  const us = ws?.[user];
  const ex = us?.exercises?.[us.exerciseIdx];
  if (!ex?.durationSeconds) return;

  stopExerciseTimer(user);

  // Resume from saved position or start fresh
  let remaining = us.exerciseTimerRemaining ?? ex.durationSeconds;
  us.exerciseTimerRemaining = remaining;

  const el = document.getElementById(`${user}-ex-countdown`);
  if (!el) return;

  el.style.display = 'block';
  el.textContent   = formatTime(remaining);

  us.exerciseTimerInterval = setInterval(() => {
    remaining--;
    us.exerciseTimerRemaining = remaining;
    if (el) el.textContent = remaining > 0 ? formatTime(remaining) : '✓ Done';

    if (remaining <= 0) {
      stopExerciseTimer(user);
      if (App.state.settings.musicMode === 'chimes') {
        playTimerComplete(App.state.settings.audioEnabled);
      }
    }
  }, 1000);
}

function stopExerciseTimer(user) {
  const us = App.workoutState?.[user];
  if (!us) return;
  if (us.exerciseTimerInterval) {
    clearInterval(us.exerciseTimerInterval);
    us.exerciseTimerInterval = null;
  }
  // Do NOT clear exerciseTimerRemaining here — that position is preserved
  // across navigates so the timer can resume from where it left off.
  // exerciseTimerRemaining is explicitly nulled in advanceSet and skip handlers.
  const el = document.getElementById(`${user}-ex-countdown`);
  if (el) el.style.display = 'none';
}

function clearRestTimer(user) {
  const us = App.workoutState?.[user];
  if (!us) return;
  if (us.restInterval) { clearInterval(us.restInterval); us.restInterval = null; }
  us.restRemaining = 0;
}

function clearAllRestTimers() {
  clearRestTimer('eli');
  clearRestTimer('christina');
  stopTimer();
}

// ---- Single-user rest overlay -----------------------------

function showRestTimer(restSecs, currentUserState) {
  const nextExName = (() => {
    if (!currentUserState) return null;
    const { exerciseIdx, exercises, completed } = currentUserState;
    if (completed) return null;
    return exercises[exerciseIdx]?.name ?? null;
  })();

  const appEl = document.getElementById('app');
  appEl.insertAdjacentHTML('beforeend', renderRestOverlay(restSecs, restSecs, nextExName, null));

  App.workoutState.restActive       = true;
  App.workoutState.restTotalSeconds = restSecs;

  const playSound = App.state.settings.musicMode === 'chimes';
  startTimer(restSecs,
    (remaining) => { updateRestOverlayDOM(remaining, restSecs); },
    () => {
      App.workoutState.restActive = false;
      navigate('workout_runner');
    },
    playSound && App.state.settings.audioEnabled
  );

  document.getElementById('btn-pause-timer')?.addEventListener('click', (e) => {
    if (isTimerPaused()) {
      resumeTimer();
      e.currentTarget.textContent = 'Pause';
    } else {
      pauseTimer();
      e.currentTarget.textContent = 'Resume';
    }
  });

  document.getElementById('btn-skip-rest')?.addEventListener('click', () => {
    skipTimer();
  });
}

// ============================================================
// Finalize Session
// ============================================================
function finalizeSession() {
  if (!App.currentSession) return;

  const s = App.currentSession;
  if (App.ui.eliCheckin)       s.eliEndCheckin   = App.ui.eliCheckin;
  if (App.ui.christinaCheckin) s.christinaCheckin = App.ui.christinaCheckin;
  if (App.ui.meditationChoice) s.meditation       = App.ui.meditationChoice;

  completeSession(s);
  App.state.sessions.push(s);
  App.state.cycleState = updateCycleAfterSession(App.state.cycleState, s, App.data.exercises);
  App.state.cycleState.cycleId = App.state.cycleState.cycleId ?? 'cycle_001';
  saveState(App.state);
  playSessionComplete(App.state.settings.audioEnabled);

  // Snapshot the session data for the summary screen BEFORE nulling currentSession
  App.ui.lastSessionSummary = {
    date:                    s.date,
    users:                   s.users,
    eliRoutineId:            s.eliRoutineId,
    christinaRoutineId:      s.christinaRoutineId,
    christinaAdaptationLevel:s.christinaAdaptationLevel,
    meditation:              s.meditation
  };

  // Reset ephemeral state
  App.currentSession        = null;
  App.workoutState          = null;
  App.ui.eliCheckin         = null;
  App.ui.christinaCheckin   = null;
  App.ui.meditationChoice   = null;
  App.ui.christinaSymptoms  = null;
  App.ui.eliAnchors         = [];
  // Central reset so the next session always rebuilds its routine plan, rather
  // than relying on every entry path to clear this guard (audit R4).
  App.ui.routineSuggestionBuilt = false;
}

// ============================================================
// Start
// ============================================================
init();
