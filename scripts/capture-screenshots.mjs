// Regenerate the curated README gallery and social sharing image from the
// current app. This uses a fresh browser context so captures never contain
// personal workout data or depend on an existing local save.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'docs', 'screenshots');
const port = 4176;
const baseURL = `http://127.0.0.1:${port}`;

await mkdir(output, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit']
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Screenshot server did not start at ${baseURL}`);
}

const capture = (page, name) => page.screenshot({
  path: join(output, `${name}.jpg`),
  type: 'jpeg',
  quality: 90,
  fullPage: true
});

const captureCSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
  }
`;
const disableMotion = page => page.addStyleTag({ content: captureCSS });

async function seedPortfolioData(page) {
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('movementPractice'));
    const dateString = date => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const today = new Date();
    const cycleStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 16, 12);
    const cycleEnd = new Date(cycleStart);
    cycleEnd.setDate(cycleEnd.getDate() + 27);

    state.settings.launchDate = dateString(cycleStart);
    state.settings.currentCycleStart = dateString(cycleStart);
    state.settings.gettingStartedGuideCompleted = true;
    state.settings.lastBackupAt = new Date().toISOString();
    state.cycleState.startDate = dateString(cycleStart);
    state.cycleState.endDate = dateString(cycleEnd);
    state.cycleState.userASequencePointer = 2;
    state.cycleState.userBSequencePointer = 2;

    const offsets = [0, 2, 5, 7, 10, 13, 15];
    const painDays = ['low', 'low', 'medium', 'low', 'high', 'medium', 'low'];
    state.sessions = offsets.map((offset, index) => {
      const date = new Date(cycleStart);
      date.setDate(date.getDate() + offset);
      const painDay = painDays[index];
      const adjusted = painDay !== 'low';
      const effort = [2, 3, 3, 2, 4, 3, 2][index];
      const weight = index < 3 ? 5 : 5.5;
      return {
        id: `portfolio-session-${index + 1}`,
        date: dateString(date),
        status: 'completed',
        users: ['userA', 'userB'],
        userARoutineId: index % 3 === 1 ? 'strength_lower_body' : 'strength_upper_push',
        userARoutineType: index % 3 === 2 ? 'mobility_recovery' : 'heavy_weight',
        userBRoutineId: index % 2 ? 'adaptive_gentle_lower' : 'adaptive_gentle_upper',
        userBAdaptationLevel: adjusted ? 'reduced' : 'normal',
        profileCheckins: {
          userA: {
            capacity: { energy: index === 4 ? 'low' : 'medium', painDay, soreness: index === 5 ? 'medium' : 'low' },
            effort, jointPain: index === 5 ? 'mild' : 'no', adjustmentUsed: adjusted
          },
          userB: {
            capacity: { energy: index === 4 ? 'low' : 'medium', painDay, soreness: index === 2 ? 'medium' : 'low' },
            effort: Math.min(effort + 1, 5), jointPain: index === 4 ? 'moderate' : 'no', adjustmentUsed: adjusted
          }
        },
        userAEndCheckin: { formFatigue: effort, jointPain: index === 5 ? 'mild' : 'no', jointLocations: index === 5 ? ['Shoulder'] : [] },
        userBCheckin: { painDay, symptoms: index === 4 ? { fatigue: 5 } : {} },
        exerciseLogs: {
          userA: [{
            exerciseId: 'strength_incline_dumbbell_bench_press', exerciseName: 'Incline Dumbbell Bench Press', skipped: false,
            setLogs: [{ weightUsed: `${weight} kg per hand`, reps: index < 3 ? '8' : '9' }, { weightUsed: `${weight} kg per hand`, reps: '8' }]
          }],
          userB: [{
            exerciseId: 'adaptive_seated_dumbbell_press', exerciseName: 'Seated Dumbbell Press', skipped: false,
            setLogs: [{ weightUsed: '3 kg per hand', reps: '8' }]
          }]
        },
        meditation: index === 3 ? { completed: true, durationMinutes: 5 } : { completed: false }
      };
    });
    state.missedDays = [{
      id: 'portfolio-rest-day', date: dateString(new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate() + 4, 12)),
      users: ['userA', 'userB'], category: 'skip_rest'
    }];
    localStorage.setItem('movementPractice', JSON.stringify(state));
  });
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 460, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark'
  });
  const page = await context.newPage();

  await page.goto(baseURL);
  await disableMotion(page);
  await page.locator('#btn-launch').waitFor();
  await page.locator('[data-profile-count="two"]').click();
  await capture(page, 'onboarding');

  await page.locator('#btn-launch').click();
  await page.locator('[data-who="userA"]').waitFor();
  await page.locator('[data-guide-skip]').click();
  await seedPortfolioData(page);
  await page.reload();
  await disableMotion(page);
  await page.locator('[data-who="userA"]').waitFor();
  await capture(page, 'dashboard');

  await page.locator('[data-nav="reports"]').click();
  await page.getByRole('heading', { name: 'Tracker' }).waitFor();
  await capture(page, 'reports');

  await page.locator('[data-nav="hello"]').click();
  await page.locator('[data-who="userA"]').click();
  await page.getByRole('heading', { name: 'How are you feeling?' }).waitFor();
  await page.locator('#pain-picker [data-value="high"]').click();
  await page.locator('[data-symptom="fatigue"]').click();
  await capture(page, 'checkin');

  await page.locator('#btn-symptoms-done').click();
  await page.getByRole('heading', { name: 'Your routine' }).waitFor();
  await capture(page, 'adaptation');

  await page.setViewportSize({ width: 1280, height: 640 });
  await page.setContent(`<!doctype html>
    <html><head><style>
      * { box-sizing: border-box; }
      html, body { width: 1280px; height: 640px; margin: 0; overflow: hidden; }
      body {
        display: grid; grid-template-columns: 680px 600px; color: #eee9df;
        background: radial-gradient(circle at 72% 28%, #283129 0, #151b17 43%, #0e1310 100%);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .copy { padding: 76px 40px 70px 82px; position: relative; z-index: 2; }
      .brand { display: flex; align-items: center; gap: 17px; color: #d1aa64; }
      .brand img { width: 70px; height: 70px; border-radius: 17px; filter: brightness(1.18) saturate(1.08); box-shadow: 0 0 0 1px #8b7449, 0 10px 28px #0007; }
      .brand span { color: #eee9df; font: 600 30px/1 Georgia, serif; }
      .brand small { display: block; margin-top: 7px; color: #d1aa64; font: 700 13px/1 sans-serif; letter-spacing: .28em; text-transform: uppercase; }
      .eyebrow { margin-top: 70px; color: #a8b79a; font-size: 16px; font-weight: 750; letter-spacing: .17em; text-transform: uppercase; }
      h1 { max-width: 610px; margin: 17px 0 20px; font: 400 66px/1.02 Georgia, serif; letter-spacing: -.025em; }
      p { max-width: 610px; margin: 0; color: #c3beb3; font-size: 24px; font-weight: 450; line-height: 1.42; }
      .tags { display: flex; gap: 10px; margin-top: 34px; }
      .tags span { padding: 9px 13px; border: 1px solid #59665a; color: #e0dbd0; font-size: 14px; font-weight: 500; letter-spacing: .035em; }
      .phone { position: relative; width: 402px; height: 706px; margin: 20px 0 0 66px; overflow: hidden; border-radius: 28px; background: #111613; box-shadow: 0 28px 80px #000a, 0 0 0 1px #657066; }
      .phone img { width: 100%; display: block; }
      .phone::after { content: ""; position: absolute; inset: 0; border: 1px solid #657066; border-radius: inherit; pointer-events: none; }
      .rule { position: absolute; inset: auto 0 0; height: 4px; background: linear-gradient(90deg, #d1aa64, #7f9670, #705162); }
    </style></head><body>
      <main class="copy">
        <div class="brand"><img src="${baseURL}/icons/icon.svg" alt=""><div><span>Movement</span><small>Practice</small></div></div>
        <div class="eyebrow">Private · Adaptive · Offline</div>
        <h1>Movement that meets you where you are.</h1>
        <p>A local-first workout tracker that adapts each day to energy, soreness, pain, and symptoms.</p>
        <div class="tags"><span>No account</span><span>Two profiles</span><span>Zero runtime dependencies</span></div>
      </main>
      <div class="phone"><img src="${baseURL}/docs/screenshots/dashboard.jpg" alt=""></div>
      <div class="rule"></div>
    </body></html>`);
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
  await page.screenshot({ path: join(root, 'docs', 'social-preview.png'), type: 'png' });

  await context.close();
  console.log('Updated docs/screenshots/*.jpg and docs/social-preview.png');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
