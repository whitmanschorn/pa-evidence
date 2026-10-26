# Answer key notes: the ten Synthea requests (Phase 7)

The forms are in `eval/synthea-requests/` (SYN-001 to SYN-010), one per Synthea sample patient chosen to cover a case
the supplied requests do not. Each key was derived by hand from the patient's bundle (pulled with small queries over
`data/synthea/cache/fhir/`, not with the rules code) and written before the first eval run. Every request is dated
2026-10-20 except SYN-002 (2026-09-01, so its June HbA1c is in the window) and SYN-003 (2025-04-15, before the policy).

Windows for 2026-10-20: C2 HbA1c `2026-07-22..2026-10-20`; C3 path A `2025-10-20..2026-10-20`.

| Request | Patient (sample) | Case | C1 | C2 | C3 | C4 | C5 |
|---|---|---|---|---|---|---|---|
| SYN-001 | Raquel318 | T2DM on metformin; HbA1c attested from an outside lab | met | missing | met | met | met |
| SYN-002 | Marlin805 | attested HbA1c contradicts the record; short current course | met | conflicting | missing | met | met |
| SYN-003 | Denisha680 | request before the policy took effect | met | met | missing | met | met |
| SYN-004 | Miranda712 | diabetes recorded only as type 2 complications | met (display) | missing | missing | met | met |
| SYN-005 | Guy979 | prediabetes only; attested HbA1c contradicts; eGFR 12 | missing | conflicting | met (eGFR) | met | met |
| SYN-006 | Peter292 | no diabetes at all; every attested fact absent | missing | missing | missing | met | met |
| SYN-007 | Billie243 | member aged 15 | missing | missing | missing | met | not met |
| SYN-008 | Angelyn934 | HbA1c 3.11 %; 12 months attested; orders without end dates | met | not met | missing | met | met |
| SYN-009 | Kendrick479 | diabetic kidney disease, eGFR 24.8 | met | not met | met (eGFR) | met | met |
| SYN-010 | Ignacio928 | the record says the member died in 2008 | met | missing | missing | met | met |
| SYN-011 | Raquel318 (SYN-001's patient) | SYN-001 resubmitted after the HbA1c was recorded; **one result added by hand** | met | met | met | met | met |

No Synthea patient as generated meets every criterion: no one in the sample has an HbA1c of 7 % or more in 2026 (see findings), and
nobody has pancreatitis, medullary thyroid carcinoma or MEN2, so C4 is met throughout.

## Decisions taken while deriving

- **Metformin orders with no end date.** Synthea writes every past metformin order as `completed` with no
  `validityPeriod`. Their durations are unknown: not counted, warning `medication_end_unknown`, and a short known total is
  `missing` (ask for the fill history), not `not_met` (D-034 in DECISIONS).
- **SYN-008 C3 is missing, not conflicting.** 12 months attested; the record has 6 known days and 33 orders of unknown
  length. A record that cannot show how long therapy ran cannot contradict the form: the policy calls "nothing either
  way" missing. (The first eval run found the service saying conflicting; fixed, see findings F-001.)
- **SYN-005 C1 is missing, not conflicting.** Prediabetes is not diabetes; the C1 conflicting rule needs a
  non-active or other-type diabetes record.
- **SYN-005 and SYN-009 C3 are met through path C** (eGFR under 30). For SYN-005 the eGFR (12.364) is in `mL/min`, not
  `mL/min/{1.73_m2}`, and nothing else in the record suggests kidney failure: the key follows the policy, which names no
  unit, and the finding F-004 raises it.

## Corrections after the first run (2026-10-26)

The first run disagreed with the key in four ways that were the key's mistakes, not the service's:

1. **Display-matched complications are cited.** For SYN-003, SYN-008 and SYN-009 the key cited only the Condition coded
   44054006. The service matches the listed code or any descendant, falls back to the display text (the policy's note allows it), and flags every display match.
   "Neuropathy due to type 2 diabetes" and the like are SNOMED descendants of 44054006 and match by display, so they are
   cited too, with `display_match:C1`.
2. **Warnings from a kind carry the criterion id.** `implausible_deceased_before_request:C5`, as the warning rule says.
3. **`other_in_window_result` on C3 path C** (SYN-002, SYN-009). The warning was written for C2's window; path C has
   no window, so the service compares the latest eGFR with every earlier one. Nothing decided this case beforehand; the
   key accepts the service's behaviour and finding F-003 asks whether to keep it.

And two were the service's: SYN-008 C3 (above) and a `display_match` raised for a display-matched Condition that was
not cited (SYN-010), both fixed with unit tests.

## SYN-011: the one chart with a result added by hand (D-089)

Added after the hand audit of the other seventeen, at the candidate's request, so the Synthea set has an `evidence_complete` row.
`eval/synthea-overlays/SYN-011.json` adds one HbA1c (7.6 % on 2026-10-23) to SYN-001's patient; nothing else in the chart changes.
Request date 2026-10-24: C2 window `2026-07-26..2026-10-24`, so the added result is the only one in it and meets C2. C3 is met as in
SYN-001, with the active order running 239 days to the request date (7.85 months against 7 attested). SYN-001 (2026-10-20) is
unchanged, because the added result is dated after its request date. The key was written before the run.
