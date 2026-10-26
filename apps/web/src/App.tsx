import { AppShell, Container, Group, Text, Title } from '@mantine/core';

// Phase 0 shell: header and an empty main area. Sign-in, queue and packet view arrive in Phase 8.
export function App() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md">
          <Title order={1} size="h4">
            Utilization review · Evidence packets
          </Title>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          <Text c="dimmed">Evidence packets will appear here.</Text>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
