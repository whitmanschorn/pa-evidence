import { AppShell, Button, Container, Group, Text, Title } from '@mantine/core';
import { UserInfoSchema } from '@pa/shared';
import { Route, Routes } from 'react-router';
import { useApi } from './api';
import { PacketPage } from './pages/PacketPage';
import { QueuePage } from './pages/QueuePage';
import { SignInPage } from './pages/SignInPage';
import { useSession } from './session';

// The app shell: header with the signed-in identity, then the token screen or the pages.
export function App() {
  const { token } = useSession();
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={1} size="h4">
            Utilization review · Evidence packets
          </Title>
          {token !== null && <Identity />}
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          {token === null ? (
            <SignInPage />
          ) : (
            <Routes>
              <Route path="/" element={<QueuePage />} />
              <Route path="/requests/:requestId" element={<PacketPage />} />
            </Routes>
          )}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function Identity() {
  const { signOut } = useSession();
  const { data } = useApi('/userinfo', UserInfoSchema);
  return (
    <Group gap="sm">
      {data !== undefined && (
        <Text size="sm">
          {data.sub} · {data.role}
        </Text>
      )}
      <Button variant="default" size="xs" onClick={signOut}>
        Sign out
      </Button>
    </Group>
  );
}
