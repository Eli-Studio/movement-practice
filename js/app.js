// ============================================================
// app.js — Movement Practice · Main orchestrator  v0.4.1
// ============================================================

import { loadState, saveState, getDefaultState, clearState, importStateJSON } from './storage.js';
import { loadAllData } from './data.js';
import { unlockAudio, playSessionComplete, playMeditation, stopMeditation, playTimerComplete, playButtonClick } from './audio.js';
import { initCycleFromLaunchDate, startNewCycle, isCycleExpired, updateCycleAfterSession, getCycleProgressionSuggestions } from './cycles.js';
import { getUserAReadiness } from './reports.js';
import { getUserASuggestion, getUserBSuggestion, getMissedDays } from './rotation.js';
import { adaptUserBExercises, adaptWorkoutToCapacity, composeCapacityPlan, annotateSymptomConflicts } from './adaptation.js';
import { analyzePairedConflicts, getConflictingItems } from './equipment.js';
import { buildExercisePlan, createSession, logSet, skipExercise,
         completeSession, getTemplateAnchors,
         adjustWeight, weightLabel, adjustReps, repsLabel, swapExercise } from './workout.js';
import { startTimer, stopTimer, pauseTimer, resumeTimer, isTimerPaused, skipTimer } from './timer.js';
import { exportFullBackupJSON, exportMonthCSV, exportMonthMarkdown, exportCycleMarkdown } from './exports.js';
import { today, showToast, formatTime, addDays, getTomorrowDate, safeSpotifyUrl } from './utils.js';
import { DEFAULT_REST_SECONDS, USERA_HEAVY_SEQUENCE, USERB_SEQUENCE } from './config.js';
import { getActiveProfileIds, setSecondProfileActive } from './profiles.js';

import {
  renderFirstLaunch, renderHello, renderResumeWorkout, renderMissedDays, renderLogToday, renderSymptomCheck,
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
    userBSymptoms:      null,
    symptomsByUser:         {},
    pendingSymptomUsers:    [],
    activeSymptomUser:      null,
    capacityChoiceByUser:   {},
    capacityDimensionChoices: {},
    userASuggestion:          null,
    userBSuggestion:    null,
    selectedUserARoutine:     null,
    selectedUserBRoutine: null,
    userAAnchors:             [],
    conflicts:              [],
    userACheckin:             null,
    userBCheckin:       null,
    meditationChoice:       null,
    endCheckins:            {},
    missedDayChoices:       {},
    calYear:                null,
    calMonth:               null,
    lastSessionSummary:     null,  // snapshot for session_summary screen
    backupNudgeDismissed:   false, // session-only; "Later" returns next app load
    guideActive:            false,
    tutorialWorkout:        false
  },
  workoutState:   null,
  currentSession: null
};

const App = window.App;

const cloneSerializable = value => JSON.parse(JSON.stringify(value));

function persistWorkoutDraft(screen = App.ui.currentScreen) {
  if (!App.state || !App.currentSession || !App.workoutState) return;
  const workoutState = cloneSerializable(App.workoutState);
  for (const user of ['userA', 'userB']) {
    if (!workoutState[user]) continue;
    workoutState[user].restInterval = null;
    workoutState[user].exerciseTimerInterval = null;
  }
  App.state.workoutDraft = {
    version: 1,
    savedAt: new Date().toISOString(),
    screen: ['workout_runner', 'end_checkin', 'meditation'].includes(screen) ? screen : 'workout_runner',
    session: cloneSerializable(App.currentSession),
    workoutState,
    ui: cloneSerializable({
      selectedUsers: App.ui.selectedUsers,
      symptomsByUser: App.ui.symptomsByUser,
      userACheckin: App.ui.userACheckin,
      userBCheckin: App.ui.userBCheckin,
      endCheckins: App.ui.endCheckins,
      meditationChoice: App.ui.meditationChoice,
      tutorialWorkout: App.ui.tutorialWorkout,
      guideActive: App.ui.guideActive
    })
  };
  saveState(App.state);
}

function resumeWorkoutDraft() {
  const draft = App.state?.workoutDraft;
  if (!draft) return;
  clearAllRestTimers();
  App.currentSession = cloneSerializable(draft.session);
  App.workoutState = cloneSerializable(draft.workoutState);
  for (const user of ['userA', 'userB']) {
    if (!App.workoutState[user]) continue;
    App.workoutState[user].restInterval = null;
    App.workoutState[user].exerciseTimerInterval = null;
  }
  const restoredUsers = Array.isArray(draft.ui?.selectedUsers)
    ? draft.ui.selectedUsers
    : (draft.session.users ?? []);
  Object.assign(App.ui, {
    selectedUsers: [...restoredUsers],
    symptomsByUser: cloneSerializable(draft.ui?.symptomsByUser ?? {}),
    userACheckin: draft.ui?.userACheckin ?? null,
    userBCheckin: draft.ui?.userBCheckin ?? null,
    endCheckins: cloneSerializable(draft.ui?.endCheckins ?? {}),
    meditationChoice: draft.ui?.meditationChoice ?? null,
    tutorialWorkout: Boolean(draft.ui?.tutorialWorkout),
    guideActive: Boolean(draft.ui?.guideActive)
  });
  navigate(draft.screen ?? 'workout_runner');
  showToast('Workout resumed', 'success');
}

function discardWorkoutDraft() {
  clearAllRestTimers();
  App.state.workoutDraft = null;
  App.currentSession = null;
  App.workoutState = null;
  App.ui.selectedUsers = [];
  App.ui.symptomsByUser = {};
  App.ui.endCheckins = {};
  App.ui.tutorialWorkout = false;
  App.ui.guideActive = false;
  saveState(App.state);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistWorkoutDraft();
});
window.addEventListener('pagehide', () => persistWorkoutDraft());

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

window.addEventListener('movement:save-error', () => {
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
    } else if (App.state.workoutDraft) {
      navigate('resume_workout');
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
      <div style="padding:32px;color:var(--status-critical, #c88071);font-family:sans-serif;">
        <h2>Failed to load</h2>
        <p style="margin-top:8px;color:var(--text-2, #aaa294);">
          The app couldn't load its data files. Refresh the page; if it keeps failing,
          your browser may be blocking local storage or offline cache.
        </p>
        <pre style="margin-top:16px;font-size:0.8rem;color:var(--text-2, #aaa294);white-space:pre-wrap;">${err.message}</pre>
      </div>
    `;
  }
}

// ============================================================
// Navigation
// ============================================================
function navigate(screen) {
  const sameScreen = App.ui.currentScreen === screen;
  const previousScrollY = window.scrollY;
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

    case 'resume_workout':
      html = renderResumeWorkout(App);
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
      html = renderSymptomCheck(App, App.ui.activeSymptomUser ?? 'userB');
      break;

    case 'routine_suggestion': {
      const users    = App.ui.selectedUsers;
      const cycleNum = App.state.cycleState?.cycleNumber ?? 1;

      if (!App.ui.routineSuggestionBuilt) {
        let userAPlan = [], userBPlan = [];

        if (users.includes('userA')) {
          const style = 'progressive';
          if (style === 'progressive') {
            App.ui.userASuggestion = getUserASuggestion(App.state.cycleState, App.state.sessions, App.state.missedDays);
          } else {
            const proxy = { ...App.state.cycleState, userBSequencePointer: App.state.cycleState.userASequencePointer };
            const adaptive = getUserBSuggestion(proxy, App.ui.symptomsByUser.userA);
            const trackingId = USERA_HEAVY_SEQUENCE[App.state.cycleState.userASequencePointer % USERA_HEAVY_SEQUENCE.length];
            App.ui.userASuggestion = {
              primary: { ...adaptive.primary, id: trackingId,
                templateId: adaptive.primary.templateId ?? adaptive.primary.id,
                type: 'heavy_weight' },
              alternatives: adaptive.alternatives,
              heavyBlocked: adaptive.heavyBlocked,
              heavyBlockedReason: adaptive.heavyBlockedReason
            };
          }
          App.ui.selectedUserARoutine = {
            id:    App.ui.userASuggestion.primary.id,
            templateId: App.ui.userASuggestion.primary.templateId,
            type:  App.ui.userASuggestion.primary.type,
            label: App.ui.userASuggestion.primary.label
          };
          if (App.ui.selectedUserARoutine.id !== 'skip_rest') {
            const tmpl = App.data.routineTemplates.find(t => t.id === (App.ui.selectedUserARoutine.templateId ?? App.ui.selectedUserARoutine.id));
            if (tmpl) {
              userAPlan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('userA')).length, cycleNum,
                App.state.cycleState?.userAExerciseWeights ?? {},
                App.state.cycleState?.userAExerciseRepsTarget ?? {},
                App.state.settings.profiles.userA,
                App.state.settings.unavailableEquipmentIds);
              if (style === 'pain_adaptive') {
                userAPlan = adaptUserBExercises(userAPlan, App.ui.symptomsByUser.userA);
                userAPlan = annotateSymptomConflicts(userAPlan, App.ui.symptomsByUser.userA);
              }
              const adjustment = adaptWorkoutToCapacity(userAPlan, App.ui.symptomsByUser.userA, App.state.settings.profiles.userA);
              App.ui.userAOriginalPlan = userAPlan;
              App.ui.userACapacityAdjustment = adjustment;
              App.ui.userARecommendedPlan = adjustment.plan;
              App.ui.capacityDimensionChoices.userA ??= {};
              userAPlan = adjustment.plan;
              App.ui.userAAnchors = App.ui.userASuggestion.primary.type === 'heavy_weight'
                ? getTemplateAnchors(tmpl, App.data.exercises, cycleNum) : [];
            }
          } else {
            App.ui.userAAnchors = [];
          }
          App.ui.userAExercisePlan = userAPlan;
        }

        if (users.includes('userB')) {
          const style = 'progressive';
          if (style === 'pain_adaptive') {
            App.ui.userBSuggestion = getUserBSuggestion(App.state.cycleState, App.ui.symptomsByUser.userB);
          } else {
            const proxy = { ...App.state.cycleState,
              userASequencePointer: App.state.cycleState.userBSequencePointer,
              userALastHeavyDate: App.state.cycleState.userBLastActivityDate };
            const mappedSessions = App.state.sessions.map(s => ({ ...s,
              users: s.users.includes('userB') ? [...new Set([...s.users, 'userA'])] : s.users }));
            const strength = getUserASuggestion(proxy, mappedSessions, App.state.missedDays);
            const trackingId = USERB_SEQUENCE[App.state.cycleState.userBSequencePointer % USERB_SEQUENCE.length];
            App.ui.userBSuggestion = {
              primary: { ...strength.primary, id: trackingId, templateId: strength.primary.id,
                adaptationLevel: 'normal' },
              alternatives: strength.alternatives.map(alt => ({ ...alt, adaptationLevel: 'normal' })),
              heavyBlocked: strength.heavyBlocked,
              heavyBlockedReason: strength.heavyBlockedReason
            };
          }
          App.ui.selectedUserBRoutine = {
            id:    App.ui.userBSuggestion.primary.id,
            templateId: App.ui.userBSuggestion.primary.templateId,
            level: App.ui.userBSuggestion.primary.adaptationLevel,
            label: App.ui.userBSuggestion.primary.label
          };
          if (App.ui.selectedUserBRoutine.id !== 'skip_rest') {
            const tmplId = App.ui.selectedUserBRoutine.templateId ?? App.ui.selectedUserBRoutine.id;
            const tmpl = App.data.routineTemplates.find(t => t.id === tmplId);
            if (tmpl) {
              let plan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('userB')).length, cycleNum,
                {}, {}, App.state.settings.profiles.userB,
                App.state.settings.unavailableEquipmentIds);
              if (style === 'pain_adaptive') plan = adaptUserBExercises(plan, App.ui.symptomsByUser.userB);
              const adjustment = adaptWorkoutToCapacity(plan, App.ui.symptomsByUser.userB, App.state.settings.profiles.userB);
              App.ui.userBOriginalPlan = plan;
              App.ui.userBCapacityAdjustment = adjustment;
              App.ui.userBRecommendedPlan = adjustment.plan;
              App.ui.capacityDimensionChoices.userB ??= {};
              plan = adjustment.plan;
              // Advisory: flag exercises that conflict with today's active symptoms (no removal).
              plan = annotateSymptomConflicts(plan, App.ui.symptomsByUser.userB);
              userBPlan = plan;
            }
          }
          App.ui.userBExercisePlan = userBPlan;
        }

        if (users.length === 2 && userAPlan.length && userBPlan.length) {
          userBPlan = reorderToReduceConflicts(userAPlan, userBPlan, App.data.exercises);
          App.ui.userBExercisePlan = userBPlan;
          App.ui.conflicts = analyzePairedConflicts(userAPlan, userBPlan, App.data.exercises);
        } else {
          App.ui.conflicts = [];
        }

        App.ui.routineSuggestionBuilt = true;
      }

      // Re-apply after every render so changing the selected routine during the
      // guide cannot expand the practice session back to full length.
      if (App.ui.tutorialWorkout) {
        App.ui.userAExercisePlan = shortenTutorialPlan(App.ui.userAExercisePlan);
        App.ui.userBExercisePlan = shortenTutorialPlan(App.ui.userBExercisePlan);
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
      const tutorialWasActive = App.ui.tutorialWorkout;
      finalizeSession();    // saves state, stores lastSessionSummary, nulls currentSession
      if (tutorialWasActive) completeGettingStartedGuide();
      html = renderSessionSummary(App);
      break;
    }

    case 'cycle_review': {
      App.ui.cycleReviewSnapshot = {
        cycleState: App.state.cycleState,
        sessions:   App.state.sessions
      };
      const activeProfiles = getActiveProfileIds(App.state.settings);
      const heavyTemplates = App.data.routineTemplates.filter(t => USERA_HEAVY_SEQUENCE.includes(t.id));
      const userAReadiness = getUserAReadiness(App.state.sessions, App.state.cycleState);
      App.ui.cycleProgressionSuggestions = activeProfiles.includes('userA')
        ? getCycleProgressionSuggestions(
          App.state.cycleState, App.data.exercises, heavyTemplates, userAReadiness.overall,
          App.state.settings.profiles.userA
        ) : [];
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
    heading.focus({ preventScroll: sameScreen });
  }
  if (sameScreen) requestAnimationFrame(() => window.scrollTo({ top: previousScrollY, behavior: 'instant' }));

  // Re-sync timers after every workout_runner render.
  // The guard above ensures workoutState is preserved, so restRemaining and
  // exerciseTimerRemaining are correct — we just need fresh DOM references.
  if (screen === 'workout_runner' && App.workoutState) {
    const ws = App.workoutState;
    if (ws.mode === 'both') {
      ['userA', 'userB'].forEach(u => {
        if (ws[u].restRemaining > 0) {
          // User is mid-rest — restart interval with saved countdown
          startUserRestTimer(u, ws[u].restRemaining);
        } else {
          // User is active — restart exercise timer only if not already tracked
          // (avoids resetting the other user's in-progress timed exercise)
          startExerciseTimer(u);
        }
      });
    } else if (ws.restActive && ws.restRemaining > 0) {
      const user = ws.mode === 'userA_only' ? 'userA' : 'userB';
      showRestTimer(ws.restRemaining, ws[user], ws.restTotalSeconds || ws.restRemaining, ws.restPaused);
    } else {
      const user = ws.mode === 'userA_only' ? 'userA' : 'userB';
      startExerciseTimer(user);
    }
  }

  if (['workout_runner', 'end_checkin', 'meditation'].includes(screen) && App.currentSession) {
    persistWorkoutDraft(screen);
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

  document.querySelectorAll('[data-guide-skip]').forEach(btn => {
    btn.addEventListener('click', () => {
      completeGettingStartedGuide();
      App.ui.tutorialWorkout = false;
      navigate('hello');
    });
  });

  on('btn-guide-hide', 'click', () => {
    completeGettingStartedGuide();
    navigate('workout_runner');
  });

  switch (screen) {

    case 'resume_workout':
      on('btn-resume-workout', 'click', resumeWorkoutDraft);
      on('btn-discard-workout', 'click', () => {
        if (!confirm('Discard this unfinished workout? Completed workout history will not be changed.')) return;
        discardWorkoutDraft();
        navigate('hello');
      });
      break;

    case 'first_launch':
      document.querySelectorAll('[data-profile-count]').forEach(btn => {
        btn.addEventListener('click', () => {
          const twoProfiles = btn.dataset.profileCount === 'two';
          document.querySelectorAll('[data-profile-count]').forEach(choice => {
            const selected = choice === btn;
            choice.classList.toggle('active', selected);
            choice.setAttribute('aria-pressed', String(selected));
          });
          get('onboard-second-profile')?.classList.toggle('hidden', !twoProfiles);
        });
      });
      on('btn-onboard-bodyweight', 'click', () => {
        const keep = new Set(['open_space', 'yoga_mats', 'adjustable_bench']);
        document.querySelectorAll('[data-onboard-equipment]').forEach(cb => { cb.checked = keep.has(cb.value); });
      });
      on('btn-onboard-all-equipment', 'click', () => {
        document.querySelectorAll('[data-onboard-equipment]').forEach(cb => { cb.checked = true; });
      });
      on('btn-launch', 'click', () => {
        const dateEl = get('launch-date');
        const launch = dateEl?.value || getTomorrowDate();
        const twoProfiles = get('onboard-profile-two')?.classList.contains('active');
        App.state.settings.activeProfileIds = twoProfiles ? ['userA', 'userB'] : ['userA'];
        App.state.settings.gettingStartedGuideCompleted = false;
        App.state.settings.activeProfileIds.forEach(userId => {
          const profile = App.state.settings.profiles[userId];
          profile.displayName = get(`onboard-name-${userId}`)?.value.trim() || profile.displayName;
          profile.primaryGoal = get(`onboard-goal-${userId}`)?.value || 'general_fitness';
          profile.experienceLevel = get(`onboard-experience-${userId}`)?.value || 'some';
          profile.adaptationPreference = get(`onboard-adaptation-${userId}`)?.value || 'both';
          profile.progressionMode = profile.adaptationPreference === 'daily_capacity' ? 'fixed' : 'cycle_review';
        });
        App.state.settings.unavailableEquipmentIds = [...document.querySelectorAll('[data-onboard-equipment]')]
          .filter(cb => !cb.checked).map(cb => cb.value);
        App.state.settings.launchDate        = launch;
        App.state.settings.currentCycleStart = launch;
        App.state.cycleState = initCycleFromLaunchDate(launch);
        App.state.cycleState.startDate = launch;
        saveState(App.state);
        navigate('hello');
      });
      break;

    case 'hello':
      on('btn-guide-start', 'click', () => {
        App.ui.guideActive = true;
        navigate('settings');
      });
      document.querySelectorAll('[data-who]').forEach(btn => {
        btn.addEventListener('click', e => {
          const who = e.currentTarget.dataset.who;
          App.ui.selectedUsers = who === 'both' ? getActiveProfileIds(App.state.settings) : [who];
          navigate('missed_days');
        });
      });
      on('btn-skip-today', 'click', () => {
        App.ui.selectedUsers = getActiveProfileIds(App.state.settings);
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
      const activeProfiles = getActiveProfileIds(App.state.settings);
      let logUsers = [...activeProfiles];

      // Apply initial selected state to Both button via inline style
      const _initWhoBtn = document.getElementById('log-who-both');
      if (_initWhoBtn && activeProfiles.length === 2) {
        _initWhoBtn.style.border = '2px solid var(--action-primary)';
        _initWhoBtn.style.background = 'color-mix(in srgb, var(--action-primary) 12%, var(--surface))';
        _initWhoBtn.style.color = 'var(--action-primary)';
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
            b.setAttribute('aria-pressed', 'false');
          });
          // Highlight the tapped button
          const t = e.currentTarget;
          t.style.border = '2px solid var(--action-primary)';
          t.style.background = 'color-mix(in srgb, var(--action-primary) 12%, var(--surface))';
          t.style.color = 'var(--action-primary)';
          t.style.fontWeight = '700';
          t.setAttribute('aria-pressed', 'true');
          const who = t.dataset.logWho;
          logUsers = who === 'both' ? [...activeProfiles] : [who];
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
          parent?.querySelectorAll('.miss-cat-btn').forEach(b => {
            b.classList.remove('selected');
            b.setAttribute('aria-pressed', 'false');
          });
          e.currentTarget.classList.add('selected');
          e.currentTarget.setAttribute('aria-pressed', 'true');
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
      const selectPressed = (buttons, selectedButton) => buttons.forEach(button => {
        const selected = button === selectedButton;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });

      document.querySelectorAll('#pain-picker .pain-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          selectPressed(document.querySelectorAll('#pain-picker .pain-btn'), e.currentTarget);
          currentPainDay = e.currentTarget.dataset.value;
        });
      });

      document.querySelectorAll('.symptom-cluster-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.currentTarget.dataset.symptom;
          if (activeSymptoms.has(id)) {
            activeSymptoms.delete(id);
            e.currentTarget.classList.remove('active');
            e.currentTarget.setAttribute('aria-pressed', 'false');
          } else {
            activeSymptoms.add(id);
            e.currentTarget.classList.add('active');
            e.currentTarget.setAttribute('aria-pressed', 'true');
          }
        });
      });

      document.querySelectorAll('[data-energy]').forEach(btn => btn.addEventListener('click', e => {
        selectPressed(document.querySelectorAll('[data-energy]'), e.currentTarget);
        currentEnergy = e.currentTarget.dataset.energy;
      }));
      document.querySelectorAll('[data-soreness]').forEach(btn => btn.addEventListener('click', e => {
        selectPressed(document.querySelectorAll('[data-soreness]'), e.currentTarget);
        currentSoreness = e.currentTarget.dataset.soreness;
      }));

      const finishCapacity = (useDefaults = false) => {
        const symptoms = {};
        activeSymptoms.forEach(id => { symptoms[id] = 5; });
        const userId = App.ui.activeSymptomUser ?? 'userB';
        App.ui.symptomsByUser[userId] = {
          painDay: useDefaults ? 'low' : currentPainDay,
          energy: useDefaults ? 'medium' : currentEnergy,
          soreness: useDefaults ? 'low' : currentSoreness,
          symptoms: useDefaults ? {} : symptoms
        };
        if (userId === 'userB') App.ui.userBSymptoms = App.ui.symptomsByUser[userId];
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
        if (App.ui.selectedUsers?.length === 2 && App.ui.userAExercisePlan?.length && App.ui.userBExercisePlan?.length) {
          App.ui.userBExercisePlan = reorderToReduceConflicts(App.ui.userAExercisePlan, App.ui.userBExercisePlan, App.data.exercises);
          App.ui.conflicts = analyzePairedConflicts(App.ui.userAExercisePlan, App.ui.userBExercisePlan, App.data.exercises);
        }
      };
      const chooseCapacityPlan = (userId, useOriginal) => {
        const key = userId === 'userA' ? 'userAExercisePlan' : 'userBExercisePlan';
        const mode = useOriginal ? 'original' : 'recommended';
        App.ui.capacityDimensionChoices[userId] = {
          length: mode, volume: mode, load: mode, rest: mode
        };
        const original = App.ui[`${userId}OriginalPlan`];
        const recommended = App.ui[`${userId}RecommendedPlan`];
        if (original && recommended) App.ui[key] = composeCapacityPlan(original, recommended, App.ui.capacityDimensionChoices[userId]);
        App.ui.capacityChoiceByUser[userId] = useOriginal ? 'original' : 'recommended';
        refreshConflicts();
        navigate('routine_suggestion');
      };
      on('btn-userA-original', 'click', () => chooseCapacityPlan('userA', true));
      on('btn-userA-recommended', 'click', () => chooseCapacityPlan('userA', false));
      on('btn-userB-original', 'click', () => chooseCapacityPlan('userB', true));
      on('btn-userB-recommended', 'click', () => chooseCapacityPlan('userB', false));
      const reviewCapacityPlan = userId => {
        App.ui.capacityChoiceByUser[userId] = null;
        navigate('routine_suggestion');
      };
      on('btn-userA-review-capacity', 'click', () => reviewCapacityPlan('userA'));
      on('btn-userB-review-capacity', 'click', () => reviewCapacityPlan('userB'));
      document.querySelectorAll('[data-capacity-user]').forEach(btn => btn.addEventListener('click', () => {
        const userId = btn.dataset.capacityUser;
        const dimension = btn.dataset.capacityDimension;
        App.ui.capacityDimensionChoices[userId] ??= {};
        App.ui.capacityDimensionChoices[userId][dimension] = btn.dataset.capacityMode;
        const original = App.ui[`${userId}OriginalPlan`];
        const recommended = App.ui[`${userId}RecommendedPlan`];
        const key = userId === 'userA' ? 'userAExercisePlan' : 'userBExercisePlan';
        if (original && recommended) App.ui[key] = composeCapacityPlan(original, recommended, App.ui.capacityDimensionChoices[userId]);
        const adjustment = App.ui[`${userId}CapacityAdjustment`];
        const comparison = adjustment?.comparison ?? {};
        const changedDimensions = [
          comparison.originalCount !== comparison.recommendedCount,
          Boolean(comparison.recommendedReps),
          (comparison.loadFactor ?? 1) !== 1,
          Boolean(comparison.restBonus)
        ].filter(Boolean).length;
        if (changedDimensions === 1) App.ui.capacityChoiceByUser[userId] = btn.dataset.capacityMode;
        refreshConflicts();
        navigate('routine_suggestion');
      }));

      on('userA-alt-toggle', 'click', () => {
        const panel = get('userA-alternatives');
        panel?.classList.toggle('hidden');
        get('userA-alt-toggle')?.setAttribute('aria-expanded', String(!panel?.classList.contains('hidden')));
      });
      on('userB-alt-toggle', 'click', () => {
        const panel = get('userB-alternatives');
        panel?.classList.toggle('hidden');
        get('userB-alt-toggle')?.setAttribute('aria-expanded', String(!panel?.classList.contains('hidden')));
      });

      document.querySelectorAll('[data-swap-user]').forEach(row => {
        row.addEventListener('click', e => {
          const user = e.currentTarget.dataset.swapUser;
          const idx  = parseInt(e.currentTarget.dataset.swapIndex, 10);
          const plan = user === 'userA' ? App.ui.userAExercisePlan : App.ui.userBExercisePlan;
          if (!plan) return;
          // User A's swaps carry forward any progressed weight for the new exercise.
          const weightOverrides = user === 'userA' ? (App.state.cycleState?.userAExerciseWeights ?? {}) : {};
          swapExercise(plan, App.data.exercises, idx, weightOverrides, App.state.settings.profiles[user]);
          // A swap changes the exercise (and its attributes) — re-flag symptom
          // conflicts on User B's plan so the advisory badges stay correct.
          if (user === 'userB') {
            App.ui.userBExercisePlan = annotateSymptomConflicts(
              App.ui.userBExercisePlan, App.ui.userBSymptoms);
          }
          // Re-derive conflicts if both users are in this session — a swap
          // can change equipment overlap between the two panels.
          if (App.ui.selectedUsers?.length === 2 &&
              App.ui.userAExercisePlan?.length && App.ui.userBExercisePlan?.length) {
            App.ui.conflicts = analyzePairedConflicts(
              App.ui.userAExercisePlan, App.ui.userBExercisePlan, App.data.exercises);
          }
          navigate('routine_suggestion');
        });
      });

      document.querySelectorAll('[data-user="userA"]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id   = e.currentTarget.dataset.id;
          const type = e.currentTarget.dataset.type;
          const templateId = e.currentTarget.dataset.templateId || id;
          const label = e.currentTarget.dataset.label || e.currentTarget.textContent.trim().replace('Current', '').replace('›','').trim();
          App.ui.selectedUserARoutine = { id, templateId, type, label };
          if (id !== 'skip_rest') {
            const tmpl = App.data.routineTemplates.find(t => t.id === templateId);
            if (tmpl) {
              let plan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('userA')).length, cycleNum,
                App.state.cycleState?.userAExerciseWeights ?? {},
                App.state.cycleState?.userAExerciseRepsTarget ?? {},
                App.state.settings.profiles.userA,
                App.state.settings.unavailableEquipmentIds);
              const adjustment = adaptWorkoutToCapacity(plan, App.ui.symptomsByUser.userA, App.state.settings.profiles.userA);
              App.ui.userAOriginalPlan = plan;
              App.ui.userACapacityAdjustment = adjustment;
              App.ui.userARecommendedPlan = adjustment.plan;
              App.ui.capacityChoiceByUser.userA = null;
              plan = composeCapacityPlan(plan, adjustment.plan, App.ui.capacityDimensionChoices.userA ?? {});
              App.ui.userAExercisePlan = annotateSymptomConflicts(plan, App.ui.symptomsByUser.userA);
              App.ui.userAAnchors = type === 'heavy_weight'
                ? getTemplateAnchors(tmpl, App.data.exercises, cycleNum) : [];
            }
          } else {
            App.ui.userAExercisePlan = [];
            App.ui.userAAnchors = [];
          }
          document.querySelectorAll('[data-user="userA"]').forEach(b => b.classList.remove('selected'));
          e.currentTarget.classList.add('selected');
          refreshConflicts();
          showToast(`${App.state.settings.profiles.userA.displayName}: ${label}`);
          navigate('routine_suggestion');
        });
      });

      document.querySelectorAll('[data-user="userB"]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id    = e.currentTarget.dataset.id;
          const level = e.currentTarget.dataset.adaptation;
          const templateId = e.currentTarget.dataset.templateId || id;
          const label = e.currentTarget.dataset.label || e.currentTarget.textContent.trim().replace('Current', '').replace('›','').trim();
          App.ui.selectedUserBRoutine = { id, templateId, level, label };

          // Rebuild User B's plan for the chosen routine (mirrors User A's handler).
          // Previously this was skipped, so the shown exercise list, swap rows, and
          // conflict banner kept operating on the prior routine's plan until the
          // workout actually started — audit B4.
          if (id !== 'skip_rest') {
            const tmpl = App.data.routineTemplates.find(t => t.id === templateId);
            if (tmpl) {
              let plan = buildExercisePlan(tmpl, App.data.exercises,
                App.state.sessions.filter(s => s.users.includes('userB')).length, cycleNum,
                {}, {}, App.state.settings.profiles.userB,
                App.state.settings.unavailableEquipmentIds);
              const capacity = App.ui.symptomsByUser.userB;
              const adjustment = adaptWorkoutToCapacity(plan, capacity, App.state.settings.profiles.userB);
              App.ui.userBOriginalPlan = plan;
              App.ui.userBCapacityAdjustment = adjustment;
              App.ui.userBRecommendedPlan = adjustment.plan;
              App.ui.capacityChoiceByUser.userB = null;
              plan = composeCapacityPlan(plan, adjustment.plan, App.ui.capacityDimensionChoices.userB ?? {});
              App.ui.userBExercisePlan = annotateSymptomConflicts(plan, capacity);
            }
          } else {
            App.ui.userBExercisePlan = [];
          }

          // A routine change can alter equipment overlap with User A's plan.
          if (App.ui.selectedUsers?.length === 2 &&
              App.ui.userAExercisePlan?.length && App.ui.userBExercisePlan?.length) {
            App.ui.userBExercisePlan = reorderToReduceConflicts(
              App.ui.userAExercisePlan, App.ui.userBExercisePlan, App.data.exercises);
            App.ui.conflicts = analyzePairedConflicts(
              App.ui.userAExercisePlan, App.ui.userBExercisePlan, App.data.exercises);
          }

          document.querySelectorAll('[data-user="userB"]').forEach(b => b.classList.remove('selected','selected--indigo'));
          e.currentTarget.classList.add('selected--indigo');
          showToast(`${App.state.settings.profiles.userB.displayName}: ${label}`);
          navigate('routine_suggestion');
        });
      });

      on('btn-start-workout', 'click', () => {
        const userAR  = App.ui.selectedUserARoutine;
        const userBR    = App.ui.selectedUserBRoutine;
        const users = [...App.ui.selectedUsers];

        const missingPlan = users.find(userId => {
          const routine = userId === 'userA' ? userAR : userBR;
          const plan = userId === 'userA' ? App.ui.userAExercisePlan : App.ui.userBExercisePlan;
          return routine?.id !== 'skip_rest' && !plan?.length;
        });
        if (missingPlan) {
          const name = App.state.settings.profiles[missingPlan].displayName;
          showToast(`No compatible exercises for ${name}. Enable more equipment or exercises in Settings.`, 'error', 6000);
          return;
        }

        const skipping = users.filter(u =>
          (u === 'userA'       && userAR?.id === 'skip_rest') ||
          (u === 'userB' && userBR?.id   === 'skip_rest')
        );
        if (skipping.length) {
          const t = today();
          if (!App.state.missedDays.find(m => m.date === t)) {
            App.state.missedDays.push({ date: t, category: 'skip_rest', users: skipping, notes: '' });
          }
          saveState(App.state);
        }

        const activeUsers = users.filter(u =>
          !(u === 'userA'       && userAR?.id === 'skip_rest') &&
          !(u === 'userB' && userBR?.id   === 'skip_rest')
        );

        if (!activeUsers.length) {
          showToast('Day logged as rest.', 'success');
          navigate('hello');
          return;
        }
        App.ui.selectedUsers = activeUsers;
        App.workoutState = null;   // force fresh build
        navigate(App.ui.tutorialWorkout ? 'workout_runner' : 'warmup');
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
      const checkins = App.ui.endCheckins ??= {};
      App.ui.selectedUsers.forEach(userId => {
        checkins[userId] ??= { effort: null, jointPain: 'no', notes: '' };
      });

      document.querySelectorAll('[data-effort-user]').forEach(btn => {
        btn.addEventListener('click', e => {
          const userId = e.currentTarget.dataset.effortUser;
          document.querySelectorAll(`[data-effort-user="${userId}"]`).forEach(b => {
            b.classList.remove('selected');
            b.setAttribute('aria-pressed', 'false');
          });
          e.currentTarget.classList.add('selected');
          e.currentTarget.setAttribute('aria-pressed', 'true');
          checkins[userId].effort = parseInt(e.currentTarget.dataset.value);
          persistWorkoutDraft('end_checkin');
        });
      });

      document.querySelectorAll('[data-joint-pain-user]').forEach(btn => {
        btn.addEventListener('click', e => {
          const userId = e.currentTarget.dataset.jointPainUser;
          document.querySelectorAll(`[data-joint-pain-user="${userId}"]`).forEach(b => {
            b.classList.remove('selected','selected--none');
            b.setAttribute('aria-pressed', 'false');
          });
          const pain = e.currentTarget.dataset.value;
          e.currentTarget.classList.add(pain === 'no' ? 'selected--none' : 'selected');
          e.currentTarget.setAttribute('aria-pressed', 'true');
          checkins[userId].jointPain = pain;
          persistWorkoutDraft('end_checkin');
        });
      });

      App.ui.selectedUsers.forEach(userId => {
        get(`notes-${userId}`)?.addEventListener('input', e => {
          checkins[userId].notes = e.currentTarget.value;
          persistWorkoutDraft('end_checkin');
        });
      });

      on('btn-checkin-done', 'click', () => {
        const users = App.ui.selectedUsers;
        users.forEach(userId => {
          checkins[userId].notes = get(`notes-${userId}`)?.value ?? checkins[userId].notes ?? '';
          App.currentSession.profileCheckins[userId] = {
            ...(App.currentSession.profileCheckins[userId] ?? {}), ...checkins[userId]
          };
        });
        if (users.includes('userA')) App.ui.userACheckin = {
          formFatigue: checkins.userA.effort, jointPain: checkins.userA.jointPain,
          jointLocations: [], notes: checkins.userA.notes
        };
        if (users.includes('userB')) {
          App.ui.userBCheckin = {
            notes: checkins.userB.notes,
            painDay: App.ui.symptomsByUser.userB?.painDay ?? 'low',
            symptoms: App.ui.symptomsByUser.userB?.symptoms ?? {}
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
          e.currentTarget.classList.toggle('btn--userA', nowAccepted);
          e.currentTarget.classList.toggle('btn--ghost', !nowAccepted);

          const arrow = get(`progression-arrow-${exId}`);
          if (arrow) {
            arrow.innerHTML = nowAccepted
              ? `→ <strong style="color:var(--action-primary);">${sugg.suggestedKg}kg</strong> across all lifts, reps restart`
              : `(holding at ${sugg.currentKg}kg)`;
          }
        });
      });

      on('btn-start-new-cycle', 'click', () => {
        const cycleState = App.state.cycleState;

        // An accepted baseline bump raises the profile's single working weight
        // (every non-overridden lift moves together) and clears the rep targets
        // so the rep climb restarts at the new load. startNewCycle() already
        // resets userAExerciseWeights to {}, so next cycle's lifts pick up the new
        // baseline automatically. Reps still climbing / held weight need no write.
        const baselineAccepted = App.ui.acceptedProgressionIds.has('baseline');
        if (baselineAccepted) {
          const sugg = App.ui.cycleProgressionSuggestions.find(s => s.type === 'baseline');
          if (sugg) {
            App.state.settings.profiles.userA.baselineWeightKg = sugg.suggestedKg;
            cycleState.userAExerciseRepsTarget = {};   // re-climb reps at the new weight
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
        showToast(`Exported ${exportMonthCSV(App.state.sessions, App.state.missedDays, App.ui.calYear, App.ui.calMonth, App.state.settings.profiles, getActiveProfileIds(App.state.settings))}`, 'success');
      });
      get('btn-export-month-md')?.addEventListener('click', () => {
        showToast(`Exported ${exportMonthMarkdown(App.state.sessions, App.state.missedDays, App.ui.calYear, App.ui.calMonth, App.state.settings.profiles, getActiveProfileIds(App.state.settings))}`, 'success');
      });
      get('btn-export-cycle')?.addEventListener('click', () => {
        showToast(`Exported ${exportCycleMarkdown(App.state.cycleState, App.state.sessions, App.state.settings.profiles, getActiveProfileIds(App.state.settings))}`, 'success');
      });
      get('btn-export-json')?.addEventListener('click', () => {
        markBackedUp();
        showToast(`Backup saved: ${exportFullBackupJSON(App.state)}`, 'success');
      });
      break;
    }

    case 'settings': {
      // ---- Profiles ----
      on('btn-guide-start-settings', 'click', () => {
        App.ui.guideActive = true;
        App.state.settings.gettingStartedGuideCompleted = false;
        saveState(App.state);
        navigate('settings');
      });
      on('btn-guide-short-workout', 'click', () => {
        App.ui.guideActive = true;
        App.ui.tutorialWorkout = true;
        App.ui.selectedUsers = [getActiveProfileIds(App.state.settings)[0]];
        afterMissedDays();
      });
      on('btn-enable-second-profile', 'click', () => {
        setSecondProfileActive(App.state.settings, true);
        saveState(App.state);
        navigate('settings');
        showToast('Second profile enabled', 'success');
      });
      on('btn-disable-second-profile', 'click', () => {
        if (!confirm(`Turn off ${App.state.settings.profiles.userB.displayName}? Their settings and workout history will be kept.`)) return;
        setSecondProfileActive(App.state.settings, false);
        saveState(App.state);
        navigate('settings');
        showToast('Second profile turned off', 'success');
      });
      ['userA', 'userB'].forEach(uid => {
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

      // Appearance and optional Spotify shortcut
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
function reorderToReduceConflicts(userAPlan, userBPlan, allExercises) {
  const result = [...userBPlan];
  for (let i = 0; i < Math.min(userAPlan.length, result.length); i++) {
    const eDef = allExercises.find(e => e.id === userAPlan[i].id);
    const userBDef = allExercises.find(e => e.id === result[i].id);
    if (!eDef || !userBDef) continue;
    if (getConflictingItems(eDef, userBDef).length > 0) {
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

function shortenTutorialPlan(plan = []) {
  return plan.slice(0, 2).map(exercise => ({
    ...exercise,
    sets: 1,
    reps: exercise.durationSeconds ? exercise.reps : '5',
    currentReps: exercise.durationSeconds ? exercise.currentReps : 5
  }));
}

function completeGettingStartedGuide() {
  App.state.settings.gettingStartedGuideCompleted = true;
  App.ui.guideActive = false;
  saveState(App.state);
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
  App.ui.capacityDimensionChoices = {};
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
  const userAR     = App.ui.selectedUserARoutine;
  const userBR  = App.ui.selectedUserBRoutine;
  const cycleNum = App.state.cycleState?.cycleNumber ?? 1;

  const userASessionCount = App.state.sessions.filter(s => s.users.includes('userA')).length;
  const userBSessionCount   = App.state.sessions.filter(s => s.users.includes('userB')).length;

  let userAExercises = [], userBExercises = [];

  if (users.includes('userA') && userAR?.id && userAR.id !== 'skip_rest') {
    const tmpl = App.data.routineTemplates.find(t => t.id === (userAR.templateId ?? userAR.id));
    if (tmpl) {
      userAExercises = buildExercisePlan(tmpl, App.data.exercises, userASessionCount, cycleNum, App.state.cycleState?.userAExerciseWeights ?? {}, App.state.cycleState?.userAExerciseRepsTarget ?? {}, App.state.settings.profiles.userA, App.state.settings.unavailableEquipmentIds);
      const adjusted = adaptWorkoutToCapacity(userAExercises, App.ui.symptomsByUser.userA, App.state.settings.profiles.userA);
      userAExercises = composeCapacityPlan(userAExercises, adjusted.plan, App.ui.capacityDimensionChoices.userA);
      userAExercises = annotateSymptomConflicts(userAExercises, App.ui.symptomsByUser.userA);
      if (App.ui.tutorialWorkout) userAExercises = shortenTutorialPlan(userAExercises);
    }
  }

  if (users.includes('userB') && userBR?.id && userBR.id !== 'skip_rest') {
    const tmpl = App.data.routineTemplates.find(t => t.id === (userBR.templateId ?? userBR.id));
    if (tmpl) {
      let plan = buildExercisePlan(tmpl, App.data.exercises, userBSessionCount, cycleNum, {}, {}, App.state.settings.profiles.userB, App.state.settings.unavailableEquipmentIds);
      const adjusted = adaptWorkoutToCapacity(plan, App.ui.symptomsByUser.userB, App.state.settings.profiles.userB);
      plan = composeCapacityPlan(plan, adjusted.plan, App.ui.capacityDimensionChoices.userB);
      userBExercises = annotateSymptomConflicts(plan, App.ui.symptomsByUser.userB);
      if (App.ui.tutorialWorkout) userBExercises = shortenTutorialPlan(userBExercises);
    }
  }

  const mode = users.length === 2 ? 'both'
    : users[0] === 'userA' ? 'userA_only' : 'userB_only';

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
    userA:      userState(userAExercises,      userAR?.templateId ?? userAR?.id),
    userB:userState(userBExercises, userBR?.templateId ?? userBR?.id),
    restActive:      false,
    restRemaining:   0,
    restTotalSeconds:0,
    restPaused:      false
  };

  App.currentSession = createSession(
    users,
    userAR?.id   !== 'skip_rest' ? userAR?.id   : null,
    userAR?.id   !== 'skip_rest' ? userAR?.type  : null,
    userBR?.id !== 'skip_rest' ? userBR?.id : null,
    userBR?.level ?? null,
    App.state.cycleState?.cycleId ?? null
  );
  App.currentSession.profileCheckins = Object.fromEntries(users.map(userId => [userId, {
    primaryGoal: App.state.settings.profiles[userId].primaryGoal,
    adaptationPreference: App.state.settings.profiles[userId].adaptationPreference,
    capacity: { ...(App.ui.symptomsByUser[userId] ?? {}) },
    ...(App.ui.symptomsByUser[userId] ?? {}),
    adjustmentChanged: Boolean(App.ui[`${userId}CapacityAdjustment`]?.changed),
    adjustmentChoices: { ...(App.ui.capacityDimensionChoices[userId] ?? {}) },
    adjustmentUsed: Boolean(App.ui[`${userId}CapacityAdjustment`]?.changed)
      && Object.values(App.ui.capacityDimensionChoices[userId] ?? {}).some(value => value !== 'original')
  }]));

  // Capture advisory symptom conflicts on the session for later visibility
  // (rides along in the JSON backup; lets us see how often conflicts occur).
  App.currentSession.userBSymptomConflicts = userBExercises
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
    const user = ws.mode === 'userA_only' ? 'userA' : 'userB';
    advanceSet(user);
  });

  // Single-user: skip exercise
  document.getElementById('btn-skip-exercise')?.addEventListener('click', () => {
    const user = ws.mode === 'userA_only' ? 'userA' : 'userB';
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
        if (user === 'userA' || user === 'userB') advanceSet(user);
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
      persistWorkoutDraft('workout_runner');
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
      persistWorkoutDraft('workout_runner');
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
  persistWorkoutDraft('workout_runner');

  // Initial button state
  const btn = document.getElementById(`${user}-complete-btn`);
  if (btn) { btn.disabled = true; btn.textContent = 'Resting…'; }

  us.restInterval = setInterval(() => {
    us.restRemaining--;
    persistWorkoutDraft('workout_runner');

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
    persistWorkoutDraft('workout_runner');
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
  clearRestTimer('userA');
  clearRestTimer('userB');
  stopTimer();
}

// ---- Single-user rest overlay -----------------------------

function showRestTimer(restSecs, currentUserState, totalSecs = restSecs, paused = false) {
  const nextExName = (() => {
    if (!currentUserState) return null;
    const { exerciseIdx, exercises, completed } = currentUserState;
    if (completed) return null;
    return exercises[exerciseIdx]?.name ?? null;
  })();

  const appEl = document.getElementById('app');
  [...appEl.children].forEach(child => { child.inert = true; });
  appEl.insertAdjacentHTML('beforeend', renderRestOverlay(restSecs, totalSecs, nextExName, null));
  document.getElementById('rest-overlay')?.focus();

  App.workoutState.restActive       = true;
  App.workoutState.restRemaining    = restSecs;
  App.workoutState.restTotalSeconds = totalSecs;
  App.workoutState.restPaused       = paused;

  const playSound = App.state.settings.musicMode === 'chimes';
  startTimer(restSecs,
    (remaining) => {
      App.workoutState.restRemaining = remaining;
      updateRestOverlayDOM(remaining, totalSecs);
      persistWorkoutDraft('workout_runner');
    },
    () => {
      App.workoutState.restActive = false;
      App.workoutState.restRemaining = 0;
      App.workoutState.restPaused = false;
      navigate('workout_runner');
    },
    playSound && App.state.settings.audioEnabled
  );

  if (paused) {
    pauseTimer();
    const pauseButton = document.getElementById('btn-pause-timer');
    if (pauseButton) pauseButton.textContent = 'Resume';
  }
  persistWorkoutDraft('workout_runner');

  document.getElementById('btn-pause-timer')?.addEventListener('click', (e) => {
    if (isTimerPaused()) {
      resumeTimer();
      e.currentTarget.textContent = 'Pause';
      App.workoutState.restPaused = false;
    } else {
      pauseTimer();
      e.currentTarget.textContent = 'Resume';
      App.workoutState.restPaused = true;
    }
    persistWorkoutDraft('workout_runner');
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
  if (App.ui.userACheckin)       s.userAEndCheckin   = App.ui.userACheckin;
  if (App.ui.userBCheckin) s.userBCheckin = App.ui.userBCheckin;
  if (App.ui.meditationChoice) s.meditation       = App.ui.meditationChoice;

  completeSession(s);
  App.state.sessions.push(s);
  App.state.cycleState = updateCycleAfterSession(App.state.cycleState, s, App.data.exercises);
  App.state.cycleState.cycleId = App.state.cycleState.cycleId ?? 'cycle_001';
  App.state.workoutDraft = null;
  saveState(App.state);
  playSessionComplete(App.state.settings.audioEnabled);

  // Snapshot the session data for the summary screen BEFORE nulling currentSession
  App.ui.lastSessionSummary = {
    date:                    s.date,
    users:                   s.users,
    userARoutineId:            s.userARoutineId,
    userBRoutineId:      s.userBRoutineId,
    userBAdaptationLevel:s.userBAdaptationLevel,
    meditation:              s.meditation
  };

  // Reset ephemeral state
  App.currentSession        = null;
  App.workoutState          = null;
  App.ui.userACheckin         = null;
  App.ui.userBCheckin   = null;
  App.ui.meditationChoice   = null;
  App.ui.endCheckins        = {};
  App.ui.userBSymptoms  = null;
  App.ui.userAAnchors         = [];
  // Central reset so the next session always rebuilds its routine plan, rather
  // than relying on every entry path to clear this guard (audit R4).
  App.ui.routineSuggestionBuilt = false;
  App.ui.tutorialWorkout = false;
}

// ============================================================
// Start
// ============================================================
init();
