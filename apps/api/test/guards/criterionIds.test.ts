import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/repoRoot.js';

// Invariant 14: criteria are data. A criterion id (C1 … C9) may appear in source code only in
// the bindings file. Everything else must loop over the policy's criteria list.
const SOURCE_DIRS = ['apps/api/src', 'apps/web/src', 'packages/shared/src', 'scripts'];
const ALLOWED_FILE = 'apps/api/src/core/rules/bindings.ts';
const CRITERION_ID = /\bC[1-9]\b/;

function listSourceFiles(dir: string): string[] {
  const absoluteDir = join(REPO_ROOT, dir);
  let names: string[];
  try {
    names = readdirSync(absoluteDir);
  } catch {
    return []; // the directory does not exist yet
  }
  const files: string[] = [];
  for (const name of names) {
    const relativePath = join(dir, name);
    if (statSync(join(REPO_ROOT, relativePath)).isDirectory()) {
      files.push(...listSourceFiles(relativePath));
    } else if (/\.(ts|tsx)$/.test(name)) {
      files.push(relativePath);
    }
  }
  return files;
}

function isExempt(relativePath: string): boolean {
  if (relativePath === ALLOWED_FILE) return true;
  if (/\.(test|spec)\.tsx?$/.test(relativePath)) return true;
  if (relativePath.includes('/fixtures/')) return true;
  return false;
}

describe('criterion ids in code', () => {
  it('appear only in core/rules/bindings.ts, tests and fixtures', () => {
    const offenders: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of listSourceFiles(dir)) {
        if (isExempt(file)) continue;
        const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (CRITERION_ID.test(line)) {
            offenders.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
