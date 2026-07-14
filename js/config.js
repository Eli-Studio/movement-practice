// ============================================================
// config.js — App constants and configuration
// ============================================================

export const APP_VERSION = '0.6.0';
// Current localStorage key. Older builds shipped under the 'morningCircuit'
// project codename; loadState() migrates those saves forward (see
// LEGACY_STORAGE_KEYS) so no history is stranded by the rename.
export const STORAGE_KEY = 'movementPractice';
export const LEGACY_STORAGE_KEYS = ['morningCircuit'];
export const CYCLE_LENGTH_DAYS = 28;

export const USERA_HEAVY_SEQUENCE = [
  'strength_upper_push',
  'strength_lower_body',
  'strength_upper_pull',
  'strength_full_body'
];

export const USERB_SEQUENCE = [
  'adaptive_gentle_upper',
  'adaptive_gentle_lower',
  'adaptive_gentle_pull_posture',
  'adaptive_gentle_full_body'
];

export const SCREENS = {
  FIRST_LAUNCH:       'first_launch',
  RESUME_WORKOUT:     'resume_workout',
  HELLO:              'hello',
  MISSED_DAYS:        'missed_days',
  LOG_TODAY:          'log_today',
  SYMPTOM_CHECK:      'symptom_check',
  ROUTINE_SUGGESTION: 'routine_suggestion',
  WARMUP:             'warmup',
  WORKOUT_RUNNER:     'workout_runner',
  END_CHECKIN:        'end_checkin',
  MEDITATION:         'meditation',
  SESSION_SUMMARY:    'session_summary',
  CYCLE_REVIEW:       'cycle_review',
  REPORTS:            'reports',
  SETTINGS:           'settings'
};

export const FATIGUE_SCALE = [
  { value: 1, label: 'Too Easy',              description: 'Could have done much more' },
  { value: 2, label: 'Manageable',            description: 'Solid work, had more in the tank' },
  { value: 3, label: 'Challenging but Clean', description: 'Form solid throughout' },
  { value: 4, label: 'Very Hard',             description: 'Struggled to maintain form at end' },
  { value: 5, label: 'Form Started Breaking Down', description: 'Form degraded. Consider reducing weight next time.' }
];

export const JOINT_PAIN_OPTIONS = [
  { value: 'no',              label: 'None' },
  { value: 'mild',            label: 'Mild' },
  { value: 'moderate',        label: 'Moderate' },
  { value: 'sharp_concerning',label: 'Sharp / Concerning' }
];

export const JOINT_PAIN_LOCATIONS = [
  'Shoulder', 'Elbow', 'Wrist', 'Lower Back', 'Upper Back', 'Hip', 'Knee', 'Ankle', 'Other'
];

// Canonical symptom vocabulary — single source of truth for the check-in screen,
// reports, and the symptom→exercise conflict matrix. Ids are camelCase; the
// reports resolver also matches snake_case variants in stored data (e.g.
// "joint_pain" resolves to "jointPain"), so historical logs stay readable.
export const USERB_SYMPTOMS = [
  { id: 'dizziness',          icon: 'spiral', label: 'Dizziness'        },
  { id: 'jointPain',          icon: 'joint', label: 'Joint Pain'       },
  { id: 'muscleAche',         icon: 'tension', label: 'Muscle Ache'    },
  { id: 'fatigue',            icon: 'rest', label: 'Fatigue'           },
  { id: 'headache',           icon: 'head', label: 'Headache'          },
  { id: 'brainFog',           icon: 'fog', label: 'Brain Fog'          },
  { id: 'nausea',             icon: 'wave', label: 'Nausea'            },
  { id: 'sensitivityToLight', icon: 'light', label: 'Light Sensitivity'}
];

export const HIGH_SYMPTOM_THRESHOLD = 4;

export const MISSED_DAY_CATEGORIES = [
  { id: 'skip_rest',   label: 'Skip / Rest' },
  { id: 'vr_exercise', label: 'VR Exercise' },
  { id: 'adventure',   label: 'Adventure' },
  { id: 'other',       label: 'Other' }
];

// Activity colors resolve to CSS custom properties (defined per-theme in
// styles.css) so calendar dots and legends re-theme with Day/Night for free.
// Keys stay on their legacy names for saved-data compatibility; the values
// are analog-palette roles, not the old vibrant hues.
export const ACTIVITY_COLORS = {
  strength_heavy:           'var(--activity-strength)',
  strength_circuit:         'var(--activity-circuit)',
  strength_combo:           'var(--activity-combo)',
  strength_cardio:          'var(--activity-cardio)',
  strength_mobility:        'var(--activity-mobility)',
  adaptive_normal:    'var(--activity-full)',
  adaptive_reduced:   'var(--activity-adapted)',
  adaptive_recovery:  'var(--activity-recovery)',
  skip_rest:           'var(--activity-rest)',
  vr_exercise:         'var(--activity-vr)',
  adventure:           'var(--activity-adventure)',
  other:               'var(--activity-other)',
  meditation:          'var(--activity-meditation)'
};

export const DEFAULT_REST_SECONDS = 120;

// This public distribution intentionally ships without audio assets. Keeping
// the capability explicit lets audio.js avoid constructing HTMLAudioElements,
// which would otherwise trigger a burst of guaranteed 404 requests at startup.
export const AUDIO_AVAILABLE = false;

// Exercise audio: marimba chime — fires only at warmup end and meditation natural end.
// Removed from rest timers and exercise duration timers to avoid interfering with music.
export const AUDIO_FILES = {
  timerComplete:  'audio/timer-complete.mp3',
  sessionComplete:'audio/session-complete.mp3',
  buttonClick:    'audio/Button Click.mp3'
};

// Meditation tracks alternate v1 → v2 → v1 … on a loop.
// Also used for the shared warm-up screen.
export const MEDITATION_TRACKS = [
  'audio/meditation-v1.mp3',
  'audio/meditation-v2.mp3'
];

// Above this many unlogged days, the missed-days screen collapses the per-day
// "What happened?" ledger into a single welcome-back card. Facing a wall of
// past days is exactly the wrong greeting after a long lapse — the comeback
// is the moment the app must be gentlest.
export const MISSED_DAYS_COMPACT_THRESHOLD = 7;

// Backup safety nudge (Hello screen): remind when the last full JSON export
// is this many days old. Everything lives in localStorage, which the browser
// can evict silently — the nudge keeps the safety net from going stale.
export const BACKUP_NUDGE_DAYS = 7;
// Don't nag a brand-new install before there's anything worth saving.
export const BACKUP_NUDGE_MIN_SESSIONS = 3;

// Weight stepper increment (kg) used in the workout runner.
export const WEIGHT_STEP_KG = 0.5;

// Suggested weight bump (kg) per anchor lift at cycle review, when readiness is green.
// Suggested weight bump (kg) per anchor lift at cycle review, once the rep
// target has topped out its range. 0.5kg matches the smallest real jump
// achievable with User A's plate set (1kg / 1.5kg / 2kg, mix and match).
export const CYCLE_PROGRESSION_STEP_KG = 0.5;
