# Synthea overlays

Resources added by hand to Synthea sample patients for the eval. `pnpm load` loads them after the Synthea patients, with PUT, so
reloading is safe. The Synthea files themselves (`data/synthea/cache/`) are never edited; their checksums still match.

Every added resource carries the tag `urn:pa-evidence:eval|synthea-overlay`, so it can be told apart in the record itself.

| File | Patient | What it adds | Why |
|---|---|---|---|
| `SYN-011.json` | `Patient/37cd4685-45ad-8602-7fff-2b04af9bc008` (also SYN-001) | one HbA1c, 7.6 % on 2026-10-23 | No sample patient can be evidence complete (F-005): only two ever have an HbA1c of 7 % or more, the latest in March 2025, before the policy takes effect. SYN-011 is SYN-001's resubmission after the HbA1c the nurse asked for was recorded. The result is dated after SYN-001's request date (2026-10-20), so SYN-001's packet does not change. |
