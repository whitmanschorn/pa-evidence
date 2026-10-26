import { randomUUID } from 'node:crypto';
import { SignJWT, importPKCS8, type CryptoKey } from 'jose';
import { z } from 'zod';
import type { AuthHeaderProvider } from './fhirClient.js';

// How the FHIR client authenticates, chosen by FHIR_AUTH:
//   none   local HAPI, no Authorization header
//   bearer a static access token (FHIR_BEARER_TOKEN)
//   smart  SMART Backend Services: a signed JWT client assertion exchanged for an access token
export type FhirAuthConfig =
  | { mode: 'none' }
  | { mode: 'bearer'; token: string }
  | {
      mode: 'smart';
      tokenUrl: string;
      clientId: string;
      privateKeyPem: string;
      keyId: string;
      alg: 'RS384' | 'ES384';
      scopes: string;
    };

// SMART Backend Services: a client assertion must expire within five minutes.
const ASSERTION_LIFETIME_SECONDS = 5 * 60;
// Fetch a new access token this long before the current one expires, so no request carries a dying token.
const REFRESH_MARGIN_MS = 60 * 1000;

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export function createFhirAuth(config: FhirAuthConfig, now: () => number = Date.now): AuthHeaderProvider {
  if (config.mode === 'none') {
    return async () => undefined;
  }
  if (config.mode === 'bearer') {
    return async () => `Bearer ${config.token}`;
  }
  return createSmartBackendAuth(config, now);
}

function createSmartBackendAuth(
  config: Extract<FhirAuthConfig, { mode: 'smart' }>,
  now: () => number,
): AuthHeaderProvider {
  let signingKey: CryptoKey | undefined;
  let cached: { token: string; expiresAtMs: number } | undefined;

  async function clientAssertion(): Promise<string> {
    signingKey ??= await importPKCS8(config.privateKeyPem, config.alg);
    const issuedAt = Math.floor(now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: config.alg, kid: config.keyId, typ: 'JWT' })
      .setIssuer(config.clientId)
      .setSubject(config.clientId)
      .setAudience(config.tokenUrl)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ASSERTION_LIFETIME_SECONDS)
      .sign(signingKey);
  }

  return async () => {
    if (cached !== undefined && now() < cached.expiresAtMs - REFRESH_MARGIN_MS) {
      return `Bearer ${cached.token}`;
    }
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: await clientAssertion(),
        scope: config.scopes,
      }),
    });
    if (!response.ok) {
      throw new Error(`SMART token request failed: HTTP ${response.status}`);
    }
    const token = TokenResponseSchema.parse(await response.json());
    cached = { token: token.access_token, expiresAtMs: now() + token.expires_in * 1000 };
    return `Bearer ${cached.token}`;
  };
}
