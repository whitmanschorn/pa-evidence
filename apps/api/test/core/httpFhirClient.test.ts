import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHttpFhirClient } from '../../src/core/fhir/fhirClient.js';

// A stand-in FHIR server: two pages of Conditions, a next link to another origin, and a batch endpoint.
let server: Server;
let baseUrl: string;
const seen: { url: string; headers: Record<string, string | string[] | undefined> }[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    seen.push({ url: request.url ?? '', headers: request.headers });
    response.setHeader('Content-Type', 'application/fhir+json');
    if (request.method === 'POST') {
      response.end(JSON.stringify({ resourceType: 'Bundle', type: 'batch-response', entry: [{ response: { status: '200 OK' } }, { response: { status: '404 Not Found' } }] }));
      return;
    }
    if (request.url?.startsWith('/fhir/Condition?')) {
      response.end(JSON.stringify({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Condition', id: 'c1' } }],
        link: [{ relation: 'next', url: `${baseUrl}?_getpages=abc` }],
      }));
      return;
    }
    if (request.url?.startsWith('/fhir?_getpages=abc')) {
      response.end(JSON.stringify({
        resourceType: 'Bundle',
        entry: [{ resource: { resourceType: 'Condition', id: 'c2' } }, { resource: { resourceType: 'OperationOutcome' }, search: { mode: 'outcome' } }],
      }));
      return;
    }
    if (request.url?.startsWith('/fhir/Observation?')) {
      response.end(JSON.stringify({ resourceType: 'Bundle', link: [{ relation: 'next', url: 'http://elsewhere.example/fhir?page=2' }] }));
      return;
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fhir`;
});

afterAll(() => {
  server.close();
});

describe('createHttpFhirClient', () => {
  const client = () => createHttpFhirClient({ baseUrl, authHeader: async () => 'Bearer test-token' });

  it('follows next links, keeps only matches, and asks for 200 per page without the search cache', async () => {
    const resources = await client().search('Condition', { patient: 'p1' });
    expect(resources.map((resource) => resource.id)).toEqual(['c1', 'c2']);
    const first = seen.find((request) => request.url.startsWith('/fhir/Condition?'));
    expect(first?.url).toContain('_count=200');
    expect(first?.headers['cache-control']).toBe('no-cache');
    expect(first?.headers.authorization).toBe('Bearer test-token');
  });

  it('refuses to follow a next link to another origin (the token must not leave)', async () => {
    await expect(client().search('Observation', { patient: 'p1' })).rejects.toThrow('different origin');
  });

  it('checks references with one batch request', async () => {
    const found = await client().existing(['Patient/p1', 'Condition/gone']);
    expect([...found]).toEqual(['Patient/p1']);
  });
});
