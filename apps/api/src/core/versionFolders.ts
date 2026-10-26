import { readdirSync, statSync } from 'node:fs';

// Rules shared by every folder of dropped-in versions (policies, models): each version is a folder named
// "<effective date>_<version>", dotfiles are ignored, and versions must take effect in version order.

const VERSION_FOLDER = /^(\d{4}-\d{2}-\d{2})_(.+)$/;

export function parseVersionFolderName(name: string): { effective: string; version: string } | null {
  const match = VERSION_FOLDER.exec(name);
  if (match === null) return null;
  return { effective: match[1] ?? '', version: match[2] ?? '' };
}

// Entries in a folder, without dotfiles (.DS_Store, SFTP partial-upload markers).
export function visibleNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort();
}

export function requireDirectory(path: string, rule: string): void {
  if (!statSync(path).isDirectory()) {
    throw new Error(`Unexpected file ${path}: ${rule}`);
  }
}

// Sorted by effective date, the versions must also be in version order, with no two on the same day; otherwise it is
// ambiguous what applied when, so loading fails.
export function checkVersionOrder(versions: { effective: string; version: string }[], label: string): void {
  const sorted = [...versions].sort((a, b) => a.effective.localeCompare(b.effective));
  for (let index = 1; index < sorted.length; index += 1) {
    const earlier = sorted[index - 1]!;
    const later = sorted[index]!;
    const pair = `${label} ${earlier.version} (effective ${earlier.effective}) and ${later.version} (effective ${later.effective})`;
    if (earlier.effective === later.effective) throw new Error(`Two versions take effect on the same day: ${pair}`);
    if (compareVersions(earlier.version, later.version) >= 0) throw new Error(`Version order contradicts effective-date order: ${pair}`);
  }
}

// Compares "2026.1" with "2026.10" part by part, numerically where both parts are numbers (so 2026.10 > 2026.9).
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const aPart = aParts[index] ?? '';
    const bPart = bParts[index] ?? '';
    const bothNumeric = /^\d+$/.test(aPart) && /^\d+$/.test(bPart);
    const difference = bothNumeric ? Number(aPart) - Number(bPart) : aPart.localeCompare(bPart);
    if (difference !== 0) return difference;
  }
  return 0;
}

// The version in effect on a date: the latest one whose effective date is on or before it.
export function latestInEffect<T extends { effective: string }>(versions: T[], onDate: string): T | undefined {
  const inEffect = versions.filter((version) => version.effective <= onDate).sort((a, b) => a.effective.localeCompare(b.effective));
  return inEffect[inEffect.length - 1];
}
