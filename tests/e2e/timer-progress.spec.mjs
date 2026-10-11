import { test, expect } from '@playwright/test';

// Timer labyrinth progress (#15). Playwright's fake clock drives the app's 1s
// intervals so --timer-progress can be read at exact elapsed fractions. Tests
// assert the progress property and computed ring gradient, never the glow.

const progressOf = locator =>
  locator.evaluate(el => Number(el.style.getPropertyValue('--timer-progress')));

// First three gradient stops of one ring: "0% 72% 100%" is full, "0% 0% 0%" empty.
const ringStops = (locator, index) =>
  locator.locator('.timer-labyrinth__ring').nth(index)
    .evaluate(el => getComputedStyle(el).backgroundImage.match(/[\d.]+%/g).slice(0, 3).join(' '));

// clock.install() still lets time flow in real time; pause it so runFor() is
// the only thing advancing the app's intervals.
async function freezeClock(page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
}

async function startSingleWorkout(page) {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#btn-launch').click();
  await page.locator('[data-guide-skip]').click();
  await page.locator('[data-who="userA"]').click();
  await page.locator('#btn-symptoms-done').click();
  await page.locator('#btn-start-workout').click();
  await page.locator('#btn-warmup-skip').click();
  await freezeClock(page);
}

async function startPairedWorkout(page) {
  await page.clock.install();
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
  await freezeClock(page);
}

// Make every exercise an 8s timed hold with 8s rest so progress lands on round
// fractions. Takes effect on the next workout re-render.
async function useEightSecondTimers(page, users) {
  await page.evaluate(users => {
    for (const user of users) {
      App.workoutState[user].exercises.forEach(ex => { ex.durationSeconds = 8; });
    }
    App.state.settings.defaultRestSeconds = 8;
  }, users);
}

test('single-user exercise and rest rings track elapsed time', async ({ page }) => {
  await startSingleWorkout(page);
  await useEightSecondTimers(page, ['userA']);
  await page.locator('#btn-skip-exercise').click();

  const exercise = page.locator('#userA-ex-countdown-instrument');
  await expect(exercise).toBeVisible();
  expect(await progressOf(exercise)).toBe(0);
  await page.clock.runFor(2000);
  expect(await progressOf(exercise)).toBeCloseTo(0.25);
  await page.clock.runFor(4000);
  expect(await progressOf(exercise)).toBeCloseTo(0.75);

  // Completion holds a full, visible ring.
  await page.clock.runFor(2000);
  expect(await progressOf(exercise)).toBe(1);
  await expect(exercise).toBeVisible();
  await expect(page.locator('#userA-ex-countdown')).toHaveText('✓ Done');

  await page.locator('#btn-complete-set').click();
  const rest = page.locator('#rest-time-instrument');
  await expect(rest).toBeVisible();
  expect(await progressOf(rest)).toBe(0);
  await page.clock.runFor(2000);
  expect(await progressOf(rest)).toBeCloseTo(0.25);
  await page.clock.runFor(4000);
  expect(await progressOf(rest)).toBeCloseTo(0.75);
});

test('paired exercise and rest rings survive re-renders', async ({ page }) => {
  await startPairedWorkout(page);
  await useEightSecondTimers(page, ['userA', 'userB']);
  await page.locator('[data-skip="userA"]').click();
  await page.locator('[data-skip="userB"]').click();

  const exercise = page.locator('#userA-ex-countdown-instrument');
  await expect(exercise).toBeVisible();
  await page.clock.runFor(4000);
  expect(await progressOf(exercise)).toBeCloseTo(0.5);
  await page.clock.runFor(4000);
  expect(await progressOf(exercise)).toBe(1);
  await expect(exercise).toBeVisible();

  // userB's finished countdown stays full after userA's action re-renders.
  await page.locator('#userA-complete-btn').click();
  const partnerExercise = page.locator('#userB-ex-countdown-instrument');
  await expect(partnerExercise).toBeVisible();
  expect(await progressOf(partnerExercise)).toBe(1);

  const rest = page.locator('#userA-rest-display-instrument');
  await expect(rest).toBeVisible();
  await page.clock.runFor(4000);
  expect(await progressOf(rest)).toBeCloseTo(0.5);

  // A partner action mid-rest re-renders both panels; progress must continue.
  await page.locator('[data-skip="userB"]').click();
  expect(await progressOf(rest)).toBeCloseTo(0.5);
  await page.clock.runFor(2000);
  expect(await progressOf(rest)).toBeCloseTo(0.75);
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('rings show accurate static progress through completion', async ({ page }) => {
    await startSingleWorkout(page);
    await useEightSecondTimers(page, ['userA']);
    await page.locator('#btn-skip-exercise').click();

    const exercise = page.locator('#userA-ex-countdown-instrument');
    await page.clock.runFor(6000);
    expect(await progressOf(exercise)).toBeCloseTo(0.75);
    expect(await Promise.all([0, 1, 2, 3].map(i => ringStops(exercise, i))))
      .toEqual(['0% 72% 100%', '0% 72% 100%', '0% 72% 100%', '0% 0% 0%']);

    await page.clock.runFor(2000);
    expect(await progressOf(exercise)).toBe(1);
    expect(await Promise.all([0, 1, 2, 3].map(i => ringStops(exercise, i))))
      .toEqual(Array(4).fill('0% 72% 100%'));
  });
});
