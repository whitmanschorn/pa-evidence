import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// The policy says "match the listed code or any descendant". There is no terminology server here, so each
// curated file in data/terminology/ lists a code's descendants and the words to fall back on when a record
// carries an unknown code (the policy allows matching on the display). Every display match is flagged.

const TermSetSchema = z.object({
  system: z.string(),
  code: z.string(),
  display: z.string(),
  // The concept one level up, when a rule needs it: "type 2 diabetes" -> "diabetes mellitus" lets the evaluator tell
  // "no diabetes in the record" (missing) from "diabetes, but not active type 2" (not met or conflicting).
  broader: z.object({ code: z.string(), display: z.string() }).optional(),
  source: z.string(),
  descendants: z.array(z.object({ code: z.string(), display: z.string() })),
  display_terms: z.array(z.string()),
});
export type TermSet = z.infer<typeof TermSetSchema>;

export type Coding = { system: string; code: string; display?: string };

// Everything a matcher needs for one policy code: the codes that count, and the words to fall back on.
export type Expansion = {
  system: string;
  codes: Set<string>;
  displayTerms: string[];
  label: string;
  broader?: Coding;
};

export type Terminology = {
  expand(coding: Coding): Expansion;
};

export function loadTerminology(dir: string): Terminology {
  const sets = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => TermSetSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
  return terminologyFromSets(sets);
}

export function terminologyFromSets(sets: TermSet[]): Terminology {
  const byKey = new Map<string, TermSet>();
  for (const set of sets) {
    byKey.set(`${set.system}|${set.code}`, set);
  }

  // Collects a code and its descendants, following nested sets (diabetes mellitus -> type 2 -> its children).
  function collectCodes(system: string, code: string, codes: Set<string>): void {
    if (codes.has(code)) return;
    codes.add(code);
    const set = byKey.get(`${system}|${code}`);
    for (const descendant of set?.descendants ?? []) {
      collectCodes(system, descendant.code, codes);
    }
  }

  return {
    expand(coding: Coding): Expansion {
      const codes = new Set<string>();
      collectCodes(coding.system, coding.code, codes);
      const set = byKey.get(`${coding.system}|${coding.code}`);
      if (set !== undefined) {
        const broader = set.broader === undefined ? undefined : { system: coding.system, ...set.broader };
        return { system: coding.system, codes, displayTerms: set.display_terms, label: set.display, broader };
      }
      // No curated file: the code itself, and its display from the policy as the fallback word.
      const displayTerms = coding.display === undefined ? [] : [coding.display];
      return { system: coding.system, codes, displayTerms, label: coding.display ?? coding.code };
    },
  };
}
