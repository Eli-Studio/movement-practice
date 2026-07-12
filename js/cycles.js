// ============================================================
// cycles.js — 28-day training cycle management
// ============================================================

import { CYCLE_LENGTH_DAYS, ELI_HEAVY_SEQUENCE, CHRISTINA_SEQUENCE, CYCLE_PROGRESSION_STEP_KG } from './config.js';
import { addDays, today, daysBetween } from './utils.js';

// Parse the first number from a weight string like "5.5kg per hand" → 5.5
function parseKg(str) {
  if (!str) return null;
  const m = str.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// Parse a reps string into a {min, max} range.
// "8-10" → {min:8, max:10}. "10 each side" (or any single leading number
// with no range) → {min:10, max:10} — a fixed target, not a climbable range.
// Returns null if nothing parseable (e.g. duration-based exercises).
function parseRepsRange(str) {
  if (!str) return null;
  const rangeMatch = String(str).match(/^(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  const singleMatch = String(str).match(/^(\d+)/);
  if (singleMatch) { const n = parseInt(singleMatch[1]); return { min: n, max: n }; }
  return null;
}

export function initCycleFromLaunchDate(launchDate) {
  return {
    cycleId:                  'cycle_001',
    cycleNumber:              1,
    startDate:                launchDate,
    endDate:                  addDays(launchDate, CYCLE_LENGTH_DAYS - 1),
    eliSequencePointer:       0,
    eliLastHeavyDate:         null,
    eliLastHeavyRoutineId:    null,
    eliLastActivityDate:      null,
    eliHeavyCounts:           { eli_upper_push: 0, eli_lower_body: 0, eli_upper_pull: 0, eli_full_body: 0 },
    eliCircuitCount:          0,
    eliCardioCount:           0,
    eliMobilityCount:         0,
    eliComboCount:            0,
    eliExerciseWeights:       {},
    eliExerciseRepsTarget:    {},
    christinaSequencePointer: 0,
    christinaLastActivityDate:null,
    christinaRoutineCounts: {
      christina_gentle_upper:       0,
      christina_gentle_lower:       0,
      christina_gentle_pull_posture:0,
      christina_gentle_full_body:   0,
      christina_light_movement:     0,
      christina_recovery_minimum:   0
    }
  };
}

export function startNewCycle(current) {
  const nextStart = addDays(current.endDate, 1);
  const n = current.cycleNumber + 1;
  return {
    cycleId:                  `cycle_${String(n).padStart(3, '0')}`,
    cycleNumber:              n,
    startDate:                nextStart,
    endDate:                  addDays(nextStart, CYCLE_LENGTH_DAYS - 1),
    eliSequencePointer:       current.eliSequencePointer,
    eliLastHeavyDate:         current.eliLastHeavyDate,
    eliLastHeavyRoutineId:    current.eliLastHeavyRoutineId,
    eliLastActivityDate:      current.eliLastActivityDate,
    eliHeavyCounts:           { eli_upper_push: 0, eli_lower_body: 0, eli_upper_pull: 0, eli_full_body: 0 },
    eliCircuitCount:          0,
    eliCardioCount:           0,
    eliMobilityCount:         0,
    eliComboCount:            0,
    // Weight now derives from the profile baseline each cycle, so per-lift logged
    // weights don't carry across the boundary (they'd otherwise shadow the baseline).
    // Rep targets DO carry — the climb continues unless a baseline bump reset them.
    eliExerciseWeights:       {},
    eliExerciseRepsTarget:    { ...(current.eliExerciseRepsTarget ?? {}) },
    christinaSequencePointer: current.christinaSequencePointer,
    christinaLastActivityDate:current.christinaLastActivityDate,
    christinaRoutineCounts: {
      christina_gentle_upper:       0,
      christina_gentle_lower:       0,
      christina_gentle_pull_posture:0,
      christina_gentle_full_body:   0,
      christina_light_movement:     0,
      christina_recovery_minimum:   0
    }
  };
}

export function isCycleExpired(cycleState) {
  return today() > cycleState.endDate;
}

export function getCycleDayNumber(cycleState) {
  const d = daysBetween(cycleState.startDate, today());
  return Math.min(Math.max(d + 1, 1), CYCLE_LENGTH_DAYS);
}

export function updateCycleAfterSession(cycleState, session, allExercises = []) {
  const c = {
    ...cycleState,
    eliExerciseWeights:    { ...(cycleState.eliExerciseWeights ?? {}) },
    eliExerciseRepsTarget: { ...(cycleState.eliExerciseRepsTarget ?? {}) }
  };
  const date = session.date;

  if (session.users.includes('eli') && session.eliRoutineId) {
    c.eliLastActivityDate = date;
    const rid   = session.eliRoutineId;
    const rtype = session.eliRoutineType;

    if (rtype === 'heavy_weight') {
      c.eliLastHeavyDate      = date;
      c.eliLastHeavyRoutineId = rid;
      const idx = ELI_HEAVY_SEQUENCE.indexOf(rid);
      if (idx >= 0) {
        c.eliSequencePointer = (idx + 1) % ELI_HEAVY_SEQUENCE.length;
        if (c.eliHeavyCounts[rid] !== undefined) c.eliHeavyCounts[rid]++;
      }
    } else if (rtype === 'circuit')              { c.eliCircuitCount++;  }
      else if (rtype === 'cardio_circuit')       { c.eliCardioCount++;   }
      else if (rtype === 'mobility_recovery')    { c.eliMobilityCount++; }
      else if (rtype === 'combo_weight_circuit') { c.eliComboCount++;    }

    for (const log of (session.exerciseLogs?.eli ?? [])) {
      if (log.skipped) continue;

      for (const setLog of (log.setLogs ?? [])) {
        const kg = parseKg(setLog.weightUsed);
        if (kg !== null && kg > 0) {
          const prev = c.eliExerciseWeights[log.exerciseId] ?? 0;
          if (kg > prev) c.eliExerciseWeights[log.exerciseId] = kg;
        }
      }

      const def = allExercises.find(e => e.id === log.exerciseId);
      const range = def ? parseRepsRange(def.defaultReps) : null;
      if (range && range.max > range.min) {
        const repsLogged = (log.setLogs ?? [])
          .map(s => s.reps).filter(r => r != null && r > 0);
        if (repsLogged.length) {
          const toppedCount = repsLogged.filter(r => r >= range.max).length;
          const majorityTopped = toppedCount > repsLogged.length / 2;
          const currentTarget = c.eliExerciseRepsTarget[log.exerciseId] ?? range.min;
          if (majorityTopped) {
            c.eliExerciseRepsTarget[log.exerciseId] = Math.min(currentTarget + 1, range.max);
          } else if (c.eliExerciseRepsTarget[log.exerciseId] == null) {
            c.eliExerciseRepsTarget[log.exerciseId] = currentTarget;
          }
        }
      }
    }
  }

  if (session.users.includes('christina') && session.christinaRoutineId) {
    c.christinaLastActivityDate = date;
    const cid    = session.christinaRoutineId;
    const cLevel = session.christinaAdaptationLevel;

    const isRealWorkout = cLevel === 'normal' || cLevel === 'reduced';
    if (isRealWorkout) {
      const cIdx = CHRISTINA_SEQUENCE.indexOf(cid);
      if (cIdx >= 0) {
        c.christinaSequencePointer = (cIdx + 1) % CHRISTINA_SEQUENCE.length;
      }
    }

    if (c.christinaRoutineCounts[cid] !== undefined) {
      c.christinaRoutineCounts[cid]++;
    }
  }

  return c;
}

// Cycle-review recommendations. Weight now moves as ONE profile baseline (adding
// plates across every lift at once), so this returns: per-anchor REP suggestions
// (keep earning reps toward the range max), plus a SINGLE 'baseline' weight
// recommendation for cycle_review profiles — bumped only once every tracked anchor
// has topped out its rep range and readiness isn't red. `fixed` profiles (Christina)
// get no weight recommendation.
export function getCycleProgressionSuggestions(cycleState, allExercises, heavyTemplates, readinessOverall, profile = null) {
  const repsRows = [];
  const seen = new Set();
  let anchorsWithData = 0, anchorsToppedOut = 0;
  const baselineKg = profile?.baselineWeightKg ?? null;

  for (const tmpl of heavyTemplates ?? []) {
    if (!cycleState.eliHeavyCounts?.[tmpl.id]) continue;

    for (const slot of tmpl.slots ?? []) {
      if (slot.slotType !== 'anchor' || !slot.allowedExerciseIds?.length) continue;

      const exId = slot.allowedExerciseIds[(cycleState.cycleNumber - 1) % slot.allowedExerciseIds.length];
      if (seen.has(exId)) continue;
      seen.add(exId);

      const def = allExercises.find(e => e.id === exId);
      if (!def) continue;

      const range = parseRepsRange(def.defaultReps);
      if (!range) continue;

      const currentTarget = cycleState.eliExerciseRepsTarget?.[exId] ?? range.min;
      anchorsWithData++;

      if (currentTarget >= range.max) {
        anchorsToppedOut++;
      } else if (readinessOverall !== 'red') {
        repsRows.push({
          exerciseId:   exId,
          exerciseName: def.name,
          type:         'reps',
          currentKg:    baselineKg,
          currentReps:  currentTarget,
          suggestedReps: Math.min(currentTarget + 1, range.max),
          repsRangeMax: range.max,
          recommended:  true
        });
      }
    }
  }

  const suggestions = [...repsRows];

  // Single working-weight recommendation (cycle_review profiles only).
  if (profile?.progressionMode === 'cycle_review' && anchorsWithData > 0 && baselineKg != null) {
    let suggestedKg = baselineKg, recommended = false, reason;
    if (readinessOverall === 'red') {
      reason = 'red';                       // recovery focus — hold
    } else if (anchorsToppedOut === anchorsWithData) {
      suggestedKg = Math.round((baselineKg + CYCLE_PROGRESSION_STEP_KG) * 10) / 10;
      recommended = true;
      reason = 'earned';                    // topped out everywhere — ready to add
    } else {
      reason = 'climbing';                  // still earning reps on some lifts
    }
    suggestions.push({
      exerciseId:   'baseline',
      exerciseName: 'Working weight',
      type:         'baseline',
      currentKg:    baselineKg,
      suggestedKg,
      recommended,
      reason,
      anchorsToppedOut,
      anchorsWithData
    });
  }

  return suggestions;
}
