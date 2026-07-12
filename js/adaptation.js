// ============================================================
// adaptation.js — Christina intensity scaling + symptom flagging
//
// Pain level (low / medium / high) is the intensity control: it scales
// sets, reps, and the number of exercises (PAIN_RULES).
//
// Active symptom buttons drive ADVISORY conflict flagging only — see
// SYMPTOM_ATTRIBUTE_EXCLUSIONS. Per the v1 decision (Eli + Christina,
// 2026-06-30), a symptom conflict does NOT remove or reorder an exercise:
// the slot's pick is kept and the conflict is surfaced so Christina makes
// the call, and so we can see how often conflicts occur before deciding
// whether to harden the behavior.
// ============================================================

export const PAIN_RULES = {
  low:    { sets: 3, reps: '8-10', maxExercises: 4 },
  medium: { sets: 3, reps: '6-8',  maxExercises: 3 },
  high:   { sets: 2, reps: '6-8',  maxExercises: 2 }
};

/**
 * Human-readable one-line summary of a pain day's scaling, derived directly
 * from PAIN_RULES so the suggestion-screen reason text can never drift out of
 * sync with the rules actually applied. (Previously rotation.js hardcoded its
 * own copy of these numbers, which had gone stale — audit B1.)
 */
export function describePainRule(painDay) {
  const r     = PAIN_RULES[painDay] ?? PAIN_RULES.low;
  const label = String(painDay).charAt(0).toUpperCase() + String(painDay).slice(1);
  const reps  = String(r.reps).replace('-', '–');
  return `${label} pain day — ${r.maxExercises} exercises, ${r.sets} sets of ${reps} reps.`;
}

// Symptom × attribute matrix. Key = canonical symptom id (config.CHRISTINA_SYMPTOMS).
// Value = mechanical attributes that conflict with that symptom when active.
// Attribute tokens match the `attributes` field on each exercise in
// data/exercises.json (sourced from Christina's Exercise Pool matrix).
//
// The three symptoms carried over from the previous vocabulary keep their
// Christina-reviewed exclusions (dizziness was formerly "dizzinessLightheadedness").
// The five symptoms added with the canonical set — jointPain, muscleAche,
// headache, nausea, sensitivityToLight — are intentionally left UNMAPPED for now:
// they track in check-ins and reports but flag no exercise conflicts until
// Christina reviews and supplies a clinical mapping. A symptom absent from this
// object simply contributes no exclusions (see getAvoidedAttributes).
export const SYMPTOM_ATTRIBUTE_EXCLUSIONS = {
  dizziness: ['standing', 'floor_transition', 'elevated_hr', 'balance_single_leg'],
  fatigue:   ['elevated_hr', 'sustained_pressure', 'balance_single_leg'],
  brainFog:  ['floor_transition', 'twisting', 'balance_single_leg']
  // jointPain / muscleAche / headache / nausea / sensitivityToLight — pending clinical review
};

// Human-readable labels for attribute tokens (used in conflict flags).
export const ATTRIBUTE_LABELS = {
  standing:           'Standing',
  floor_transition:   'Floor transition',
  overhead_arm:       'Overhead arm',
  neck_loaded:        'Neck loaded',
  spinal_hinge:       'Spinal hinge',
  grip_dependent:     'Grip dependent',
  elevated_hr:        'Elevated HR',
  sustained_pressure: 'Sustained pressure',
  twisting:           'Twisting',
  balance_single_leg: 'Balance / single-leg'
};

function parseFirstNum(s) {
  const m = String(s ?? '').match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}

/**
 * Scale a Christina plan by today's pain level.
 * @param exercises    the generated plan (from buildExercisePlan)
 * @param symptomState { painDay: 'low'|'medium'|'high', symptoms: {...} }
 */
export function adaptChristinaExercises(exercises, symptomState) {
  const painDay = symptomState?.painDay ?? 'low';
  const rules   = PAIN_RULES[painDay] ?? PAIN_RULES.low;

  const scaled = exercises.map(ex => ({
    ...ex,
    sets: rules.sets,
    // Duration-based exercises keep their timing; rep-based exercises scale to pain rules.
    reps:        ex.durationSeconds ? ex.reps        : rules.reps,
    currentReps: ex.durationSeconds ? ex.currentReps : parseFirstNum(rules.reps),
  }));

  return scaled.slice(0, rules.maxExercises);
}

/**
 * Union of mechanical attributes to avoid given today's active symptoms.
 * A symptom is "active" when its value in symptomState.symptoms is truthy
 * (the symptom_check screen sets active buttons to 5).
 * Returns a Set of attribute tokens.
 */
export function getAvoidedAttributes(symptomState) {
  const out = new Set();
  const symptoms = symptomState?.symptoms ?? {};
  for (const [id, val] of Object.entries(symptoms)) {
    if (!val) continue;
    (SYMPTOM_ATTRIBUTE_EXCLUSIONS[id] ?? []).forEach(a => out.add(a));
  }
  return out;
}

/**
 * ADVISORY annotation. For each plan item, record which of its mechanical
 * attributes conflict with today's active symptoms in `symptomConflicts`.
 * Does NOT drop, reorder, or substitute anything — Christina keeps the call.
 * `symptomConflicts` is [] when an exercise is clear (or no symptoms active).
 */
export function annotateSymptomConflicts(exercises, symptomState) {
  const avoid = getAvoidedAttributes(symptomState);
  return exercises.map(ex => {
    const attrs = ex.attributes ?? [];
    return { ...ex, symptomConflicts: avoid.size ? attrs.filter(a => avoid.has(a)) : [] };
  });
}
