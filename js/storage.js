// ============================================================
// storage.js — localStorage persistence
// ============================================================

import { STORAGE_KEY } from './config.js';
import { safeSpotifyUrl } from './utils.js';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const isDate = value => {
  if (value === null) return true;
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

function validateBackup(state) {
  const s = state.settings;
  return isObject(state) && typeof state.version === 'string' && isObject(s)
    && isDate(s.launchDate ?? null) && isDate(s.currentCycleStart ?? null)
    && typeof s.audioEnabled === 'boolean' && Number.isFinite(s.defaultRestSeconds)
    && s.defaultRestSeconds >= 30 && s.defaultRestSeconds <= 300
    && ['spotify', 'chimes'].includes(s.musicMode) && ['night', 'day'].includes(s.theme)
    && (s.spotifyUrl === '' || Boolean(safeSpotifyUrl(s.spotifyUrl)))
    && isObject(s.profiles) && isObject(s.profiles.eli) && isObject(s.profiles.christina)
    && Array.isArray(state.sessions) && state.sessions.length <= 10000
    && Array.isArray(state.missedDays) && state.missedDays.length <= 10000
    && Array.isArray(state.cycleReviews) && state.cycleReviews.length <= 10000
    && state.sessions.every(x => isObject(x) && typeof x.date === 'string' && isDate(x.date))
    && state.missedDays.every(x => isObject(x) && typeof x.date === 'string' && isDate(x.date));
}

export function getDefaultState() {
  return {
    version: '0.4.0',
    settings: {
      launchDate:         null,
      currentCycleStart:  null,
      audioEnabled:       true,
      defaultRestSeconds: 120,
      spotifyUrl:         '',
      musicMode:          'spotify',  // 'spotify' | 'chimes'
      theme:              'night',    // 'night' (dark, default) | 'day' (light)
      lastBackupAt:       null,       // ISO timestamp of the last full JSON export
      // Per-user profiles. Internal ids (eli/christina) are stable; name, baseline
      // weight, progression style, per-exercise weight overrides, and disabled
      // exercises are all editable in Settings. See SPEC_User_Profiles.md.
      profiles: {
        eli: {
          displayName:      'Eli',
          baselineWeightKg: 5,
          progressionMode:  'cycle_review',   // climbs via cycle review
          disabledExerciseIds: [],
          weightOverridesKg: {                // light isolation moves stay at 3kg
            eli_lateral_raise_3kg: 3,
            eli_front_raise_3kg:   3,
            eli_rear_delt_raise_3kg: 3,
            eli_reverse_fly:       3
          }
        },
        christina: {
          displayName:      'Christina',
          baselineWeightKg: 3,
          progressionMode:  'fixed',          // never prompted to increase
          disabledExerciseIds: [],
          weightOverridesKg: {}
        }
      }
    },
    cycleState: {
      cycleId:                  'cycle_001',
      cycleNumber:              1,
      startDate:                null,
      endDate:                  null,
      eliSequencePointer:       0,
      eliLastHeavyDate:         null,
      eliLastHeavyRoutineId:    null,
      eliLastActivityDate:      null,
      eliHeavyCounts: {
        eli_upper_push: 0,
        eli_lower_body: 0,
        eli_upper_pull: 0,
        eli_full_body:  0
      },
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
    },
    sessions:    [],
    missedDays:  [],
    cycleReviews:[]
  };
}

// Nested cycleState sub-objects that must be deep-merged against defaults so a
// newly-added key (e.g. a new routine in eliHeavyCounts) is filled in on an
// existing save instead of silently staying undefined. The user's logged values
// always win; defaults only supply keys the save is missing.
const CYCLE_NESTED_KEYS = [
  'eliHeavyCounts',
  'christinaRoutineCounts',
  'eliExerciseWeights',
  'eliExerciseRepsTarget'
];

function mergeCycleState(defCycle, savedCycle) {
  const saved = savedCycle ?? {};
  const out = { ...defCycle, ...saved };
  for (const k of CYCLE_NESTED_KEYS) {
    out[k] = { ...(defCycle[k] ?? {}), ...(saved[k] ?? {}) };
  }
  return out;
}

// Forward-fill settings.profiles: each profile is merged key-by-key against its
// default so an existing save (no profiles, or missing a newly-added field) is
// seeded, while the user's own values always win. Nested maps (overrides,
// disabled lists) are shallow-merged per profile.
function mergeProfiles(defProfiles, savedProfiles) {
  const saved = savedProfiles ?? {};
  const out = {};
  for (const id of Object.keys(defProfiles)) {
    const dp = defProfiles[id];
    const sp = saved[id] ?? {};
    out[id] = {
      ...dp,
      ...sp,
      weightOverridesKg: { ...(dp.weightOverridesKg ?? {}), ...(sp.weightOverridesKg ?? {}) },
      disabledExerciseIds: Array.isArray(sp.disabledExerciseIds)
        ? sp.disabledExerciseIds
        : (dp.disabledExerciseIds ?? [])
    };
  }
  // Preserve any extra profiles a save might carry (future-proofing).
  for (const id of Object.keys(saved)) if (!out[id]) out[id] = saved[id];
  return out;
}

// Merge a parsed/loaded state object against defaults. Settings and cycleState
// (including its nested count maps) are forward-filled; the three collections
// are array-guarded so a malformed or older save can't leave them undefined.
function mergeAgainstDefaults(parsed) {
  const d = getDefaultState();
  return {
    ...d,
    ...parsed,
    version:      parsed.version ?? d.version,
    settings:     {
      ...d.settings,
      ...(parsed.settings ?? {}),
      profiles: mergeProfiles(d.settings.profiles, parsed.settings?.profiles)
    },
    cycleState:   mergeCycleState(d.cycleState, parsed.cycleState),
    sessions:     Array.isArray(parsed.sessions)     ? parsed.sessions     : d.sessions,
    missedDays:   Array.isArray(parsed.missedDays)   ? parsed.missedDays   : d.missedDays,
    cycleReviews: Array.isArray(parsed.cycleReviews) ? parsed.cycleReviews : d.cycleReviews
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return mergeAgainstDefaults(JSON.parse(raw));
  } catch {
    console.error('[storage] Failed to parse stored state');
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('[storage] Failed to save state:', err);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('morning-circuit:save-error'));
    return false;
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function exportStateJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function importStateJSON(jsonStr) {
  if (typeof jsonStr !== 'string' || new TextEncoder().encode(jsonStr).length > MAX_BACKUP_BYTES) {
    return { success: false, error: 'Backup must be a JSON file no larger than 5 MB.' };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { success: false, error: 'Could not parse JSON: ' + err.message };
  }
  if (!isObject(parsed) || typeof parsed.version !== 'string' || !isObject(parsed.settings)) {
    return { success: false, error: 'This does not look like a Morning Circuit backup.' };
  }
  for (const key of ['sessions', 'missedDays', 'cycleReviews']) {
    if (key in parsed && !Array.isArray(parsed[key])) return { success: false, error: `Backup field "${key}" must be a list.` };
  }
  const migrated = mergeAgainstDefaults(parsed);
  if (!validateBackup(migrated)) return { success: false, error: 'Backup data is missing fields or contains invalid values.' };
  // Same forward-compat merge as loadState, so a restored backup from an older
  // schema gets every current field (including nested cycleState maps).
  return { success: true, state: migrated };
}
