// ============================================================
// equipment.js — Equipment conflict detection for paired mode
// ============================================================

const HARD_CONFLICT_IDS = [
  'modular_adjustable_weights',
  'fixed_dumbbells_3kg',
  'adjustable_bench',
  'speed_rope'
];

export function getConflictingItems(def1, def2) {
  if (!def1 || !def2) return [];
  return HARD_CONFLICT_IDS.filter(id =>
    (def1.conflictEquipment ?? []).includes(id) &&
    (def2.conflictEquipment ?? []).includes(id)
  );
}

/**
 * Analyze a paired workout for conflicts at the same exercise position.
 * Returns array of { position, userAName, userBName, conflictingEquipment, suggestion }
 */
export function analyzePairedConflicts(userAExercises, userBExercises, allExercises) {
  const warnings = [];
  const len = Math.min(userAExercises.length, userBExercises.length);

  for (let i = 0; i < len; i++) {
    const eDef = allExercises.find(e => e.id === userAExercises[i].id);
    const userBDef = allExercises.find(e => e.id === userBExercises[i].id);
    if (!eDef || !userBDef) continue;

    const conflicts = getConflictingItems(eDef, userBDef);
    if (conflicts.length > 0) {
      warnings.push({
        position:            i + 1,
        userAName:             userAExercises[i].name,
        userBName:       userBExercises[i].name,
        conflictingEquipment:conflicts,
        suggestion:          getConflictSuggestion(conflicts[0])
      });
    }
  }

  return warnings;
}

function getConflictSuggestion(equipmentId) {
  switch (equipmentId) {
    case 'adjustable_bench':
      return 'Bench needed by both — coordinate who goes first, or take a floor variation.';
    case 'fixed_dumbbells_3kg':
      return 'Fixed dumbbells needed by both — take turns, or one of you uses a band or bodyweight alternative.';
    case 'modular_adjustable_weights':
      return 'Adjustable weights are tied up — the other profile should use a bodyweight or band alternative.';
    case 'speed_rope':
      return 'Speed rope in use — the other profile can sub in step jacks or marching in place.';
    default:
      return 'Equipment overlap — coordinate who goes first.';
  }
}
