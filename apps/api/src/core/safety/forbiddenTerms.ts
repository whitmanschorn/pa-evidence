import { findForbiddenTerms } from '@pa/shared';

// Invariant 5: no output may contain any form of approve, deny or authorize. Every way out of the service uses
// this one check: JSON responses (outputGuard), SSE events and MCP tool results.
export class OutputPolicyError extends Error {
  constructor(public readonly termCount: number) {
    super('output_policy_violation');
  }
}

export function assertNoForbiddenTerms(text: string): void {
  const found = findForbiddenTerms(text);
  if (found.length > 0) {
    throw new OutputPolicyError(found.length); // the count is logged, never the words or the text around them
  }
}
