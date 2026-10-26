import type { CriterionResult, CriterionStatus } from '@pa/shared';
import type { PolicyCriterion } from '../policy/policySchema.js';
import type { DocumentWording, EvaluationContext, Evaluator } from './types.js';

// Runs one criterion's evaluator and turns the kind's result into the packet's criterion entry.
// Works the same for every criterion: nothing here knows which criterion it is evaluating.
export function evaluateCriterion(
  criterion: PolicyCriterion,
  evaluator: Evaluator,
  context: EvaluationContext,
): { result: CriterionResult; warnings: string[] } {
  const kindResult = evaluator.evaluate(context);
  const result: CriterionResult = {
    id: criterion.id,
    requirement: criterion.requirement,
    kind: evaluator.kind,
    status: kindResult.status,
    sources: kindResult.sources,
    value: kindResult.value,
    observed: kindResult.observed,
    attested: kindResult.attested,
    note: kindResult.note,
    considered: kindResult.considered,
    window: kindResult.window,
    threshold: kindResult.threshold,
    paths: kindResult.paths,
    missing_document: documentFor(criterion, kindResult.status, evaluator.documents, kindResult.documentVars),
  };
  // Kinds raise generic codes; the criterion id is added here, at runtime ("display_match:<criterion id>").
  const warnings = kindResult.warnings.map((code) => `${code}:${criterion.id}`);
  return { result, warnings };
}

// What to ask the provider for. Only missing and conflicting criteria produce a request: not_met means the
// record already shows the criterion failing, and the nurse decides what happens next.
function documentFor(
  criterion: PolicyCriterion,
  status: CriterionStatus,
  wording: DocumentWording,
  vars: Record<string, string>,
): string | null {
  let template: string | undefined;
  if (status === 'missing') template = wording.missing ?? `Records documenting: ${criterion.requirement}`;
  if (status === 'conflicting') template = wording.conflicting ?? `Records resolving the conflict on: ${criterion.requirement}`;
  if (template === undefined) return null;
  return template.replace(/\{(\w+)\}/g, (placeholder: string, name: string) => vars[name] ?? placeholder);
}
