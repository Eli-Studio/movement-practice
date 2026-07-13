// ============================================================
// storage.js — localStorage persistence
// ============================================================

import { AUDIO_AVAILABLE, STORAGE_KEY } from './config.js?v=2';
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
    && isObject(s.profiles) && isObject(s.profiles.userA) && isObject(s.profiles.userB)
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
      audioEnabled:       AUDIO_AVAILABLE,
      defaultRestSeconds: 120,
      spotifyUrl:         '',
      musicMode:          'spotify',  // 'spotify' | 'chimes'
      theme:              'night',    // 'night' (dark, default) | 'day' (light)
      lastBackupAt:       null,       // ISO timestamp of the last full JSON export
      unavailableEquipmentIds: [],    // household equipment intentionally turned off
      // Per-user profiles. Internal ids (userA/userB) are stable; name, baseline
      // weight, progression style, per-exercise weight overrides, and disabled
      // exercises are all editable in Settings. See SPEC_User_Profiles.md.
      profiles: {
        userA: {
          displayName:      'User A',
          icon:             'profile-a',
          primaryGoal:      'general_fitness',
          secondaryGoals:   [],
          experienceLevel:  'some',
          typicalDuration:  '20_30',
          adaptationPreference: 'both',
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
        userB: {
          displayName:      'User B',
          icon:             'profile-b',
          primaryGoal:      'general_fitness',
          secondaryGoals:   [],
          experienceLevel:  'some',
          typicalDuration:  '20_30',
          adaptationPreference: 'both',
          baselineWeightKg: 3,
          progressionMode:  'cycle_review',
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
      userASequencePointer:       0,
      userALastHeavyDate:         null,
      userALastHeavyRoutineId:    null,
      userALastActivityDate:      null,
      userAHeavyCounts: {
        eli_upper_push: 0,
        eli_lower_body: 0,
        eli_upper_pull: 0,
        eli_full_body:  0
      },
      userACircuitCount:          0,
      userACardioCount:           0,
      userAMobilityCount:         0,
      userAComboCount:            0,
      userAExerciseWeights:       {},
      userAExerciseRepsTarget:    {},
      userBSequencePointer: 0,
      userBLastActivityDate:null,
      userBRoutineCounts: {
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
// newly-added key (e.g. a new routine in userAHeavyCounts) is filled in on an
// existing save instead of silently staying undefined. The user's logged values
// always win; defaults only supply keys the save is missing.
const CYCLE_NESTED_KEYS = [
  'userAHeavyCounts',
  'userBRoutineCounts',
  'userAExerciseWeights',
  'userAExerciseRepsTarget'
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
    const legacyAdaptation = sp.trainingStyle === 'progressive' ? 'progress_when_ready'
      : sp.trainingStyle === 'pain_adaptive' ? 'daily_capacity' : null;
    out[id] = {
      ...dp,
      ...sp,
      weightOverridesKg: { ...(dp.weightOverridesKg ?? {}), ...(sp.weightOverridesKg ?? {}) },
      disabledExerciseIds: Array.isArray(sp.disabledExerciseIds)
        ? sp.disabledExerciseIds
        : (dp.disabledExerciseIds ?? []),
      secondaryGoals: Array.isArray(sp.secondaryGoals) ? sp.secondaryGoals : (dp.secondaryGoals ?? []),
      adaptationPreference: sp.adaptationPreference ?? legacyAdaptation ?? dp.adaptationPreference
    };
  }
  // Preserve any extra profiles a save might carry (future-proofing).
  for (const id of Object.keys(saved)) if (!out[id]) out[id] = saved[id];
  return out;
}

// ---- Legacy profile-id migration ---------------------------------------
// v0.5 renamed the two built-in profile ids from the original personal names
// to neutral userA/userB. Saves and JSON backups from before the rename carry
// the old ids as object KEYS (profiles.eli, cycleState.eliSequencePointer,
// exerciseLogs.eli, …), as scalar VALUES (session users, per-set log.userId,
// sessionType 'eli_only'), and nowhere else. This walks the whole tree once and
// remaps both, so historical logs and cycle counts survive the rename. Content
// ids ("eli_upper_push", "christina_gentle_upper") keep their prefix — the key
// rule only fires on the bare id or a camelCase compound, never on "eli_"/"christina_".
const LEGACY_ID_MAP = { eli: 'userA', christina: 'userB' };
const LEGACY_VALUE_MAP = {
  eli: 'userA', christina: 'userB',
  eli_only: 'userA_only', christina_only: 'userB_only'
};
function renameLegacyKey(key) {
  const m = key.match(/^(eli|christina)(?=[A-Z]|$)/);
  return m ? LEGACY_ID_MAP[m[1]] + key.slice(m[1].length) : key;
}
function migrateLegacyIds(value) {
  if (typeof value === 'string') return LEGACY_VALUE_MAP[value] ?? value;
  if (Array.isArray(value)) return value.map(migrateLegacyIds);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[renameLegacyKey(k)] = migrateLegacyIds(v);
    return out;
  }
  return value;
}

// Merge a parsed/loaded state object against defaults. Legacy profile ids are
// migrated first; then settings and cycleState (including its nested count maps)
// are forward-filled and the three collections are array-guarded so a malformed
// or older save can't leave them undefined.
function mergeAgainstDefaults(rawParsed) {
  const parsed = migrateLegacyIds(rawParsed);
  const d = getDefaultState();
  const merged = {
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
  // Audio files are not part of the public build. Normalize old backups that
  // selected chimes so the UI and workout controls consistently use Spotify's
  // external-link mode and never imply unavailable sound effects will play.
  if (!AUDIO_AVAILABLE) {
    merged.settings.audioEnabled = false;
    merged.settings.musicMode = 'spotify';
  }
  return merged;
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
    return { success: false, error: 'This does not look like a Movement backup.' };
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
