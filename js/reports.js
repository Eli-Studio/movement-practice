// ============================================================
// reports.js — Calendar, stats, and chart functions  v0.4.4
// ============================================================

import { today, getDaysInMonth, getFirstDayOfMonth, formatDateShort } from './utils.js';
import { ACTIVITY_COLORS, USERB_SYMPTOMS } from './config.js';

// Chart.js draws to <canvas>, which can't resolve CSS custom properties, so we
// read the current theme's --chart-* token values off <html> at build time.
// This keeps the charts on the same analog palette as the rest of the app and
// re-themes correctly when the charts are rebuilt after a Day/Night switch.
function chartTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (s.getPropertyValue(name).trim() || fallback);
  return {
    series: [v('--chart-series-1', '#9c7385'), v('--chart-series-2', '#b899a6'), v('--chart-series-3', '#cfbcc6')],
    solid:  v('--chart-solid', '#7f9670'),
    grid:   v('--chart-grid', 'rgb(255 255 255 / 6%)'),
    tick:   v('--chart-tick', '#aaa294')
  };
}

// Humanize an unknown symptom id (e.g. "grip_muscle_weakness" -> "Grip Muscle Weakness")
// so nothing silently disappears if the data carries an id not in config.
function humanizeSymptomId(id) {
  return String(id)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// Resolve any stored symptom id to its canonical {id, label}. Matching is done
// on a normalized key (lowercased, alphanumerics only) so camelCase config ids
// and snake_case data ids ("jointPain" vs "joint_pain") map to the same symptom.
// Unknown ids fall back to a humanized label instead of being dropped.
const _symNormKey = id => String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
const _symByNorm = {};
for (const _sym of USERB_SYMPTOMS) _symByNorm[_symNormKey(_sym.id)] = _sym;
function resolveSymptom(rawId) {
  const match = _symByNorm[_symNormKey(rawId)];
  return match ? { id: match.id, label: match.label }
               : { id: rawId, label: humanizeSymptomId(rawId) };
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function parseKg(str) {
  const m = String(str ?? '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function parseRepsNum(str) {
  if (!str) return null;
  if (typeof str === 'number') return str;
  const m = String(str).match(/^(\d+)(?:-(\d+))?/);
  if (!m) return null;
  const lo = parseInt(m[1]), hi = m[2] ? parseInt(m[2]) : lo;
  return Math.round((lo + hi) / 2);
}

// ---- Calendar -----------------------------------------------

export function buildMonthCalendar(year, month, sessions, missedDays) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDayOfMonth(year, month);
  const data        = {};

  for (const s of sessions) {
    const d = new Date(s.date + 'T12:00:00');
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    if (!data[day]) data[day] = { activities:[], meditation:false };
    if (s.users.includes('userA') && s.userARoutineType) {
      const t = userAType(s.userARoutineType);
      if (!data[day].activities.includes(t)) data[day].activities.push(t);
    }
    if (s.users.includes('userB') && s.userBRoutineId) {
      const t = userBType(s.userBAdaptationLevel);
      if (!data[day].activities.includes(t)) data[day].activities.push(t);
    }
    if (s.meditation?.completed) data[day].meditation = true;
  }
  for (const m of missedDays) {
    const d = new Date(m.date + 'T12:00:00');
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const day = d.getDate();
    if (!data[day]) data[day] = { activities:[], meditation:false };
    if (!data[day].activities.includes(m.category)) data[day].activities.push(m.category);
  }
  return { daysInMonth, firstDay, data };
}

function userAType(rtype) {
  return ({ heavy_weight:'eli_heavy', circuit:'eli_circuit', cardio_circuit:'eli_cardio',
            mobility_recovery:'eli_mobility', combo_weight_circuit:'eli_combo' })[rtype] ?? 'other';
}
function userBType(level) {
  return ({ normal:'christina_normal', reduced:'christina_reduced', recovery:'christina_recovery' })[level] ?? 'christina_normal';
}

export function renderCalendarHTML(year, month, calData) {
  const { daysInMonth, firstDay, data } = calData;
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });
  const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayStr = today();
  const todayDate = new Date(todayStr + 'T12:00:00');
  const todayDay = (todayDate.getFullYear() === year && todayDate.getMonth() === month) ? todayDate.getDate() : -1;

  let html = `<div class="calendar">
    <div class="calendar__header">
      <button class="btn-icon" id="cal-prev" aria-label="Previous month">&#8249;</button>
      <h3 class="calendar__month">${monthName}</h3>
      <button class="btn-icon" id="cal-next" aria-label="Next month">&#8250;</button>
    </div>
    <div class="calendar__grid">
      ${DAY_LABELS.map(d => `<div class="calendar__day-label">${d}</div>`).join('')}`;

  for (let i = 0; i < firstDay; i++) html += `<div class="calendar__cell calendar__cell--empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dayData = data[day];
    const isToday = day === todayDay;
    let dots = '';
    if (dayData) {
      dots = dayData.activities.slice(0, 3).map(act => {
        const color = ACTIVITY_COLORS[act] ?? 'var(--activity-other)';
        return `<span class="calendar__dot" style="background:${color}"></span>`;
      }).join('');
      if (dayData.meditation) dots += `<span class="calendar__dot" style="background:${ACTIVITY_COLORS.meditation}"></span>`;
    }
    html += `<div class="calendar__cell ${isToday?'calendar__cell--today':''} ${dayData?'calendar__cell--active':''}">
      <span class="calendar__day-num">${day}</span>
      <div class="calendar__dots">${dots}</div>
    </div>`;
  }
  html += `</div></div>`;
  return html;
}

// ---- Eli stats ----------------------------------------------

export function getEliStats(sessions) {
  const userA = sessions.filter(s => s.users.includes('userA'));
  const fatigue = userA.map(s => s.userAEndCheckin?.formFatigue).filter(f => f != null && f > 0);
  return {
    total:    userA.length,
    heavy:    userA.filter(s => s.userARoutineType === 'heavy_weight').length,
    circuit:  userA.filter(s => s.userARoutineType === 'circuit').length,
    mobility: userA.filter(s => s.userARoutineType === 'mobility_recovery').length,
    cardio:   userA.filter(s => s.userARoutineType === 'cardio_circuit').length,
    combo:    userA.filter(s => s.userARoutineType === 'combo_weight_circuit').length,
    avgFatigue: fatigue.length ? (fatigue.reduce((a,b) => a+b, 0) / fatigue.length).toFixed(1) : null,
    jointPainCount: userA.filter(s => s.userAEndCheckin?.jointPain && s.userAEndCheckin.jointPain !== 'no').length
  };
}

// ---- Strength Progress Index --------------------------------

export function getEliStrengthData(sessions, cycleState) {
  const cycleStart = cycleState?.startDate ?? '0000-00-00';
  const heavySessions = sessions
    .filter(s => s.users.includes('userA') && s.userARoutineType === 'heavy_weight' && s.date >= cycleStart)
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!heavySessions.length) return [];

  // Severity ranking so we can keep the worst joint state seen for an exercise.
  const JOINT_RANK = { no: 0, mild: 1, moderate: 2, sharp_concerning: 3 };

  const exMap = {};
  for (const s of heavySessions) {
    const fatigue   = s.userAEndCheckin?.formFatigue ?? null;
    const jointRaw  = s.userAEndCheckin?.jointPain ?? 'no';
    const hasJoint  = jointRaw && jointRaw !== 'no';
    const jointLocs = s.userAEndCheckin?.jointLocations ?? [];
    const isClean   = fatigue == null || fatigue <= 3;

    for (const log of (s.exerciseLogs?.userA ?? [])) {
      if (log.skipped) continue;
      if (!exMap[log.exerciseId]) {
        exMap[log.exerciseId] = {
          exerciseId: log.exerciseId,
          exerciseName: log.exerciseName,
          firstDate:   s.date,
          firstBest:   0,
          currentBest: 0,
          cleanBest:   0,
          hasFormFlag: false,
          jointSeverity: 'no',      // worst severity seen across this cycle
          jointLocations: new Set(), // specific locations, e.g. Shoulder / Knee
          hasLaterData: false,      // logged on a date after firstDate?
          setCount:    0
        };
      }
      const entry = exMap[log.exerciseId];
      if (s.date > entry.firstDate) entry.hasLaterData = true;
      if (fatigue != null && fatigue > 3) entry.hasFormFlag = true;
      if (hasJoint) {
        if (JOINT_RANK[jointRaw] > JOINT_RANK[entry.jointSeverity]) entry.jointSeverity = jointRaw;
        for (const loc of jointLocs) entry.jointLocations.add(loc);
      }

      for (const setLog of (log.setLogs ?? [])) {
        const kg   = parseKg(setLog.weightUsed);
        const reps = parseRepsNum(setLog.reps);
        if (!kg || !reps) continue;
        const score = kg * reps;
        entry.setCount++;
        if (s.date === entry.firstDate) entry.firstBest = Math.max(entry.firstBest, score);
        entry.currentBest = Math.max(entry.currentBest, score);
        if (isClean) entry.cleanBest = Math.max(entry.cleanBest, score);
      }
    }
  }

  return Object.values(exMap)
    .filter(e => e.setCount > 0)
    .map(e => {
      const displayBest = e.cleanBest || e.currentBest;
      const progress = e.firstBest > 0
        ? Math.round((displayBest - e.firstBest) / e.firstBest * 100)
        : null;
      return {
        ...e,
        displayBest,
        flaggedBest: e.currentBest > e.cleanBest ? e.currentBest : null,
        jointLocations: [...e.jointLocations],
        progress
      };
    })
    // Chart is about progress, not absolute strength: sort by improvement.
    // Nulls (single-data-point exercises) sink to the bottom.
    .sort((a, b) => (b.progress ?? -Infinity) - (a.progress ?? -Infinity));
}

// ---- Muscle Group Stimulus Map ------------------------------

const MUSCLE_MAP = {
  eli_incline_dumbbell_bench_press: { p:['chest','shoulders'], s:['triceps'] },
  eli_flat_dumbbell_bench_press:    { p:['chest'], s:['shoulders','triceps'] },
  eli_floor_press:                  { p:['chest'], s:['shoulders','triceps'] },
  eli_incline_pushup:               { p:['chest','shoulders'], s:['triceps','core'] },
  eli_tempo_incline_pushup:         { p:['chest','shoulders'], s:['triceps'] },
  eli_close_grip_incline_pushup:    { p:['triceps','chest'], s:['shoulders'] },
  eli_seated_dumbbell_shoulder_press:   { p:['shoulders'], s:['triceps'] },
  eli_standing_dumbbell_shoulder_press: { p:['shoulders'], s:['triceps'] },
  eli_standing_arnold_press:        { p:['shoulders'], s:['triceps'] },
  eli_lateral_raise_3kg:            { p:['shoulders'], s:[] },
  eli_front_raise_3kg:              { p:['shoulders'], s:[] },
  eli_rear_delt_raise_3kg:          { p:['shoulders'], s:['back'] },
  eli_reverse_fly:                  { p:['shoulders','back'], s:[] },
  eli_prone_y_raise:                { p:['back','shoulders'], s:[] },
  eli_overhead_tricep_extension:    { p:['triceps'], s:[] },
  eli_single_dumbbell_tricep_extension: { p:['triceps'], s:[] },
  eli_bench_tricep_extension:       { p:['triceps'], s:[] },
  eli_one_arm_dumbbell_row:         { p:['back','biceps'], s:['core'] },
  eli_two_dumbbell_bent_row:        { p:['back'], s:['biceps'] },
  eli_bench_supported_dumbbell_row: { p:['back'], s:['biceps'] },
  eli_single_dumbbell_row:          { p:['back','biceps'], s:[] },
  eli_renegade_row:                 { p:['back','core'], s:['biceps','chest'] },
  eli_hammer_curl:                  { p:['biceps'], s:['core'] },
  eli_standard_dumbbell_curl:       { p:['biceps'], s:[] },
  eli_slow_eccentric_curl:          { p:['biceps'], s:[] },
  eli_goblet_squat:                 { p:['quads','glutes'], s:['hamstrings','core'] },
  bodyweight_squat:                 { p:['quads'], s:['glutes'] },
  eli_bodyweight_tempo_squat:       { p:['quads','glutes'], s:['hamstrings'] },
  eli_split_squat:                  { p:['quads','glutes'], s:['hamstrings'] },
  eli_reverse_lunge:                { p:['quads','glutes'], s:['hamstrings'] },
  eli_step_up:                      { p:['quads','glutes'], s:['hamstrings'] },
  eli_wall_sit:                     { p:['quads'], s:['glutes'] },
  eli_dumbbell_rdl:                 { p:['hamstrings','glutes'], s:['back'] },
  eli_kettlebell_style_deadlift:    { p:['hamstrings','glutes','back'], s:['quads'] },
  eli_single_dumbbell_rdl:          { p:['hamstrings','glutes'], s:['back'] },
  eli_bench_glute_bridge:           { p:['glutes'], s:['hamstrings'] },
  eli_floor_glute_bridge:           { p:['glutes'], s:['hamstrings'] },
  eli_weighted_glute_bridge:        { p:['glutes'], s:['hamstrings'] },
  eli_calf_raises:                  { p:['calves'], s:[] },
  eli_weighted_calf_raises:         { p:['calves'], s:[] },
  eli_side_plank:                   { p:['core'], s:[] },
  eli_plank:                        { p:['core'], s:[] },
  eli_incline_situp:                { p:['core'], s:[] },
  eli_bench_reverse_crunch:         { p:['core'], s:[] },
  eli_farmer_carry:                 { p:['core','back'], s:['shoulders','quads'] },
  step_jacks:                       { p:['quads','calves'], s:['core'] },
  eli_speed_rope_intervals:         { p:['calves'], s:['core','shoulders'] },
};

export function getEliMuscleStimulus(sessions, cycleState) {
  const cycleStart = cycleState?.startDate ?? '0000-00-00';
  const cycleSessions = sessions.filter(s => s.users.includes('userA') && s.date >= cycleStart);

  const counts = { chest:0, shoulders:0, triceps:0, back:0, biceps:0,
                   quads:0, glutes:0, hamstrings:0, core:0, calves:0 };

  for (const s of cycleSessions) {
    for (const log of (s.exerciseLogs?.userA ?? [])) {
      if (log.skipped) continue;
      const setCount = log.setLogs?.length ?? 0;
      if (!setCount) continue;
      const m = MUSCLE_MAP[log.exerciseId];
      if (!m) continue;
      for (const muscle of m.p) { if (counts[muscle] !== undefined) counts[muscle] += setCount; }
      for (const muscle of m.s) { if (counts[muscle] !== undefined) counts[muscle] += setCount * 0.5; }
    }
  }
  for (const k of Object.keys(counts)) counts[k] = Math.round(counts[k]);
  return counts;
}

// ---- Christina stats ----------------------------------------

export function getChristinaStats(sessions) {
  const c = sessions.filter(s => s.users.includes('userB'));

  // Build counts only from symptoms that were actually logged (any truthy /
  // positive value — handles both boolean flags and numeric severities), so we
  // never render empty bars for symptoms that never occurred. Ids are resolved
  // to the canonical config symptom so snake_case data and camelCase check-ins
  // collapse into one entry.
  const symptomFreq = {};
  const SYMPTOM_LABELS = {};
  for (const s of c) {
    for (const [rawId, val] of Object.entries(s.userBCheckin?.symptoms ?? {})) {
      const active = typeof val === 'boolean' ? val : Number(val) > 0;
      if (!active) continue;
      const { id, label } = resolveSymptom(rawId);
      if (!(id in symptomFreq)) {
        symptomFreq[id] = 0;
        SYMPTOM_LABELS[id] = label;
      }
      symptomFreq[id]++;
    }
  }
  return {
    total:    c.length,
    normal:   c.filter(s => s.userBAdaptationLevel === 'normal').length,
    reduced:  c.filter(s => s.userBAdaptationLevel === 'reduced').length,
    recovery: c.filter(s => s.userBAdaptationLevel === 'recovery').length,
    painDays: {
      low:    c.filter(s => s.userBCheckin?.painDay === 'low').length,
      medium: c.filter(s => s.userBCheckin?.painDay === 'medium').length,
      high:   c.filter(s => s.userBCheckin?.painDay === 'high').length
    },
    symptomFreq,
    symptomLabels: SYMPTOM_LABELS
  };
}

// Conservative per-profile signals from recent completed workouts. These are
// recommendations only and never mutate weights, reps, or saved progression.
export function getProfileProgressionSignals(sessions, userId, profile) {
  if (profile?.adaptationPreference === 'daily_capacity') return [];
  const recent = sessions.filter(s => s.status === 'completed' && s.users?.includes(userId)).slice(-6);
  const byExercise = new Map();
  for (const session of recent) {
    const checkin = session.profileCheckins?.[userId]
      ?? (userId === 'userA' ? session.userAEndCheckin : null) ?? {};
    const effort = checkin.effort ?? checkin.formFatigue ?? null;
    const pain = checkin.jointPain ?? 'no';
    if ((effort != null && effort > 3) || !['no', 'mild'].includes(pain)) continue;
    for (const log of session.exerciseLogs?.[userId] ?? []) {
      if (log.skipped || !(log.setLogs?.length)) continue;
      const weightedSets = log.setLogs.filter(set => typeof set.weightUsed === 'string' && /kg/i.test(set.weightUsed));
      if (!weightedSets.length) continue;
      const row = byExercise.get(log.exerciseId) ?? { exerciseId: log.exerciseId, name: log.exerciseName, sessions: 0 };
      row.sessions++;
      byExercise.set(log.exerciseId, row);
    }
  }
  const required = profile?.experienceLevel === 'experienced' ? 2 : 3;
  return [...byExercise.values()].filter(row => row.sessions >= required).map(row => ({
    ...row,
    recommendation: profile?.experienceLevel === 'new'
      ? 'Keep the load and consider one more clean rep.'
      : 'Consider a small rep or weight increase if form remains comfortable.',
    reason: `${row.sessions} recent manageable sessions without concerning joint pain.`
  }));
}

// Slot-neutral overview: either profile can pursue strength, use adaptations,
// or do both. Older sessions remain readable through the legacy fallbacks.
export function getProfileOverview(sessions, userId) {
  const completed = sessions.filter(s => s.status === 'completed' && s.users?.includes(userId));
  const checkinFor = session => session.profileCheckins?.[userId]
    ?? (userId === 'userA' ? session.userAEndCheckin : session.userBCheckin) ?? {};
  const capacityFor = session => checkinFor(session).capacity ?? checkinFor(session);
  const effortValues = completed.map(s => checkinFor(s).effort ?? checkinFor(s).formFatigue)
    .filter(value => Number.isFinite(Number(value)) && Number(value) > 0).map(Number);
  const adapted = completed.filter(session => {
    const checkin = checkinFor(session);
    if (checkin.adjustmentUsed != null) return checkin.adjustmentUsed;
    if (checkin.adjustmentChanged != null) return checkin.adjustmentChanged;
    if (userId === 'userB') return ['reduced', 'recovery'].includes(session.userBAdaptationLevel);
    return false;
  }).length;
  const weighted = completed.filter(session => (session.exerciseLogs?.[userId] ?? []).some(log =>
    (log.setLogs ?? []).some(set => typeof set.weightUsed === 'string' && /kg/i.test(set.weightUsed))
  )).length;
  const discomfort = completed.filter(session => {
    const value = checkinFor(session).jointPain;
    return value && value !== 'no';
  }).length;
  const capacity = { low: 0, medium: 0, high: 0 };
  completed.forEach(session => {
    const pain = capacityFor(session).painDay;
    if (pain in capacity) capacity[pain]++;
  });
  return {
    total: completed.length,
    adapted,
    weighted,
    discomfort,
    avgEffort: effortValues.length
      ? (effortValues.reduce((sum, value) => sum + value, 0) / effortValues.length).toFixed(1)
      : null,
    capacity
  };
}

// ---- Recovery-Adjusted Growth Readiness --------------------

function scoreToStatus(value, greenThreshold, yellowThreshold, higherIsBetter = true) {
  if (higherIsBetter) {
    return value >= greenThreshold ? 'green' : value >= yellowThreshold ? 'yellow' : 'red';
  }
  return value <= greenThreshold ? 'green' : value <= yellowThreshold ? 'yellow' : 'red';
}

export function getEliReadiness(sessions, cycleState) {
  const cycleStart = cycleState?.startDate ?? '0000-00-00';
  const cycleEli   = sessions.filter(s => s.users.includes('userA') && s.date >= cycleStart);
  const heavy      = cycleEli.filter(s => s.userARoutineType === 'heavy_weight');
  const nonHeavy   = cycleEli.filter(s => s.userARoutineType !== 'heavy_weight');

  const fatigueVals = cycleEli.map(s => s.userAEndCheckin?.formFatigue).filter(f => f != null && f > 0);
  const avgFatigue  = fatigueVals.length ? fatigueVals.reduce((a,b) => a+b, 0) / fatigueVals.length : null;

  const painSessions = cycleEli.filter(s => s.userAEndCheckin?.jointPain && s.userAEndCheckin.jointPain !== 'no').length;
  const sharpPain    = cycleEli.some(s => s.userAEndCheckin?.jointPain === 'sharp_concerning');

  const factors = [
    {
      label:  'Heavy sessions',
      value:  `${heavy.length} this cycle`,
      status: heavy.length >= 4 ? 'green' : heavy.length >= 2 ? 'yellow' : 'red',
      detail: 'Target: ≥4 per 28-day cycle'
    },
    {
      label:  'Avg form fatigue',
      value:  avgFatigue != null ? `${avgFatigue.toFixed(1)} / 5` : 'No data yet',
      status: avgFatigue == null ? 'green' : avgFatigue <= 3 ? 'green' : avgFatigue <= 3.5 ? 'yellow' : 'red',
      detail: '≤3 is clean; >3.5 means load may be too high'
    },
    {
      label:  'Joint pain events',
      value:  sharpPain ? `${painSessions} sessions (includes sharp)` : `${painSessions} sessions`,
      status: sharpPain ? 'red' : painSessions === 0 ? 'green' : painSessions <= 2 ? 'yellow' : 'red',
      detail: 'Sharp/concerning pain = automatic Red'
    },
    {
      label:  'Training variety',
      value:  `${nonHeavy.length} circuit/mobility/cardio sessions`,
      status: nonHeavy.length >= 2 ? 'green' : nonHeavy.length >= 1 ? 'yellow' : 'red',
      detail: 'Non-heavy sessions support recovery'
    }
  ];

  const reds    = factors.filter(f => f.status === 'red').length;
  const yellows = factors.filter(f => f.status === 'yellow').length;
  const overall = reds > 0 ? 'red' : yellows >= 2 ? 'yellow' : 'green';

  return {
    factors, overall, total: cycleEli.length,
    recommendation: {
      green:  'Ready to progress. Consider increasing anchor weights at next 28-day review.',
      yellow: 'Maintain current load. Monitor flagged areas before adding volume or weight.',
      red:    'Consider a deload week or reduced intensity before progressing.'
    }[overall]
  };
}

export function getChristinaReadiness(sessions, cycleState) {
  const cycleStart = cycleState?.startDate ?? '0000-00-00';
  const cycleC     = sessions.filter(s => s.users.includes('userB') && s.date >= cycleStart);
  if (!cycleC.length) return { factors:[], overall:'green', total:0, recommendation:'No sessions logged yet.' };

  const highPain    = cycleC.filter(s => s.userBCheckin?.painDay === 'high').length;
  const highPainPct = Math.round(highPain / cycleC.length * 100);

  const withSymptoms = cycleC.filter(s => Object.values(s.userBCheckin?.symptoms ?? {}).some(v => v >= 4)).length;
  const symptomPct   = Math.round(withSymptoms / cycleC.length * 100);

  let totalEx = 0, skippedEx = 0;
  for (const s of cycleC) {
    for (const log of (s.exerciseLogs?.userB ?? [])) {
      totalEx++;
      if (log.skipped) skippedEx++;
    }
  }
  const completionPct = totalEx > 0 ? Math.round((1 - skippedEx / totalEx) * 100) : 100;

  const factors = [
    {
      label:  'Sessions this cycle',
      value:  `${cycleC.length}`,
      status: cycleC.length >= 8 ? 'green' : cycleC.length >= 4 ? 'yellow' : 'red',
      detail: 'Target: ≥8 sessions per cycle'
    },
    {
      label:  'High pain days',
      value:  `${highPain} sessions (${highPainPct}%)`,
      status: highPainPct <= 20 ? 'green' : highPainPct <= 40 ? 'yellow' : 'red',
      detail: '≤20% high-pain days = good'
    },
    {
      label:  'Active symptom sessions',
      value:  `${withSymptoms} sessions (${symptomPct}%)`,
      status: symptomPct <= 30 ? 'green' : symptomPct <= 60 ? 'yellow' : 'red',
      detail: '≤30% = manageable'
    },
    {
      label:  'Exercise completion',
      value:  `${completionPct}%`,
      status: completionPct >= 90 ? 'green' : completionPct >= 70 ? 'yellow' : 'red',
      detail: '≥90% completion = good'
    }
  ];

  const reds    = factors.filter(f => f.status === 'red').length;
  const yellows = factors.filter(f => f.status === 'yellow').length;
  const overall = reds > 0 ? 'red' : yellows >= 2 ? 'yellow' : 'green';

  return {
    factors, overall, total: cycleC.length,
    recommendation: {
      green:  'The app-defined thresholds show fewer current flags. Consider progressing only if it feels right.',
      yellow: 'Continue current routine. Flagged areas suggest monitoring before adjusting.',
      red:    'High symptom load this cycle. Prioritise recovery and gentle movement first.'
    }[overall]
  };
}

// ---- Render functions ----------------------------------------

// Full bar ≈ this much improvement. Fixed scale keeps each bar independently
// readable as "how much I improved" rather than a comparison between exercises.
const PROGRESS_FULL_PCT = 25;

const JOINT_LABELS = { mild: 'Mild', moderate: 'Moderate', sharp_concerning: 'Sharp' };

export function renderStrengthProgressChart(containerId, strengthData) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!strengthData.length) {
    el.innerHTML = '<p class="empty-state">No weighted heavy sessions yet. Progress appears after your first logged sets.</p>';
    return;
  }

  const rows = strengthData.map(ex => {
    const p = ex.progress; // % change, or null for single-data-point exercises

    // Visual state: neutral (maintained / no baseline), positive (improved),
    // caution (declined). +0% must read neutral, never like a full bar.
    let state, badge, barColor, fillPct;
    if (p == null || (p === 0 && !ex.hasLaterData)) {
      // No comparison possible yet — first time logging this lift.
      state = 'neutral';
      badge = '<span style="color:var(--text-2);">Baseline set</span>';
      barColor = 'var(--text-2)';
      fillPct = 0;
    } else if (p > 0) {
      state = 'positive';
      badge = `<span style="color:var(--status-positive);font-weight:600;">+${p}%</span>`;
      barColor = 'var(--status-positive)';
      fillPct = Math.min(p / PROGRESS_FULL_PCT * 100, 100);
    } else if (p === 0) {
      state = 'neutral';
      badge = '<span style="color:var(--text-2);">Maintained</span>';
      barColor = 'var(--text-2)';
      fillPct = 0;
    } else {
      state = 'caution';
      badge = `<span style="color:var(--status-critical);font-weight:600;">${p}%</span>`;
      barColor = 'var(--status-critical)';
      fillPct = Math.min(Math.abs(p) / PROGRESS_FULL_PCT * 100, 100);
    }

    // A small sliver keeps maintained/neutral bars visible without implying completion.
    const drawnFill = state === 'neutral' ? 4 : Math.max(fillPct, 6);

    // Joint tag: specific + quiet metadata. Escalates to caution only for sharp pain.
    let jointTag = '';
    if (ex.jointSeverity && ex.jointSeverity !== 'no') {
      const locs = (ex.jointLocations && ex.jointLocations.length)
        ? ex.jointLocations.join(' / ')
        : (JOINT_LABELS[ex.jointSeverity] || 'Joint');
      const sharp = ex.jointSeverity === 'sharp_concerning';
      const tagColor = sharp ? 'var(--status-critical)' : 'var(--text-2)';
      const tagBg    = sharp ? 'rgba(248,113,113,0.12)' : 'var(--fill-faint)';
      jointTag = `<span title="Joint sensitivity logged this cycle (${JOINT_LABELS[ex.jointSeverity] || ex.jointSeverity})"
        style="font-size:0.6rem;color:${tagColor};background:${tagBg};padding:1px 6px;border-radius:8px;">${esc(locs)}</span>`;
    }
    const fatigueTag = ex.hasFormFlag
      ? `<span title="Form fatigue logged on a set; best score uses your clean set only"
          style="font-size:0.6rem;color:var(--text-2);background:var(--fill-faint);padding:1px 6px;border-radius:8px;">form watch</span>`
      : '';
    const tags = [jointTag, fatigueTag].filter(Boolean).join(' ');

    const hasComparison = ex.progress != null && ex.hasLaterData;
    const startBest = hasComparison
      ? `Start ${ex.firstBest} → Best ${ex.displayBest} pts (best clean set)`
      : `Best ${ex.displayBest} pts (best clean set)`;

    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;gap:8px;">
          <span style="font-size:0.78rem;font-weight:600;color:var(--text);">${esc(ex.exerciseName)}</span>
          <span style="font-size:0.72rem;white-space:nowrap;">${badge}</span>
        </div>
        <div style="position:relative;height:14px;background:var(--fill-faint);border-radius:4px;overflow:hidden;">
          <div style="position:absolute;inset:0;width:${drawnFill}%;background:${barColor};opacity:${state === 'neutral' ? 0.35 : 0.8};border-radius:4px;transition:width .2s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.63rem;color:var(--text-2);margin-top:3px;gap:8px;">
          <span>${startBest}</span>
          <span style="display:flex;gap:4px;">${tags}</span>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:0.63rem;color:var(--text-2);margin-bottom:10px;line-height:1.5;">
      Bar shows improvement from cycle start to your current best clean set (score = weight × reps).
      A full bar ≈ +${PROGRESS_FULL_PCT}%. Maintained lifts stay neutral. This chart tracks your own
      progress per exercise — it does not rank exercises against each other.
    </div>
    ${rows}`;
}

export function renderMuscleMapChart(containerId, muscleData) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const total = Object.values(muscleData).reduce((a,b) => a+b, 0);
  if (!total) {
    el.innerHTML = '<p class="empty-state">No weighted sets logged yet. Stimulus map fills in after heavy sessions.</p>';
    return;
  }

  const GROUPS = [
    {id:'chest',      label:'Chest'},  {id:'shoulders', label:'Shoulders'},
    {id:'triceps',    label:'Triceps'},{id:'back',      label:'Back'},
    {id:'biceps',     label:'Biceps'}, {id:'quads',     label:'Quads'},
    {id:'glutes',     label:'Glutes'}, {id:'hamstrings',label:'Hams'},
    {id:'core',       label:'Core'},   {id:'calves',    label:'Calves'}
  ];

  function level(sets) { return sets >= 16 ? 'high' : sets >= 10 ? 'strong' : sets >= 4 ? 'moderate' : 'low'; }
  const STYLE = {
    low:      {bg:'var(--fill-faint)', txt:'var(--muted-soft)', lbl:'Low'},
    moderate: {bg:'color-mix(in srgb, var(--status-info) 15%, transparent)', txt:'var(--status-info)', lbl:'Moderate'},
    strong: {bg:'color-mix(in srgb, var(--status-positive) 20%, transparent)', txt:'var(--status-positive-strong)', lbl:'Strong'},
    high: {bg:'color-mix(in srgb, var(--status-warm) 20%, transparent)', txt:'var(--status-warm)', lbl:'High'}
  };

  const cells = GROUPS.map(g => {
    const sets = muscleData[g.id] ?? 0;
    const st   = STYLE[level(sets)];
    return `<div style="background:${st.bg};border-radius:8px;padding:8px 4px;text-align:center;
                         display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:68px;">
      <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${st.txt};">${g.label}</div>
      <div style="font-size:1rem;font-weight:800;color:${st.txt};margin:3px 0;">${sets}</div>
      <div style="font-size:0.58rem;color:${st.txt};opacity:0.8;">${st.lbl}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px;">${cells}</div>
    <div style="font-size:0.63rem;color:var(--text-2);line-height:1.5;">
      Estimated hard sets this cycle (direct + 0.5× secondary).
      Low 0–3 · Moderate 4–9 · Strong 10–15 · High 16+.
      <em>Stimulus map shows training emphasis, not muscle gain.</em>
    </div>`;
}

export function renderReadinessCard(containerId, data, user) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!data || !data.total) {
    el.innerHTML = '<p class="empty-state">Readiness score appears after a few sessions are logged this cycle.</p>';
    return;
  }

  const STATUS = {
    green: {bg:'color-mix(in srgb, var(--status-positive) 10%, transparent)', border:'color-mix(in srgb, var(--status-positive) 30%, transparent)', txt:'var(--status-positive)', lbl:'Fewer Flags', icon:'✓'},
    yellow: {bg:'color-mix(in srgb, var(--status-caution) 10%, transparent)', border:'color-mix(in srgb, var(--status-caution) 30%, transparent)', txt:'var(--status-caution)', lbl:'Maintain & Monitor', icon:'~'},
    red: {bg:'color-mix(in srgb, var(--status-critical) 10%, transparent)', border:'color-mix(in srgb, var(--status-critical) 30%, transparent)', txt:'var(--status-critical)', lbl:'More Flags', icon:'↓'}
  };
  const DOT = {green:'var(--status-positive)', yellow:'var(--status-caution)', red:'var(--status-critical)'};
  const s = STATUS[data.overall];

  const rows = data.factors.map(f => `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line-faint);">
      <div style="width:9px;height:9px;border-radius:50%;background:${DOT[f.status]};margin-top:4px;flex-shrink:0;"></div>
      <div>
        <div style="font-size:0.78rem;color:var(--text);font-weight:600;">${f.label}
          <span style="font-weight:400;color:var(--text-2);"> — ${f.value}</span>
        </div>
        <div style="font-size:0.65rem;color:var(--text-2);margin-top:1px;">${f.detail}</div>
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div style="border:1px solid ${s.border};border-radius:14px;background:${s.bg};padding:16px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:46px;height:46px;border-radius:50%;border:2px solid ${s.txt};
                    display:flex;align-items:center;justify-content:center;
                    font-size:1.25rem;font-weight:800;color:${s.txt};flex-shrink:0;">${s.icon}</div>
        <div>
          <div style="font-size:1rem;font-weight:700;color:${s.txt};">${s.lbl}</div>
          <div style="font-size:0.7rem;color:var(--text-2);margin-top:2px;">${data.total} session${data.total !== 1 ? 's' : ''} this cycle</div>
        </div>
      </div>
      ${rows}
      <div style="margin-top:10px;font-size:0.65rem;color:var(--text-2);line-height:1.45;">
        Advisory only: this combines the app-defined thresholds shown above; it is not a clinical readiness score.
      </div>
      <div style="margin-top:12px;font-size:0.73rem;color:var(--text-2);font-style:italic;line-height:1.5;">
        ${data.recommendation}
      </div>
    </div>`;
}

export function renderChristinaPainDaysChart(canvasId, painDays) {
  if (!window.Chart) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();
  const total = painDays.low + painDays.medium + painDays.high;
  if (!total) { canvas.parentElement.innerHTML = '<p class="empty-state">No check-in data yet.</p>'; return; }
  const t = chartTheme();
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Low Pain','Medium Pain','High Pain'],
      datasets: [{ data:[painDays.low,painDays.medium,painDays.high],
                   backgroundColor:t.series, borderRadius:6, borderSkipped:false }]
    },
    options: {
      responsive:true,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>`${ctx.raw} session${ctx.raw!==1?'s':''}`}} },
      scales:{ y:{beginAtZero:true,grid:{color:t.grid},ticks:{color:t.tick,stepSize:1}},
               x:{grid:{display:false},ticks:{color:t.tick}} }
    }
  });
}

export function renderChristinaSymptomChart(canvasId, symptomFreq, symptomLabels) {
  if (!window.Chart) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const existing = Chart.getChart(canvasId);
  if (existing) existing.destroy();
  const total = Object.values(symptomFreq).reduce((a,b) => a+b, 0);
  if (!total) { canvas.parentElement.innerHTML = '<p class="empty-state">No symptoms logged yet.</p>'; return; }
  const entries = Object.entries(symptomFreq)
    .map(([id,count]) => ({ label:symptomLabels[id]??id, count }))
    .sort((a,b) => b.count - a.count);
  const t = chartTheme();
  new Chart(canvas, {
    type:'bar',
    data:{ labels:entries.map(e=>e.label), datasets:[{data:entries.map(e=>e.count), backgroundColor:t.solid, borderRadius:4, borderSkipped:false}] },
    options:{
      indexAxis:'y', responsive:true,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>`${ctx.raw} session${ctx.raw!==1?'s':''}`}} },
      scales:{ x:{beginAtZero:true,grid:{color:t.grid},ticks:{color:t.tick,stepSize:1}},
               y:{grid:{display:false},ticks:{color:t.tick}} }
    }
  });
}

// ---- Christina Movement Exposure Map ------------------------

const USERB_MOVEMENT_GROUPS = [
  { id: 'shoulders',  label: 'Shoulders' },
  { id: 'upper_back', label: 'Upper Back' },
  { id: 'arms',       label: 'Arms' },
  { id: 'core',       label: 'Core' },
  { id: 'hips',       label: 'Hips' },
  { id: 'glutes',     label: 'Glutes' },
  { id: 'quads',      label: 'Quads' },
  { id: 'hamstrings', label: 'Hams' },
  { id: 'calves',     label: 'Calves' },
  { id: 'mobility',   label: 'Mobility' }
];

function emptyChristinaMovementCounts() {
  return USERB_MOVEMENT_GROUPS.reduce((acc, g) => {
    acc[g.id] = 0;
    return acc;
  }, {});
}

function mapChristinaExerciseToMovement(log) {
  const text = `${log.exerciseId ?? ''} ${log.exerciseName ?? ''}`.toLowerCase();
  const primary = [];
  const secondary = [];

  if (/shoulder|press|raise|wall angel|arm circle|overhead/.test(text)) primary.push('shoulders');
  if (/row|pull|posture|scap|band pull|reverse fly|upper back/.test(text)) primary.push('upper_back');
  if (/curl|tricep|bicep|arm/.test(text)) primary.push('arms');

  if (/core|dead bug|plank|bird dog|march|carry|brace|crunch/.test(text)) primary.push('core');

  if (/hip|clam|abduction|mobility|stretch/.test(text)) primary.push('hips');
  if (/glute|bridge|hinge/.test(text)) primary.push('glutes');

  if (/squat|sit to stand|step|lunge|quad/.test(text)) primary.push('quads');
  if (/hamstring|hinge|rdl|deadlift/.test(text)) primary.push('hamstrings');
  if (/calf|heel raise|toe raise/.test(text)) primary.push('calves');

  if (/mobility|stretch|gentle|range|breath|recovery/.test(text)) primary.push('mobility');

  if (/squat|lunge|step/.test(text)) {
    secondary.push('glutes', 'core');
  }
  if (/bridge|hinge/.test(text)) {
    secondary.push('hamstrings', 'core');
  }
  if (/row|pull/.test(text)) {
    secondary.push('arms', 'shoulders');
  }
  if (/press|raise/.test(text)) {
    secondary.push('arms', 'upper_back');
  }

  if (!primary.length) primary.push('mobility');

  return {
    p: [...new Set(primary)],
    s: [...new Set(secondary.filter(x => !primary.includes(x)))]
  };
}

export function getChristinaMovementExposure(sessions, cycleState) {
  const cycleStart = cycleState?.startDate ?? '0000-00-00';
  const cycleSessions = sessions.filter(s =>
    s.users.includes('userB') && s.date >= cycleStart
  );

  const counts = emptyChristinaMovementCounts();

  for (const s of cycleSessions) {
    for (const log of (s.exerciseLogs?.userB ?? [])) {
      if (log.skipped) continue;

      const setCount = log.setLogs?.length
        ? log.setLogs.length
        : 1;

      const movement = mapChristinaExerciseToMovement(log);

      for (const area of movement.p) {
        if (counts[area] !== undefined) counts[area] += setCount;
      }
      for (const area of movement.s) {
        if (counts[area] !== undefined) counts[area] += setCount * 0.5;
      }
    }
  }

  for (const k of Object.keys(counts)) counts[k] = Math.round(counts[k]);
  return counts;
}

export function renderChristinaMovementExposureMap(containerId, movementData) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const total = Object.values(movementData ?? {}).reduce((a, b) => a + b, 0);
  if (!total) {
    el.innerHTML = '<p class="empty-state">No Christina movement exposure logged yet. This map fills in after completed exercises.</p>';
    return;
  }

  function level(sets) {
    return sets >= 16 ? 'high'
      : sets >= 10 ? 'strong'
      : sets >= 4 ? 'moderate'
      : 'low';
  }

  const STYLE = {
    low:      { bg: 'var(--fill-faint)', txt: 'var(--muted-soft)', lbl: 'Low' },
    moderate: { bg: 'color-mix(in srgb, var(--profile-b-accent) 15%, transparent)', txt: 'var(--profile-b-accent-strong)', lbl: 'Moderate' },
    strong: { bg: 'color-mix(in srgb, var(--status-positive) 16%, transparent)', txt: 'var(--status-positive-strong)', lbl: 'Strong' },
    high: { bg: 'color-mix(in srgb, var(--status-warm) 18%, transparent)', txt: 'var(--status-warm)', lbl: 'High' }
  };

  const cells = USERB_MOVEMENT_GROUPS.map(g => {
    const count = movementData[g.id] ?? 0;
    const st = STYLE[level(count)];
    return `<div style="background:${st.bg};border-radius:8px;padding:8px 4px;text-align:center;
                         display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:68px;">
      <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${st.txt};">${g.label}</div>
      <div style="font-size:1rem;font-weight:800;color:${st.txt};margin:3px 0;">${count}</div>
      <div style="font-size:0.58rem;color:${st.txt};opacity:0.8;">${st.lbl}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px;">${cells}</div>
    <div style="font-size:0.63rem;color:var(--text-2);line-height:1.5;">
      Estimated movement exposure this cycle. Direct movement counts as 1×. Supporting movement counts as 0.5×.
      <em>For Christina, high exposure means repeated load. It is not automatically good or bad.</em>
    </div>`;
}

// ---- Christina Symptom Calendar -----------------------------

// Compact labels for the tight calendar cells, keyed by canonical symptom id.
const USERB_SYMPTOM_LABELS_SHORT = {
  dizziness:          'Dizzy',
  jointPain:          'Joint',
  muscleAche:         'Ache',
  fatigue:            'Fatigue',
  headache:           'Headache',
  brainFog:           'Fog',
  nausea:             'Nausea',
  sensitivityToLight: 'Light'
};

export function getChristinaSymptomCalendarData(year, month, sessions) {
  const data = {};

  for (const s of sessions) {
    if (!s.users.includes('userB')) continue;

    const d = new Date(s.date + 'T12:00:00');
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;

    const day = d.getDate();
    const symptoms = s.userBCheckin?.symptoms ?? {};
    const symptomEntries = Object.entries(symptoms)
      .filter(([, val]) => (typeof val === 'boolean' ? val : Number(val) > 0))
      .map(([rawId, val]) => {
        const { id, label } = resolveSymptom(rawId);
        return {
          id,
          label: USERB_SYMPTOM_LABELS_SHORT[id] ?? label,
          value: typeof val === 'boolean' ? (val ? 1 : 0) : Number(val)
        };
      });

    const symptomLoad = symptomEntries.reduce((sum, x) => sum + x.value, 0);
    const activeSymptomCount = symptomEntries.filter(x => x.value >= 4).length;

    data[day] = {
      date: s.date,
      painDay: s.userBCheckin?.painDay ?? null,
      adaptationLevel: s.userBAdaptationLevel ?? 'normal',
      symptoms: symptomEntries,
      symptomLoad,
      activeSymptomCount,
      routineId: s.userBRoutineId ?? null
    };
  }

  return data;
}

export function renderChristinaSymptomCalendarHTML(year, month, symptomData) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function heatLevel(dayData) {
    if (!dayData) return 'none';
    if (dayData.painDay === 'high') return 'high';
    if (dayData.symptomLoad >= 8 || dayData.activeSymptomCount >= 2) return 'high';
    if (dayData.painDay === 'medium' || dayData.symptomLoad >= 4) return 'medium';
    if (dayData.symptomLoad > 0 || dayData.painDay === 'low') return 'low';
    return 'none';
  }

  const STYLE = {
    none:   { bg: 'var(--fill-fainter)', border: 'var(--line-faint)', txt: 'var(--text-3)' },
    low: { bg: 'color-mix(in srgb, var(--profile-b-accent) 12%, transparent)', border: 'color-mix(in srgb, var(--profile-b-accent) 24%, transparent)', txt: 'var(--profile-b-accent-strong)' },
    medium: { bg: 'color-mix(in srgb, var(--status-caution) 13%, transparent)', border: 'color-mix(in srgb, var(--status-caution) 28%, transparent)', txt: 'var(--status-caution)' },
    high: { bg: 'color-mix(in srgb, var(--status-critical) 14%, transparent)', border: 'color-mix(in srgb, var(--status-critical) 30%, transparent)', txt: 'var(--status-critical)' }
  };

  function marker(level) {
    if (level === 'recovery') return 'R';
    if (level === 'reduced') return 'A';
    return 'F';
  }

  let html = `
    <div class="calendar">
      <div class="calendar__header">
        <h3 class="calendar__month">${monthName}</h3>
      </div>
      <div class="calendar__grid">
        ${DAY_LABELS.map(d => `<div class="calendar__day-label">${d}</div>`).join('')}
  `;

  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar__cell calendar__cell--empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayData = symptomData?.[day];
    const h = heatLevel(dayData);
    const st = STYLE[h];
    const symptomTags = dayData?.symptoms?.slice(0, 2).map(s =>
      `<span style="font-size:0.52rem;color:${st.txt};line-height:1;">${esc(s.label)}</span>`
    ).join('') ?? '';

    const more = dayData?.symptoms?.length > 2
      ? `<span style="font-size:0.5rem;color:${st.txt};opacity:0.8;">+${dayData.symptoms.length - 2}</span>`
      : '';

    const adaptMarker = dayData
      ? `<span style="position:absolute;top:4px;right:5px;font-size:0.52rem;font-weight:800;color:${st.txt};">${marker(dayData.adaptationLevel)}</span>`
      : '';

    html += `
      <div class="calendar__cell"
           style="position:relative;min-height:58px;background:${st.bg};border-color:${st.border};">
        ${adaptMarker}
        <span class="calendar__day-num" style="color:${st.txt};">${day}</span>
        <div style="display:flex;flex-direction:column;gap:1px;margin-top:4px;overflow:hidden;">
          ${symptomTags}${more}
        </div>
      </div>
    `;
  }

  html += `
      </div>
      <div style="font-size:0.63rem;color:var(--text-2);line-height:1.5;margin-top:10px;">
        Heat reflects symptom load and pain level. F = full intensity. A = adapted. R = recovery.
      </div>
    </div>
  `;

  return html;
}
