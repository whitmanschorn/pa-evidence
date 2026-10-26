import { defineConfig, devices } from '@playwright/test';

// Two projects:
// - ui:  Vite's dev server with every API call mocked via page.route from fixture JSON.
//        Fast, and needs no HAPI and no Ollama.
// - e2e: the real stack from `make up`, where the API serves the built app at /ui.
// `pnpm test:e2e` sets E2E=1 so the Vite dev server is not started for the e2e project.
const runningE2E = process.env.E2E === '1';
const UI_DEV_URL = 'http://localhost:5173';
const E2E_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  outputDir: './test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'ui',
      testDir: './e2e/ui',
      use: { ...devices['Desktop Chrome'], baseURL: UI_DEV_URL },
    },
    {
      name: 'e2e',
      testDir: './e2e/full',
      use: { ...devices['Desktop Chrome'], baseURL: E2E_URL },
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
