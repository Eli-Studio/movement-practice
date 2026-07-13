# Movement Practice

A static, local-first movement practice tracker for one or two profiles. It includes routine rotation, timers, capacity check-ins, interrupted-workout recovery, four-week cycle reports, and JSON/CSV/Markdown exports. New installs can start with one profile and add a second later; turning off the second profile keeps its settings and history intact.

The optional getting-started guide explains the important settings and leads into a short two-exercise workout. Daily capacity defaults are medium energy, low pain, low soreness, and no active symptoms; each check-in affects only that day's plan.

Deferred engineering work and the latest review checkpoint are tracked in [NEXT_STEPS.md](NEXT_STEPS.md).

## Privacy and backups

Records stay in the current browser's `localStorage`; there is no account, server, upload, or device sync. Different browsers, devices, and hostnames have separate data. Use **Settings → Full JSON Backup** regularly and restore the JSON separately on each device.

## Health notice

Adaptations and readiness labels are app-defined training heuristics, not medical advice. Stop exercising and seek appropriate medical help for chest pain, faintness, sharp pain, or severe or new symptoms.

## GitHub Pages

The included workflow deploys `main` through GitHub Actions. In repository **Settings → Pages**, set **Source** to **GitHub Actions**. The service worker caches the app shell after the first successful visit. Chart.js is vendored locally (`js/vendor/chart.umd.min.js`), so the app makes no third-party network requests and works fully offline.

Audio assets are intentionally not included in this public release. The app does not request missing audio files, chime controls are hidden, and warm-up and meditation timers continue to work silently. Internal profile and routine identifiers retain their legacy names so backups remain compatible.

## Licenses

No open-source license has been assigned; all rights are reserved unless a license is added later.
