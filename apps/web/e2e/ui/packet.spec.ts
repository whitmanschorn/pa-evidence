import { mockPacket, packet, queue } from '../fixtures';
import { expect, test } from '../test';

test.beforeEach(async ({ api, signIn }) => {
  api.mock('GET', '/requests', queue());
  await signIn('nurse');
});

test('the queue lists every request, and PA-001 shows five met criteria', async ({ page, api, attachScreenshot }) => {
  mockPacket(api, 'PA-001');

  await test.step('the queue shows all seven requests', async () => {
    await expect(page.getByRole('row')).toHaveCount(8); // a header row and seven requests
    await attachScreenshot('queue');
    await expect(page).toPassAxe();
    await expect(page).toHaveNoForbiddenTerms();
  });

  await test.step('PA-001: five Met badges and a neutral Evidence complete route', async () => {
    await page.getByRole('link', { name: 'PA-001' }).click();
    await expect(page.getByRole('heading', { name: 'PA-001' })).toBeVisible();
    await expect(page.getByText('Met', { exact: true })).toHaveCount(5);
    await expect(page.getByText('Evidence complete')).toBeVisible();
    // Nothing to ask the provider for, so no draft to write.
    await expect(page.getByRole('button', { name: 'Draft provider request' })).toHaveCount(0);
    await attachScreenshot('PA-001 packet');
    await expect(page).toPassAxe();
    await expect(page).toHaveNoForbiddenTerms();
  });
});

test('PA-004: a conflicting criterion shows the form value next to the chart, and what to ask for', async ({ page, api, attachScreenshot }) => {
  mockPacket(api, 'PA-004');
  await page.getByRole('link', { name: 'PA-004' }).click();

  await expect(page.getByText('Conflicting', { exact: true })).toBeVisible();
  await expect(page.getByText('Needs clinician review')).toBeVisible();
  const asks = page.getByRole('region', { name: 'What to ask the provider for' });
  await expect(asks).toContainText('Metformin prescription or pharmacy fill history');
  await expect(asks.getByRole('button', { name: 'Copy' })).toBeVisible();
  await attachScreenshot('PA-004 packet');
  await expect(page).toPassAxe();
  await expect(page).toHaveNoForbiddenTerms();
});

test('PA-004: the criteria show at once, and the summary loads on its own', async ({ page, api, attachScreenshot }) => {
  let showCriteria = () => {};
  let showSummary = () => {};
  mockPacket(api, 'PA-004', {
    holdCriteria: new Promise((resolve) => (showCriteria = resolve)),
    holdSummary: new Promise((resolve) => (showSummary = resolve)),
  });
  await page.getByRole('link', { name: 'PA-004' }).click();

  await test.step('first, one spinner for the packet', async () => {
    await expect(page.getByRole('status')).toHaveText('Loading the evidence packet');
    await attachScreenshot('PA-004 loading');
    await expect(page).toPassAxe();
  });

  await test.step('the criteria and asks, while a second spinner holds the summary', async () => {
    showCriteria();
    await expect(page.getByText('Conflicting', { exact: true })).toBeVisible();
    const summary = page.getByRole('region', { name: 'Summary' });
    await expect(summary.getByRole('status')).toHaveText('Writing the summary');
    await expect(page.getByRole('region', { name: 'What to ask the provider for' })).toContainText('Metformin prescription');
    await attachScreenshot('PA-004 criteria, summary loading');
    await expect(page).toPassAxe();
  });

  await test.step("then the full packet's summary in its place", async () => {
    showSummary();
    const summary = page.getByRole('region', { name: 'Summary' });
    await expect(summary.getByText(packet('PA-004').summary)).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await attachScreenshot('PA-004 summary written');
    await expect(page).toHaveNoForbiddenTerms();
  });
});
