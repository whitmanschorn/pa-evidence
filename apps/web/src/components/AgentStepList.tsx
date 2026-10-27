import { Group, List, Stack, Text } from '@mantine/core';
import { CriterionStatusSchema, type AgentEvent, type CriterionStatus } from '@pa/shared';
import { StatusBadge } from './statusBadges';

type StepEvent = Extract<AgentEvent, { type: 'step' }>;

// What one tool call did, in words: a title from the call, and a line from its result.
type StepView = { title: string; status?: CriterionStatus; detail?: string; failed?: boolean };

const NO_RESULT = { detail: 'No result came back from this tool.', failed: true };

// The agent's tool calls as sentences a nurse can read, not the JSON the tools exchange. The tool's name stays, small,
// so each line can be matched to the MCP call behind it.
export function AgentStepList({ steps }: { steps: StepEvent[] }) {
  return (
    <List type="ordered" aria-label="Agent steps" size="sm" spacing="xs">
      {steps.map((step) => {
        const view = describeStep(step);
        return (
          <List.Item key={step.step}>
            <Stack gap={2}>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {view.title}
                </Text>
                {view.status !== undefined && <StatusBadge status={view.status} />}
              </Group>
              {view.detail !== undefined && (
                <Text size="sm" c={view.failed ? 'red.9' : undefined}>
                  {view.detail}
                </Text>
              )}
              <Text size="xs" c="dimmed">
                <Text span ff="monospace" size="xs">
                  {step.tool}
                </Text>
                , {duration(step.ms)}
              </Text>
            </Stack>
          </List.Item>
        );
      })}
    </List>
  );
}

// The step's result is the API's short summary of the tool's answer (see traceSummary in the API). A call the MCP
// server refused comes back as { error } or as an empty result.
function describeStep(step: StepEvent): StepView {
  const title = titleOf(step);
  const result = step.result;
  if ('error' in result) return { title, detail: `The tool answered with an error: ${text(result.error) ?? 'no details'}`, failed: true };

  if (step.tool === 'get_request') {
    const policy = text(result.policy_id);
    const date = text(result.request_date);
    if (policy === undefined || date === undefined) return { title, ...NO_RESULT };
    return { title, detail: `Policy ${policy}, request date ${date}` };
  }
  if (step.tool === 'get_policy') {
    const version = text(result.version);
    const criteria = texts(result.criteria);
    if (version === undefined || criteria === undefined) return { title, ...NO_RESULT };
    return { title, detail: `Version ${version}, ${criteria.length} criteria: ${criteria.join(', ')}` };
  }
  if (step.tool === 'evaluate_criterion') {
    const status = CriterionStatusSchema.safeParse(result.status);
    const sources = texts(result.sources);
    if (!status.success || sources === undefined) return { title, ...NO_RESULT };
    const detail = sources.length === 0 ? 'No sources cited' : `Sources: ${resourceTypes(sources)}`;
    return { title, status: status.data, detail };
  }
  if (step.tool === 'verify_sources') {
    const verified = typeof result.verified === 'number' ? result.verified : undefined;
    const notFound = texts(result.not_found);
    if (verified === undefined || notFound === undefined) return { title, ...NO_RESULT };
    return verifiedView(title, verified, notFound);
  }
  return { title };
}

function titleOf(step: StepEvent): string {
  const args = step.arguments;
  if (step.tool === 'get_request') return `Read request ${text(args.request_id) ?? '(no request id given)'}`;
  if (step.tool === 'get_policy') return `Looked up policy ${text(args.policy_id) ?? '(no policy id given)'}`;
  if (step.tool === 'evaluate_criterion') return `Evaluated criterion ${text(args.criterion_id) ?? '(no criterion given)'}`;
  if (step.tool === 'verify_sources') return 'Checked the cited sources';
  return `Called ${step.tool}`;
}

function verifiedView(title: string, verified: number, notFound: string[]): StepView {
  const total = verified + notFound.length;
  if (total === 0) return { title, detail: 'No cited sources to check' };
  const found = `${verified} of ${total} cited sources ${verified === 1 ? 'is' : 'are'} on the FHIR server`;
  if (notFound.length === 0) return { title, detail: found };
  return { title, detail: `${found}. Not found: ${notFound.join(', ')}`, failed: true };
}

// "Condition/79827375-…" → "Condition". The ids mean nothing to a reader here; the packet's table above lists them.
// A type cited more than once shows its count: "Observation (2)".
function resourceTypes(refs: string[]): string {
  const counts = new Map<string, number>();
  for (const ref of refs) {
    const type = ref.split('/')[0] ?? ref;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => (count === 1 ? type : `${type} (${count})`)).join(', ');
}

function duration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function texts(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}
