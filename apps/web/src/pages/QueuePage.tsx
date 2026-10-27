import { Anchor, Stack, Table, Title } from '@mantine/core';
import { RequestSummarySchema } from '@pa/shared';
import { Link } from 'react-router';
import { useApi } from '../api';
import { ApiErrorAlert } from '../components/ApiErrorAlert';
import { CenteredLoader } from '../components/CenteredLoader';

const QueueSchema = RequestSummarySchema.array();

export function QueuePage() {
  const { data, error } = useApi('/requests', QueueSchema);
  if (error !== undefined) return <ApiErrorAlert error={error} />;
  if (data === undefined) return <CenteredLoader label="Loading requests" />;

  return (
    <Stack>
      <Title order={2}>Requests</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Request</Table.Th>
            <Table.Th>Request date</Table.Th>
            <Table.Th>Urgency</Table.Th>
            <Table.Th>Drug</Table.Th>
            <Table.Th>Policy</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((request) => (
            <Table.Tr key={request.request_id}>
              <Table.Td>
                <Anchor component={Link} to={`/requests/${request.request_id}`}>
                  {request.request_id}
                </Anchor>
              </Table.Td>
              <Table.Td>{request.request_date}</Table.Td>
              <Table.Td>{request.urgency}</Table.Td>
              <Table.Td>{request.drug}</Table.Td>
              <Table.Td>{request.policy_id}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
