import { defineConfig, devices } from '@playwright/test';

// Projects (desktop only: nurses use approved desktop workstations, so there is no mobile layout to test):
//   ui   Vite's dev server with every API call mocked (see e2e/test.ts). Fast; needs no HAPI and no Ollama.
//   e2e  the real stack from `make up`, where the API serves the built app at /ui.
// Review a run visually with `pnpm test:ui:report` or `pnpm test:e2e:report`: each test shows its step screenshots
// and a trace. Each suite writes its own report folder (set by the package scripts), so one run never erases the other.
// `pnpm test:e2e` sets E2E=1 so the Vite dev server is not started for the e2e project.
const runningE2E = process.env.E2E === '1';
const UI_DEV_URL = 'http://localhost:5173';
const E2E_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  reporter: [['list'], ['html', { open: 'never' }]], // folder: PLAYWRIGHT_HTML_OUTPUT_DIR, set per suite in package.json
  use: {
    trace: 'on', // every action with before/after snapshots, viewable from the report
    screenshot: 'on', // plus a final screenshot of every test
  },
  projects: [
    {
      name: 'ui',
      testDir: './e2e/ui',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: UI_DEV_URL },
    },
    {
      name: 'e2e',
      testDir: './e2e/full',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: E2E_URL },
    },
  ],
  webServer: runningE2E
    ? undefined
    : {
        command: 'pnpm exec vite --port 5173 --strictPort',
        url: `${UI_DEV_URL}/ui/`,
        reuseExistingServer: true,
      },
});
