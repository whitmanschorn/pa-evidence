import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Reads every .json file named in `paths`. A path may be a file or a directory (its .json files, sorted).
// Missing paths are skipped, so an empty data/policies/ directory is fine.
export function readJsonFiles(paths: string[]): { path: string; json: unknown }[] {
  const files: string[] = [];
  for (const path of paths) {
    let isDirectory: boolean;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) {
      const names = readdirSync(path).filter((name) => name.endsWith('.json')).sort();
      files.push(...names.map((name) => join(path, name)));
    } else {
      files.push(path);
    }
  }
  return files.map((path) => ({ path, json: JSON.parse(readFileSync(path, 'utf8')) as unknown }));
}
