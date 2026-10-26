import { latestInEffect } from '../versionFolders.js';
import type { LocalModel } from './localModel.js';
import type { ModelVersion } from './modelVersions.js';

// The model versions on disk, and the one in effect today. As with policies, a new version is a dropped-in folder,
// picked up by POST /admin/models/reload without a restart; a reload that fails changes nothing.
//
// "Today" is the server's UTC date. This is deployment, not clinical logic (which model writes a summary has nothing
// to do with the request date), so a folder with a later date is staged: it takes over on that day by itself.

export type LoadedModelVersion = { folder: string; name: string; digest: string; effective: string; in_effect: boolean };
export type ModelReloadResult = { ok: boolean; problems: string[]; versions: LoadedModelVersion[] };

export type ModelRegistry = {
  current(): LocalModel;
  versions(): LoadedModelVersion[];
  reload(): ModelReloadResult;
  lastReload(): (ModelReloadResult & { at: string }) | null;
};

export function createModelRegistry(options: {
  load: () => ModelVersion[]; // reads the models directory (throws on a malformed folder)
  connect: (version: ModelVersion) => LocalModel; // a scripted model in tests
  clock?: () => Date;
}): ModelRegistry {
  const clock = options.clock ?? (() => new Date());
  const today = () => clock().toISOString().slice(0, 10);

  function loadAndConnect(): LocalModel[] {
    const models = options.load().map(options.connect);
    if (latestInEffect(models, today()) === undefined) {
      throw new Error(`No model version is in effect on ${today()}: every version folder has a later date`);
    }
    return models;
  }

  // At startup a problem stops the service: there is nothing older to fall back to.
  let models = loadAndConnect();
  let last: (ModelReloadResult & { at: string }) | null = null;

  // Never undefined: one version was in effect when these were loaded, and dates only move forward.
  const current = () => latestInEffect(models, today()) as LocalModel;

  function versions(): LoadedModelVersion[] {
    const inEffect = current();
    return models.map((model) => ({
      folder: model.folder,
      name: model.name,
      digest: model.digest,
      effective: model.effective,
      in_effect: model === inEffect,
    }));
  }

  return {
    current,
    versions,
    lastReload: () => last,

    reload() {
      let problems: string[] = [];
      try {
        models = loadAndConnect(); // one assignment: a call sees either the old versions or the new ones
      } catch (error) {
        problems = [error instanceof Error ? error.message : String(error)];
      }
      const result = { ok: problems.length === 0, problems, versions: versions() };
      last = { ...result, at: clock().toISOString() };
      return result;
    },
  };
}
