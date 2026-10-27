import { Anchor, Badge, Button, Code, CopyButton, Group, List, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { PacketSchema, type CriterionResult } from '@pa/shared';
import { Link, useParams } from 'react-router';
import { useApi } from '../api';
import { AgentPanel } from '../components/AgentPanel';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import { CenteredLoader } from '../components/CenteredLoader';
import { RouteBadge, StatusBadge } from '../components/statusBadges';

// The evidence packet the rules engine built. Rows come from packet.criteria, never a fixed list. No action buttons:
// the nurse decides, and nothing here suggests what to decide.
export function PacketPage() {
  const requestId = useParams().requestId ?? '';
  const path = `/requests/${encodeURIComponent(requestId)}/evidence`;
  // Two requests for one packet. The template summary comes back at once, so the criteria show while the model writes
  // its summary; the full packet then takes over (its criteria are the same, decided by the same rules).
  const quick = useApi(`${path}?summary=template`, PacketSchema);
  const full = useApi(path, PacketSchema);
  const packet = full.data ?? quick.data;
  if (packet === undefined) {
    const error = quick.error ?? full.error;
    if (error !== undefined) return <ApiErrorAlert error={error} />;
    return <CenteredLoader label="Loading the evidence packet" />;
  }
  const summaryWritten = full.data !== undefined;

  const asks = packet.missing_documents;
  return (
    <Stack gap="lg">
      <Anchor component={Link} to="/">
        ← All requests
      </Anchor>
      <Group>
        <Title order={2}>{packet.request_id}</Title>
        <RouteBadge route={packet.route} />
      </Group>
      <Text c="dimmed">
        Policy {packet.policy_id}, version {packet.policy_version} · request date {packet.request_date}
      </Text>

      <Table withTableBorder verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Criterion</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Citations</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {packet.criteria.map((criterion) => (
            <Table.Tr key={criterion.id}>
              <Table.Td>
                <Text fw={600}>{criterion.id}</Text>
                <Text size="sm">{criterion.requirement}</Text>
              </Table.Td>
              <Table.Td>
                <StatusDetail criterion={criterion} />
              </Table.Td>
              <Table.Td>
                <Stack gap={4}>
                  {criterion.sources.length === 0 ? <Text size="sm">None</Text> : criterion.sources.map((ref) => <Code key={ref}>{ref}</Code>)}
                </Stack>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Paper withBorder p="md" component="section" aria-labelledby="asks-heading">
        <Group justify="space-between" mb="xs">
          <Title order={3} id="asks-heading">
            What to ask the provider for
          </Title>
          {asks.length > 0 && (
            <CopyButton value={asks.join('\n')}>
              {({ copied, copy }) => (
                <Button variant="light" size="xs" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </CopyButton>
          )}
        </Group>
        {asks.length === 0 ? <Text>Nothing: every criterion has evidence in the record.</Text> : <List>{asks.map((ask) => <List.Item key={ask}>{ask}</List.Item>)}</List>}
      </Paper>

      <Paper withBorder p="md" component="section" aria-labelledby="summary-heading">
        <Group mb="xs">
          <Title order={3} id="summary-heading">
            Summary
          </Title>
          {summaryWritten && (
            <Badge variant="outline" color="gray" c="gray.9">
              {packet.summary_source === 'model' ? 'Written by AI, checked against the evidence' : 'Template'}
            </Badge>
          )}
        </Group>
        {summaryWritten && <Text>{packet.summary}</Text>}
        {!summaryWritten && full.error !== undefined && <ApiErrorAlert error={full.error} />}
        {!summaryWritten && full.error === undefined && <CenteredLoader label="Writing the summary" />}
        {packet.warnings.length > 0 && (
          <Text size="sm" mt="xs">
            Warnings: {packet.warnings.join(', ')}
          </Text>
        )}
      </Paper>

      {packet.route === 'clinician_review' && <AgentPanel requestId={packet.request_id} />}
    </Stack>
  );
}

// The badge, then what the rules engine found: the value and date from the chart, and the form's value next to it.
function StatusDetail({ criterion }: { criterion: CriterionResult }) {
  return (
    <Stack gap={4}>
      <StatusBadge status={criterion.status} />
      {criterion.value !== undefined && (
        <Text size="sm">
          Chart: {criterion.value}
          {criterion.observed !== undefined && ` (${criterion.observed})`}
        </Text>
      )}
      {criterion.attested !== undefined && (
        <Text size="sm">
          Form: {criterion.attested.value}
          {criterion.attested.agrees === false && ' (does not match the chart)'}
        </Text>
      )}
      {criterion.note !== undefined && <Text size="sm">{criterion.note}</Text>}
    </Stack>
  );
}
