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

async function setThemeWithoutTransitions(page, theme) {
  await page.evaluate((nextTheme) => {
    if (!document.querySelector('#e2e-disable-transitions')) {
      const style = document.createElement('style');
      style.id = 'e2e-disable-transitions';
      style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.append(style);
    }
    document.documentElement.setAttribute('data-theme', nextTheme);
  }, theme);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function contrastRatio(locator) {
  return locator.evaluate((el) => {
    const parseRGB = value => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error(`Unable to parse computed color: ${value}`);
      return channels;
    };
    const luminance = value => parseRGB(value)
      .map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const styles = getComputedStyle(el);
    const foreground = luminance(styles.color);
    const background = luminance(styles.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
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
  await expect(page.getByRole('link', { name: 'Eli-Studio' }))
    .toHaveAttribute('href', 'https://github.com/Eli-Studio');
  await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });
});

test('cycle progress uses four concentric week rings across the app', async ({ page }) => {
  await onboard(page);

  await expect(page.locator('.four-week-cycle--medium .cycle-ring__track')).toHaveCount(4);
  await expect(page.locator('.four-week-cycle--medium .cycle-ring__progress')).toHaveCount(4);
  await expect(page.locator('.four-week-cycle--medium .cycle-quadrant')).toHaveCount(0);

  await page.locator('[data-guide-skip]').click();
  await page.locator('[data-who="userA"]').click();
  await page.locator('#btn-symptoms-done').click();
  await page.locator('#btn-start-workout').click();
  await page.locator('#btn-warmup-skip').click();

  await expect(page.locator('.four-week-cycle--compact .cycle-ring__track')).toHaveCount(4);
  await expect(page.locator('.four-week-cycle--compact .cycle-ring__progress')).toHaveCount(4);
  await expect(page.locator('.four-week-cycle--compact .cycle-quadrant')).toHaveCount(0);
});

test('warm-up timer wakes the orb and molten ring instrument', async ({ page }) => {
  await onboard(page);
  await page.locator('[data-guide-skip]').click();
  await page.locator('[data-who="userA"]').click();
  await page.locator('#btn-symptoms-done').click();
  await page.locator('#btn-start-workout').click();

  await expect(page.getByRole('heading', { name: 'Warm-Up' })).toBeVisible();
  await page.locator('#btn-warmup-begin').click();
  await expect(page.locator('#warmup-orb')).toHaveClass(/is-running/);
  await expect(page.locator('#warmup-timer-instrument')).toBeVisible();
  await expect(page.locator('#warmup-timer-instrument .timer-labyrinth__ring')).toHaveCount(4);
  await page.screenshot({ path: `${SHOTS}/warmup-running.png`, fullPage: true });
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
    await setThemeWithoutTransitions(page, theme);
    const ratio = await contrastRatio(page.locator('.mode-btn.active'));

    expect(ratio, `contrast in ${theme} theme`).toBeGreaterThanOrEqual(4.5);
  }
});

test('paired workout hardware meets WCAG AA contrast in both themes', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-profile-count="two"]').click();
  await page.locator('#btn-launch').click();

  const guideSkip = page.locator('[data-guide-skip]');
  if (await guideSkip.isVisible()) await guideSkip.click();
  await page.locator('[data-who="both"]').click();
  await page.locator('#btn-symptoms-done').click();
  await page.locator('#btn-symptoms-done').click();
  await page.locator('#btn-start-workout').click();
  await page.locator('#btn-warmup-skip').click();

  await expect(page.locator('.paired-panel')).toHaveCount(2);
  for (const user of ['userA', 'userB']) {
    await page.locator(`.paired-panel--${user} .paired-set-dot.current`).evaluate(el => {
      el.classList.remove('current');
      el.classList.add('done');
    });
  }

  const controls = [
    '#btn-end-workout-early',
    '.paired-panel--userA .paired-complete-btn',
    '.paired-panel--userB .paired-complete-btn',
    '.paired-panel--userA .weight-btn',
    '.paired-panel--userB .weight-btn',
    '.paired-panel--userA .paired-set-dot.done',
    '.paired-panel--userB .paired-set-dot.done'
  ];

  for (const theme of ['night', 'day']) {
    await setThemeWithoutTransitions(page, theme);
    await page.screenshot({ path: `${SHOTS}/paired-workout-${theme}.png`, fullPage: true });
    for (const selector of controls) {
      const target = page.locator(selector).first();
      await expect(target).toBeVisible();
      const ratio = await contrastRatio(target);
      expect(ratio, `${selector} contrast in ${theme} theme`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
