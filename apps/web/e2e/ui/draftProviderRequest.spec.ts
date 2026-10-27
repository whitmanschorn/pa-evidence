import { agentRun, mockPacket, queue } from '../fixtures';
import { expect, test } from '../test';

test.beforeEach(async ({ page, api, signIn }) => {
  api.mock('GET', '/requests', queue());
  mockPacket(api, 'PA-004');
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

  await test.step('the tool calls stream into the panel, each as a sentence rather than JSON', async () => {
    await panel.getByRole('button', { name: 'Draft provider request' }).click();
    const list = panel.getByRole('list', { name: 'Agent steps' });
    const steps = list.getByRole('listitem');
    await expect(steps).toHaveCount(8);
    await expect(steps.nth(0)).toContainText('Read request PA-004');
    await expect(steps.nth(0)).toContainText('Policy MP-SYN-021, request date 2026-10-01');
    await expect(steps.nth(1)).toContainText('Version 2026.1, 5 criteria: C1, C2, C3, C4, C5');
    await expect(steps.nth(4)).toContainText('Evaluated criterion C3');
    await expect(steps.nth(4).getByText('Conflicting', { exact: true })).toBeVisible();
    await expect(steps.nth(4)).toContainText('Sources: MedicationRequest, AllergyIntolerance');
    await expect(steps.nth(5)).toContainText('No sources cited');
    await expect(steps.last()).toContainText('2 of 2 cited sources are on the FHIR server');
    await expect(steps.first()).toContainText('get_request, 8 ms'); // the MCP tool behind each line, small
    await expect(list).not.toContainText(/[{}[\]"]/);
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

test('a tool call that went wrong says so in words', async ({ page, api, attachScreenshot }) => {
  // The recorded run, with C2's call rejected (the MCP server's refusals come back as an error or as nothing) and a
  // cited source that the FHIR server no longer has.
  const events = agentRun('PA-004-model').map((event) => {
    if (event.type !== 'step') return event;
    if (event.step === 4) return { ...event, result: { error: 'criterion_id is required' } };
    if (event.step === 5) return { ...event, result: {} };
    if (event.tool === 'verify_sources') return { ...event, result: { verified: 1, not_found: ['AllergyIntolerance/5343aadb-9d69-59eb-9aac-e96f129206b1'] } };
    return event;
  });
  api.mockEvents('/requests/PA-004/agent-runs', events);
  const panel = page.getByRole('region', { name: 'Draft provider request' });
  await panel.getByRole('button', { name: 'Draft provider request' }).click();

  const steps = panel.getByRole('list', { name: 'Agent steps' }).getByRole('listitem');
  await expect(steps).toHaveCount(8);
  await expect(steps.nth(3)).toContainText('The tool answered with an error: criterion_id is required');
  await expect(steps.nth(4)).toContainText('No result came back from this tool.');
  await expect(steps.last()).toContainText('1 of 2 cited sources is on the FHIR server. Not found: AllergyIntolerance/5343aadb-9d69-59eb-9aac-e96f129206b1');
  await attachScreenshot('tool calls that went wrong');
  await expect(page).toPassAxe();
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
