# Roadmap and Release Checkpoint

Version 0.6.1 is the latest tagged release. The deployed `main` branch also
contains the accepted candidate Home OS design foundation planned for the next
minor release. It is functional, deployable, and covered by automated phone-first
flows plus deterministic portfolio captures.

## Completed through 0.6.1

- One- or two-profile onboarding with an optional guided first workout.
- Daily capacity choices with transparent defaults.
- Single and paired workouts, timers, cycle rotation, reports, and exports.
- Interrupted-workout **Resume** and **Discard** recovery.
- Device-local storage, full JSON backup, and structural migration of older saves.
- Neutral public exercise, routine, report, export, and activity identifiers.
- Keyboard-operable controls, accessible names and selected states, focus handling,
  calendar descriptions, visible focus indicators, and reduced-motion support.
- Responsive layouts at 320, 390, 768, and 1440 pixels, including 44px paired
  workout controls at the narrowest tested width.
- Accessible Day and Night color combinations for confirmed text and control cases.
- Spreadsheet-safe CSV cells for profile names and free-text notes.
- Dependency-free automated release checks in pull requests and before Pages deploys.

## Completed on main after 0.6.1

- Candidate shared Home OS semantic tokens with Night and sunlit-relic Day modes.
- Movement-owned stone-sanctuary presentation, teal/amethyst profile identity,
  concentric cycle instrument, and animated timer labyrinths.
- Accessible ancient-tech workout hardware with rendered contrast coverage for
  both profiles in both themes.
- A redesigned icon family plus regenerated README and social-preview imagery.
- Scoped service-worker cleanup that preserves sibling Home OS caches sharing an origin.

## Release procedure

1. Run `npm test` and `npm run test:e2e` locally.
2. Regenerate and inspect documentation imagery with `npm run screenshots`.
3. Merge the release branch into `main`.
4. Confirm the GitHub Pages workflow succeeds.
5. On the deployed HTTPS URL, smoke-test fresh onboarding, one short workout,
   resume/discard, backup restore, second-profile controls, paired phone layout,
   install, and offline reload.
6. Tag the verified commit with the next semantic version (`0.7.0` for the current
   candidate design-system release).

## Portfolio and release tooling

- MIT license ([LICENSE](LICENSE)).
- Playwright behavioral smoke tests ([tests/e2e/](tests/e2e)) covering onboarding,
  navigation, backup export, cycle and timer instruments, and rendered Night/Day
  contrast for selected and paired workout controls, wired into CI.
- Zero-dependency local static server (`npm run serve`).
- Architecture overview ([ARCHITECTURE.md](ARCHITECTURE.md)).
- Reproducible README screenshots and social preview (`npm run screenshots`).

## Intentionally deferred beyond the demo

- Extending the browser suite from smoke coverage to every complete workflow
  (full paired workout, cycle rollover, resume/discard edge cases).
- Styled in-app dialogs in place of native browser confirm/prompt dialogs.
- Physical-device Safari and installed-PWA regression coverage.
- Explicitly versioned migration functions for every future schema release.
