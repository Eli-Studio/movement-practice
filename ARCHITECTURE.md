# Architecture

A tour of how Movement Practice is put together. The app is a single-page,
offline-first PWA written in vanilla ES modules — no framework, no build step,
one vendored chart library. This document is the map a reviewer needs to move
through ~8.7k lines quickly.

## The big picture

```
index.html ──loads──▶ js/app.js  (orchestrator: state + router + event wiring)
                          │
        ┌─────────────────┼──────────────────────────────┐
        ▼                 ▼                                ▼
   js/screens.js     domain modules                  js/storage.js
   (render → HTML)   (compose a plan)                (persist + migrate)
                          │
   data/*.json ──▶ js/data.js ──▶ rotation ▶ adaptation ▶ equipment ▶ workout
```

There is one global, `window.App`, holding three things:

- `App.state` — the persisted document (settings, profiles, cycle state, sessions).
- `App.ui` — ephemeral per-session view state (current screen, selections, calendar month).
- `App.data` — the static content graph (exercises, routines, equipment) loaded once.

## Rendering model

The app is a **string-rendering SPA**. There is no virtual DOM and no component
framework:

1. `navigate(screen)` in [`app.js`](js/app.js) calls the matching `render*`
   function in [`screens.js`](js/screens.js), which returns an HTML **string**.
2. That string is assigned to `#app.innerHTML`.
3. A single `setupListeners()` pass re-attaches event handlers for the new screen
   (event delegation where practical), and focus/scroll are restored.

All user-supplied text (profile names, notes, Spotify URL) is passed through
`escapeHtml()` at interpolation time, so `innerHTML` rendering stays safe. A few
cross-cutting listeners (button-tap sound, save-error toast, draft persistence on
`visibilitychange`/`pagehide`) are registered once, outside the per-screen pass.

**Why strings, not a framework?** It keeps the app dependency-free and the whole
render path inspectable in one file. The trade-off — full re-render per navigation
— is a non-issue at this scale (one or two users, a handful of screens).

## How a day's plan is composed

The interesting domain logic is the pipeline that turns "how do you feel today?"
into a concrete workout:

1. **Rotation** — [`rotation.js`](js/rotation.js) picks the next routine from the
   28-day sequence based on cycle pointers and history.
2. **Capacity + symptoms** — the check-in screens populate `App.ui` capacity
   choices; [`adaptation.js`](js/adaptation.js) applies a symptom→exercise
   conflict matrix and scales or swaps movements, or drops to a recovery routine.
3. **Equipment** — [`equipment.js`](js/equipment.js) resolves conflicts when two
   profiles train together and would contend for the same equipment.
4. **Plan + session** — [`workout.js`](js/workout.js) builds the concrete exercise
   plan (weights from per-exercise overrides → profile baseline → defaults) and
   creates the session object the runner mutates.
5. **Close-out** — on completion, [`cycles.js`](js/cycles.js) updates cycle
   counters and progression, and the session is appended and persisted.

## State & persistence

- **One key.** The whole document is a single JSON blob in `localStorage`
  (`movementPractice`). [`storage.js`](js/storage.js) owns load/save.
- **Forward-fill on load.** `mergeAgainstDefaults()` merges any saved document
  against the current defaults — deep-merging nested cycle count maps and
  per-profile fields — so a save from an older schema gains every current field
  without clobbering the user's values.
- **Legacy migration.** Older builds shipped under a project codename key; loading
  copies that save forward to the current key once, then retires the old key.
  Legacy content namespaces are inferred from stable routine suffixes and rewritten.
- **Validated imports.** Restored JSON backups are size-capped and validated
  field-by-field (`validateBackup`) before being trusted — a malformed backup is
  rejected with a message rather than crashing the app.
- **Crash recovery.** An in-progress workout is snapshotted to `workoutDraft` on
  tab hide/close; on next launch the app offers **Resume** or **Discard**.

## Offline & caching

[`service-worker.js`](service-worker.js) precaches the app shell and data files on
install and serves them offline. A single `CACHE` version constant is the only
cache-busting mechanism — module URLs carry no per-file query strings. Bump that
constant whenever a precached asset changes; the worker then wipes older caches on
activate. Chart.js is vendored under `js/vendor/`, so the app makes zero
third-party network requests.

## Testing

- [`scripts/release-check.mjs`](scripts/release-check.mjs) — **dependency-free**
  gate: JS syntax, the exercise/routine/equipment reference graph, version
  alignment, backup-migration round-trip, and CSV formula-injection safety.
- [`tests/e2e/`](tests/e2e) — **dev-only** Playwright behavioral tests (onboarding,
  navigation, backup download, and a WCAG-AA contrast regression guard), driven
  through the zero-dep static server in [`scripts/serve.mjs`](scripts/serve.mjs).

## Module reference

| Module | Responsibility |
|---|---|
| `app.js` | Orchestrator: global state, screen router, event wiring, bootstrap |
| `screens.js` | Pure `render*` functions returning HTML strings |
| `storage.js` | localStorage load/save, schema forward-fill, migration, backup validation |
| `data.js` | Loads the static `data/*.json` content graph |
| `rotation.js` | Routine rotation and next-session suggestions |
| `adaptation.js` | Capacity/symptom adaptation and the conflict matrix |
| `cycles.js` | 28-day cycle state, counters, and progression |
| `workout.js` | Exercise-plan construction, sessions, sets, weight/rep logic |
| `equipment.js` | Shared-equipment conflict resolution for paired workouts |
| `reports.js` | Readiness scoring and chart rendering |
| `exports.js` | JSON / CSV / Markdown export (CSV injection-safe) |
| `audio.js` | iOS-safe audio unlocking and playback |
| `timer.js` | Rest / exercise / meditation timers |
| `profiles.js` | Profile ids and active-profile helpers |
| `config.js` | Constants, sequences, and content vocabulary |
| `utils.js` | Dates, formatting, `escapeHtml`, toasts, UUIDs |
