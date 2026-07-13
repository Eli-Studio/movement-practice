# Next Steps

Review checkpoint from July 13, 2026. The current development branch is functional,
deployable, and passes manual browser checks, including offline startup. These
items are intentionally deferred for the next development session.

## Completed — Protect active workouts

- Persist the in-progress session and workout runner state after meaningful
  changes, including completed sets, skipped exercises, timer state, and check-ins.
- Detect an interrupted workout during startup and offer **Resume** or **Discard**.
- Clear the draft only after a session is finalized or explicitly discarded.
- Manual browser checks cover reload/resume, paused rest timers, partial
  check-ins, discard, and final draft cleanup.

## Completed — Align the public audio experience

- Audio capability is explicitly disabled for this public build, so it creates no
  media elements and makes no missing-asset requests.
- Chime controls are hidden and Settings accurately describes silent operation.
- Warm-up and meditation timers remain available without bundled audio, while an
  optional Spotify URL still provides an external music shortcut.

## Priority 3 — Add release checks

- Add unit tests for storage migration, cycle rotation, workout plan generation,
  capacity adaptation, and exports.
- Keep a legacy `0.4.x` backup fixture and test its migration to neutral profile
  IDs (`userA` and `userB`).
- Add data-integrity checks for duplicate IDs and missing exercise, equipment, and
  substitution references.
- Add a small browser smoke suite covering onboarding, a single-user workout,
  a paired workout, interrupted-workout recovery, reports, backup restore, and
  offline startup.
- Run syntax, data, and smoke checks in GitHub Actions before Pages deployment.

## Priority 4 — Hardening and cleanup

- Update the persisted schema version to match the displayed app version and make
  future migrations explicitly versioned.
- Neutralize spreadsheet formula prefixes in user-controlled CSV fields.
- Add accessible grouping and selected-state semantics to training-experience and
  adaptation-preference controls.
- Keep README compatibility wording aligned with the neutral profile-ID migration.

## Verified at this checkpoint

- JavaScript syntax and JSON parsing pass.
- The data graph contains 84 exercises, 14 routines, and 7 equipment records with
  no broken references found.
- Legacy profile IDs migrate successfully in profiles, cycle state, sessions, and
  exercise logs.
- Onboarding, capacity check-in, routine suggestion, workout startup, Settings,
  workout recovery, Settings, and offline reload work in browser testing.
- No committed secrets or unexpected third-party runtime requests were found.
