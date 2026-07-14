import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Screenshots here are a debugging aid, regenerated on every run and not
// committed (see .gitignore). Curated README images live in docs/screenshots/.
const SHOTS = 'test-results/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Walk a brand-new install through onboarding (single "Just me" profile) and
// land on the Home dashboard. Returns once the dashboard is interactive.
async function onboard(page) {
  await page.goto('/');
  const launch = page.locator('#btn-launch');
  await expect(launch).toBeVisible();
  // "Just me" is the default selection; just start the cycle.
  await launch.click();
  await expect(page.locator('[data-who="userA"]')).toBeVisible();
}

test('onboarding lands on the dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btn-launch')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/onboarding.png`, fullPage: true });

  await onboard(page);
  // Bottom nav is present and the workout entry point is offered.
  await expect(page.locator('[data-nav="hello"]')).toBeVisible();
  await expect(page.locator('[data-nav="reports"]')).toBeVisible();
  await expect(page.locator('[data-nav="settings"]')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });
});

test('reports and settings screens render from the nav', async ({ page }) => {
  await onboard(page);

  await page.locator('[data-nav="reports"]').click();
  await expect(page.getByRole('heading', { name: 'Tracker' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/reports.png`, fullPage: true });

  await page.locator('[data-nav="settings"]').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
});

test('full JSON backup produces a download', async ({ page }) => {
  await onboard(page);
  // The full-backup export lives on the Tracker (reports) screen.
  await page.locator('[data-nav="reports"]').click();
  const exportBtn = page.locator('#btn-export-json');
  await exportBtn.scrollIntoViewIfNeeded();

  const downloadPromise = page.waitForEvent('download');
  await exportBtn.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^movement-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

// Regression guard for the selected-state contrast fix: the active segmented
// control must clear WCAG AA (4.5:1) against its own background in BOTH themes.
// (This is the exact defect that shipped in 0.6.0 — action-primary used as text
// on a dark surface measured 3.2:1.)
test('selected control text meets WCAG AA contrast in both themes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.mode-btn.active')).toBeVisible();

  for (const theme of ['night', 'day']) {
    const ratio = await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      // Force a style/layout flush so var()-derived colors re-resolve.
      void document.body.offsetHeight;
      const el = document.querySelector('.mode-btn.active');
      const cs = getComputedStyle(el);

      const ctx = document.createElement('canvas').getContext('2d');
      const toRGB = (str) => { ctx.fillStyle = '#000'; ctx.fillStyle = str; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

      // The button background is a translucent tint over the surface; composite
      // it by reading the actually-rendered backgroundColor.
      const fg = lum(toRGB(cs.color));
      const bg = lum(toRGB(cs.backgroundColor));
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    }, theme);

    expect(ratio, `contrast in ${theme} theme`).toBeGreaterThanOrEqual(4.5);
  }
});
