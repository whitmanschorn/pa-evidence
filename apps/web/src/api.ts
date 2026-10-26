import { ErrorBodySchema } from '@pa/shared';
import useSWR from 'swr';
import { useSession } from './session';

// Every API call sends the token as a bearer header and parses the reply with the shared schema. SWR's cache is
// in memory only, so nothing clinical is written to disk by the browser.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`HTTP ${status}: ${code}`);
  }
}

type Schema<T> = { parse: (data: unknown) => T };

export async function apiGet<T>(path: string, token: string, schema: Schema<T>): Promise<T> {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, ErrorBodySchema.safeParse(body).data?.error ?? 'internal_error');
  }
  return schema.parse(body);
}

export function useApi<T>(path: string, schema: Schema<T>) {
  const { token } = useSession();
  return useSWR<T, ApiError>(token === null ? null : [path, token], ([url, bearer]: [string, string]) => apiGet(url, bearer, schema), {
    revalidateOnFocus: false,
  });
}
