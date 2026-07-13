// ============================================================
// rotation.js — Routine selection and break-day logic
// ============================================================

import { USERA_HEAVY_SEQUENCE, USERB_SEQUENCE } from './config.js';
import { today, daysBetween, toLocalDateString } from './utils.js';
import { describePainRule } from './adaptation.js';

// ---- User A ------------------------------------------------

/**
 * Has User A had a break since his last heavy session?
 * Break = any non-heavy session logged, any missed-day entry,
 * OR simply 1+ calendar day elapsed since last heavy.
 */
export function userAHasBreakDay(cycleState, sessions, missedDays) {
  const lastHeavy = cycleState.userALastHeavyDate;
  if (!lastHeavy) return true;           // No heavy session yet
  if (lastHeavy === today()) return false; // Heavy was today — no break yet

  const nonHeavyAfter = sessions.some(s =>
    s.date > lastHeavy &&
    s.users.includes('userA') &&
    s.userARoutineType !== 'heavy_weight' &&
    s.status !== 'abandoned'
  );

  const missedAfter = missedDays.some(m =>
    m.date > lastHeavy && m.users.includes('userA')
  );

  const daysSince = daysBetween(lastHeavy, today());

  return nonHeavyAfter || missedAfter || daysSince >= 1;
}

/**
 * Full Body only unlocks after Upper Push + Lower Body + Upper Pull
 * are each completed at least once in the current cycle.
 */
export function userAEligibleForFullBody(cycleState) {
  const c = cycleState.userAHeavyCounts;
  return c.strength_upper_push > 0 && c.strength_lower_body > 0 && c.strength_upper_pull > 0;
}

const USERA_ALTERNATIVES = [
  { id: 'strength_light_circuit',        label: 'Light Circuit',           type: 'circuit' },
  { id: 'strength_cardio_circuit',       label: 'Cardio Circuit',          type: 'cardio_circuit' },
  { id: 'strength_mobility_recovery',    label: 'Mobility / Recovery',     type: 'mobility_recovery' },
  { id: 'strength_combo_weight_circuit', label: 'Combo: Weight + Circuit', type: 'combo_weight_circuit' },
  { id: 'skip_rest',                label: 'Skip / Rest Today',       type: 'skip_rest' }
];

const USERA_HEAVY_LABELS = {
  strength_upper_push: 'Upper Push — Chest & Shoulders',
  strength_lower_body: 'Lower Body — Legs & Glutes',
  strength_upper_pull: 'Upper Pull — Back & Biceps',
  strength_full_body:  'Full Body'
};

export function getUserASuggestion(cycleState, sessions, missedDays) {
  const hasBreak  = userAHasBreakDay(cycleState, sessions, missedDays);
  const nextHeavy = USERA_HEAVY_SEQUENCE[cycleState.userASequencePointer];

  if (!hasBreak) {
    return {
      primary: {
        id:     'strength_light_circuit',
        label:  'Light Circuit',
        type:   'circuit',
        reason: 'Break day needed after your last heavy session.'
      },
      alternatives: [
        ...USERA_ALTERNATIVES.filter(a => a.id !== 'strength_light_circuit'),
        { id: 'adaptive_light_movement', label: 'Gentle Movement', type: 'circuit' }
      ],
      heavyBlocked: true,
      heavyBlockedReason: 'Complete a break day before your next heavy session.'
    };
  }

  return {
    primary: {
      id:     nextHeavy,
      label:  USERA_HEAVY_LABELS[nextHeavy] || nextHeavy,
      type:   'heavy_weight',
      reason: 'Next in your rotation — cleared for a heavy session.'
    },
    alternatives:     USERA_ALTERNATIVES,
    heavyBlocked:     false,
    eligibleForFullBody: userAEligibleForFullBody(cycleState)
  };
}

// ---- User B ------------------------------------------
//
// Pain level (low / med / high) is the only driver of intensity. The specific
// symptom buttons are tracked for history only — they do not steer the routine.
// Recovery / Light Movement / Rest are always offered as alternatives; User B
// chooses them herself rather than the app forcing them.

const USERB_LABELS = {
  adaptive_gentle_upper:        'Gentle Upper Body',
  adaptive_gentle_lower:        'Gentle Lower Body',
  adaptive_gentle_pull_posture: 'Gentle Pull & Posture',
  adaptive_gentle_full_body:    'Gentle Full Body',
  adaptive_light_movement:      'Light Movement',
  adaptive_recovery_minimum:    'Recovery / Minimum'
};

// A low-pain day borrows the corresponding five-slot strength template while
// retaining User B's own routine id, sequence pointer, profile weight, and
// reporting. Medium/high days continue to use the gentle templates above.
const USERB_LOW_PAIN_TEMPLATES = {
  adaptive_gentle_upper:        { id: 'strength_upper_push', label: 'Strength Upper Body' },
  adaptive_gentle_lower:        { id: 'strength_lower_body', label: 'Strength Lower Body' },
  adaptive_gentle_pull_posture: { id: 'strength_upper_pull', label: 'Strength Pull & Posture' },
  adaptive_gentle_full_body:    { id: 'strength_full_body',  label: 'Strength Full Body' }
};

export function getUserBSuggestion(cycleState, symptomState) {
  const painDay = symptomState?.painDay ?? 'low';

  const nextId = USERB_SEQUENCE[cycleState.userBSequencePointer % USERB_SEQUENCE.length];
  const lowPainTemplate = USERB_LOW_PAIN_TEMPLATES[nextId];

  // Low = full gentle routine; medium/high = same routine, scaled down by the pain rules.
  const adaptationLevel = painDay === 'low' ? 'normal' : 'reduced';

  return {
    primary: {
      id:              nextId,
      templateId:      painDay === 'low' ? lowPainTemplate?.id : nextId,
      label:           painDay === 'low' ? lowPainTemplate?.label : (USERB_LABELS[nextId] || nextId),
      adaptationLevel,
      reason:          describePainRule(painDay)
    },
    alternatives: [
      { id: 'adaptive_light_movement',   label: 'Light Movement',     adaptationLevel },
      { id: 'adaptive_recovery_minimum', label: 'Recovery / Minimum', adaptationLevel: 'recovery' },
      { id: 'skip_rest',                  label: 'Skip / Rest Today',  adaptationLevel: 'skip' }
    ].filter(a => a.id !== nextId)
  };
}

// ---- Missed Days ----------------------------------------

export function getMissedDays(sessions, missedDays, launchDate, selectedUsers) {
  const t = today();

  const allDates = [
    ...sessions
      .filter(s => selectedUsers.some(u => s.users.includes(u)))
      .map(s => s.date),
    ...missedDays
      .filter(m => selectedUsers.some(u => m.users.includes(u)))
      .map(m => m.date),
    launchDate
  ].filter(Boolean).sort();

  const lastDate = allDates[allDates.length - 1];
  if (!lastDate) return [];

  const missed  = [];
  const cursor  = new Date(lastDate + 'T12:00:00');
  const end     = new Date(t + 'T12:00:00');
  cursor.setDate(cursor.getDate() + 1);

  while (cursor < end) {
    missed.push(toLocalDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return missed;
}
