// fhir4.* types are global, from @types/fhir (listed under "types" in tsconfig.json).

export type SearchParams = Record<string, string>;

// The only two things the rules need from a FHIR server. The HTTP client talks to HAPI;
// tests and fixtures use an in-memory client built from bundle files (bundleFhirClient.ts).
export type FhirClient = {
  // Every matching resource, across all result pages.
  search(resourceType: string, params: SearchParams): Promise<fhir4.Resource[]>;
  // Which of these "Type/id" references exist on the server.
  existing(refs: string[]): Promise<Set<string>>;
  // One resource by "Type/id", or null if the server does not have it.
  read(ref: string): Promise<fhir4.Resource | null>;
};

// Returns the Authorization header value, or undefined for an unauthenticated server (local HAPI).
// Phase 4 adds bearer and SMART Backend Services providers behind this same function type.
export type AuthHeaderProvider = () => Promise<string | undefined>;

const PAGE_SIZE = '200';

export function createHttpFhirClient(options: { baseUrl: string; authHeader: AuthHeaderProvider }): FhirClient {
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  const baseOrigin = new URL(baseUrl).origin;

  async function headers(): Promise<Record<string, string>> {
    const result: Record<string, string> = {
      Accept: 'application/fhir+json',
      // Never answer from a cached result set: a reload must show up in the next search.
      'Cache-Control': 'no-cache',
    };
    const authorization = await options.authHeader();
    if (authorization !== undefined) {
      result.Authorization = authorization;
    }
    return result;
  }

  async function getBundle(url: string): Promise<fhir4.Bundle> {
    const response = await fetch(url, { headers: await headers() });
    if (!response.ok) {
      throw new Error(`FHIR search failed: HTTP ${response.status}`);
    }
    return (await response.json()) as fhir4.Bundle;
  }

  return {
    async search(resourceType, params) {
      const query = new URLSearchParams({ ...params, _count: PAGE_SIZE });
      let url: string | undefined = `${baseUrl}/${resourceType}?${query.toString()}`;
      const resources: fhir4.Resource[] = [];
      while (url !== undefined) {
        const bundle = await getBundle(url);
        for (const entry of bundle.entry ?? []) {
          // "include" and "outcome" entries are not matches.
          if (entry.resource !== undefined && (entry.search?.mode ?? 'match') === 'match') {
            resources.push(entry.resource);
          }
        }
        url = bundle.link?.find((link) => link.relation === 'next')?.url;
        // Follow paging only on the same server, so the Authorization header never goes anywhere else.
        if (url !== undefined && new URL(url).origin !== baseOrigin) {
          throw new Error('FHIR next link points to a different origin');
        }
      }
      return resources;
    },

    async read(ref) {
      const response = await fetch(`${baseUrl}/${ref}`, { headers: await headers() });
      if (response.status === 404 || response.status === 410) return null;
      if (!response.ok) {
        throw new Error(`FHIR read failed: HTTP ${response.status}`);
      }
      return (await response.json()) as fhir4.Resource;
    },

    async existing(refs) {
      if (refs.length === 0) return new Set();
      // One batch request with a read per reference, instead of one round trip each.
      const batch: fhir4.Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: refs.map((ref) => ({ request: { method: 'GET', url: ref } })),
      };
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { ...(await headers()), 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(batch),
      });
      if (!response.ok) {
        throw new Error(`FHIR batch read failed: HTTP ${response.status}`);
      }
      const result = (await response.json()) as fhir4.Bundle;
      const found = new Set<string>();
      (result.entry ?? []).forEach((entry, index) => {
        const ref = refs[index];
        if (ref !== undefined && entry.response?.status.startsWith('200') === true) {
          found.add(ref);
        }
      });
      return found;
    },
  };
}
