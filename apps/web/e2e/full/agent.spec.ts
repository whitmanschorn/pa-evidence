import { expect, test } from '../test';

// The whole stack (`make up`): real tokens, HAPI, the rules engine, the local model writing the summary, and the agent
// calling the MCP tools and drafting the provider request. Slow: the model runs on this machine.
test('a nurse reviews PA-001 and PA-004, and drafts the provider request with the agent @slow', async ({ page, signIn, attachScreenshot }) => {
  test.setTimeout(240_000); // the agent's own limit is 180 s (data/models), plus the page loads

  await test.step('sign in with the real nurse token', async () => {
    await signIn('nurse');
    await expect(page.getByRole('link', { name: 'PA-001' })).toBeVisible();
    await attachScreenshot('queue');
    await expect(page).toPassAxe();
  });

  await test.step('PA-001: five Met criteria and Evidence complete, so nothing to draft', async () => {
    await page.getByRole('link', { name: 'PA-001' }).click();
    await expect(page.getByText('Met', { exact: true })).toHaveCount(5, { timeout: 60_000 }); // the summary is a model call
    await expect(page.getByText('Evidence complete')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draft provider request' })).toHaveCount(0);
    await attachScreenshot('PA-001 packet');
    await expect(page).toHaveNoForbiddenTerms();
  });

  await test.step('PA-004: the conflicting criterion and what to ask the provider for', async () => {
    await page.getByRole('link', { name: 'All requests' }).click();
    await page.getByRole('link', { name: 'PA-004' }).click();
    await expect(page.getByText('Conflicting', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'What to ask the provider for' })).toContainText('Metformin');
    await attachScreenshot('PA-004 packet');
  });

  const panel = page.getByRole('region', { name: 'Draft provider request' });
  await test.step('the agent runs: its tool calls stream in', async () => {
    await panel.getByRole('button', { name: 'Draft provider request' }).click();
    await expect(panel.getByRole('list', { name: 'Agent steps' }).getByRole('listitem').first()).toContainText('get_request', { timeout: 60_000 });
    await attachScreenshot('agent running');
  });

  await test.step("the draft appears, and the agent's packet matches the rules engine", async () => {
    await expect(panel.getByText(/^Finished: \d+ tool calls/)).toBeVisible({ timeout: 180_000 });
    await expect(panel.getByLabel('Draft request to the provider')).toHaveValue(/Re: request PA-004 \(semaglutide\)/);
    await expect(panel.getByText(/^(Draft, written by AI, checked against the evidence|Template)$/)).toBeVisible();
    const comparison = panel.getByRole('table', { name: "Agent's packet compared with the rules engine" });
    await expect(comparison.getByText('Same', { exact: true })).toHaveCount(5);
    await attachScreenshot('draft provider request');
    await expect(page).toPassAxe();
    await expect(page).toHaveNoForbiddenTerms();
  });
});
