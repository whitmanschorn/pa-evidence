import { expect, test } from '../test';

test('the app shell loads with the product name', async ({ page, attachScreenshot }) => {
  await test.step('open the app', async () => {
    await page.goto('/ui/');
    await expect(page.getByRole('heading', { level: 1, name: 'Utilization review · Evidence packets' })).toBeVisible();
    await attachScreenshot('app shell');
  });

  await test.step('the page is accessible and uses no banned words', async () => {
    await expect(page).toPassAxe();
    await expect(page).toHaveNoForbiddenTerms();
  });
});
