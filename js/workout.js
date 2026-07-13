// ============================================================
// workout.js — Build exercise plans from templates; session logging
// ============================================================

import { generateUUID, today } from './utils.js';
import { DEFAULT_REST_SECONDS, WEIGHT_STEP_KG } from './config.js';

// ---- Weight helpers ----------------------------------------

/**
 * Parse the leading kg number from a weight string like "5kg per hand" → 5.
 * Returns null for bodyweight or unrecognised formats.
 */
function parseWeightKg(str) {
  if (!str) return null;
  const m = str.match(/(\d+(?:\.\d+)?)\s*kg/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Resolve a weighted exercise's starting load from the user's profile:
 * per-exercise override wins, else the profile baseline, else the exercise's
 * own defaultWeight string (legacy fallback). Returns null for bodyweight
 * exercises or when no profile is supplied.
 */
export function resolveProfileWeight(profile, exId, def) {
  if (!def?.weighted) return null;
  if (profile) {
    const override = profile.weightOverridesKg?.[exId];
    if (override != null) return override;
    if (profile.baselineWeightKg != null) return profile.baselineWeightKg;
  }
  return parseWeightKg(def.defaultWeight);
}

/**
 * Format current weight back to a display/log string.
 * Preserves "per hand" suffix when the original had it.
 */
export function weightLabel(ex) {
  if (!ex?.weighted || ex.currentWeightKg === null || ex.currentWeightKg === undefined) {
    return ex?.defaultWeight ? ex.defaultWeight.replace(/(\d)kg/i, '$1 kg') : null;
  }
  const suffix = (ex.defaultWeight ?? '').includes('per hand') ? ' kg per hand' : ' kg';
  return `${ex.currentWeightKg}${suffix}`;
}

/**
 * Increase or decrease the working weight for the current exercise.
 * Mutates the exercise object in workoutState in place (no re-render needed).
 */
export function adjustWeight(ex, direction) {
  if (!ex || ex.currentWeightKg === null || ex.currentWeightKg === undefined) return;
  if (direction === 'up') {
    ex.currentWeightKg = Math.round((ex.currentWeightKg + WEIGHT_STEP_KG) * 10) / 10;
  } else {
    ex.currentWeightKg = Math.max(WEIGHT_STEP_KG, Math.round((ex.currentWeightKg - WEIGHT_STEP_KG) * 10) / 10);
  }
}

// ---- Plan building -----------------------------------------

/**
 * Build an exercise list from a routine template.
 *
 * Slot types:
 *   - "anchor"    → pinned for the whole 4-week cycle.
 *                   Rotates to a different option only when cycleNumber changes.
 *   - "accessory" → rotates session-to-session within the cycle.
 *   - "optional"  → generated like an accessory, marked skippable so the
 *                   User B pain-scaler drops it first.
 */
export function parseDefaultReps(repsStr) {
  if (!repsStr) return null;
  const m = String(repsStr).match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}

export function repsLabel(ex) {
  if (ex.currentReps == null) return ex.reps ?? '—';
  return `${ex.currentReps} reps`;
}

export function adjustReps(ex, direction) {
  if (ex.currentReps == null) return;
  if (direction === 'up')   ex.currentReps = Math.min(ex.currentReps + 1, 40);
  else                      ex.currentReps = Math.max(1, ex.currentReps - 1);
}

export function buildExercisePlan(template, allExercises, sessionCount = 0, cycleNumber = 1, weightOverrides = {}, repsOverrides = {}, profile = null, unavailableEquipmentIds = []) {
  const exercises = [];
  const used = new Set();
  const disabled = new Set(profile?.disabledExerciseIds ?? []);
  const unavailable = new Set(unavailableEquipmentIds ?? []);
  const dumbbellIds = new Set(['modular_adjustable_weights', 'fixed_dumbbells_3kg']);
  const availableDumbbells = [...dumbbellIds].filter(id => !unavailable.has(id));
  const hasAnyDumbbells = availableDumbbells.length > 0;
  const normalizeDumbbellIds = ids => (ids ?? []).map(id =>
    dumbbellIds.has(id) && availableDumbbells.length === 1 ? availableDumbbells[0] : id
  );

  for (const slot of template.slots) {
    const fullPool = slot.allowedExerciseIds ?? [];
    // Respect both per-profile exercise choices and household equipment. A
    // missing item is never silently reintroduced to fill a required slot.
    const pool = fullPool.filter(id => {
      if (disabled.has(id)) return false;
      const def = allExercises.find(ex => ex.id === id);
      return def && (def.equipment ?? []).every(itemId =>
        dumbbellIds.has(itemId) ? hasAnyDumbbells : !unavailable.has(itemId)
      );
    });
    if (!pool.length) continue;

    const slotType = slot.slotType ?? 'accessory';

    // Anchors pin by cycle; everything else rotates by session count.
    const baseIdx = slotType === 'anchor'
      ? (cycleNumber - 1) % pool.length
      : sessionCount % pool.length;

    // Avoid duplicate exercise across slots in the same routine.
    let exId = pool[baseIdx];
    for (let step = 1; step < pool.length && used.has(exId); step++) {
      exId = pool[(baseIdx + step) % pool.length];
    }

    const def = allExercises.find(e => e.id === exId);
    if (!def) continue;
    used.add(exId);

    // Use the highest weight previously logged for this exercise (if any),
    // otherwise fall back to the template default. Only tracked for User A weighted
    // exercises; User B's exercises don't have weightOverrides passed in.
    // Previously-logged weight (in-cycle continuity) wins; otherwise start from
    // the profile's override-or-baseline; legacy defaultWeight is the final fallback.
    const savedKg = (weightOverrides && weightOverrides[exId] != null)
      ? weightOverrides[exId]
      : null;
    const currentWeightKg = savedKg ?? resolveProfileWeight(profile, exId, def);

    exercises.push({
      id:              exId,
      name:            def.name,
      sets:            def.defaultSets    ?? 3,
      reps:            def.defaultReps    ?? null,
      durationSeconds: def.defaultDurationSeconds ?? null,
      restSeconds:     def.defaultRestSeconds     ?? DEFAULT_REST_SECONDS,
      weighted:        def.weighted       ?? false,
      defaultWeight:   def.defaultWeight  ?? null,
      currentWeightKg,                              // mutable working weight
      currentReps:     def.defaultDurationSeconds ? null
        : ((repsOverrides && repsOverrides[exId] != null) ? repsOverrides[exId] : parseDefaultReps(def.defaultReps)),
      intensity:       def.intensity      ?? 'medium',
      formCues:        def.formCues       ?? [],
      cautions:        def.cautions       ?? [],
      equipment:       normalizeDumbbellIds(def.equipment),
      conflictEquipment: normalizeDumbbellIds(def.conflictEquipment),
      attributes:      def.attributes     ?? [],   // mechanical demands (User B symptom matrix)
      symptomConflicts:[],                          // filled by annotateSymptomConflicts (advisory)
      slotId:          slot.slotId,
      poolIds:         pool,
      originalId:      exId,
      isSwapped:       false,
      slotName:        slot.slotName,
      slotType,
      isAnchor:        slotType === 'anchor',
      required:        slot.required !== false,
      skippable:       slotType === 'optional',
      adapted:         false,
      adaptationNote:  null
    });
  }

  return exercises;
}

/**
 * Swap the exercise at `planIndex` to the next valid option in its slot's
 * pool — loops back to the slot's original suggestion after the last option.
 * Pre-workout only (Routine Suggestion screen); not used once a session starts.
 *
 * Preserves sets/reps as currently set on the plan item (these reflect any
 * pain-day scaling already applied) unless the new exercise's rep/duration
 * type differs from the old one, in which case reps/duration are taken from
 * the new exercise's own defaults.
 *
 * Skips ids already used elsewhere in the same plan, except when wrapping
 * back around to the slot's original exercise.
 */
export function swapExercise(plan, allExercises, planIndex, weightOverrides = {}, profile = null) {
  const item = plan[planIndex];
  if (!item?.poolIds?.length || item.poolIds.length <= 1) return plan;

  const pool = item.poolIds;
  const usedElsewhere = new Set(
    plan.filter((_, i) => i !== planIndex).map(p => p.id)
  );
  const startIdx = pool.indexOf(item.id);

  for (let step = 1; step <= pool.length; step++) {
    const nextId = pool[(startIdx + step) % pool.length];
    if (nextId === item.id) continue;
    if (usedElsewhere.has(nextId) && nextId !== item.originalId) continue;

    const def = allExercises.find(e => e.id === nextId);
    if (!def) continue;

    const newIsDuration = def.defaultDurationSeconds != null;
    const oldWasDuration = item.durationSeconds != null;
    const sameType = newIsDuration === oldWasDuration;

    plan[planIndex] = {
      ...item,
      id:                nextId,
      name:              def.name,
      durationSeconds:   newIsDuration ? def.defaultDurationSeconds : null,
      reps:              newIsDuration ? null : (sameType ? item.reps : def.defaultReps),
      currentReps:       newIsDuration ? null : (sameType ? item.currentReps : parseDefaultReps(def.defaultReps)),
      weighted:          def.weighted ?? false,
      defaultWeight:     def.defaultWeight ?? null,
      // Prefer the highest weight previously logged for the swapped-in exercise
      // (carries progression across a swap) — falls back to the template default.
      currentWeightKg:   def.weighted
        ? ((weightOverrides && weightOverrides[nextId] != null)
            ? weightOverrides[nextId]
            : resolveProfileWeight(profile, nextId, def))
        : null,
      intensity:         def.intensity ?? 'medium',
      formCues:          def.formCues ?? [],
      cautions:          def.cautions ?? [],
      equipment:         def.equipment ?? [],
      conflictEquipment: def.conflictEquipment ?? [],
      attributes:        def.attributes ?? [],   // re-annotated by caller after swap
      symptomConflicts:  [],
      isSwapped:         true
    };
    return plan;
  }

  return plan;
}

/**
 * Returns all anchor exercise names for a given template + cycle,
 * as a flat array of strings. Used by the suggestion screen.
 */
export function getTemplateAnchors(template, allExercises, cycleNumber = 1) {
  if (!template) return [];
  return template.slots
    .filter(s => s.slotType === 'anchor')
    .map(s => {
      const exId = s.allowedExerciseIds?.[(cycleNumber - 1) % (s.allowedExerciseIds?.length || 1)];
      return allExercises.find(e => e.id === exId)?.name ?? null;
    })
    .filter(Boolean);
}

// ---- Session management ------------------------------------

export function createSession(users, userARoutineId, userARoutineType, userBRoutineId, userBAdaptationLevel, cycleId) {
  const sessionType =
    users.length === 2 ? 'both' :
    users[0] === 'userA' ? 'userA_only' : 'userB_only';

  return {
    sessionId:               generateUUID(),
    date:                    today(),
    cycleId:                 cycleId ?? null,
    users,
    sessionType,
    userARoutineId:            userARoutineId ?? null,
    userARoutineType:          userARoutineType ?? null,
    userBRoutineId:      userBRoutineId ?? null,
    userBAdaptationLevel:userBAdaptationLevel ?? null,
    status:                  'in_progress',
    exerciseLogs:            { userA: [], userB: [] },
    userAEndCheckin:           null,
    userBCheckin:        null,
    profileCheckins:         {},
    userBSymptomConflicts: [],   // advisory symptom flags captured at session build
    meditation:              null,
    notes:                   '',
    startedAt:               new Date().toISOString(),
    completedAt:             null
  };
}

export function logSet(session, userId, exerciseId, exerciseName, setNumber, reps, durationSeconds, weightUsed) {
  let log = session.exerciseLogs[userId].find(l => l.exerciseId === exerciseId);

  if (!log) {
    log = {
      exerciseLogId: generateUUID(),
      sessionId:     session.sessionId,
      userId,
      exerciseId,
      exerciseName,
      completedSets: 0,
      setLogs:       [],
      skipped:       false
    };
    session.exerciseLogs[userId].push(log);
  }

  log.setLogs.push({
    setNumber,
    reps:            reps ?? null,
    durationSeconds: durationSeconds ?? null,
    weightUsed:      weightUsed ?? null,
    completedAt:     new Date().toISOString()
  });
  log.completedSets = log.setLogs.length;

  return session;
}

export function skipExercise(session, userId, exerciseId, exerciseName) {
  let log = session.exerciseLogs[userId].find(l => l.exerciseId === exerciseId);
  if (!log) {
    log = {
      exerciseLogId: generateUUID(),
      sessionId:     session.sessionId,
      userId,
      exerciseId,
      exerciseName,
      completedSets: 0,
      setLogs:       [],
      skipped:       true
    };
    session.exerciseLogs[userId].push(log);
  } else {
    log.skipped = true;
  }
  return session;
}

export function completeSession(session) {
  session.status      = 'completed';
  session.completedAt = new Date().toISOString();
  return session;
}

export function abandonSession(session) {
  session.status      = 'abandoned';
  session.completedAt = new Date().toISOString();
  return session;
}
