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
 * Returns array of { position, eliName, christinaName, conflictingEquipment, suggestion }
 */
export function analyzePairedConflicts(eliExercises, christinaExercises, allExercises) {
  const warnings = [];
  const len = Math.min(eliExercises.length, christinaExercises.length);

  for (let i = 0; i < len; i++) {
    const eDef = allExercises.find(e => e.id === eliExercises[i].id);
    const cDef = allExercises.find(e => e.id === christinaExercises[i].id);
    if (!eDef || !cDef) continue;

    const conflicts = getConflictingItems(eDef, cDef);
    if (conflicts.length > 0) {
      warnings.push({
        position:            i + 1,
        eliName:             eliExercises[i].name,
        christinaName:       christinaExercises[i].name,
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
      return 'Bench needed by both — coordinate who goes first, or swap Christina to a floor variation.';
    case 'fixed_dumbbells_3kg':
      return 'Fixed dumbbells needed by both — Christina goes first (primary user), then Eli does lateral raises.';
    case 'modular_adjustable_weights':
      return 'Eli\'s adjustable weights are tied up here. Christina should use a bodyweight or band alternative.';
    case 'speed_rope':
      return 'Speed rope in use — Christina should sub in step jacks or marching in place.';
    default:
      return 'Equipment overlap — coordinate who goes first.';
  }
}
