// ============================================================
// screens.js — All screen HTML renderers  v0.4.1
// ============================================================

import { FATIGUE_SCALE, JOINT_PAIN_OPTIONS, JOINT_PAIN_LOCATIONS,
         MISSED_DAY_CATEGORIES, ACTIVITY_COLORS, CHRISTINA_SYMPTOMS,
         ELI_HEAVY_SEQUENCE, CHRISTINA_SEQUENCE,
         BACKUP_NUDGE_DAYS, BACKUP_NUDGE_MIN_SESSIONS,
         MISSED_DAYS_COMPACT_THRESHOLD } from './config.js';
import { getCycleDayNumber } from './cycles.js';
import { formatDate, formatDateShort, escapeHtml, getTomorrowDate, formatTime, today, safeSpotifyUrl } from './utils.js';
import { buildMonthCalendar, renderCalendarHTML, getEliStats, getChristinaStats,
         getEliStrengthData, getEliMuscleStimulus, getEliReadiness, getChristinaReadiness,
         getProfileProgressionSignals,
         getChristinaMovementExposure, getChristinaSymptomCalendarData,
         renderStrengthProgressChart, renderMuscleMapChart, renderReadinessCard,
         renderChristinaMovementExposureMap, renderChristinaSymptomCalendarHTML,
         renderChristinaPainDaysChart, renderChristinaSymptomChart } from './reports.js';
import { weightLabel } from './workout.js';
import { ATTRIBUTE_LABELS } from './adaptation.js';

// Advisory symptom-conflict flag shared across suggestion + runner views.
// Renders nothing when the exercise carries no conflicts for today's symptoms.
function symptomConflictBadge(ex) {
  if (!ex?.symptomConflicts?.length) return '';
  const labels = ex.symptomConflicts.map(a => ATTRIBUTE_LABELS[a] ?? a).join(' · ');
  return `<span class="symptom-flag" title="Conflicts with today's symptoms — your call whether to do or swap it">⚠ ${escapeHtml(labels)}</span>`;
}

// User display helpers — single source of truth for names/emoji
const userName = (App, id) => App?.state?.settings?.profiles?.[id]?.displayName
  ?? (id === 'eli' ? 'User A' : 'User B');
const userIcon = (App, id) => App?.state?.settings?.profiles?.[id]?.icon
  ?? (id === 'eli' ? '🔵' : '🟣');
const userLabel = (App, id) => `${userIcon(App, id)} ${escapeHtml(userName(App, id))}`;
const PROFILE_ICONS = ['🔵', '🟣', '⭐', '⚡', '🌿', '🏔️', '🧘', '🏋️'];
const TRAINING_GOALS = [
  ['build_strength', 'Build strength'], ['improve_mobility', 'Improve mobility'],
  ['maintain_consistency', 'Maintain consistency'], ['return_after_break', 'Return after a break'],
  ['general_fitness', 'Improve general fitness']
];
const EXPERIENCE_LEVELS = [
  ['new', 'New to exercise'], ['some', 'Some experience'], ['experienced', 'Experienced']
];
const ADAPTATION_OPTIONS = [
  ['progress_when_ready', 'Progress weights when appropriate'],
  ['daily_capacity', 'Adapt based on daily capacity'],
  ['both', 'Use both']
];

// ---- Shared Nav -------------------------------------------

function bottomNav(active) {
  const items = [
    { key:'hello',    icon:'🏠', label:'Home'    },
    { key:'reports',  icon:'📊', label:'Tracker' },
    { key:'settings', icon:'⚙️', label:'Settings'}
  ];
  return `
    <nav class="bottom-nav">
      ${items.map(i => `
        <button class="bottom-nav__item ${active === i.key ? 'active' : ''}" data-nav="${i.key}">
          <span class="bottom-nav__icon">${i.icon}</span>
          <span>${i.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

// ---- 1. First Launch --------------------------------------

export function renderFirstLaunch(App) {
  const tomorrow = getTomorrowDate();
  const profileSetup = userId => {
    const p = App.state.settings.profiles[userId];
    return `<div class="card" style="margin-bottom:12px;">
      <div class="setting-row__label" style="margin-bottom:12px;">${userLabel(App, userId)}</div>
      <div class="input-group"><label class="input-label" for="onboard-name-${userId}">Profile name</label>
        <input class="input" id="onboard-name-${userId}" value="${escapeHtml(p.displayName)}" maxlength="80"></div>
      <div class="input-group"><label class="input-label" for="onboard-goal-${userId}">Primary training goal</label>
        <select class="input" id="onboard-goal-${userId}">${TRAINING_GOALS.map(([value,label]) => `<option value="${value}" ${p.primaryGoal===value?'selected':''}>${label}</option>`).join('')}</select></div>
      <div class="input-group"><label class="input-label" for="onboard-experience-${userId}">Training experience</label>
        <select class="input" id="onboard-experience-${userId}">${EXPERIENCE_LEVELS.map(([value,label]) => `<option value="${value}" ${p.experienceLevel===value?'selected':''}>${label}</option>`).join('')}</select></div>
      <div class="input-group" style="margin-bottom:0;"><label class="input-label" for="onboard-adaptation-${userId}">Training approach</label>
        <select class="input" id="onboard-adaptation-${userId}">${ADAPTATION_OPTIONS.map(([value,label]) => `<option value="${value}" ${p.adaptationPreference===value?'selected':''}>${label}</option>`).join('')}</select>
        <div class="setting-row__desc" style="margin-top:6px;">“Use both” supports progression while adapting individual workouts to daily capacity.</div></div>
    </div>`;
  };
  const unavailable = new Set(App.state.settings.unavailableEquipmentIds ?? []);
  const equipmentSetup = (App.data.equipment ?? []).map(item => `<label class="ex-toggle">
    <input type="checkbox" data-onboard-equipment value="${item.id}" ${unavailable.has(item.id)?'':'checked'}><span>${escapeHtml(item.name)}</span></label>`).join('');
  return `
    <div class="page page--no-nav fade-in">
      <div style="margin-top:24px;">
        <div class="eyebrow">Welcome</div>
        <h1 class="page-title" style="margin-top:8px;">Morning Circuit</h1>
        <p class="page-subtitle" style="margin-top:12px;">
          Set up two flexible profiles. You can change everything later in Settings.
        </p>
      </div>
      <div style="margin-top:28px;">
        <div class="section-label" style="margin-bottom:12px;">Profiles</div>
        ${profileSetup('eli')}${profileSetup('christina')}
        <div class="section-label" style="margin:24px 0 12px;">Household equipment</div>
        <div class="card">
          <div class="setting-row__desc" style="margin-bottom:12px;">Leave available items checked. Routines automatically avoid anything turned off.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <button class="btn btn--sm btn--secondary" id="btn-onboard-bodyweight">Bodyweight-focused</button>
            <button class="btn btn--sm btn--ghost" id="btn-onboard-all-equipment">Enable all</button>
          </div><div class="ex-toggle-grid">${equipmentSetup}</div>
        </div>
        <div class="section-label" style="margin:24px 0 12px;">Start cycle</div>
        <div class="input-group">
          <label class="input-label" for="launch-date">Cycle 1 Start Date</label>
          <input type="date" id="launch-date" class="input" value="${tomorrow}">
        </div>
        <p class="text-muted text-sm" style="margin-bottom:32px;line-height:1.5;">
          A cycle is 28 days. Rotation tracking and reports are organized around it.
        </p>
        <div class="card" style="margin-bottom:16px;"><div class="setting-row__label">Private by default</div>
          <div class="setting-row__desc" style="margin-top:6px;line-height:1.5;">Profiles and workout records stay in this browser. There is no account or automatic sync. Use JSON backups regularly.</div></div>
        <button class="btn btn--primary" id="btn-launch">Start Cycle 1</button>
      </div>
    </div>
  `;
}

// ---- 2. Hello ---------------------------------------------

// Overdue when there's real data but no backup yet, or the last one is stale.
// Dismissal is session-only (App.ui) — a data-loss risk shouldn't be
// permanently silenceable, so "Later" returns on the next app load.
function backupNudgeBanner(settings, sessions, dismissed) {
  if (dismissed) return '';
  const lastBackup = settings?.lastBackupAt;
  const daysSince  = lastBackup
    ? Math.floor((Date.now() - new Date(lastBackup)) / 86400000)
    : null;
  const overdue =
    (lastBackup === null && sessions.length >= BACKUP_NUDGE_MIN_SESSIONS) ||
    (daysSince !== null && daysSince >= BACKUP_NUDGE_DAYS);
  if (!overdue) return '';

  const msg = lastBackup === null
    ? 'Your data has never been backed up. One tap saves everything.'
    : `Last backup ${daysSince} days ago. Tap to save a fresh copy.`;

  return `
    <div style="margin-top:16px;padding:12px 14px;border:1px solid var(--yellow);
                border-radius:12px;background:rgba(234,179,8,0.08);
                display:flex;flex-direction:column;gap:10px;">
      <div style="color:var(--yellow);font-size:0.9rem;font-weight:600;">⚠ ${msg}</div>
      <div style="display:flex;gap:10px;">
        <button id="btn-hello-backup" class="btn btn--sm btn--secondary"
                style="flex:1;min-height:44px;white-space:nowrap;border-color:var(--yellow);color:var(--yellow);">
          Back up now</button>
        <button id="btn-hello-backup-later" class="btn btn--sm btn--ghost"
                style="flex:0 0 auto;width:auto;min-height:44px;padding:0 20px;">Later</button>
      </div>
    </div>
  `;
}

export function renderHello(state, backupNudgeDismissed = false) {
  const { cycleState, sessions, settings } = state;

  const musicMode  = settings?.musicMode ?? 'spotify';
  const spotifyUrl = safeSpotifyUrl(settings?.spotifyUrl);
  const helloSpotifyPill = (musicMode === 'spotify' && spotifyUrl)
    ? `<a href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener noreferrer" class="spotify-pill" title="Open in Spotify"
         style="position:absolute;top:20px;right:0;">♫</a>`
    : '';

  const dayNum = cycleState.startDate ? getCycleDayNumber(cycleState) : 1;

  const cyclePct = Math.round((dayNum / 28) * 100);

  const ELI_LABELS = {
    eli_upper_push:'Upper Push — Chest & Shoulders',
    eli_lower_body:'Lower Body — Legs & Glutes',
    eli_upper_pull:'Upper Pull — Back & Biceps',
    eli_full_body: 'Full Body'
  };
  // Christina mirrors Eli's structure: Upper / Lower / Pull&Posture / Full Body
  const C_LABELS = {
    christina_gentle_upper:        'Upper Body',
    christina_gentle_lower:        'Lower Body',
    christina_gentle_pull_posture: 'Pull & Posture',
    christina_gentle_full_body:    'Full Body'
  };

  const eliNextId    = ELI_HEAVY_SEQUENCE[cycleState.eliSequencePointer % ELI_HEAVY_SEQUENCE.length];
  const eliNextLabel = ELI_LABELS[eliNextId] ?? '—';
  const cNextId      = CHRISTINA_SEQUENCE[cycleState.christinaSequencePointer % CHRISTINA_SEQUENCE.length];
  const cNextLabel   = C_LABELS[cNextId] ?? '—';

  const eliSessions   = sessions.filter(s => s.users.includes('eli')).length;
  const christSessions= sessions.filter(s => s.users.includes('christina')).length;

  return `
    <div class="page fade-in" style="display:flex;flex-direction:column;">
      ${backupNudgeBanner(settings, sessions, backupNudgeDismissed)}
      <div style="margin-top:20px;margin-bottom:10px;position:relative;">
        <div class="eyebrow">Cycle ${cycleState.cycleNumber} · Day ${dayNum} of 28</div>
        <h1 class="page-title" style="margin-top:4px;margin-bottom:0;">Good morning.</h1>
        ${helloSpotifyPill}
      </div>

      <div class="cycle-bar">
        <div class="cycle-bar__fill" style="width:${cyclePct}%"></div>
      </div>

      <div class="who-grid" style="margin-top:14px;flex:1;min-height:0;">
        <button class="who-card who-card--eli" data-who="eli">
          <div class="who-card__emoji">${userIcon({state}, 'eli')}</div>
          <div class="who-card__name">${escapeHtml(settings.profiles.eli.displayName)}</div>
          <div class="who-card__next">${eliNextLabel}</div>
        </button>
        <button class="who-card who-card--christina" data-who="christina">
          <div class="who-card__emoji">${userIcon({state}, 'christina')}</div>
          <div class="who-card__name">${escapeHtml(settings.profiles.christina.displayName)}</div>
          <div class="who-card__next">${cNextLabel}</div>
        </button>
      </div>

      <button class="who-card who-card--both" data-who="both"
              style="margin-top:10px;width:100%;flex-direction:row;
                     gap:12px;padding:16px 20px;min-height:60px;">
        <span style="font-size:1.5rem;">👥</span>
        <div style="text-align:left;">
          <div class="who-card__name" style="font-size:1rem;">Both Together</div>
          <div class="who-card__next">Paired session</div>
        </div>
      </button>

      <div class="hello-stats" style="margin-top:12px;">
        <div class="hello-stat">
          <div class="hello-stat__value" style="color:var(--eli);">${eliSessions}</div>
          <div class="hello-stat__label">${escapeHtml(settings.profiles.eli.displayName)} sessions</div>
        </div>
        <div class="hello-stat">
          <div class="hello-stat__value" style="color:var(--christina);">${christSessions}</div>
          <div class="hello-stat__label">${escapeHtml(settings.profiles.christina.displayName)} sessions</div>
        </div>
        <div class="hello-stat">
          <div class="hello-stat__value">${dayNum}/28</div>
          <div class="hello-stat__label">Cycle day</div>
        </div>
      </div>

      <div style="margin-top:12px;margin-bottom:8px;">
        <button class="btn btn--ghost" id="btn-skip-today">Log a Day Without Workout</button>
      </div>
    </div>
    ${bottomNav('hello')}
  `;
}

// ---- 3. Missed Days (past) --------------------------------

export function renderMissedDays(missedDates) {
  if (!missedDates.length) return null;

  // Long gap: skip the day-by-day ledger entirely. One tap logs the whole
  // gap as rest and gets straight to today's workout — no judgment, no wall.
  if (missedDates.length > MISSED_DAYS_COMPACT_THRESHOLD) {
    return `
      <div class="page page--no-nav fade-in">
        <div class="eyebrow">Welcome Back</div>
        <h1 class="page-title" style="margin-top:6px;">It's been ${missedDates.length} days.</h1>
        <p class="page-subtitle" style="margin-bottom:24px;">
          Showing up today is the part that counts. Want to log the gap as rest
          and get straight to your workout?
        </p>
        <button class="btn btn--primary" id="btn-missed-bulk-rest" style="margin-top:16px;">
          Log It as Rest & Start Today</button>
        <button class="btn btn--ghost" id="btn-missed-skip">Skip for Now</button>
      </div>
    `;
  }

  const rows = missedDates.map(date => `
    <div class="missed-day-row">
      <span class="missed-day-row__date">${formatDateShort(date)}</span>
      <div class="missed-day-cats">
        ${MISSED_DAY_CATEGORIES.map(cat => `
          <button class="miss-cat-btn" data-cat="${cat.id}" data-date="${date}">${cat.label}</button>
        `).join('')}
      </div>
    </div>
  `).join('');

  return `
    <div class="page page--no-nav fade-in">
      <div class="eyebrow">Unlogged Days</div>
      <h1 class="page-title" style="margin-top:6px;">What happened?</h1>
      <p class="page-subtitle" style="margin-bottom:24px;">
        ${missedDates.length} day${missedDates.length>1?'s':''} since your last session.
      </p>
      <div class="card">${rows}</div>
      <button class="btn btn--primary" id="btn-missed-done" style="margin-top:16px;">Done, Let's Go</button>
      <button class="btn btn--ghost" id="btn-missed-skip">Skip for Now</button>
    </div>
  `;
}

// ---- 3b. Log Today ----------------------------------------

export function renderLogToday(App) {
  const todayStr = today();
  const cats = [
    { id:'skip_rest',   icon:'😴', label:'Skip / Rest'  },
    { id:'vr_exercise', icon:'🎮', label:'VR Exercise'   },
    { id:'adventure',   icon:'🌲', label:'Adventure'     },
    { id:'other',       icon:'📝', label:'Other'         }
  ];
  return `
    <div class="page page--no-nav fade-in">
      <div class="eyebrow">No Workout</div>
      <h1 class="page-title" style="margin-top:6px;">Log a day</h1>

      <div class="section-label" style="margin-top:16px;margin-bottom:8px;">Which day?</div>
      <input type="date" id="log-date" class="input"
             value="${todayStr}" max="${todayStr}"
             style="font-size:1rem;padding:12px;">

      <div class="section-label" style="margin-top:16px;margin-bottom:8px;">For who?</div>
      <div style="display:flex;gap:8px;">
        <button data-log-who="both" id="log-who-both"
          style="flex:1;padding:14px 8px;border-radius:12px;cursor:pointer;
                 font-size:0.95rem;font-weight:700;line-height:1.3;
                 border:2px solid var(--eli);background:var(--eli-dim);color:var(--eli);">
          👥<br>Both
        </button>
        <button data-log-who="eli" id="log-who-eli"
          style="flex:1;padding:14px 8px;border-radius:12px;cursor:pointer;
                 font-size:0.95rem;font-weight:400;line-height:1.3;
                 border:1px solid var(--border);background:var(--surface);color:var(--text-2);">
          ${userIcon(App, 'eli')}<br>${escapeHtml(userName(App, 'eli'))}
        </button>
        <button data-log-who="christina" id="log-who-christina"
          style="flex:1;padding:14px 8px;border-radius:12px;cursor:pointer;
                 font-size:0.95rem;font-weight:400;line-height:1.3;
                 border:1px solid var(--border);background:var(--surface);color:var(--text-2);">
          ${userIcon(App, 'christina')}<br>${escapeHtml(userName(App, 'christina'))}
        </button>
      </div>

      <div class="section-label" style="margin-top:16px;margin-bottom:8px;">What happened?</div>
      <div class="choice-grid choice-grid--2" style="gap:10px;">
        ${cats.map(c => `
          <button class="choice-btn" data-log="${c.id}" style="min-height:80px;">
            <span class="choice-btn__icon">${c.icon}</span>
            <span>${c.label}</span>
          </button>
        `).join('')}
      </div>

      <button class="btn btn--ghost" id="btn-log-cancel" style="margin-top:16px;">Cancel</button>
    </div>
  `;
}

// ---- 4. Symptom Check (Christina) ------------------------

// Symptom buttons come straight from the canonical config list so the check-in
// screen, reports, and conflict matrix can never drift apart again.
const SYMPTOM_CLUSTERS = CHRISTINA_SYMPTOMS;

export function renderSymptomCheck(App, userId = 'christina') {
  return `
    <div class="page page--no-nav fade-in">
      <div class="eyebrow eyebrow--christina">${userLabel(App, userId)}</div>
      <h1 class="page-title" style="margin-top:6px;">How are you feeling?</h1>
      <p class="page-subtitle" style="margin-bottom:28px;">Quick check — this shapes today's routine.</p>

      <div class="section-label">Energy level</div>
      <div class="pain-picker" data-capacity-group="energy">
        <button class="pain-btn" data-energy="low">Low</button>
        <button class="pain-btn selected" data-energy="medium">Medium</button>
        <button class="pain-btn" data-energy="high">High</button>
      </div>

      <div class="section-label">Today's pain level</div>
      <div class="pain-picker" id="pain-picker">
        <button class="pain-btn selected" data-value="low"><span class="pain-btn__icon">😊</span>Low</button>
        <button class="pain-btn" data-value="medium"><span class="pain-btn__icon">😐</span>Medium</button>
        <button class="pain-btn" data-value="high"><span class="pain-btn__icon">😔</span>High</button>
      </div>

      <div class="section-label">Muscle soreness</div>
      <div class="pain-picker" data-capacity-group="soreness">
        <button class="pain-btn selected" data-soreness="low">Low</button>
        <button class="pain-btn" data-soreness="medium">Medium</button>
        <button class="pain-btn" data-soreness="high">High</button>
      </div>


      <div class="section-label" style="margin-top:4px;">
        Active symptoms
        <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3);"> — tap any that apply</span>
      </div>
      <div class="symptom-clusters">
        ${SYMPTOM_CLUSTERS.map(s => `
          <button class="symptom-cluster-btn" data-symptom="${s.id}">
            <span class="symptom-cluster-btn__icon">${s.icon}</span>${s.label}
          </button>
        `).join('')}
      </div>

      <button class="btn btn--christina" id="btn-symptoms-done" style="margin-top:8px;">Continue</button>
      <button class="btn btn--ghost" id="btn-capacity-skip">Use typical capacity</button>
    </div>
  `;
}

// ---- 5. Routine Suggestion --------------------------------

function buildExerciseListHTML(exercises, user) {
  if (!exercises?.length) return '<p class="text-muted text-sm" style="padding:8px 0;">No exercises loaded.</p>';
  return `
    <div class="exercise-list">
      ${exercises.map((ex, idx) => {
        const label = weightLabel(ex);
        const parts = [
          ex.sets ? `${ex.sets} sets` : null,
          ex.reps ? ex.reps : (ex.durationSeconds ? `${ex.durationSeconds}s` : null),
          label ?? null
        ].filter(Boolean).join(' · ');
        const anchorBadge = ex.isAnchor
          ? `<span class="anchor-badge" title="Track progression on this lift">⚓ Cycle anchor</span>`
          : '';
        const swappable = (ex.poolIds?.length ?? 0) > 1;
        const swappedBadge = ex.isSwapped
          ? `<span class="swapped-badge" title="Swapped from the original suggestion">Swapped</span>`
          : '';
        return `
          <div class="exercise-list-item${swappable ? ' exercise-list-item--swappable' : ''}"
               ${swappable ? `data-swap-user="${user}" data-swap-index="${idx}" style="cursor:pointer;"` : ''}>
            <span class="exercise-list-item__name">${escapeHtml(ex.name)}${anchorBadge}${swappedBadge}${symptomConflictBadge(ex)}</span>
            <span class="exercise-list-item__meta">
              ${escapeHtml(parts)}
              ${swappable ? `<span class="exercise-list-item__swap-icon" title="Tap to try a different exercise">↻</span>` : ''}
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function capacityAdjustmentHTML(adjustment, userId, choices = {}) {
  if (!adjustment?.changed) return '';
  const explanation = adjustment.reasons?.length
    ? adjustment.reasons.join('; ') : 'today’s capacity suggests a lighter plan';
  const c = adjustment.comparison ?? {};
  const rows = [
    ['length', 'Exercises', c.originalCount, c.recommendedCount],
    ['volume', 'Sets / reps', 'Original', c.recommendedReps ? `−${c.setReduction} set · ${c.recommendedReps}` : 'Original'],
    ['load', 'Working load', '100%', `${Math.round((c.loadFactor ?? 1) * 100)}%`],
    ['rest', 'Rest', 'Original', c.restBonus ? `+${c.restBonus}s` : 'Original']
  ];
  const choiceButton = (dimension, mode, label) => {
    const selected = (choices[dimension] ?? 'recommended') === mode;
    return `<button class="mode-btn ${selected ? 'active' : ''}" data-capacity-user="${userId}"
      data-capacity-dimension="${dimension}" data-capacity-mode="${mode}" aria-pressed="${selected}">${escapeHtml(String(label))}</button>`;
  };
  return `<div class="symptom-flag-summary" style="margin-bottom:10px;">
    <strong>Recommended adjustment:</strong> ${escapeHtml(explanation)}.
    Choose original or recommended values independently. You can also swap exercises below.
    <div style="margin-top:10px;border-top:1px solid var(--border);">
      ${rows.map(([dimension,label,original,recommended]) => `<div class="setting-row" style="padding:9px 0;gap:8px;">
        <div style="min-width:86px;"><div class="setting-row__label">${label}</div></div>
        <div class="mode-toggle" style="margin-left:auto;">${choiceButton(dimension,'original',original)}${choiceButton(dimension,'recommended',recommended)}</div>
      </div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
      <button class="btn btn--sm btn--secondary" id="btn-${userId}-recommended">Use all recommended</button>
      <button class="btn btn--sm btn--ghost" id="btn-${userId}-original">Use all original</button>
    </div>
  </div>`;
}

function workoutCountHTML(plan) {
  const count = plan?.length ?? 0;
  return `<div class="setting-row__desc" style="margin:8px 0 10px;">Today’s workout: <strong>${count} exercise${count === 1 ? '' : 's'}</strong></div>`;
}

function strengthRestHTML(suggestion) {
  if (!suggestion?.heavyBlocked) return '';
  return `<div class="symptom-flag-summary" style="margin-bottom:12px;">
    <strong>Strength rest day recommended.</strong> Recovery supports progress; missing perfection is not the goal.
    Choose a circuit, cardio, mobility, gentle movement, or rest below—and come back for strength afterward.
  </div>`;
}

function buildEquipmentSummaryHTML(eliExercisePlan, christinaExercisePlan, allEquipment) {
  const ids = new Set();
  [...(eliExercisePlan ?? []), ...(christinaExercisePlan ?? [])].forEach(ex => {
    (ex.equipment ?? []).forEach(id => ids.add(id));
  });
  if (!ids.size) return '';

  const names = [...ids]
    .map(id => allEquipment?.find(e => e.id === id)?.name ?? null)
    .filter(Boolean)
    .sort();
  if (!names.length) return '';

  return `
    <div class="equipment-summary">
      <span class="equipment-summary__label">Equipment</span>
      <span class="equipment-summary__list">${escapeHtml(names.join(' · '))}</span>
    </div>
  `;
}

export function renderRoutineSuggestion(App) {
  const { ui, data } = App;
  const { selectedUsers, eliSuggestion, christinaSuggestion, conflicts,
          eliExercisePlan, christinaExercisePlan, eliAnchors } = ui;

  const equipmentSummary = buildEquipmentSummaryHTML(eliExercisePlan, christinaExercisePlan, data?.equipment);

  const anchorLine = eliAnchors?.length
    ? `<div class="anchor-line">
         <span class="anchor-line__label">This cycle's anchors:</span>
         ${eliAnchors.map(n => `<span class="anchor-pill">⚓ ${escapeHtml(n)}</span>`).join('')}
       </div>`
    : '';

  const eliSection = selectedUsers.includes('eli') && eliSuggestion ? `
    <div class="reports-section">
      <div class="section-label" style="margin-bottom:12px;">${userLabel(App, 'eli')}</div>
      <div class="suggestion-card suggestion-card--eli">
        <div class="eyebrow" style="margin-bottom:6px;">
          ${eliSuggestion.primary.type === 'heavy_weight' ? '🏋️ Heavy' : '⚡ Circuit'}
          ${eliSuggestion.heavyBlocked ? ' &nbsp;<span style="color:var(--yellow);">Break day required</span>' : ''}
        </div>
        <div class="suggestion-card__routine">${escapeHtml(eliSuggestion.primary.label)}</div>
        <div class="suggestion-card__reason">${escapeHtml(eliSuggestion.primary.reason)}</div>
        ${strengthRestHTML(eliSuggestion)}
        ${capacityAdjustmentHTML(ui.eliCapacityAdjustment, 'eli', ui.capacityDimensionChoices?.eli)}
        ${workoutCountHTML(eliExercisePlan)}
        ${anchorLine}
        ${buildExerciseListHTML(eliExercisePlan, 'eli')}
        <p class="text-muted text-sm" style="margin-top:4px;">Tap an exercise to swap it.</p>
        <button class="alternatives-toggle" id="eli-alt-toggle">Change routine <span>→</span></button>
        <div id="eli-alternatives" class="${eliSuggestion.heavyBlocked ? '' : 'hidden'}">
          <div class="alternatives" style="margin-top:6px;">
            ${eliSuggestion.alternatives.map(alt => `
              <button class="alt-btn" data-user="eli" data-id="${alt.id}" data-type="${alt.type ?? ''}">
                ${escapeHtml(alt.label)}<span style="color:var(--text-3);">›</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  ` : '';

  const christinaSection = selectedUsers.includes('christina') && christinaSuggestion ? `
    <div class="reports-section" style="margin-top:20px;">
      <div class="section-label" style="margin-bottom:12px;">${userLabel(App, 'christina')}</div>
      <div class="suggestion-card suggestion-card--christina">
        <div class="eyebrow eyebrow--christina" style="margin-bottom:6px;">
          ${christinaSuggestion.primary.adaptationLevel === 'recovery' ? 'Recovery'
            : christinaSuggestion.primary.adaptationLevel === 'reduced' ? 'Adapted'
            : 'Gentle Strength'}
        </div>
        <div class="suggestion-card__routine">${escapeHtml(christinaSuggestion.primary.label)}</div>
        <div class="suggestion-card__reason">${escapeHtml(christinaSuggestion.primary.reason)}</div>
        ${strengthRestHTML(christinaSuggestion)}
        ${capacityAdjustmentHTML(ui.christinaCapacityAdjustment, 'christina', ui.capacityDimensionChoices?.christina)}
        ${workoutCountHTML(christinaExercisePlan)}
        ${(() => {
          const n = (christinaExercisePlan ?? []).filter(e => e.symptomConflicts?.length).length;
          return n ? `<div class="symptom-flag-summary">⚠ ${n} exercise${n>1?'s':''} flagged for today's symptoms — review below, do or swap as feels right.</div>` : '';
        })()}
        ${buildExerciseListHTML(christinaExercisePlan, 'christina')}
        <p class="text-muted text-sm" style="margin-top:4px;">Tap an exercise to swap it.</p>
        <button class="alternatives-toggle" id="christina-alt-toggle">Change routine <span>→</span></button>
        <div id="christina-alternatives" class="${christinaSuggestion.heavyBlocked ? '' : 'hidden'}">
          <div class="alternatives" style="margin-top:6px;">
            ${christinaSuggestion.alternatives.map(alt => `
              <button class="alt-btn" data-user="christina" data-id="${alt.id}"
                      data-adaptation="${alt.adaptationLevel ?? ''}">
                ${escapeHtml(alt.label)}<span style="color:var(--text-3);">›</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  ` : '';

  const conflictSection = conflicts?.length ? `
    <div style="margin-top:16px;">
      ${conflicts.map(c => `
        <div class="conflict-banner">
          <span class="conflict-banner__icon">⚠️</span>
          <div class="conflict-banner__text">
            <strong>Heads up:</strong> ${escapeHtml(c.suggestion)}
          </div>
        </div>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="page page--no-nav fade-in" style="padding-bottom:100px;">
      <div class="eyebrow">Today's Plan</div>
      <h1 class="page-title" style="margin-top:6px;">Your routine</h1>
      <p class="page-subtitle" style="margin-bottom:16px;">Tap "Change routine" to swap.</p>
      ${equipmentSummary}
      ${eliSection}
      ${christinaSection}
      ${conflictSection}
      <div style="position:fixed;bottom:0;left:0;right:0;
                  background:var(--bg);border-top:1px solid var(--border);
                  padding:16px 20px;padding-bottom:calc(16px + env(safe-area-inset-bottom));">
        <button class="btn btn--primary" id="btn-start-workout">Start Workout</button>
      </div>
    </div>
  `;
}

// ---- 5b. Warm-Up ------------------------------------------

export function renderWarmup() {
  return `
    <div class="meditation-screen fade-in">
      <div class="eyebrow" style="margin-bottom:8px;">Together</div>
      <h1 class="page-title">Warm-Up</h1>
      <p class="page-subtitle" style="max-width:320px;margin:8px auto 0;">
        Five minutes together — sun salutations or gentle stretching,
        whatever feels right this morning.
      </p>
      <div class="meditation-orb">🌅</div>
      <div id="warmup-start-wrap" style="text-align:center;">
        <button class="btn btn--primary" id="btn-warmup-begin" style="min-width:200px;">Begin Warm-Up</button>
        <div style="margin-top:12px;">
          <button class="btn btn--ghost btn--sm" id="btn-warmup-skip">Skip warm-up</button>
        </div>
      </div>
      <div id="warmup-timer-wrap" style="display:none;text-align:center;margin-top:24px;">
        <div class="meditation-timer" id="warmup-timer">05:00</div>
        <button class="btn btn--ghost btn--sm" id="btn-warmup-end" style="margin-top:16px;">
          End &amp; Start Workout
        </button>
      </div>
    </div>
  `;
}

// ---- 6. Workout Runner ------------------------------------

function renderWeightStepper(ex, user) {
  if (!ex.weighted || ex.currentWeightKg === null || ex.currentWeightKg === undefined) return '';
  const label = weightLabel(ex);
  return `
    <div class="weight-stepper">
      <button class="weight-btn" data-weight-adj="${user}" data-dir="down" aria-label="Decrease weight">−</button>
      <span class="weight-display" id="${user}-weight-display">${escapeHtml(label)}</span>
      <button class="weight-btn" data-weight-adj="${user}" data-dir="up" aria-label="Increase weight">+</button>
    </div>
  `;
}

function renderRepsStepper(ex, user) {
  if (ex.durationSeconds || ex.currentReps == null) return '';
  return `
    <div class="weight-stepper" style="margin-top:4px;">
      <button class="weight-btn" data-reps-adj="${user}" data-dir="down" aria-label="Decrease reps">−</button>
      <span class="weight-display" id="${user}-reps-display">${ex.currentReps} reps</span>
      <button class="weight-btn" data-reps-adj="${user}" data-dir="up" aria-label="Increase reps">+</button>
    </div>
  `;
}

/**
 * Paired panel — two visual states:
 *
 * RESTING: minimal layout dominated by a large countdown.
 *   Shows nothing but the user label, big timer, and control buttons.
 *
 * ACTIVE: full layout with exercise info, weight stepper, set dots.
 */
function renderSingleUserPanel(ws, user) {
  const us = ws[user];
  const label = userLabel(App, user);

  if (us.completed) {
    return `
      <div class="paired-panel paired-panel--${user}">
        <div class="paired-panel__user" style="font-size:1.25rem;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">${label}</div>
        <div class="paired-done-badge">✓ All done!</div>
      </div>
    `;
  }

  const ex = us.exercises[us.exerciseIdx];
  if (!ex) {
    return `
      <div class="paired-panel paired-panel--${user}">
        <div class="paired-panel__user" style="font-size:1.25rem;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">${label}</div>
        <div class="paired-done-badge">✓ Done</div>
      </div>
    `;
  }

  const restRemaining = us.restRemaining ?? 0;

  // ---- RESTING state: big countdown, minimal UI ----
  if (restRemaining > 0) {
    const mm = String(Math.floor(restRemaining / 60)).padStart(2,'0');
    const ss = String(restRemaining % 60).padStart(2,'0');
    // Next exercise name shown so they know what's coming
    const nextEx = us.exercises[us.exerciseIdx];
    const upNext = nextEx ? `<div class="panel-up-next">Up next: ${escapeHtml(nextEx.name)}</div>` : '';
    return `
      <div class="paired-panel paired-panel--${user} paired-panel--resting">
        <div class="paired-panel__user" style="font-size:1.25rem;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">${label}</div>
        <div class="rest-label-small">rest</div>
        <div class="rest-countdown-big" id="${user}-rest-display"
             style="font-variant-numeric:tabular-nums;">${mm}:${ss}</div>
        ${upNext}
        <button class="paired-complete-btn" id="${user}-complete-btn" disabled
                data-user="${user}">
          Resting…
        </button>
        <button class="paired-skip-btn" data-skip="${user}">skip exercise</button>
      </div>
    `;
  }

  // ---- ACTIVE state: full exercise info ----
  const setsDone  = us.setIdx;
  const totalSets = ex.sets;
  const dots = Array.from({length:totalSets},(_,i) =>
    `<div class="paired-set-dot ${i<setsDone?'done':i===setsDone?'current':''}">${i+1}</div>`
  ).join('');

  const metaParts = [
    ex.reps ? ex.reps : (ex.durationSeconds ? `${ex.durationSeconds}s` : null)
  ].filter(Boolean);

  const circuitLabel = us.workoutStructure === 'circuit'
    ? `Round ${us.circuitRound + 1} of ${ex.sets} · Ex ${us.exerciseIdx + 1}/${us.exercises.length}`
    : `Set ${setsDone + 1} of ${totalSets}`;

  const adaptNote = ex.adaptationNote
    ? `<div style="font-size:0.7rem;color:var(--yellow);margin-bottom:6px;">⚡ ${escapeHtml(ex.adaptationNote)}</div>`
    : '';

  const anchorBadge = ex.isAnchor
    ? `<span class="anchor-badge anchor-badge--runner" title="Track progression on this lift">⚓ Cycle anchor</span>`
    : '';

  const completeLabel = us.workoutStructure === 'circuit'
    ? `Complete — Round ${us.circuitRound + 1}`
    : `Complete Set ${setsDone + 1}`;

  const exCountdown = ex.durationSeconds
    ? `<div id="${user}-ex-countdown"
         style="display:none;font-size:clamp(3rem,11vw,5rem);font-weight:800;
                text-align:center;font-variant-numeric:tabular-nums;
                line-height:1;padding:12px 0;color:var(--${user});">
         ${formatTime(ex.durationSeconds)}
       </div>`
    : '';

  // Hidden rest display — populated by startUserRestTimer when rest starts
  const restDisplay = `<div class="paired-rest" id="${user}-rest-display"
    style="visibility:hidden;font-variant-numeric:tabular-nums;">00:00</div>`;

  return `
    <div class="paired-panel paired-panel--${user}">
      <div class="paired-panel__user" style="font-size:1.25rem;font-weight:700;letter-spacing:0.02em;margin-bottom:6px;">${label}</div>
      <div class="paired-panel__exercise">${escapeHtml(ex.name)}${anchorBadge}</div>
      ${ex.symptomConflicts?.length ? `<div style="margin:2px 0 4px;">${symptomConflictBadge(ex)}</div>` : ''}
      <div class="paired-panel__meta">
        ${escapeHtml(circuitLabel)}${metaParts.length ? ' · ' + escapeHtml(metaParts.join(' · ')) : ''}
      </div>
      ${adaptNote}
      <div class="paired-set-dots">${dots}</div>
      ${renderWeightStepper(ex, user)}
      ${renderRepsStepper(ex, user)}
      ${ex.formCues?.length
        ? `<div style="margin-top:8px;padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);">
             <div style="font-size:0.6rem;text-transform:uppercase;letter-spacing:0.08em;
                         color:var(--text-2);margin-bottom:4px;">Form</div>
             ${ex.formCues.slice(0,2).map(c =>
               `<div style="font-size:0.72rem;color:var(--text-2);line-height:1.4;margin-bottom:2px;">
                  · ${escapeHtml(c)}
                </div>`
             ).join('')}
           </div>`
        : ''}
      ${exCountdown}
      ${restDisplay}
      <button class="paired-complete-btn" id="${user}-complete-btn" data-user="${user}">
        ${completeLabel}
      </button>
      <button class="paired-skip-btn" data-skip="${user}">skip exercise</button>
    </div>
  `;
}

export function renderWorkoutRunner(App) {
  const ws = App.workoutState;
  if (!ws) return `<div class="workout-screen"><div class="workout-body"><p class="empty-state">No workout loaded.</p></div></div>`;

  const { mode } = ws;
  const musicMode  = App.state?.settings?.musicMode ?? 'spotify';
  const spotifyUrl = safeSpotifyUrl(App.state?.settings?.spotifyUrl);
  const spotifyPill = (musicMode === 'spotify' && spotifyUrl)
    ? `<a href="${escapeHtml(spotifyUrl)}" target="_blank" rel="noopener noreferrer" class="spotify-pill" title="Open in Spotify">♫</a>`
    : '';

  // ---- BOTH: side-by-side ----
  if (mode === 'both') {
    if (ws.eli.completed && ws.christina.completed) return renderBothDone();

    const eliProgress = `${Math.min(ws.eli.exerciseIdx+1, ws.eli.exercises.length)}/${ws.eli.exercises.length}`;
    const cProgress   = `${Math.min(ws.christina.exerciseIdx+1, ws.christina.exercises.length)}/${ws.christina.exercises.length}`;

    return `
      <div class="workout-screen">
        <div class="workout-header">
          <span class="workout-header__label">
            ${ws.eli.completed ? '✓' : eliProgress} &nbsp;·&nbsp; ${ws.christina.completed ? '✓' : cProgress}
          </span>
          <div style="display:flex;align-items:center;gap:8px;">
            ${spotifyPill}
            <button class="btn btn--sm btn--ghost" id="btn-end-workout-early">End</button>
          </div>
        </div>
        <div class="paired-workout fade-in">
          ${renderSingleUserPanel(ws, 'eli')}
          ${renderSingleUserPanel(ws, 'christina')}
        </div>
      </div>
    `;
  }

  // ---- Single user ----
  const user = mode === 'eli_only' ? 'eli' : 'christina';
  const us   = ws[user];
  if (us.completed) return renderBothDone();

  const ex = us.exercises[us.exerciseIdx];
  if (!ex) return renderBothDone();

  const setsDone  = us.setIdx;
  const totalSets = ex.sets;
  const exNum     = us.exerciseIdx + 1;
  const exTotal   = us.exercises.length;
  const col       = user === 'eli' ? 'eli' : 'christina';

  const setDots = Array.from({length:totalSets},(_,i) =>
    `<div class="set-dot ${user==='christina'?'set-dot--christina':''} ${i<setsDone?'done':i===setsDone?'current':''}">${i+1}</div>`
  ).join('');

  const targetText = ex.durationSeconds ? `${ex.durationSeconds}s` : ex.reps ? `${ex.reps} reps` : '';
  const formCues = ex.formCues?.length
    ? `<div class="form-cues">
         <div class="form-cues__title">Form cues</div>
         <div class="form-cues__list">
           ${ex.formCues.map(c=>`<div class="form-cue${user==='christina'?' form-cue--christina':''}">${escapeHtml(c)}</div>`).join('')}
         </div>
       </div>` : '';
  const adaptNote = ex.adaptationNote
    ? `<div class="adaptation-note">⚡ ${escapeHtml(ex.adaptationNote)}</div>` : '';

  const anchorBadge = ex.isAnchor
    ? `<span class="anchor-badge anchor-badge--runner">⚓ Cycle anchor</span>`
    : '';

  const circuitLabel = us.workoutStructure === 'circuit'
    ? `Round ${us.circuitRound + 1} of ${ex.sets}`
    : `Set ${setsDone + 1} of ${totalSets}`;

  return `
    <div class="workout-screen">
      <div class="workout-header">
        <span class="workout-header__label">
          ${userLabel(App, user)} · Ex ${exNum}/${exTotal}
        </span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${spotifyPill}
          <button class="btn btn--sm btn--ghost" id="btn-end-workout-early">End</button>
        </div>
      </div>
      <div class="workout-body">
        <div class="exercise-card exercise-card--${col} fade-in">
          <div class="exercise-card__meta">${escapeHtml(ex.slotName ?? '')}</div>
          <div class="exercise-card__name">${escapeHtml(ex.name)}</div>
          ${anchorBadge}
          ${ex.symptomConflicts?.length ? `<div style="margin-top:6px;">${symptomConflictBadge(ex)}</div>` : ''}
          <div class="exercise-card__targets">
            ${targetText ? `<span class="tag">${escapeHtml(targetText)}</span>` : ''}
            <span class="tag">${escapeHtml(circuitLabel)}</span>
          </div>
          ${renderWeightStepper(ex, user)}
          ${renderRepsStepper(ex, user)}
          <div class="set-tracker" style="margin-top:16px;">${setDots}</div>
          ${adaptNote}
          ${formCues}
          <div id="${user}-ex-countdown"
               style="display:none;font-size:clamp(3rem,12vw,5.5rem);font-weight:800;
                      text-align:center;font-variant-numeric:tabular-nums;
                      line-height:1;padding:16px 0;color:var(--${col});"></div>
        </div>
      </div>
      <div class="workout-footer">
        <button class="btn btn--${col}" id="btn-complete-set">
          ${us.workoutStructure === 'circuit' ? `Complete — Round ${us.circuitRound + 1}` : `Complete Set ${setsDone+1}`}
        </button>
        <button class="btn btn--ghost btn--sm" id="btn-skip-exercise">Skip Exercise</button>
      </div>
    </div>
  `;
}

function renderBothDone() {
  return `
    <div class="workout-screen">
      <div class="workout-body" style="align-items:center;justify-content:center;text-align:center;padding-top:64px;">
        <div style="font-size:3rem;margin-bottom:16px;">🎉</div>
        <div class="page-title" style="margin-bottom:8px;">All done!</div>
        <p class="page-subtitle" style="margin-bottom:32px;">Great work today.</p>
        <button class="btn btn--primary" id="btn-finish-workout">Finish &amp; Check In</button>
      </div>
    </div>
  `;
}

// ---- 7. Rest Timer Overlay (single-user) ------------------

export function renderRestOverlay(remaining, totalSeconds, nextExName) {
  const pct    = Math.max(0, Math.min(100, (remaining/totalSeconds)*100));
  const urgent = remaining <= 10;
  const mm     = String(Math.floor(remaining/60)).padStart(2,'0');
  const ss     = String(remaining%60).padStart(2,'0');

  return `
    <div class="rest-overlay" id="rest-overlay" role="dialog" aria-modal="true" aria-label="Rest between sets">
      <div class="rest-overlay__label">REST</div>
      <div class="rest-overlay__time ${urgent?'urgent':''}" id="rest-time" role="timer" aria-live="off" aria-label="Rest time remaining">${mm}:${ss}</div>
      <div class="progress-bar" style="width:240px;margin-bottom:32px;">
        <div class="progress-bar__fill" id="rest-progress" style="width:${pct}%;"></div>
      </div>
      ${nextExName
        ? `<div class="rest-overlay__next">Up next<strong>${escapeHtml(nextExName)}</strong></div>`
        : `<div class="rest-overlay__next">Last set done.</div>`}
      <div class="rest-overlay__actions">
        <button class="btn btn--secondary" id="btn-pause-timer">Pause</button>
        <button class="btn btn--primary" id="btn-skip-rest">Skip Rest →</button>
      </div>
    </div>
  `;
}

export function updateRestOverlayDOM(remaining, totalSeconds) {
  const el = document.getElementById('rest-time');
  const pr = document.getElementById('rest-progress');
  if (!el) return;
  el.textContent = `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  el.className = `rest-overlay__time ${remaining<=10?'urgent':''}`;
  if (pr) pr.style.width = `${Math.max(0,(remaining/totalSeconds)*100)}%`;
}

// ---- 8. End Check-In --------------------------------------

export function renderEndCheckin(App) {
  const { selectedUsers } = App.ui;
  const includesEli       = selectedUsers.includes('eli');
  const includesChristina = selectedUsers.includes('christina');
  const session            = App.currentSession;

  const humanize = id => id ? id.replace(/^(eli|christina)_/, '').replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()) : null;

  const eliRoutineLabel       = humanize(session?.eliRoutineId);
  const christinaRoutineLabel = humanize(session?.christinaRoutineId);

  const durationMin = session?.startedAt
    ? Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000))
    : null;

  const summaryLines = [
    includesEli && eliRoutineLabel
      ? `<div>${userIcon(App, 'eli')} <strong>${escapeHtml(userName(App, 'eli'))}:</strong> ${escapeHtml(eliRoutineLabel)}</div>` : '',
    includesChristina && christinaRoutineLabel
      ? `<div>${userIcon(App, 'christina')} <strong>${escapeHtml(userName(App, 'christina'))}:</strong> ${escapeHtml(christinaRoutineLabel)}</div>` : '',
    durationMin
      ? `<div style="margin-top:6px;color:var(--text-2);">Duration: ${durationMin} min</div>` : ''
  ].filter(Boolean).join('');

  const summaryCard = summaryLines ? `
    <div class="card" style="margin-bottom:24px;font-size:0.875rem;line-height:1.7;">
      ${summaryLines}
    </div>
  ` : '';

  const profileCheckinSection = userId => `
    <div class="reports-section">
      <div class="section-label" style="margin-bottom:12px;">${userLabel(App, userId)} — Check-In</div>
      <div class="section-label" style="margin-bottom:8px;">How hard did this session feel?</div>
      <div class="fatigue-scale">
        ${FATIGUE_SCALE.map(f => `
          <button class="fatigue-btn" data-effort-user="${userId}" data-value="${f.value}">
            <span class="fatigue-btn__num">${f.value}</span>
            <span class="fatigue-btn__text">
              <span class="fatigue-btn__label">${f.label}</span>
              <span class="fatigue-btn__desc">${f.description}</span>
            </span>
          </button>
        `).join('')}
      </div>
      <div class="section-label" style="margin-top:20px;margin-bottom:8px;">Joint pain?</div>
      <div class="pain-options">
        ${JOINT_PAIN_OPTIONS.map(opt => `
          <button class="pain-option-btn" data-joint-pain-user="${userId}" data-value="${opt.value}">${opt.label}</button>
        `).join('')}
      </div>
      <div class="input-group" style="margin-top:16px;">
        <label class="input-label" for="notes-${userId}">Anything to remember? (optional)</label>
        <textarea class="input" id="notes-${userId}" placeholder="What felt good, what was hard, or what to change next time..."></textarea>
      </div>
    </div>
  `;

  const eliSection = includesEli ? profileCheckinSection('eli') : '';
  const christinaSection = includesChristina ? profileCheckinSection('christina') : '';

  return `
    <div class="page page--no-nav fade-in" style="padding-bottom:100px;">
      <div class="eyebrow">Finish Up</div>
      <h1 class="page-title" style="margin-top:6px;">Nice work.</h1>
      <p class="page-subtitle" style="margin-bottom:24px;">Quick check before we save.</p>
      ${summaryCard}
      ${eliSection}
      ${christinaSection}
      <div style="position:fixed;bottom:0;left:0;right:0;
                  background:var(--bg);border-top:1px solid var(--border);
                  padding:16px 20px;padding-bottom:calc(16px + env(safe-area-inset-bottom));">
        <button class="btn btn--primary" id="btn-checkin-done">Continue</button>
      </div>
    </div>
  `;
}

// ---- 9. Meditation ----------------------------------------

export function renderMeditation() {
  return `
    <div class="meditation-screen fade-in">
      <div class="meditation-card">
        <div class="eyebrow eyebrow--christina" style="margin-bottom:8px;">Optional</div>
        <h1 class="page-title">Meditation</h1>
        <p class="page-subtitle" style="max-width:300px;margin:8px auto 0;">
          Close out with a few quiet minutes, or skip and save.
        </p>
        <div class="meditation-orb">🧘</div>
        <div class="choice-grid choice-grid--3" style="width:100%;">
          <button class="choice-btn" data-med="5">
            <span class="choice-btn__icon">5</span>Minutes
            <span class="choice-btn__hint">Recommended</span>
          </button>
          <button class="choice-btn" data-med="10"><span class="choice-btn__icon">10</span>Minutes</button>
          <button class="choice-btn" data-med="skip"><span class="choice-btn__icon">⏭</span>Skip and save</button>
        </div>
        <div id="med-timer-wrap" style="display:none;text-align:center;margin-top:32px;">
          <div class="meditation-timer" id="med-timer">--:--</div>
          <button class="btn btn--ghost btn--sm" id="btn-end-meditation" style="margin-top:16px;">End Meditation</button>
        </div>
      </div>
    </div>
  `;
}

// ---- 10. Session Summary ----------------------------------

export function renderSessionSummary(App) {
  const { state, ui } = App;
  const { sessions, missedDays } = state;

  // Use the snapshot saved by finalizeSession — currentSession is null by this point
  const snap = ui.lastSessionSummary ?? {};

  const year  = ui.calYear  ?? new Date().getFullYear();
  const month = ui.calMonth ?? new Date().getMonth();

  const calData = buildMonthCalendar(year, month, sessions, missedDays);
  const calHTML = renderCalendarHTML(year, month, calData);

  const eliLine = snap.users?.includes('eli') && snap.eliRoutineId
    ? `<div>${userIcon(App, 'eli')} <strong>${escapeHtml(userName(App, 'eli'))}:</strong> ${escapeHtml(snap.eliRoutineId.replace(/eli_/g,'').replace(/_/g,' '))}</div>`
    : '';
  const cLine = snap.users?.includes('christina') && snap.christinaRoutineId
    ? `<div>${userIcon(App, 'christina')} <strong>${escapeHtml(userName(App, 'christina'))}:</strong> ${escapeHtml(snap.christinaRoutineId.replace(/christina_/g,'').replace(/_/g,' '))} (${snap.christinaAdaptationLevel ?? ''})</div>`
    : '';

  const summaryCard = (eliLine || cLine || snap.meditation?.completed)
    ? `<div class="card" style="font-size:0.875rem;line-height:1.8;color:var(--text-2);">
         ${eliLine}${cLine}
         ${snap.meditation?.completed ? `<div>🧘 Meditation: ${snap.meditation.durationMinutes} min</div>` : ''}
       </div>`
    : '';

  const legendHtml = `
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:${ACTIVITY_COLORS.eli_heavy}"></div>${escapeHtml(userName(App, 'eli'))} strength</div>
      <div class="legend-item"><div class="legend-dot" style="background:${ACTIVITY_COLORS.eli_circuit}"></div>Circuit</div>
      <div class="legend-item"><div class="legend-dot" style="background:${ACTIVITY_COLORS.christina_normal}"></div>${escapeHtml(userName(App, 'christina'))} full</div>
      <div class="legend-item"><div class="legend-dot" style="background:${ACTIVITY_COLORS.christina_reduced}"></div>Adapted</div>
      <div class="legend-item"><div class="legend-dot" style="background:${ACTIVITY_COLORS.meditation}"></div>Meditation</div>
      <div class="legend-item"><div class="legend-dot" style="background:${ACTIVITY_COLORS.skip_rest}"></div>Rest</div>
    </div>
  `;

  return `
    <div class="page fade-in" style="padding-bottom:80px;">
      <div class="summary-hero">
        <div class="summary-hero__icon">✅</div>
        <div class="summary-hero__title">Session saved.</div>
        <div class="summary-hero__sub">${snap.date ? formatDate(snap.date) : 'Today'}</div>
      </div>
      ${summaryCard}
      <div class="divider"></div>
      <div class="section-label" style="margin-bottom:12px;">This Month</div>
      ${calHTML}
      ${legendHtml}
      <div style="margin-top:20px;">
        <button class="btn btn--ghost" id="btn-to-reports">View Full Reports →</button>
      </div>
    </div>
    ${bottomNav('hello')}
  `;
}

// ---- 11. Reports ------------------------------------------

export function renderReports(App) {
  const { state, ui } = App;
  const { sessions, missedDays, cycleState } = state;

  const year  = ui.calYear  ?? new Date().getFullYear();
  const month = ui.calMonth ?? new Date().getMonth();

  const calData  = buildMonthCalendar(year, month, sessions, missedDays);
  const calHTML  = renderCalendarHTML(year, month, calData);
  const eliStats = getEliStats(sessions);
  const cStats   = getChristinaStats(sessions);

  const cSymptomCalendarData = getChristinaSymptomCalendarData(year, month, sessions);
  const cSymptomCalendarHTML = renderChristinaSymptomCalendarHTML(year, month, cSymptomCalendarData);
  const progressionSignals = ['eli','christina'].map(userId => ({ userId,
    rows: getProfileProgressionSignals(sessions, userId, state.settings.profiles[userId])
  }));
  const progressionHTML = progressionSignals.map(({userId, rows}) => `
    <div class="card" style="margin-bottom:10px;">
      <div class="setting-row__label">${userLabel(App, userId)}</div>
      ${rows.length ? rows.slice(0,4).map(row => `<div class="setting-row" style="display:block;">
        <div class="setting-row__label">${escapeHtml(row.name)}</div>
        <div class="setting-row__desc">${escapeHtml(row.recommendation)} ${escapeHtml(row.reason)}</div>
      </div>`).join('') : '<div class="setting-row__desc" style="margin-top:6px;">Keep training normally. A progression signal appears only after repeated manageable sessions.</div>'}
    </div>`).join('');

  return `
    <div class="page fade-in" style="padding-bottom:80px;">
      <h1 class="page-title" style="margin-top:8px;">Tracker</h1>
      <p class="page-subtitle" style="margin-bottom:24px;">Cycle ${cycleState.cycleNumber} · ${sessions.length} sessions total</p>

      <div class="section-label" style="margin-bottom:12px;">This Month</div>
      ${calHTML}
      <div class="divider"></div>

      <div class="section-label" style="margin-bottom:12px;">${userLabel(App, 'eli')}</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card__value" style="color:var(--eli);">${eliStats.total}</div><div class="stat-card__label">Total sessions</div></div>
        <div class="stat-card"><div class="stat-card__value" style="color:var(--eli);">${eliStats.heavy}</div><div class="stat-card__label">Heavy sessions</div></div>
        <div class="stat-card"><div class="stat-card__value" style="color:var(--eli);">${eliStats.avgFatigue ?? '—'}</div><div class="stat-card__label">Avg form fatigue</div></div>
        <div class="stat-card"><div class="stat-card__value" style="color:var(--red);">${eliStats.jointPainCount}</div><div class="stat-card__label">Pain flags</div></div>
      </div>
      <div class="section-label" style="margin-top:16px;margin-bottom:8px;">Cycle Strength Progress</div>
      <p class="text-muted text-sm" style="margin-bottom:8px;margin-top:-4px;">How much each lift improved from cycle start to your current best clean set.</p>
      <div id="chart-eli-strength"></div>
      <div class="section-label" style="margin-top:20px;margin-bottom:8px;">Muscle Group Stimulus Map</div>
      <p class="text-muted text-sm" style="margin-bottom:8px;margin-top:-4px;">Estimated hard sets per muscle group this cycle. Does not indicate muscle gain.</p>
      <div id="chart-eli-muscle"></div>
      <div class="section-label" style="margin-top:20px;margin-bottom:8px;">Recovery-Adjusted Growth Readiness</div>
      <div id="card-eli-readiness" style="margin-bottom:4px;"></div>

      <div class="divider"></div>

           <div class="section-label" style="margin-bottom:12px;">${userLabel(App, 'christina')}</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card__value" style="color:var(--christina);">${cStats.total}</div><div class="stat-card__label">Total sessions</div></div>
        <div class="stat-card"><div class="stat-card__value" style="color:var(--christina);">${cStats.normal}</div><div class="stat-card__label">Full intensity</div></div>
        <div class="stat-card"><div class="stat-card__value" style="color:var(--yellow);">${cStats.reduced}</div><div class="stat-card__label">Adapted sessions</div></div>
        <div class="stat-card"><div class="stat-card__value" style="color:var(--text-2);">${cStats.recovery}</div><div class="stat-card__label">Recovery days</div></div>
      </div>

      <div class="section-label" style="margin-top:16px;margin-bottom:8px;">Movement Exposure Map</div>
      <p class="text-muted text-sm" style="margin-bottom:8px;margin-top:-4px;">
        Estimated movement exposure by area this cycle. Use this to spot repeated load, tolerance patterns, and possible recovery needs.
      </p>
      <div id="chart-christina-exposure"></div>

      <div class="section-label" style="margin-top:20px;margin-bottom:8px;">Symptom + Pain Calendar</div>
      <p class="text-muted text-sm" style="margin-bottom:8px;margin-top:-4px;">
        Shows symptom load by day, with full, adapted, and recovery markers.
      </p>
      <div id="chart-christina-symptom-calendar">
        ${cSymptomCalendarHTML}
      </div>

      <div class="section-label" style="margin-top:20px;margin-bottom:8px;">Pain Day Breakdown</div>
      <div class="chart-wrap"><canvas id="chart-christina-pain-days"></canvas></div>

      <div class="section-label" style="margin-top:16px;margin-bottom:8px;">Top Symptoms This Cycle</div>
      <p class="text-muted text-sm" style="margin-bottom:8px;margin-top:-4px;">
        Frequency summary across logged ${escapeHtml(userName(App, 'christina'))} sessions.
      </p>
      <div class="chart-wrap"><canvas id="chart-christina-symptoms"></canvas></div>

      <div class="section-label" style="margin-top:20px;margin-bottom:8px;">Recovery-Adjusted Growth Readiness</div>
      <div id="card-christina-readiness" style="margin-bottom:4px;"></div>

      <div class="divider"></div>
      <div class="section-label" style="margin-bottom:12px;">Progression Recommendations</div>
      <p class="text-muted text-sm" style="margin-bottom:10px;">Based on recent completed workouts, reported effort, and joint discomfort. Recommendations never apply automatically.</p>
      ${progressionHTML}
      <div class="divider"></div>
      <div class="section-label" style="margin-bottom:12px;">Export</div>
      <button class="btn btn--secondary" id="btn-export-month-csv">📄 Export Month as CSV</button>
      <button class="btn btn--secondary" id="btn-export-month-md" style="margin-top:8px;">📝 Export Month as Markdown</button>
      <button class="btn btn--secondary" id="btn-export-cycle" style="margin-top:8px;">📊 Export Cycle Review</button>
      <button class="btn btn--secondary" id="btn-export-json" style="margin-top:8px;">💾 Full JSON Backup</button>
    </div>
    ${bottomNav('reports')}
  `;
}

export function initReportCharts(App) {
  const { sessions, cycleState } = App.state;
  const cStats = getChristinaStats(sessions);

  renderStrengthProgressChart('chart-eli-strength', getEliStrengthData(sessions, cycleState));
  renderMuscleMapChart('chart-eli-muscle', getEliMuscleStimulus(sessions, cycleState));
  renderReadinessCard('card-eli-readiness', getEliReadiness(sessions, cycleState), 'eli');

  renderChristinaMovementExposureMap(
    'chart-christina-exposure',
    getChristinaMovementExposure(sessions, cycleState)
  );

  renderChristinaPainDaysChart('chart-christina-pain-days', cStats.painDays);
  renderChristinaSymptomChart('chart-christina-symptoms', cStats.symptomFreq, cStats.symptomLabels);
  renderReadinessCard('card-christina-readiness', getChristinaReadiness(sessions, cycleState), 'christina');
}

// ---- Cycle Review ------------------------------------------

export function renderCycleReview(App) {
  const snap = App.ui.cycleReviewSnapshot;
  const cycleState = snap?.cycleState ?? App.state.cycleState;
  const suggestions = App.ui.cycleProgressionSuggestions ?? [];

  // Weight now moves as ONE baseline across every lift (adjustable-dumbbell reality).
  const baselineRow = suggestions.find(s => s.type === 'baseline');
  const repsRows    = suggestions.filter(s => s.type === 'reps');

  let baselineSection = '';
  if (baselineRow && baselineRow.reason === 'earned') {
    baselineSection = `
    <div class="reports-section" style="margin-top:20px;">
      <div class="section-label" style="margin-bottom:10px;">Ready to Add Weight</div>
      <div class="card">
        <div class="setting-row" id="progression-row-baseline">
          <div>
            <div class="setting-row__label">Working weight — all lifts</div>
            <div class="setting-row__desc" id="progression-desc-baseline">
              ${baselineRow.currentKg}kg <span id="progression-arrow-baseline">→ <strong style="color:var(--eli);">${baselineRow.suggestedKg}kg</strong> across all lifts, reps restart</span>
            </div>
          </div>
          <button class="btn btn--sm btn--eli"
                  id="progression-toggle-baseline"
                  data-exercise-id="baseline"
                  data-accepted="true">
            Accept
          </button>
        </div>
      </div>
      <p class="text-muted text-sm" style="margin-top:8px;">You topped out the rep range on every anchor lift — one ${(baselineRow.suggestedKg - baselineRow.currentKg).toFixed(1)}kg bump moves them all together. Reps restart at the new weight. Tap to hold instead.</p>
    </div>`;
  } else if (baselineRow) {
    const msg = baselineRow.reason === 'red'
      ? `Readiness flagged recovery this cycle — holding your working weight at ${baselineRow.currentKg}kg.`
      : `Still earning reps on some lifts — working weight holds at ${baselineRow.currentKg}kg. It bumps once you top out the rep range everywhere.`;
    baselineSection = `
    <div class="reports-section" style="margin-top:20px;">
      <div class="section-label" style="margin-bottom:10px;">Working Weight</div>
      <div class="card"><div class="setting-row"><div class="setting-row__desc">${msg}</div></div></div>
    </div>`;
  }

  const repsSection = repsRows.length ? `
    <div class="reports-section" style="margin-top:20px;">
      <div class="section-label" style="margin-bottom:10px;">Still Climbing Reps</div>
      <div class="card">
        ${repsRows.map(s => `
          <div class="setting-row">
            <div>
              <div class="setting-row__label">${escapeHtml(s.exerciseName)}</div>
              <div class="setting-row__desc">${s.currentKg}kg · targeting ${s.currentReps} of ${s.repsRangeMax} reps</div>
            </div>
            <span class="swapped-badge">Carries over</span>
          </div>
        `).join('')}
      </div>
      <p class="text-muted text-sm" style="margin-top:8px;">These continue at the same weight next cycle — your rep target picks up right where it left off, no action needed.</p>
    </div>
  ` : '';

  const noDataNote = !suggestions.length ? `
    <p class="text-muted text-sm" style="margin-top:16px;">No anchor lifts logged this cycle — nothing to suggest progressing.</p>
  ` : '';

  return `
    <div class="page page--no-nav fade-in" style="padding-bottom:110px;">
      <div class="eyebrow">Cycle ${cycleState.cycleNumber} Complete 🎉</div>
      <h1 class="page-title" style="margin-top:6px;">Nice work this cycle.</h1>
      <p class="page-subtitle" style="margin-bottom:20px;">${formatDate(cycleState.startDate)} – ${formatDate(cycleState.endDate)}</p>

      <div class="reports-section">
        <div class="section-label" style="margin-bottom:10px;">${userLabel(App, 'eli')} This Cycle</div>
        <div id="cycle-review-eli-readiness"></div>
      </div>

      ${baselineSection}
      ${repsSection}
      ${noDataNote}

      <div class="reports-section" style="margin-top:24px;">
        <div class="section-label" style="margin-bottom:10px;">${userLabel(App, 'christina')} This Cycle</div>
        <div id="cycle-review-christina-readiness"></div>
      </div>

      <div style="position:fixed;bottom:0;left:0;right:0;
                  background:var(--bg);border-top:1px solid var(--border);
                  padding:16px 20px;padding-bottom:calc(16px + env(safe-area-inset-bottom));">
        <button class="btn btn--primary" id="btn-start-new-cycle">Start Cycle ${cycleState.cycleNumber + 1}</button>
      </div>
    </div>
  `;
}

export function initCycleReviewCards(App) {
  const snap = App.ui.cycleReviewSnapshot;
  if (!snap) return;
  renderReadinessCard('cycle-review-eli-readiness', getEliReadiness(snap.sessions, snap.cycleState), 'eli');
  renderReadinessCard('cycle-review-christina-readiness', getChristinaReadiness(snap.sessions, snap.cycleState), 'christina');
}

// ---- 12. Settings -----------------------------------------

// Exercises currently reachable in a profile's routine templates (dedup, sorted).
// This is the set the profile's on/off accordion shows in Phase A.
function profileExerciseList(App, userId) {
  const seen = new Set();
  const out = [];
  for (const t of (App.data.routineTemplates ?? [])) {
    // Unified profiles can use either legacy template family, so both profile
    // checklists intentionally expose the same complete exercise pool.
    for (const slot of (t.slots ?? [])) {
      for (const id of (slot.allowedExerciseIds ?? [])) {
        if (seen.has(id)) continue;
        seen.add(id);
        const def = (App.data.exercises ?? []).find(e => e.id === id);
        out.push({ id, name: def?.name ?? id });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function renderProfileCard(App, userId) {
  const p = App.state.settings.profiles[userId];
  const list = profileExerciseList(App, userId);
  const disabled = new Set(p.disabledExerciseIds ?? []);
  const onCount = list.filter(x => !disabled.has(x.id)).length;
  const prog = p.progressionMode ?? 'cycle_review';
  const primaryGoal = p.primaryGoal ?? 'general_fitness';
  const secondaryGoals = new Set(p.secondaryGoals ?? []);
  const experience = p.experienceLevel ?? 'some';
  const adaptationPreference = p.adaptationPreference ?? 'both';

  const rows = list.map(x => `
    <label class="ex-toggle">
      <input type="checkbox" data-ex-toggle="${userId}" value="${x.id}" ${disabled.has(x.id) ? '' : 'checked'}>
      <span>${escapeHtml(x.name)}</span>
    </label>`).join('');

  return `
    <div class="card">
      <div class="setting-row">
        <div style="flex:1;">
          <div class="input-label" style="margin-bottom:4px;">Profile name</div>
          <input class="input" id="profile-name-${userId}" value="${escapeHtml(p.displayName)}" style="max-width:240px;" aria-label="Profile name">
        </div>
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
        <div class="setting-row__label">Profile icon</div>
        <div class="mode-toggle" role="group" aria-label="${escapeHtml(p.displayName)} profile icon" style="flex-wrap:wrap;">
          ${PROFILE_ICONS.map(icon => `<button class="mode-btn ${p.icon === icon ? 'active' : ''}"
            data-profile-icon="${userId}" data-icon="${icon}" aria-label="Use ${icon}"
            aria-pressed="${p.icon === icon}">${icon}</button>`).join('')}
        </div>
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:12px;">
        <div class="setting-row__label">Training goals</div>
        <label class="input-label" for="primary-goal-${userId}">Primary goal</label>
        <select class="input" id="primary-goal-${userId}">
          ${TRAINING_GOALS.map(([value,label]) => `<option value="${value}" ${primaryGoal===value?'selected':''}>${label}</option>`).join('')}
        </select>
        <div class="input-label">Optional secondary goals</div>
        <div class="ex-toggle-grid">${TRAINING_GOALS.filter(([value]) => value !== primaryGoal).map(([value,label]) => `
          <label class="ex-toggle"><input type="checkbox" data-secondary-goal="${userId}" value="${value}" ${secondaryGoals.has(value)?'checked':''}><span>${label}</span></label>`).join('')}</div>
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
        <div class="setting-row__label">Training experience</div>
        <div class="mode-toggle" style="flex-wrap:wrap;">${EXPERIENCE_LEVELS.map(([value,label]) => `
          <button class="mode-btn ${experience===value?'active':''}" data-experience="${userId}" data-value="${value}">${label}</button>`).join('')}</div>
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
        <div><div class="setting-row__label">Adaptation preferences</div>
          <div class="setting-row__desc">Preferences guide recommendations; today’s capacity can always adjust the plan.</div></div>
        <div class="mode-toggle" style="flex-wrap:wrap;">${ADAPTATION_OPTIONS.map(([value,label]) => `
          <button class="mode-btn ${adaptationPreference===value?'active':''}" data-adaptation="${userId}" data-value="${value}">${label}</button>`).join('')}</div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-row__label">Baseline weight</div>
          <div class="setting-row__desc">${prog === 'fixed' ? 'Fixed — never auto-increases' : 'Starting load; climbs at cycle review'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn--sm btn--ghost" data-baseline="${userId}" data-dir="down" aria-label="Decrease ${escapeHtml(p.displayName)} baseline weight">−</button>
          <span id="baseline-value-${userId}" style="font-weight:700;min-width:56px;text-align:center;">${p.baselineWeightKg} kg</span>
          <button class="btn btn--sm btn--ghost" data-baseline="${userId}" data-dir="up" aria-label="Increase ${escapeHtml(p.displayName)} baseline weight">+</button>
        </div>
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
        <div>
          <div class="setting-row__label">Weight progression</div>
          <div class="setting-row__desc">${prog === 'cycle_review' ? 'Reviewed every 4 weeks, informed by reports' : 'Stays put — toning & maintaining'}</div>
        </div>
        <div class="mode-toggle" role="group" aria-label="${escapeHtml(p.displayName)} progression mode">
          <button class="mode-btn ${prog === 'cycle_review' ? 'active' : ''}" data-prog="${userId}" data-mode="cycle_review" aria-pressed="${prog === 'cycle_review'}">Cycle review</button>
          <button class="mode-btn ${prog === 'fixed' ? 'active' : ''}" data-prog="${userId}" data-mode="fixed" aria-pressed="${prog === 'fixed'}">Fixed</button>
        </div>
      </div>
      <details class="ex-accordion">
        <summary>
          <span class="setting-row__label">Exercises</span>
          <span class="setting-row__desc" id="ex-count-${userId}">${onCount} of ${list.length} on</span>
        </summary>
        <div class="ex-toggle-grid">${rows}</div>
      </details>
    </div>`;
}

export function renderSettings(App) {
  const { settings } = App.state;
  const mode = settings.musicMode ?? 'spotify';
  const theme = settings.theme ?? 'night';
  const unavailableEquipment = new Set(settings.unavailableEquipmentIds ?? []);
  const dumbbellIds = new Set(['modular_adjustable_weights', 'fixed_dumbbells_3kg']);
  const hasAnyDumbbells = [...dumbbellIds].some(id => !unavailableEquipment.has(id));
  const equipment = App.data.equipment ?? [];
  const availableExerciseCount = (App.data.exercises ?? []).filter(ex =>
    (ex.equipment ?? []).every(id => dumbbellIds.has(id) ? hasAnyDumbbells : !unavailableEquipment.has(id))
  ).length;
  const strengthGoalSelected = Object.values(settings.profiles ?? {}).some(profile =>
    profile.primaryGoal === 'build_strength' || (profile.secondaryGoals ?? []).includes('build_strength')
  );
  const weightsUnavailable = unavailableEquipment.has('modular_adjustable_weights')
    && unavailableEquipment.has('fixed_dumbbells_3kg');
  const equipmentRows = equipment.map(item => `
    <label class="ex-toggle">
      <input type="checkbox" data-equipment-toggle value="${item.id}" ${unavailableEquipment.has(item.id) ? '' : 'checked'}>
      <span>${escapeHtml(item.name)}</span>
    </label>`).join('');

  return `
    <div class="page fade-in" style="padding-bottom:80px;">
      <h1 class="page-title" style="margin-top:8px;">Settings</h1>
      <p class="page-subtitle" style="margin-bottom:24px;">App configuration.</p>

      <div class="card" style="border-color:var(--yellow);">
        <div class="setting-row__label">Health &amp; safety</div>
        <div class="setting-row__desc" style="margin-top:6px;line-height:1.55;">
          Morning Circuit provides app-defined training suggestions, not medical advice.
          Stop exercising and seek appropriate medical help for chest pain, faintness,
          sharp pain, or severe or new symptoms.
        </div>
      </div>

      <div class="card">
        <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:12px;">
          <div>
            <div class="setting-row__label">Appearance</div>
            <div class="setting-row__desc">
              ${theme === 'day'
                ? 'Day — light background, gentle off-white.'
                : 'Night — dark background, low light.'}
            </div>
          </div>
          <div class="mode-toggle" role="group" aria-label="Appearance theme">
            <button class="mode-btn ${theme==='day'?'active':''}" id="btn-theme-day"
                    aria-pressed="${theme==='day'}">☀️ Day</button>
            <button class="mode-btn ${theme==='night'?'active':''}" id="btn-theme-night"
                    aria-pressed="${theme==='night'}">🌙 Night</button>
          </div>
        </div>
      </div>

      <div class="section-label" style="margin:20px 0 12px;">Profiles</div>
      ${renderProfileCard(App, 'eli')}
      ${renderProfileCard(App, 'christina')}

      <div class="section-label" style="margin:20px 0 12px;">Available equipment</div>
      <div class="card">
        <div class="setting-row__desc" style="margin-bottom:12px;line-height:1.5;">
          Turn off anything this household does not have. Exercises requiring unavailable equipment will be removed from routine choices.
        </div>
        <div class="setting-row__desc" style="margin-bottom:12px;">
          ${availableExerciseCount} of ${App.data.exercises.length} exercises currently available.
        </div>
        ${strengthGoalSelected && weightsUnavailable ? `<div class="symptom-flag-summary" style="margin-bottom:12px;">
          Strength is selected as a goal, but no weights are available. The app will use bodyweight strength variations where possible.
        </div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button class="btn btn--sm btn--secondary" id="btn-equipment-bodyweight">Bodyweight-focused</button>
          <button class="btn btn--sm btn--ghost" id="btn-equipment-all">Enable all</button>
        </div>
        <div class="ex-toggle-grid">${equipmentRows}</div>
      </div>

      <div class="card">
        <div class="setting-row">
          <div>
            <div class="setting-row__label">Launch Date</div>
            <div class="setting-row__desc">${settings.launchDate ? formatDate(settings.launchDate) : 'Not set'}</div>
          </div>
          <button class="btn btn--sm btn--ghost" id="btn-change-launch">Change</button>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-row__label">Default Rest</div>
            <div class="setting-row__desc">${settings.defaultRestSeconds}s between sets</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn--sm btn--ghost" id="btn-rest-minus" aria-label="Decrease default rest time">−</button>
            <span id="rest-value" style="font-weight:700;min-width:32px;text-align:center;">${settings.defaultRestSeconds}s</span>
            <button class="btn btn--sm btn--ghost" id="btn-rest-plus" aria-label="Increase default rest time">+</button>
          </div>
        </div>

        <!-- Music Mode toggle -->
        <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:12px;">
          <div>
            <div class="setting-row__label">Music during workout</div>
            <div class="setting-row__desc">
              ${mode === 'spotify'
                ? 'Spotify mode — ♫ pill opens your playlist. No chimes.'
                : 'Chime mode — marimba plays at end of every rest and exercise timer.'}
            </div>
          </div>
          <div class="mode-toggle">
            <button class="mode-btn ${mode==='spotify'?'active':''}" id="btn-mode-spotify">
              🎵 Spotify
            </button>
            <button class="mode-btn ${mode==='chimes'?'active':''}" id="btn-mode-chimes">
              🔔 Chimes
            </button>
          </div>
          ${mode === 'spotify' ? `
          <div style="width:100%;">
            <div class="input-label" style="margin-bottom:4px;">Spotify Playlist URL</div>
            <input type="url" class="input" id="spotify-url"
                   placeholder="https://open.spotify.com/playlist/..."
                   value="${escapeHtml(settings.spotifyUrl ?? '')}">
          </div>` : `
          <div style="display:flex;align-items:center;gap:12px;">
            <label class="toggle">
              <input type="checkbox" id="audio-toggle" ${settings.audioEnabled?'checked':''}>
              <span class="toggle-slider"></span>
            </label>
            <span style="font-size:0.85rem;color:var(--text-2);">Enable chime sounds</span>
          </div>`}
        </div>
      </div>

      <div style="margin-top:24px;">
        <div class="section-label" style="margin-bottom:12px;">Data</div>
        <div class="card">
          <div class="setting-row">
            <div>
              <div class="setting-row__label">Full JSON Backup</div>
              <div class="setting-row__desc">Download everything — sessions, cycle, settings</div>
            </div>
            <button class="btn btn--sm btn--secondary" id="btn-export-json-settings">Save</button>
          </div>
          <div class="setting-row" style="border-bottom:none;padding-bottom:0;">
            <div>
              <div class="setting-row__label">Restore from Backup</div>
              <div class="setting-row__desc">Load a .json backup file — replaces all current data</div>
            </div>
            <button class="btn btn--sm btn--secondary" id="btn-restore">Load</button>
          </div>
          <input type="file" id="restore-input" accept=".json" style="display:none;">
        </div>
        <button class="btn btn--danger" id="btn-reset-data" style="margin-top:12px;">Reset All Data</button>
      </div>
    </div>
    ${bottomNav('settings')}
  `;
}
