import { Alert, Badge, Button, CopyButton, Group, Paper, Stack, Table, Text, Textarea, Title } from '@mantine/core';
import { readAgentEvents, type AgentEvent, type DraftEvent } from '@pa/shared';
import { useState } from 'react';
import { useSession } from '../session';
import { AgentStepList } from './AgentStepList';
import { StatusBadge } from './statusBadges';

type StepEvent = Extract<AgentEvent, { type: 'step' }>;
type PacketEvent = Extract<AgentEvent, { type: 'packet' }>;
type DoneEvent = Extract<AgentEvent, { type: 'done' }>;

// The agent drafts the request to the prescriber's office. It runs only when the nurse asks, streams its tool calls,
// and the draft is never sent: the nurse edits it and sends it. The stream is read with fetch (EventSource cannot
// send the token) and the shared reader.
export function AgentPanel({ requestId }: { requestId: string }) {
  const { token } = useSession();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [agentPacket, setAgentPacket] = useState<PacketEvent | null>(null);
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [draftText, setDraftText] = useState('');
  const [done, setDone] = useState<DoneEvent | null>(null);
  const [failed, setFailed] = useState(false);

  function onEvent(event: AgentEvent) {
    if (event.type === 'step') setSteps((previous) => [...previous, event]);
    if (event.type === 'packet') setAgentPacket(event);
    if (event.type === 'draft') {
      setDraft(event);
      setDraftText(event.text);
    }
    if (event.type === 'done') setDone(event);
    if (event.type === 'error') setFailed(true);
  }

  async function run() {
    setRunning(true);
    setSteps([]);
    setAgentPacket(null);
    setDraft(null);
    setDone(null);
    setFailed(false);
    try {
      const response = await fetch(`/requests/${encodeURIComponent(requestId)}/agent-runs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!response.ok || response.body === null) throw new Error(`HTTP ${response.status}`);
      await readAgentEvents(response.body, onEvent);
    } catch {
      setFailed(true);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Paper withBorder p="md" component="section" aria-labelledby="agent-heading">
      <Stack>
        <Title order={3} id="agent-heading">
          Draft provider request
        </Title>
        <Text size="sm">
          An AI agent gathers the evidence through the same tools and drafts the request to the prescriber&apos;s office.
          Nothing is sent: you edit the draft and send it yourself.
        </Text>
        <Group>
          <Button onClick={run} loading={running}>
            Draft provider request
          </Button>
        </Group>

        {steps.length > 0 && <AgentStepList steps={steps} />}

        {failed && (
          <Alert color="red" role="alert">
            The agent run did not finish. The evidence packet above is unaffected.
          </Alert>
        )}

        {draft !== null && (
          <Stack gap="xs">
            <Group justify="space-between">
              <Badge variant="outline" color="gray" c="gray.9">
                {draft.source === 'model' ? 'Draft, written by AI, checked against the evidence' : 'Template'}
              </Badge>
              <CopyButton value={draftText}>
                {({ copied, copy }) => (
                  <Button variant="light" size="xs" onClick={copy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </CopyButton>
            </Group>
            <Textarea
              label="Draft request to the provider"
              autosize
              minRows={4}
              value={draftText}
              onChange={(event) => setDraftText(event.currentTarget.value)}
            />
          </Stack>
        )}

        {agentPacket !== null && <AgentPacketTable packet={agentPacket} />}
        {done !== null && (
          <Text size="sm" c="dimmed">
            Finished: {done.steps} tool calls in {(done.ms / 1000).toFixed(1)} s.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

// The agent's packet next to the rules engine's: the statuses come from the tools it called, so they should match.
function AgentPacketTable({ packet }: { packet: PacketEvent }) {
  return (
    <Stack gap="xs">
      <Table withTableBorder aria-label="Agent's packet compared with the rules engine">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Criterion</Table.Th>
            <Table.Th>Agent</Table.Th>
            <Table.Th>Rules engine</Table.Th>
            <Table.Th>Comparison</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {packet.criteria.map((criterion) => (
            <Table.Tr key={criterion.id}>
              <Table.Td>{criterion.id}</Table.Td>
              <Table.Td>{criterion.status === null ? <Text size="sm">Not evaluated</Text> : <StatusBadge status={criterion.status} />}</Table.Td>
              <Table.Td>
                <StatusBadge status={criterion.rules_status} />
              </Table.Td>
              <Table.Td>{criterion.agrees_with_rules ? 'Same' : 'Different'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {packet.warnings.length > 0 && <Text size="sm">Warnings: {packet.warnings.join(', ')}</Text>}
    </Stack>
  );
}
