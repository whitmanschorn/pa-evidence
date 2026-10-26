import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { AgentEventSchema, PERMISSIONS, findForbiddenTerms, formatAgentEvent, type AgentEvent } from '@pa/shared';
import { test as base, expect as baseExpect, type Page } from '@playwright/test';
import { isApiPath } from '../src/apiPaths';

// Every spec imports `test` and `expect` from here instead of '@playwright/test'.
//
// Fixtures:
//   api         In the ui project, every API call is answered from mocks the test registers with
//               api.mock(...), or api.mockEvents(...) for a server-sent-event stream (an agent run). A call the test
//               did not mock gets a 501 and fails the test when it ends.
//               In the e2e project nothing is mocked: the real API answers. (Automatic: no need to ask for it.)
//   signIn      signIn('nurse') pastes a token on the sign-in screen and waits for the identity in the header. In the
//               ui project the token is made up and /userinfo is mocked; in e2e it is the real one from .tokens.local.
//   attachScreenshot  attachScreenshot('queue loaded') takes a full-page screenshot and attaches it to the test, so the
//               HTML report (pnpm test:ui:report) shows each step's picture in order. (Not "screenshot": that name is
//               Playwright's own option.)
//
// Matchers:
//   await expect(page).toPassAxe()               axe accessibility check, including colour contrast
//   await expect(page).toHaveNoForbiddenTerms()  no form of approve, deny or authorize on screen

export type MockApi = {
  mock(method: 'GET' | 'POST', path: string, body: unknown, status?: number): void;
  mockEvents(path: string, events: AgentEvent[]): void;
};

type Role = 'nurse' | 'admin';

// The real token for a role, written by `make tokens` (never in the bundle; only tests and people read this file).
function realToken(role: Role): string {
  const lines = readFileSync(new URL('../../../.tokens.local', import.meta.url), 'utf8').split('\n');
  const line = lines.find((entry) => entry.startsWith(`${role}=`));
  if (line === undefined) throw new Error(`No ${role} token in .tokens.local: run make tokens`);
  return line.slice(role.length + 1).trim();
}

export const test = base.extend<{
  api: MockApi;
  attachScreenshot: (name: string) => Promise<void>;
  signIn: (role: Role) => Promise<void>;
}>({
  api: [
    async ({ page }, use, testInfo) => {
      const mocks = new Map<string, { status: number; body: unknown; events?: AgentEvent[] }>();
      const unmocked: string[] = [];
      const mockingEnabled = testInfo.project.name === 'ui';

      if (mockingEnabled) {
        await page.route(
          (url) => isApiPath(url.pathname),
          async (route) => {
            const request = route.request();
            const key = `${request.method()} ${new URL(request.url()).pathname}`;
            const mock = mocks.get(key);
            if (mock === undefined) {
              unmocked.push(key);
              await route.fulfill({ status: 501, json: { error: 'internal_error' } });
              return;
            }
            if (mock.events !== undefined) {
              const body = mock.events.map(formatAgentEvent).join('');
              await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
              return;
            }
            await route.fulfill({ status: mock.status, json: mock.body });
          },
        );
      }

      await use({
        mock(method, path, body, status = 200) {
          mocks.set(`${method} ${path}`, { status, body });
        },
        mockEvents(path, events) {
          // Parsed with the shared schema, so a fixture that drifts from the contract fails here.
          mocks.set(`POST ${path}`, { status: 200, body: null, events: events.map((event) => AgentEventSchema.parse(event)) });
        },
      });

      baseExpect(unmocked, 'API calls the test did not mock').toEqual([]);
    },
    { auto: true },
  ],

  signIn: async ({ page, api }, use, testInfo) => {
    await use(async (role) => {
      const mocked = testInfo.project.name === 'ui';
      if (mocked) api.mock('GET', '/userinfo', { sub: `${role}-1`, role, permissions: PERMISSIONS[role] });
      await page.goto('/ui/');
      await page.getByLabel('Access token').fill(mocked ? `${role}-token-for-ui-tests` : realToken(role));
      await page.getByRole('button', { name: 'Sign in' }).click();
      await baseExpect(page.getByRole('banner').getByText(`${role}-1`)).toBeVisible();
    });
  },

  attachScreenshot: async ({ page }, use, testInfo) => {
    let count = 0;
    await use(async (name) => {
      count += 1;
      const fileName = `${String(count).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      const path = testInfo.outputPath(fileName);
      // From the top: the app header is fixed, so a full-page shot taken mid-scroll draws it halfway down the page.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(name, { path, contentType: 'image/png' });
    });
  },
});

export const expect = baseExpect.extend({
  async toPassAxe(page: Page) {
    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations.map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `${violation.id}: ${violation.help} [${targets}]`;
    });
    return {
      name: 'toPassAxe',
      pass: violations.length === 0,
      message: () => `axe found ${violations.length} violation(s):\n${violations.join('\n')}`,
    };
  },

  async toHaveNoForbiddenTerms(page: Page) {
    const visibleText = await page.evaluate(() => `${document.title}\n${document.body.innerText}`);
    const found = findForbiddenTerms(visibleText);
    return {
      name: 'toHaveNoForbiddenTerms',
      pass: found.length === 0,
      message: () => `forbidden terms on the page: ${found.join(', ')}`,
    };
  },
});
