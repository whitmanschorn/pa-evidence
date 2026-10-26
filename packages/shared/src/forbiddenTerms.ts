// The service assembles evidence and never states a determination, so no output may contain
// any form of approve, deny or authorize. One definition, shared by the API's output guard
// and the UI's Playwright specs, so the two can never disagree.
//
// - "approv" and "authori[sz]" match anywhere in a word, which also catches
//   "disapprove", "Unauthorized" and "preauthorization".
// - deny is matched as whole words only, so "denominator" or "Denmark" stay allowed.
const FORBIDDEN_PATTERN = /approv\w*|\w*authori[sz]\w*|\bden(?:y|ies|ied|ying|ials?)\b/gi;

// Returns every forbidden word found, lower-cased (an empty array means the text is clean).
export function findForbiddenTerms(text: string): string[] {
  const matches = text.match(FORBIDDEN_PATTERN) ?? [];
  return matches.map((match) => match.toLowerCase());
}
