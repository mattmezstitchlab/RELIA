import { defineConfig } from '@playwright/test';

// Chromium standard par défaut. Un exécutable préinstallé peut être fourni dans un
// environnement restreint ; aucun navigateur / binaire n’est livré avec RELIA.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const args = process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [];

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: '.browser-test/results',
  reporter: [['line'], ['json', { outputFile: '.browser-test/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    launchOptions: { ...(executablePath ? { executablePath } : {}), args },
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1080 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
