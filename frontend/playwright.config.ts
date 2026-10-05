import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke test against the REAL API serving the committed 8-drug
 * test fixture (stub LLM, RxNav off): no Kaggle data, GPU or network needed.
 * Ports differ from the dev servers (8001 / 5173) so both can run at once.
 * Locally, PW_CHROMIUM_PATH can point at an installed Chrome.
 */
const API_PORT = 8091;
const WEB_PORT = 4183;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      // WebGL (sigma.js) via SwiftShader in headless mode
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: [
    {
      command: 'cargo run -q -p drug-interaction-api',
      cwd: '..',
      url: `http://localhost:${API_PORT}/health`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        APP_PORT: String(API_PORT),
        APP_DATASET_PATH: 'crates/api/tests/fixtures/mini_dataset.json',
        APP_LLM_STUB: 'true',
        APP_LLM_PROVIDER: 'stub',
        APP_RXNAV_ENABLED: 'false',
        APP_ALIASES_PATH: 'does-not-exist.json',
      },
    },
    {
      command: `pnpm build && pnpm preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
