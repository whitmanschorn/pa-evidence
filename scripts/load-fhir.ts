// Loads the FHIR server, in this order:
//   1. Synthea hospitals and practitioners (patient bundles reference them, so they go first)
//   2. Synthea patients
//   3. the supplied bundles, as-is (they already use PUT)
// Every Synthea bundle goes through rewritePostToPut, so reloading is safe and ids stay stable.
// Then it prints a count for every resource type it loaded. Running it twice leaves every count unchanged.
//
// Usage: pnpm load                    (FHIR_LOAD_URL defaults to the host port of the compose HAPI)
//        pnpm load --supplied-only    skip Synthea: reloads the 7 supplied bundles in about a second
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countResponseStatuses, resourceTypesIn, rewritePostToPut } from './fhirBundles.js';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const FHIR_URL = process.env.FHIR_LOAD_URL ?? 'http://localhost:8090/fhir';
const SYNTHEA_DIR = join(REPO_ROOT, 'data/synthea/cache/fhir');
const SUPPLIED_DIR = join(REPO_ROOT, 'data/bundles');
const SUPPLIED_ONLY = process.argv.includes('--supplied-only');

const WAIT_TIMEOUT_MS = 180_000;
const WAIT_INTERVAL_MS = 2_000;

// Every resource type seen while loading. All of them are counted at the end, so a type that
// duplicates on reload cannot hide behind a hand-picked list.
const loadedTypes = new Set<string>();

async function main(): Promise<void> {
  const started = Date.now();
  await waitForServer();

  const syntheaFiles = SUPPLIED_ONLY ? [] : listJsonFiles(SYNTHEA_DIR);
  const hospitalFiles = syntheaFiles.filter((name) => name.startsWith('hospitalInformation'));
  const practitionerFiles = syntheaFiles.filter((name) => name.startsWith('practitionerInformation'));
  const patientFiles = syntheaFiles.filter(
    (name) => !hospitalFiles.includes(name) && !practitionerFiles.includes(name),
  );
  const suppliedFiles = listJsonFiles(SUPPLIED_DIR);

  await loadAll('Synthea hospitals', SYNTHEA_DIR, hospitalFiles, rewritePostToPut);
  await loadAll('Synthea practitioners', SYNTHEA_DIR, practitionerFiles, rewritePostToPut);
  await loadAll('Synthea patients', SYNTHEA_DIR, patientFiles, rewritePostToPut);
  await loadAll('Supplied bundles', SUPPLIED_DIR, suppliedFiles, (bundle) => bundle);

  await printCounts();
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s`);
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${FHIR_URL}/metadata`);
      if (response.ok) {
        console.log(`FHIR server ready at ${FHIR_URL}`);
        return;
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  throw new Error(`FHIR server at ${FHIR_URL} not ready after ${WAIT_TIMEOUT_MS / 1000}s`);
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

async function loadAll(
  label: string,
  dir: string,
  files: string[],
  prepare: (bundle: fhir4.Bundle) => fhir4.Bundle,
): Promise<void> {
  const totals: Record<string, number> = {};
  const started = Date.now();
  for (const [index, file] of files.entries()) {
    const bundle = JSON.parse(readFileSync(join(dir, file), 'utf8')) as fhir4.Bundle;
    for (const resourceType of resourceTypesIn(bundle)) {
      loadedTypes.add(resourceType);
    }
    const statuses = await postTransaction(prepare(bundle), file);
    for (const [status, count] of Object.entries(statuses)) {
      totals[status] = (totals[status] ?? 0) + count;
    }
    // Progress by position only: Synthea file names contain (synthetic) patient names.
    process.stdout.write(`\r${label}: ${index + 1}/${files.length}`);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\r${label}: ${files.length} bundles in ${seconds}s, entry statuses ${JSON.stringify(totals)}`);
}

async function postTransaction(bundle: fhir4.Bundle, file: string): Promise<Record<string, number>> {
  const response = await fetch(FHIR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(bundle),
  });
  if (!response.ok) {
    const outcome = await response.text();
    throw new Error(`Transaction failed for ${file}: HTTP ${response.status}\n${outcome.slice(0, 1000)}`);
  }
  return countResponseStatuses((await response.json()) as fhir4.Bundle);
}

async function printCounts(): Promise<void> {
  console.log('Resource counts:');
  for (const resourceType of [...loadedTypes].sort()) {
    const response = await fetch(`${FHIR_URL}/${resourceType}?_summary=count`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const bundle = (await response.json()) as fhir4.Bundle;
    console.log(`  ${resourceType.padEnd(28)} ${bundle.total}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
