// ============================================================
// rotation.js — Routine selection and break-day logic
// ============================================================

import { ELI_HEAVY_SEQUENCE, CHRISTINA_SEQUENCE } from './config.js';
import { today, daysBetween, toLocalDateString } from './utils.js';
import { describePainRule } from './adaptation.js';

// ---- Eli ------------------------------------------------

/**
 * Has Eli had a break since his last heavy session?
 * Break = any non-heavy session logged, any missed-day entry,
 * OR simply 1+ calendar day elapsed since last heavy.
 */
export function eliHasBreakDay(cycleState, sessions, missedDays) {
  const lastHeavy = cycleState.eliLastHeavyDate;
  if (!lastHeavy) return true;           // No heavy session yet
  if (lastHeavy === today()) return false; // Heavy was today — no break yet

  const nonHeavyAfter = sessions.some(s =>
    s.date > lastHeavy &&
    s.users.includes('eli') &&
    s.eliRoutineType !== 'heavy_weight' &&
    s.status !== 'abandoned'
  );

  const missedAfter = missedDays.some(m =>
    m.date > lastHeavy && m.users.includes('eli')
  );

  const daysSince = daysBetween(lastHeavy, today());

  return nonHeavyAfter || missedAfter || daysSince >= 1;
}

/**
 * Full Body only unlocks after Upper Push + Lower Body + Upper Pull
 * are each completed at least once in the current cycle.
 */
export function eliEligibleForFullBody(cycleState) {
  const c = cycleState.eliHeavyCounts;
  return c.eli_upper_push > 0 && c.eli_lower_body > 0 && c.eli_upper_pull > 0;
}

const ELI_ALTERNATIVES = [
  { id: 'eli_light_circuit',        label: 'Light Circuit',           type: 'circuit' },
  { id: 'eli_cardio_circuit',       label: 'Cardio Circuit',          type: 'cardio_circuit' },
  { id: 'eli_mobility_recovery',    label: 'Mobility / Recovery',     type: 'mobility_recovery' },
  { id: 'eli_combo_weight_circuit', label: 'Combo: Weight + Circuit', type: 'combo_weight_circuit' },
  { id: 'skip_rest',                label: 'Skip / Rest Today',       type: 'skip_rest' }
];

const ELI_HEAVY_LABELS = {
  eli_upper_push: 'Upper Push — Chest & Shoulders',
  eli_lower_body: 'Lower Body — Legs & Glutes',
  eli_upper_pull: 'Upper Pull — Back & Biceps',
  eli_full_body:  'Full Body'
};

export function getEliSuggestion(cycleState, sessions, missedDays) {
  const hasBreak  = eliHasBreakDay(cycleState, sessions, missedDays);
  const nextHeavy = ELI_HEAVY_SEQUENCE[cycleState.eliSequencePointer];

  if (!hasBreak) {
    return {
      primary: {
        id:     'eli_light_circuit',
        label:  'Light Circuit',
        type:   'circuit',
        reason: 'Break day needed after your last heavy session.'
      },
      alternatives: ELI_ALTERNATIVES.filter(a => a.id !== 'eli_light_circuit'),
      heavyBlocked: true,
      heavyBlockedReason: 'Complete a break day before your next heavy session.'
    };
  }

  return {
    primary: {
      id:     nextHeavy,
      label:  ELI_HEAVY_LABELS[nextHeavy] || nextHeavy,
      type:   'heavy_weight',
      reason: 'Next in your rotation — cleared for a heavy session.'
    },
    alternatives:     ELI_ALTERNATIVES,
    heavyBlocked:     false,
    eligibleForFullBody: eliEligibleForFullBody(cycleState)
  };
}

// ---- Christina ------------------------------------------
//
// Pain level (low / med / high) is the only driver of intensity. The specific
// symptom buttons are tracked for history only — they do not steer the routine.
// Recovery / Light Movement / Rest are always offered as alternatives; Christina
// chooses them herself rather than the app forcing them.

const CHRISTINA_LABELS = {
  christina_gentle_upper:        'Gentle Upper Body',
  christina_gentle_lower:        'Gentle Lower Body',
  christina_gentle_pull_posture: 'Gentle Pull & Posture',
  christina_gentle_full_body:    'Gentle Full Body',
  christina_light_movement:      'Light Movement',
  christina_recovery_minimum:    'Recovery / Minimum'
};

export function getChristinaSuggestion(cycleState, symptomState) {
  const painDay = symptomState?.painDay ?? 'low';

  const nextId = CHRISTINA_SEQUENCE[cycleState.christinaSequencePointer % CHRISTINA_SEQUENCE.length];

  // Low = full gentle routine; medium/high = same routine, scaled down by the pain rules.
  const adaptationLevel = painDay === 'low' ? 'normal' : 'reduced';

  return {
    primary: {
      id:              nextId,
      label:           CHRISTINA_LABELS[nextId] || nextId,
      adaptationLevel,
      reason:          describePainRule(painDay)
    },
    alternatives: [
      { id: 'christina_light_movement',   label: 'Light Movement',     adaptationLevel },
      { id: 'christina_recovery_minimum', label: 'Recovery / Minimum', adaptationLevel: 'recovery' },
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
