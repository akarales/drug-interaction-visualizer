// Records docs/demo.gif: one clinician flow in ~15 s against the running
// dev app (pnpm dev + the API on the real dataset).
//
//   cd frontend
//   pnpm exec playwright install ffmpeg            # once (tool, not a dependency)
//   DEMO_MODEL=ollama:qwen3:8b node scripts/record-demo.mjs   # default: stub
//
// Flow: add fluconazole to warfarin → regimen check + FDA direction →
// add simvastatin + clarithromycin → contraindication alert → documented
// override → streamed clinician + patient explanation.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const BASE = process.env.DEMO_URL ?? 'http://localhost:5173';
const OUT = new URL('../../docs/demo.gif', import.meta.url).pathname;
const [provider, ...model] = (process.env.DEMO_MODEL ?? 'stub:stub').split(':');
const size = { width: 1280, height: 800 };

// warm the model first so the recording shows streaming, not model loading
if (provider !== 'stub') {
  const res = await fetch(`${BASE}/api/v1/explain/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ drug_a: 'warfarin', drug_b: 'aspirin', provider, model: model.join(':') }),
  });
  await res.text();
}

const dir = mkdtempSync(join(tmpdir(), 'ddi-demo-'));
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH ?? '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
await context.addInitScript(
  ([p, m]) => localStorage.setItem('ddi.model-choice', JSON.stringify({ provider: p, model: m })),
  [provider, model.join(':')],
);
const page = await context.newPage();
const started = Date.now();
await page.goto(`${BASE}/?meds=warfarin`);
await page.getByRole('region', { name: 'Medication 1' }).getByText('Warfarin').waitFor();
await page.waitForTimeout(1200);
const lead = (Date.now() - started) / 1000 - 0.6; // trim the blank page load

const add = async (name) => {
  await page.getByRole('button', { name: 'Add another medication' }).click();
  await page.keyboard.type(name, { delay: 35 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
};

await add('fluconazole');
await page.waitForTimeout(900);
await add('simvastatin');
await add('clarithromycin');

const alert = page.getByRole('alertdialog');
await alert.waitFor();
await page.waitForTimeout(1300);
await alert.getByRole('radio', { name: 'Specialist recommendation' }).click();
await page.waitForTimeout(400);
await alert.getByRole('button', { name: 'Override & keep both' }).click();
await page.waitForTimeout(700);

const inspector = page.getByRole('complementary', { name: 'Inspector' });
await page.getByRole('region', { name: 'Regimen check' }).getByText('Warfarin + Fluconazole').click();
await inspector.getByText('Direction', { exact: true }).scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
await inspector.getByRole('button', { name: 'Explain for clinician + patient' }).click();
await inspector.getByRole('region', { name: 'For the clinician' }).waitFor({ timeout: 60_000 });
await inspector.getByRole('region', { name: 'For the clinician' }).scrollIntoViewIfNeeded();
await inspector.getByRole('button', { name: 'Explain again' }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(1500);

const video = await page.video().path();
await context.close();
await browser.close();

// webm → GIF (< 3 MB): played 1.6× (≈ 15–20 s), 8 fps; denoise the lossy
// webm and drop near-duplicate frames (kept as longer delays), 780 px, 64 colours
const filters =
  'setpts=PTS/1.6,fps=8,hqdn3d=3:3:8:8,mpdecimate=hi=64*24:lo=64*8:frac=0.2,scale=780:-1:flags=lanczos,' +
  'split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle';
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, lead)), '-i', video, '-vf', filters, '-fps_mode', 'vfr', '-loop', '0', OUT]);
copyFileSync(video, join(tmpdir(), 'ddi-demo-raw.webm')); // for re-encoding without re-recording
rmSync(dir, { recursive: true, force: true });
console.log(`${OUT}: ${(statSync(OUT).size / 1e6).toFixed(2)} MB, model ${provider}:${model.join(':')}`);
