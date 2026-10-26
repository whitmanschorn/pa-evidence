import AxeBuilder from '@axe-core/playwright';
import { findForbiddenTerms } from '@pa/shared';
import { test as base, expect as baseExpect, type Page } from '@playwright/test';
import { isApiPath } from '../src/apiPaths';

// Every spec imports `test` and `expect` from here instead of '@playwright/test'.
//
// Fixtures:
//   api         In the ui project, every API call is answered from mocks the test registers with
//               api.mock(...). A call the test did not mock gets a 501 and fails the test when it ends.
//               In the e2e project nothing is mocked: the real API answers. (Automatic: no need to ask for it.)
//   attachScreenshot  attachScreenshot('queue loaded') takes a full-page screenshot and attaches it to the test, so the
//               HTML report (pnpm test:ui:report) shows each step's picture in order. (Not "screenshot": that name is
//               Playwright's own option.)
//
// Matchers:
//   await expect(page).toPassAxe()               axe accessibility check, including colour contrast
//   await expect(page).toHaveNoForbiddenTerms()  no form of approve, deny or authorize on screen (invariant 5)

export type MockApi = {
  mock(method: 'GET' | 'POST', path: string, body: unknown, status?: number): void;
};

export const test = base.extend<{ api: MockApi; attachScreenshot: (name: string) => Promise<void> }>({
  api: [
    async ({ page }, use, testInfo) => {
      const mocks = new Map<string, { status: number; body: unknown }>();
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
            await route.fulfill({ status: mock.status, json: mock.body });
          },
        );
      }

      await use({
        mock(method, path, body, status = 200) {
          mocks.set(`${method} ${path}`, { status, body });
        },
      });

      baseExpect(unmocked, 'API calls the test did not mock').toEqual([]);
    },
    { auto: true },
  ],

  attachScreenshot: async ({ page }, use, testInfo) => {
    let count = 0;
    await use(async (name) => {
      count += 1;
      const fileName = `${String(count).padStart(2, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      const path = testInfo.outputPath(fileName);
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
