import { Alert } from '@mantine/core';
import type { ApiError } from '../api';

// API errors in plain words. The API's error codes are fixed (never a banned word), and so are these messages.
const MESSAGES: Record<number, string> = {
  401: 'Your token was not recognised. Sign out and sign in again.',
  403: 'forbidden: your role cannot see this.',
  404: 'not found.',
};

export function ApiErrorAlert({ error }: { error: ApiError }) {
  return (
    <Alert color="red" title="Could not load this" role="alert">
      {MESSAGES[error.status] ?? `Something went wrong (${error.code}).`}
    </Alert>
  );
}
