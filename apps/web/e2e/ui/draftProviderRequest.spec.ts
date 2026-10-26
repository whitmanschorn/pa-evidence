import { agentRun, packet, queue } from '../fixtures';
import { expect, test } from '../test';

test.beforeEach(async ({ page, api, signIn }) => {
  api.mock('GET', '/requests', queue());
  api.mock('GET', '/requests/PA-004/evidence', packet('PA-004'));
  await signIn('nurse');
  await page.getByRole('link', { name: 'PA-004' }).click();
});

test('the agent steps stream in, then an editable draft written by AI', async ({ page, api, attachScreenshot }) => {
  api.mockEvents('/requests/PA-004/agent-runs', agentRun('PA-004-model'));
  const panel = page.getByRole('region', { name: 'Draft provider request' });

  await test.step('nothing runs until the nurse asks', async () => {
    await expect(panel.getByRole('button', { name: 'Draft provider request' })).toBeVisible();
    await attachScreenshot('before the draft');
  });

  await test.step('the tool calls stream into the panel', async () => {
    await panel.getByRole('button', { name: 'Draft provider request' }).click();
    const steps = panel.getByRole('list', { name: 'Agent steps' }).getByRole('listitem');
    await expect(steps).toHaveCount(8);
    await expect(steps.first()).toContainText('get_request');
    await expect(steps.last()).toContainText('verify_sources');
  });

  await test.step('the draft is editable, copyable and labelled as written by AI', async () => {
    await expect(panel.getByText('Draft, written by AI, checked against the evidence')).toBeVisible();
    const draft = panel.getByLabel('Draft request to the provider');
    await expect(draft).toHaveValue(/Re: request PA-004 \(semaglutide\)/);
    await draft.fill(`${await draft.inputValue()}\nCall us with questions.`);
    await expect(draft).toHaveValue(/Call us with questions\./);
    await expect(panel.getByRole('button', { name: 'Copy' })).toBeVisible();
  });

  await test.step("the agent's packet agrees with the rules engine on every criterion", async () => {
    const comparison = panel.getByRole('table', { name: "Agent's packet compared with the rules engine" });
    await expect(comparison.getByRole('row')).toHaveCount(6);
    await expect(comparison.getByText('Same', { exact: true })).toHaveCount(5);
    await attachScreenshot('draft written by AI');
    await expect(page).toPassAxe();
    await expect(page).toHaveNoForbiddenTerms();
  });
});

test('a draft that failed the checks falls back to the template, and says so', async ({ page, api, attachScreenshot }) => {
  api.mockEvents('/requests/PA-004/agent-runs', agentRun('PA-004-template'));
  const panel = page.getByRole('region', { name: 'Draft provider request' });
  await panel.getByRole('button', { name: 'Draft provider request' }).click();

  await expect(panel.getByText('Template', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Draft request to the provider')).toHaveValue(/Metformin prescription or pharmacy fill history/);
  await attachScreenshot('template fallback');
  await expect(page).toHaveNoForbiddenTerms();
});
