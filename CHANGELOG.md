# Changelog

All notable changes to Movement Practice are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] — 2026-07-13

### Fixed
- Selected/active controls failed WCAG AA color contrast (dark accent used as
  text on dark surfaces, ~3.2:1, dimmer than the unselected option). Repointed to
  a theme-aware token — now ~8.6:1 in both Night and Day themes.
- A session missing its `users` array no longer crashes the dashboard, and
  malformed backups are rejected on import with a clear message.

### Changed
- Active Symptoms buttons are text-only, with a yellow/gold selected state
  (previously mauve) that matches the accent used elsewhere.
- Warm-up length is now a 5–15 minute slider (default 5) instead of a fixed
  5 minutes; the timer runs for the chosen length.
- The cycle ring is drawn as a single ring split into four quadrants that fill
  by cycle week 1–4, replacing the day-based arc.
- Energy, soreness, and pain-level button labels are vertically centered.
- Renamed the `localStorage` key `morningCircuit` → `movementPractice`, with a
  one-time automatic migration so existing history carries over.

### Added
- MIT license.
- Playwright behavioral test suite (onboarding, navigation, backup export, and a
  WCAG-AA contrast regression guard), wired into CI.
- `npm run serve` — a zero-dependency local static server.
- `ARCHITECTURE.md` and a rewritten, portfolio-oriented `README.md`.

### Internal
- Unified module cache-busting: removed inconsistent `?v=` import query strings
  (which spawned duplicate module instances and left a service-worker precache
  gap) in favor of the single service-worker cache-version constant.

## [0.6.0] — 2026-07-13

Initial public demo.

### Added
- One- or two-profile onboarding with an optional guided first workout.
- Daily capacity check-in (energy, soreness, joint pain, symptoms) that adapts
  only that day's plan.
- Rotating strength and adaptive routines, weight/rep tracking, rest and warm-up
  timers, and guided meditation.
- Interrupted-workout Resume and Discard recovery.
- Four-week cycle reports and readiness trends (locally vendored Chart.js).
- Device-local storage, full JSON backup/restore, and per-month CSV/Markdown
  exports with spreadsheet-formula-injection safety.
- Day and Night themes, applied before first paint.
- Keyboard-operable controls, accessible names/selected states, focus handling,
  visible focus indicators, and reduced-motion support.
- Dependency-free automated release checks in pull requests and before deploys.

[0.6.1]: https://github.com/Eli-Studio/movement-practice/releases/tag/v0.6.1
[0.6.0]: https://github.com/Eli-Studio/movement-practice/releases/tag/v0.6.0
