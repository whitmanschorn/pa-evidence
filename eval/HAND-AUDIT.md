<!-- The instructions the hand-audit agent followed on 2026-10-26, for the 17 requests then in the set (SYN-011 came later). The candidate ran the agent; its results are in eval/hand-audit.json and findings F-012 to F-018. -->
# Task: an independent hand audit of the evidence-packet eval (17 requests)

The service in /Users/whitmanschorn/workbench/autonomize-interview/pa-evidence builds evidence packets for GLP-1 prior-auth requests.
For each request it scores every policy criterion `met`, `not_met`, `missing` or `conflicting`, cites the FHIR resources behind each
status, lists what a nurse would ask the provider for, writes a two-sentence summary, and sets a route (`evidence_complete` or
`clinician_review`). Check its results against the raw records and the policy the way a careful utilization-management nurse would, and
record where it is right and where it is wrong. All data is synthetic.

## Rules
- Read-only, except the two files under "Output". Do not edit code, `data/`, `eval/expected/`, `eval/results/` or anything else. Do not
  run pnpm, make or docker, and do not call the API on :8080 (it calls a local model this machine cannot spare right now).
- The FHIR server is HAPI at http://localhost:8090/fhir. GET requests only.
- All date math is anchored to the request form's `request_date`, never today's date.
- Never write approve, deny or authorize in any form (approval, denied, authorization, …).
- Notes and findings name requests by id and records by FHIR reference only: no patient names, birth dates or other identifiers.

## Inputs
- **The brief:** `../FDE_Assignment_v2_Prior_Auth_Evidence_Packet.md`. Read item 2 (what a packet is) and the example packet.
- **The policy:** `data/policies/MP-SYN-021/2026-07-01_2026.1/policy.json`, and `rules-engine-config.json` beside it (thresholds and
  windows the policy has no field for).
- **How ambiguities were settled:** in `DECISIONS.md`, the section "Defaults until the panel answers" and decisions D-028, D-029, D-034,
  D-035 (blocking warnings and the route), D-038 (dates), D-040 (allergies), D-083.
- **Code lists:** `data/terminology/*.json`. They are hand-curated and may be incomplete: flag any chart code that plausibly qualifies
  but is missing from them.
- **Request forms:** `data/requests/PA-001.json` to `PA-007.json` (supplied) and `eval/synthea-requests/SYN-001.json` to `SYN-010.json`
  (written for this eval; each states its request date).
- **Charts:** read them from HAPI, so the ids match what the service cites. The member is the form's `member.fhir_reference`. Fetch
  `Patient/<id>`, then `Condition`, `Observation`, `MedicationRequest`, `AllergyIntolerance` and `DocumentReference` with
  `?patient=<id>&_count=1000` (Synthea charts are large; narrow `Observation` with `&code=` once you know which codes matter).
- **The service's results (step 2 only):** the newest `eval/results/<timestamp>_<sha>.json` (not `models-*.json`). Per request: each
  criterion's `actual_status`, `actual_sources`, `considered` (records it looked at and why each was or was not used) and
  `unresolved_sources`, plus `summary`, `summary_problems`, `route_actual`, `warnings_actual` and `missing_documents_match`.
  `EVAL.md` and `EVAL.html` show the same results.
- **The answer key (step 2 only):** `eval/expected/<id>.json`, `NOTES.md`, `SYNTHEA-NOTES.md`. Written by an AI before the rules code,
  so it can be wrong too. `missing_documents_match: true` means the packet's list equals the key's `missing_documents`.
- **Known findings:** `eval/findings.json` (F-001 to F-011). Reference them; do not duplicate them.

## Method
1. **Blind pass.** Do not open `eval/results/`, `eval/expected/` or `EVAL.*` yet. For each of the 17 requests, read the form and the
   chart and decide yourself: each criterion's status and the FHIR references behind it, what a nurse would ask the provider for, and
   the route. `conflicting` means the form's attested facts disagree with the record on a fact the criterion depends on, and it takes
   precedence over `met`. Write your reasoning per request in a scratch folder outside the repo.
2. **Compare.** Now open the service's results and the answer key. For each request check:
   - each criterion's status against yours;
   - each cited source: GET it, and confirm it supports the status (right code, date inside the window, value past the threshold);
   - nothing in the chart that should change a status was missed (use `considered`);
   - the provider asks: would a nurse ask for exactly these?
   - the summary: exactly two sentences, every fact in it is in the packet, nothing invented, no recommendation;
   - the route and warnings.

   For every disagreement, go back to the records before deciding who is wrong: you, the service, the answer key, or an ambiguous
   policy.
3. **Implausible data.** Note anything in the records a nurse would find implausible: a lab dated after the request, impossible values
   or units, medication dates that do not add up, diagnoses that contradict each other.

## Output
1. **`eval/hand-audit.json`.** Keep the 17 rows in their order. Set `agrees` to true only if the packet is right on everything you
   checked. Write `note` as one to three sentences: what you checked and, if `agrees` is false, what is wrong (criterion id, FHIR
   reference, expected and actual). The file must match `HandAuditEntrySchema` in `packages/shared/src/eval.ts`.
2. **`eval/findings.json`.** Append new findings only (F-012 onward): `{ id, severity: high|medium|low, kind: service|data,
   request_id, criterion_id, text, status: "open" }`. Do not change existing entries. If you disagree with one, say so in your report.
3. **Your reply** (not a file):
   - a table of every disagreement: request, criterion, service says, you say, evidence, who is wrong, confidence;
   - the new findings;
   - anything you could not check, and why;
   - three requests the candidate should spot-check by hand, and what to look at in each.

Be skeptical of everything, the answer key included, and say "not sure" when you are.
