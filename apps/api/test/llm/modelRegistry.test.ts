import { cpSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LocalModel } from '../../src/core/llm/localModel.js';
import { createModelRegistry } from '../../src/core/llm/modelRegistry.js';
import { loadModelVersions } from '../../src/core/llm/modelVersions.js';
import { MODELS_DIR } from '../support/suppliedWorld.js';

const CURRENT = '2026-10-26_1';

// A copy of data/models to change, so the real folder is never touched.
function modelsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'models-'));
  cpSync(join(MODELS_DIR, CURRENT), join(dir, CURRENT), { recursive: true });
  return dir;
}

// A new version folder: a copy of the current one with model.json edited.
function dropVersion(dir: string, folder: string, edit: (config: Record<string, unknown>) => void): void {
  cpSync(join(dir, CURRENT), join(dir, folder), { recursive: true });
  const path = join(dir, folder, 'model.json');
  const config = JSON.parse(readFileSync(path, 'utf8'));
  edit(config);
  writeFileSync(path, JSON.stringify(config));
}

function registryOver(dir: string, today: string) {
  return createModelRegistry({
    load: () => loadModelVersions(dir),
    connect: (version) => ({ ...version, languageModel: 'not-called' }) as LocalModel,
    clock: () => new Date(`${today}T12:00:00.000Z`),
  });
}

describe('model versions (data/models)', () => {
  it('loads the shipped version with its settings, caps and timeouts', () => {
    const [version] = loadModelVersions(MODELS_DIR);
    expect(version?.folder).toBe(CURRENT);
    expect(version?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(version?.timeouts_ms.agent_run).toBeGreaterThan(version?.timeouts_ms.call ?? 0);
  });

  it('refuses a folder whose name disagrees with model.json', () => {
    const dir = modelsDir();
    dropVersion(dir, '2026-11-01_2', (config) => {
      config.version = '3';
    });
    expect(() => loadModelVersions(dir)).toThrow(/its folder says 2026-11-01_2/);
  });

  it('refuses a folder with no model.json, or with anything else in it', () => {
    const missing = modelsDir();
    renameSync(join(missing, CURRENT, 'model.json'), join(missing, CURRENT, 'model.json.partial'));
    expect(() => loadModelVersions(missing)).toThrow(/missing: model.json; unexpected: model.json.partial/);

    const extra = modelsDir();
    writeFileSync(join(extra, CURRENT, 'summary.md'), 'a prompt dropped in as data');
    expect(() => loadModelVersions(extra)).toThrow(/unexpected: summary.md/);
  });

  it('refuses a setting it does not know (a typo would otherwise be silently ignored)', () => {
    const dir = modelsDir();
    dropVersion(dir, '2026-11-01_2', (config) => {
      config.version = '2';
      config.effective = '2026-11-01';
      config.call_settings = { temperature: 0, seed: 42, temprature: 1 };
    });
    expect(() => loadModelVersions(dir)).toThrow(/Invalid model config/);
  });
});

describe('model registry', () => {
  it('uses the latest version in effect today, so a later-dated folder is staged until its day', () => {
    const dir = modelsDir();
    dropVersion(dir, '2026-11-01_2', (config) => {
      config.version = '2';
      config.effective = '2026-11-01';
      config.name = 'a-newer-model:latest';
    });
    expect(registryOver(dir, '2026-10-31').current().name).not.toBe('a-newer-model:latest');
    expect(registryOver(dir, '2026-11-01').current().name).toBe('a-newer-model:latest');
  });

  it('picks up a dropped-in folder on reload, and keeps the old versions when a reload finds a problem', () => {
    const dir = modelsDir();
    const registry = registryOver(dir, '2026-11-02');
    expect(registry.current().folder).toBe(CURRENT);

    dropVersion(dir, '2026-11-01_2', (config) => {
      config.version = '2';
      config.effective = '2026-11-01';
    });
    expect(registry.reload()).toMatchObject({ ok: true, problems: [] });
    expect(registry.current().folder).toBe('2026-11-01_2');

    writeFileSync(join(dir, '2026-11-01_2', 'model.json'), '{"version": "2"}');
    const failed = registry.reload();
    expect(failed.ok).toBe(false);
    expect(failed.problems[0]).toMatch(/Invalid model config/);
    expect(registry.current().folder).toBe('2026-11-01_2'); // still serving what it had
    expect(registry.lastReload()).toMatchObject({ ok: false });
  });

  it('refuses to start when no version is in effect yet', () => {
    expect(() => registryOver(modelsDir(), '2026-01-01')).toThrow(/No model version is in effect on 2026-01-01/);
  });
});
