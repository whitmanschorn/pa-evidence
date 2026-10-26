import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportPKCS8, generateKeyPair, jwtVerify, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFhirAuth } from '../../src/core/fhir/fhirAuth.js';

// A stand-in SMART authorization server: verifies the client assertion like a real one, then issues a token.
let server: Server;
let tokenUrl: string;
let publicKey: CryptoKey;
let privateKeyPem: string;
const issued: { form: URLSearchParams; claims: Record<string, unknown>; header: Record<string, unknown> }[] = [];
// One clock for the client and this server, so the test can move time forward.
let nowMs = Date.now();

beforeAll(async () => {
  const pair = await generateKeyPair('RS384', { extractable: true });
  publicKey = pair.publicKey;
  privateKeyPem = await exportPKCS8(pair.privateKey);

  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', async () => {
      const form = new URLSearchParams(body);
      try {
        const { payload, protectedHeader } = await jwtVerify(form.get('client_assertion') ?? '', publicKey, {
          issuer: 'client-123',
          subject: 'client-123',
          audience: tokenUrl,
          currentDate: new Date(nowMs),
        });
        issued.push({ form, claims: payload, header: protectedHeader });
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ access_token: `at-${issued.length}`, token_type: 'bearer', expires_in: 300 }));
      } catch {
        response.statusCode = 401;
        response.end('{"error":"invalid_client"}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  tokenUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/token`;
});

afterAll(() => {
  server.close();
});

describe('FHIR client authentication', () => {
  it('sends nothing for local HAPI, and a fixed token in bearer mode', async () => {
    expect(await createFhirAuth({ mode: 'none' })()).toBeUndefined();
    expect(await createFhirAuth({ mode: 'bearer', token: 'abc' })()).toBe('Bearer abc');
  });

  it('SMART Backend Services: signs a valid client assertion, then caches the token until 60 s before expiry', async () => {
    const auth = createFhirAuth(
      { mode: 'smart', tokenUrl, clientId: 'client-123', privateKeyPem, keyId: 'key-1', alg: 'RS384', scopes: 'system/Patient.rs' },
      () => nowMs,
    );

    expect(await auth()).toBe('Bearer at-1');
    const first = issued[0]!;
    expect(first.form.get('grant_type')).toBe('client_credentials');
    expect(first.form.get('client_assertion_type')).toBe('urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    expect(first.form.get('scope')).toBe('system/Patient.rs');
    expect(first.header).toMatchObject({ alg: 'RS384', kid: 'key-1' });
    expect(typeof first.claims.jti).toBe('string');
    expect((first.claims.exp as number) - (first.claims.iat as number)).toBeLessThanOrEqual(300);

    nowMs += 239_000; // 61 s before the 300 s token expires: still cached
    expect(await auth()).toBe('Bearer at-1');
    nowMs += 2_000; // inside the last minute: fetch a new one
    expect(await auth()).toBe('Bearer at-2');
    expect(issued[1]!.claims.jti).not.toBe(first.claims.jti);
  });
});
