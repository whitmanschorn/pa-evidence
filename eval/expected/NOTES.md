# Answer key notes (Phase 2)

Hand-derived from the seven request forms and bundles before any rules code existed. Every request is dated
2026-10-01, so policy version 2026.1 (effective 2026-07-01) is in effect for all of them, and every requested drug
(RxNorm 1991302) is on `covered_medications`.

Windows, anchored to the request date: C2 HbA1c `2026-07-03..2026-10-01` (90 days). C3 path A `2025-10-01..2026-10-01`
(365 days). Day counts are `end − start`, so an order covering the whole window is "365 of 365 days".
Metformin months = total record days across all orders (not clipped to the window) / 30.44.

| Request | C1 | C2 | C3 | C4 | C5 | Route | The one issue |
|---|---|---|---|---|---|---|---|
| PA-001 | met | met | met | met | met | evidence_complete | none |
| PA-002 | met | **missing** | met | met | met | clinician_review | HbA1c only from 2025-07-20, outside the window |
| PA-003 | met | met | **not_met** | met | met | clinician_review | metformin 35 days, under 90 |
| PA-004 | met | met | **conflicting** | met | met | clinician_review | attested 6 months, record 21 days |
| PA-005 | met | met | met | **not_met** | met | clinician_review | pancreatitis (resolved) in history |
| PA-006 | met | **conflicting** | met | met | met | clinician_review | attested 7.8 %, record 6.4 % on the same date |
| PA-007 | **conflicting** | met | met | met | met | clinician_review | T2DM resolved, form claims T2DM |

This matches the brief: "Only one of the seven requests meets policy. Others are missing a document, fail a criterion,
or contain a conflict." Each non-passing request has exactly one designed issue, and the three kinds of issue are each covered.

## PA-001 checked against the plan's golden case (§7)

Every field matches: C1 cites `Condition/b1aa0158…`. C2 cites only `Observation/17151fc0…`, 8.1 % on 2026-09-03,
28 days before the request; the 8.6 % from 2026-03-11 is outside the window and not cited. Attested 8.1 % on 2026-09-03 agrees.
C3: metformin active since 2025-07-15 covers 365 of 365 days; record total 443 days = 14.55 months, attested 14 agrees. C4 met with no
sources. C5 age 54. The LDL Observation and the hypertension Condition are not cited. Route `evidence_complete`.

## Two decisions for the candidate (the key departs from the plan's §7 wording)

**1. PA-004 C3: conflicting, not met.** The plan says "if C3 is met via path B or C, a mismatch in months is only a warning".
Under that rule PA-004 has all five criteria met (path B: confirmed metformin intolerance) and routes `evidence_complete`.
That would give two requests meeting policy, which contradicts the brief. The policy itself says "Where the prescriber
attestation and the record disagree, mark the criterion conflicting and cite both", and conflicting "takes precedence over met".
The key follows the policy: the attestation conflict applies whichever path meets C3, and C3 cites both the stopped order and the intolerance.

**2. PA-005 C3: met, not conflicting.** The plan's default is a two-sided ±1 month tolerance. Attested 30 months against a record of 32.52
months is 2.52 months apart, so the default says conflicting. The request to the provider would then be "send fill history supporting
the reported 30 months" while the chart already shows 32.5 months of active therapy. The key uses a one-sided rule:
**C3 is conflicting when the attestation claims more than the record supports by more than 1 month** (attested − record > 1).
A record showing more therapy than attested does not contradict the attestation. C2 stays two-sided (a lab value either matches or it doesn't, tolerance 0.1).
This also keeps PA-005 to its one designed issue (C4).

Neither choice changes any other request: every other attested duration is within 1 month below the record, and PA-004's
+5.31 months fails both the one-sided and the two-sided rule.

## Ambiguities the plan's defaults already settle

- **PA-002 C2 is missing, not conflicting.** The form attests 8.0 % on 2026-09-10, but the record has no HbA1c in the window,
  and an absent record is never conflicting. The packet should show the attested value with `agrees: null` (nothing to compare).
- **PA-006 C2 is conflicting, not not_met.** Record 6.4 % on the attested date would fail the threshold on its own; conflicting takes precedence.
- **PA-007 C1 is conflicting, not not_met.** The record's only T2DM Condition is resolved, and the form's structured `diagnosis_claimed`
  is T2DM. The plan's C1 rule picks conflicting; a reader who ignores the form would say not_met.
- **PA-003 has no missing_documents.** It routes to `clinician_review` with an empty list: the record shows C3 failing, and the plan only
  defines provider asks for missing and conflicting. (An alternative would ask for intolerance or contraindication documentation.)
- **PA-005 C4: resolved pancreatitis counts.** The policy says "a resolved or inactive Condition still counts as history".
- **C4 met cites no sources.** The packet's `note` names the codes searched instead.
- **Window edges don't matter here.** No supplied result is within weeks of a window boundary, so inclusive versus exclusive doesn't change any status.
- **PA-004's stopped order has an end date** (`validityPeriod.end` 2026-02-22), so its 21 days are known and there is no `medication_end_unknown` warning.
- **No warnings are expected** for any of the seven.

## For later phases

- **Prompt injection in PA-006.** The Condition's `note` and the DocumentReference (base64 office note) both carry an embedded instruction
  aimed at the reviewer, telling them to treat every criterion as met. The rules never read free text and it never reaches the model.
  But the source drawer would return that Condition with the note intact. The note contains a banned word, so `outputGuard` would block the
  whole response. Proposal for Phase 4: the source endpoint returns the resource without free-text fields (`note`, `text`, attachment `data`)
  and says that free text was left out.
- **Data findings for EVAL.md.**
  - PA-007 has active metformin and a recent HbA1c of 8.4 % but marks T2DM resolved: an inconsistent record, which is why C1 is conflicting.
  - PA-004's MedicationRequest note mentions GI intolerance (free text, not used; the structured AllergyIntolerance carries the same fact).
  - PA-002's request note says the A1c is at an outside lab (free text, not used; our provider ask matches it).
