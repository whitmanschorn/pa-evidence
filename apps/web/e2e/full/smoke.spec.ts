import { expect, test } from '../test';

// Against the real stack (`make up`): the API serves the built app at /ui without a token (static files only).
test('the API serves the app shell at /ui', async ({ page, attachScreenshot }) => {
  await test.step('open the app from the API', async () => {
    await page.goto('/ui/');
    await expect(page.getByRole('heading', { level: 1, name: 'Utilization review · Evidence packets' })).toBeVisible();
    await attachScreenshot('app shell served by the API');
  });

  await test.step('a client-side route loads the app too', async () => {
    await page.goto('/ui/requests/PA-001');
    await expect(page.getByRole('heading', { level: 1, name: 'Utilization review · Evidence packets' })).toBeVisible();
    await expect(page).toPassAxe();
    await expect(page).toHaveNoForbiddenTerms();
  });
});
