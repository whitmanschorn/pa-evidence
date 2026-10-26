import { Alert, Button, Container, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { UserInfoSchema } from '@pa/shared';
import { useState, type FormEvent } from 'react';
import { ApiError, apiGet } from '../api';
import { useSession } from '../session';

// Paste a token from .tokens.local. It is checked against /userinfo before it is kept.
export function SignInPage() {
  const { signIn } = useSession();
  const [token, setToken] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setChecking(true);
    setProblem(null);
    try {
      await apiGet('/userinfo', token.trim(), UserInfoSchema);
      signIn(token.trim());
    } catch (error) {
      setProblem(error instanceof ApiError && error.status === 401 ? 'That token was not recognised.' : 'The service did not answer. Try again.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Container size="xs" py="xl">
      <form onSubmit={submit}>
        <Stack>
          <Title order={2}>Sign in</Title>
          <Text c="dimmed">Paste your access token. It stays in this browser tab and is forgotten when you sign out.</Text>
          <PasswordInput label="Access token" value={token} onChange={(event) => setToken(event.currentTarget.value)} required />
          {problem !== null && (
            <Alert color="red" role="alert">
              {problem}
            </Alert>
          )}
          <Button type="submit" loading={checking}>
            Sign in
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
