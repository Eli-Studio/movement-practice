# Morning Circuit

A static, local-first workout tracker for two profiles. It includes routine rotation, timers, symptom check-ins, cycle reports, and JSON/CSV/Markdown exports.

## Privacy and backups

Records stay in the current browser's `localStorage`; there is no account, server, upload, or device sync. Different browsers, devices, and hostnames have separate data. Use **Settings → Full JSON Backup** regularly and restore the JSON separately on each device.

## Health notice

Adaptations and readiness labels are app-defined training heuristics, not medical advice. Stop exercising and seek appropriate medical help for chest pain, faintness, sharp pain, or severe or new symptoms.

## GitHub Pages

The included workflow deploys `main` through GitHub Actions. In repository **Settings → Pages**, set **Source** to **GitHub Actions**. The service worker caches the app shell after the first successful visit. Chart.js is cached at runtime after reports are opened online.

Audio assets are intentionally not included in this public release. The app continues to work silently. Internal profile and routine identifiers retain their legacy names so backups remain compatible.

No open-source license has been assigned; all rights are reserved unless a license is added later.
