import type { PathResult } from '@pa/shared';
import { unique } from '../matching.js';
import type { AnyOfBinding, EvaluationContext, Evaluator, KindResult, PathBinding } from '../types.js';

// "Path A, or path B, or path C." Example: 90 days of metformin, or a metformin intolerance, or eGFR < 30.
//   conflicting: any path is conflicting (an attestation conflict counts whichever path is met; D-028)
//   met:         any path is met
//   otherwise:   the primary path's status (not_met or missing). A failed alternative, such as a normal
//                eGFR, never makes the criterion not_met on its own.
export function buildAnyOf(
  fhirBlock: Record<string, unknown>,
  binding: AnyOfBinding,
  buildPath: (fhirBlock: Record<string, unknown>, path: PathBinding) => Evaluator,
): Evaluator {
  const paths = [binding.primary, ...binding.alternatives].map((pathBinding) => ({
    from: pathBinding.from ?? 'primary',
    evaluator: buildPath(fhirBlock, pathBinding),
  }));
  const primary = paths[0]!; // the binding type guarantees a primary

  function evaluate(context: EvaluationContext): KindResult {
    const results = paths.map((path) => ({ ...path, result: path.evaluator.evaluate(context) }));
    const primaryResult = results[0]!.result;
    const metAlternatives = results.slice(1).filter((path) => path.result.status === 'met');

    let status: KindResult['status'];
    let sources: string[];
    if (results.some((path) => path.result.status === 'conflicting')) {
      status = 'conflicting';
      sources = unique([...primaryResult.sources, ...metAlternatives.flatMap((path) => path.result.sources)]);
    } else if (primaryResult.status === 'met' || metAlternatives.length > 0) {
      status = 'met';
      const metPaths = results.filter((path) => path.result.status === 'met');
      sources = unique(metPaths.flatMap((path) => path.result.sources));
    } else {
      status = primaryResult.status;
      sources = primaryResult.sources;
    }

    // e.g. "21 of 365 days in window (path A); intolerance documented (path B)"
    const shown = [results[0]!, ...metAlternatives].filter((path) => path.result.value !== undefined);
    const value = shown.map((path) => `${path.result.value} (${labelOf(path.from)})`).join('; ');

    const pathResults: PathResult[] = results.map((path) => ({
      from: path.from,
      label: labelOf(path.from),
      kind: path.evaluator.kind,
      status: path.result.status,
      sources: path.result.sources,
      value: path.result.value,
      considered: path.result.considered,
      window: path.result.window,
      threshold: path.result.threshold,
    }));

    return {
      status,
      sources,
      value: value === '' ? undefined : value,
      attested: results.find((path) => path.result.attested !== undefined)?.result.attested,
      note: primaryResult.note,
      considered: results.flatMap((path) => path.result.considered),
      paths: pathResults,
      warnings: unique(results.flatMap((path) => path.result.warnings)),
      documentVars: primaryResult.documentVars,
    };
  }

  return {
    kind: 'any_of',
    needs: paths.flatMap((path) => path.evaluator.needs),
    documents: { ...primary.evaluator.documents, ...binding.documents },
    evaluate,
  };
}

// "path_a" -> "path A"
function labelOf(from: string): string {
  return from.startsWith('path_') ? `path ${from.slice('path_'.length).toUpperCase()}` : from;
}
