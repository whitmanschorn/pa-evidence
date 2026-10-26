import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, expectNoForbiddenTerms } from '../support/checks';
import { mockApi } from '../support/mockApi';
import { takeScreenshots } from '../support/screenshots';

test('the app shell loads with the product name', async ({ page }) => {
  const api = await mockApi(page);

  await page.goto('/ui/');

  await expect(page.getByRole('heading', { level: 1, name: 'Utilization review · Evidence packets' })).toBeVisible();
  await expectNoForbiddenTerms(page);
  await expectNoAxeViolations(page);
  await takeScreenshots(page, 'smoke-shell');
  expect(api.unmockedCalls).toEqual([]);
});
