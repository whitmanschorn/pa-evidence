import { queue } from '../fixtures';
import { expect, test } from '../test';

test('sign in with a token, see who you are, sign out', async ({ page, api, signIn, attachScreenshot }) => {
  api.mock('GET', '/requests', queue());

  await test.step('the app opens on the token screen', async () => {
    await page.goto('/ui/');
    await expect(page.getByRole('heading', { level: 1, name: 'Utilization review · Evidence packets' })).toBeVisible();
    await expect(page.getByLabel('Access token')).toBeVisible();
    await attachScreenshot('token screen');
    await expect(page).toPassAxe();
  });

  await test.step('pasting a nurse token shows the identity and role', async () => {
    await signIn('nurse');
    await expect(page.getByRole('banner')).toContainText('nurse-1');
    await expect(page.getByRole('banner')).toContainText('nurse');
    await attachScreenshot('signed in as nurse');
  });

  await test.step('sign out returns to the token screen', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByLabel('Access token')).toBeVisible();
    await attachScreenshot('signed out');
  });
});

test('a token the API does not recognise is refused with a plain message', async ({ page, api, attachScreenshot }) => {
  api.mock('GET', '/userinfo', { error: 'unauthenticated' }, { status: 401 });
  await page.goto('/ui/');
  await page.getByLabel('Access token').fill('not-a-real-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('That token was not recognised');
  await attachScreenshot('token refused');
  await expect(page).toHaveNoForbiddenTerms();
});
