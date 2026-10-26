import type { AuthHeaderProvider } from './fhir/fhirClient.js';

// One dependency's state for /ready. `required` dependencies must be ok for the service to be ready; the model
// is not required, because summaries fall back to the code template when it is down.
export type DependencyCheck = {
  ok: boolean;
  required: boolean;
  detail: Record<string, string | number | boolean | null | string[]>;
};

export async function checkFhir(baseUrl: string, authHeader: AuthHeaderProvider): Promise<DependencyCheck> {
  const started = performance.now();
  try {
    const authorization = await authHeader();
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/metadata`, {
      headers: { Accept: 'application/fhir+json', ...(authorization === undefined ? {} : { Authorization: authorization }) },
    });
    const body = response.ok ? ((await response.json()) as { fhirVersion?: string }) : {};
    return {
      ok: response.ok,
      required: true,
      detail: { http_status: response.status, fhir_version: body.fhirVersion ?? null, ms: Math.round(performance.now() - started) },
    };
  } catch {
    return { ok: false, required: true, detail: { error: 'unreachable', ms: Math.round(performance.now() - started) } };
  }
}

// Ollama: is it up, is it the version we tested, and is the pinned model present with the pinned digest.
export async function checkModel(options: {
  baseUrl: string;
  model?: string;
  expectedDigest?: string;
  expectedVersion?: string;
}): Promise<DependencyCheck> {
  const base = options.baseUrl.replace(/\/$/, '');
  try {
    const versionResponse = await fetch(`${base}/api/version`);
    const { version } = (await versionResponse.json()) as { version?: string };
    const detail: DependencyCheck['detail'] = {
      version: version ?? null,
      version_matches: options.expectedVersion === undefined ? null : version === options.expectedVersion,
      model: options.model ?? null,
      model_digest: null,
      digest_matches: null,
    };
    if (options.model !== undefined) {
      const tags = (await (await fetch(`${base}/api/tags`)).json()) as { models?: { name: string; digest: string }[] };
      const pulled = tags.models?.find((entry) => entry.name === options.model);
      detail.model_digest = pulled?.digest ?? null;
      detail.digest_matches = options.expectedDigest === undefined ? null : pulled?.digest === options.expectedDigest;
    }
    const ok = versionResponse.ok && detail.digest_matches !== false && (options.model === undefined || detail.model_digest !== null);
    return { ok, required: false, detail };
  } catch {
    return { ok: false, required: false, detail: { error: 'unreachable' } };
  }
}
