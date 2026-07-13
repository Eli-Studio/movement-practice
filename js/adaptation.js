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
  low:    { sets: 3, reps: '6-8',  maxExercises: 5 },
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

// Symptom × attribute matrix. Key = canonical symptom id (config.USERB_SYMPTOMS).
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

// Unified, temporary daily-capacity adjustment. This never writes progression
// state: it changes only the plan objects created for today's workout.
export function adaptWorkoutToCapacity(exercises, capacity = {}, profile = {}) {
  const energy = capacity.energy ?? 'medium';
  const pain = capacity.painDay ?? 'low';
  const soreness = capacity.soreness ?? 'low';
  let score = 0;
  if (energy === 'low') score += 2; else if (energy === 'high') score -= 1;
  if (pain === 'medium') score += 1; else if (pain === 'high') score += 3;
  if (soreness === 'medium') score += 1; else if (soreness === 'high') score += 2;

  const goalCaps = {
    build_strength: 5,
    improve_mobility: 4,
    maintain_consistency: 4,
    return_after_break: 3,
    general_fitness: 4
  };
  let maxExercises = goalCaps[profile.primaryGoal] ?? 4;
  let setReduction = 0, reps = null, restBonus = 0, loadFactor = 1;
  const reasons = [];
  if (score >= 5) {
    maxExercises = Math.min(maxExercises, 2); setReduction = 1; reps = '5-7'; restBonus = 30; loadFactor = 0.75;
    reasons.push('capacity is substantially reduced today');
  } else if (score >= 2) {
    maxExercises = Math.min(maxExercises, 4); setReduction = 1; reps = '6-8'; restBonus = 15; loadFactor = 0.9;
    reasons.push('today calls for a moderate reduction');
  } else if (energy === 'high' && pain === 'low' && soreness === 'low') {
    reasons.push('capacity supports the original plan');
  }
  if (profile.experienceLevel === 'new') maxExercises = Math.min(maxExercises, 3);
  if (maxExercises < exercises.length && score < 2) reasons.push(`your current goal sets a ${maxExercises}-exercise plan`);
  else if (maxExercises < exercises.length) reasons.push(`today's capacity reduces the plan to ${maxExercises} exercises`);

  const plan = exercises.slice(0, maxExercises).map(ex => ({
    ...ex,
    sets: Math.max(1, (ex.sets ?? 3) - setReduction),
    reps: ex.durationSeconds ? ex.reps : (reps ?? ex.reps),
    currentReps: ex.durationSeconds ? ex.currentReps : (reps ? parseFirstNum(reps) : ex.currentReps),
    restSeconds: (ex.restSeconds ?? 120) + restBonus,
    currentWeightKg: ex.currentWeightKg == null ? ex.currentWeightKg
      : Math.max(0.5, Math.round(ex.currentWeightKg * loadFactor * 2) / 2),
    adapted: score >= 2,
    adaptationNote: score >= 2 ? `${Math.round(loadFactor * 100)}% load · ${restBonus ? `+${restBonus}s rest` : 'usual rest'}` : null
  }));
  return {
    plan, changed: score >= 2 || maxExercises < exercises.length, score, reasons,
    comparison: {
      originalCount: exercises.length, recommendedCount: plan.length,
      setReduction, recommendedReps: reps, restBonus, loadFactor
    }
  };
}

export function composeCapacityPlan(original, recommended, choices = {}) {
  const use = dimension => (choices[dimension] ?? 'recommended') === 'recommended';
  const count = use('length') ? recommended.length : original.length;
  const recommendedById = new Map(recommended.map(ex => [ex.id, ex]));
  return original.slice(0, count).map(ex => {
    const rec = recommendedById.get(ex.id) ?? ex;
    return {
      ...ex,
      sets: use('volume') ? rec.sets : ex.sets,
      reps: use('volume') ? rec.reps : ex.reps,
      currentReps: use('volume') ? rec.currentReps : ex.currentReps,
      currentWeightKg: use('load') ? rec.currentWeightKg : ex.currentWeightKg,
      restSeconds: use('rest') ? rec.restSeconds : ex.restSeconds,
      adapted: ['length','volume','load','rest'].some(key => use(key)) && rec.adapted,
      adaptationNote: ['volume','load','rest'].some(key => use(key)) ? rec.adaptationNote : null
    };
  });
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
