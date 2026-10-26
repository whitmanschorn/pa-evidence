import type { Page } from '@playwright/test';
import { isApiPath } from '../../src/apiPaths';

// In the `ui` project nothing may reach a real API. Every API call is answered from `routes`
// (keyed by "METHOD /path"). A call the spec did not mock gets a 501 and is recorded in
// `unmockedCalls`, so a spec can assert that the screen made no unexpected requests.
export type MockResponse = { status?: number; body: unknown };
export type MockRoutes = Record<string, MockResponse>;

export async function mockApi(page: Page, routes: MockRoutes = {}): Promise<{ unmockedCalls: string[] }> {
  const unmockedCalls: string[] = [];

  await page.route(
    (url) => isApiPath(url.pathname),
    async (route) => {
      const request = route.request();
      const key = `${request.method()} ${new URL(request.url()).pathname}`;
      const mock = routes[key];
      if (mock === undefined) {
        unmockedCalls.push(key);
        await route.fulfill({ status: 501, json: { error: 'internal_error' } });
        return;
      }
      await route.fulfill({ status: mock.status ?? 200, json: mock.body });
    },
  );

  return { unmockedCalls };
}
