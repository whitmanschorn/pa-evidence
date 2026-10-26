// fhir4.* types are global, from @types/fhir (listed under "types" in tsconfig.json).
const URN_UUID_PREFIX = 'urn:uuid:';

// Synthea creates resources with POST, so loading a bundle twice would duplicate it. Each entry already
// carries a stable id in its fullUrl ("urn:uuid:<id>"), so we turn "POST Condition" into
// "PUT Condition/<id>": the first load creates it, a reload updates it in place.
// References inside the bundle still say "urn:uuid:<id>"; the server resolves them to the new ids.
export function rewritePostToPut(bundle: fhir4.Bundle): fhir4.Bundle {
  const entries = bundle.entry ?? [];
  return { ...bundle, entry: entries.map(rewriteEntry) };
}

function rewriteEntry(entry: fhir4.BundleEntry): fhir4.BundleEntry {
  if (entry.request?.method !== 'POST') {
    return entry; // already PUT (the supplied bundles) or another method: leave it alone
  }
  if (entry.request.ifNoneExist !== undefined) {
    // A conditional create ("create unless one with this identifier exists") is already idempotent.
    // Synthea's Organizations, Locations and Practitioners use it, and patient bundles find them by identifier.
    return entry;
  }
  if (entry.resource === undefined || !entry.fullUrl?.startsWith(URN_UUID_PREFIX)) {
    // Without a urn:uuid we have no stable id, and the load could not be idempotent.
    throw new Error(`POST entry without a urn:uuid fullUrl: ${entry.request.url}`);
  }
  const id = entry.fullUrl.slice(URN_UUID_PREFIX.length);
  const resourceType = entry.resource.resourceType;
  return {
    ...entry,
    resource: { ...entry.resource, id },
    request: { method: 'PUT', url: `${resourceType}/${id}` },
  };
}

// The resource types a bundle contains, so the loader can count every type it touched.
export function resourceTypesIn(bundle: fhir4.Bundle): string[] {
  const types = new Set<string>();
  for (const entry of bundle.entry ?? []) {
    if (entry.resource !== undefined) {
      types.add(entry.resource.resourceType);
    }
  }
  return [...types];
}

// Counts the entry outcomes in a transaction-response, e.g. { "201": 40, "200": 27 }.
// 201 means created, 200 means updated or unchanged, so a second load should show no 201s.
export function countResponseStatuses(response: fhir4.Bundle): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of response.entry ?? []) {
    const statusCode = (entry.response?.status ?? 'unknown').split(' ')[0] ?? 'unknown';
    counts[statusCode] = (counts[statusCode] ?? 0) + 1;
  }
  return counts;
}
