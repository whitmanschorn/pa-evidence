# pa-evidence

Evidence packets for utilization review of GLP-1 requests (synthetic data only).

Work in progress. The build plan is in [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md), the decisions are in
[DECISIONS.md](DECISIONS.md), and the hours are in [HOURS.md](HOURS.md). The full README is written in Phase 9.

## ⚠ Two places we read the brief over the build plan

The answer key (`eval/expected/`, written by hand before any rules code) departs from the original build plan on two C3
(metformin) rules. The brief settled the first one:

> "Only one of the seven requests meets policy. Others are missing a document, fail a criterion, or contain a conflict
> between what the prescriber attests and what the record shows." (assignment brief)

1. **PA-004: an attestation conflict counts even when C3 is met another way.** The plan said a months mismatch is only a
   warning when C3 is met through intolerance (path B). Under that rule PA-004 meets all five criteria: its record has a
   confirmed metformin intolerance. That makes **two** of the seven meet policy, which the sentence above rules out. The prescriber attests a
   6-month metformin trial; the record shows 21 days. The policy file says *"Where the prescriber attestation and the record
   disagree, mark the criterion conflicting and cite both"*, and conflicting *"takes precedence over met"*. So PA-004 C3 is
   **conflicting**, and the packet cites both the stopped order and the intolerance for the nurse.
2. **PA-005: the metformin months check is one-sided.** The brief defines conflicting as the form disagreeing with the record
   *"on a fact the criterion depends on"*. PA-005 attests 30 months, and the record shows 32.5 months of active therapy. The record supports more than
   was claimed, so nothing contradicts the 90-day requirement. A two-sided ±1 month check would mark it conflicting and ask
   the provider to prove 30 months the chart already shows. So C3 is conflicting only when the form claims **more** than the
   record supports (by more than 1 month). PA-005 keeps its one designed issue: resolved pancreatitis, C4 not met.

With both rules the seven requests line up with the brief: one meets policy, and each of the other six has exactly one issue
(one missing, two not met, three conflicting). Details: [eval/expected/NOTES.md](eval/expected/NOTES.md), decisions D-028 and D-029 in
[DECISIONS.md](DECISIONS.md).

## What runs so far

Needs Docker Desktop, Node 24 and pnpm 12.

```sh
pnpm install
make tokens    # nurse/admin/probe tokens: hashes to .env, plaintext to .tokens.local (both gitignored)
make up        # HAPI + Postgres + the API, then loads the Synthea sample and the 7 supplied bundles
make reload-policies   # pick up a dropped-in data/policies/<id>/<effective>_<version>/ folder without a restart
make down      # stop (data kept)   |   make reset   # stop and delete the data
```

| Port (this machine only) | What |
|---|---|
| `http://localhost:8080` | the API; the UI at `/ui` |
| `http://localhost:8090/fhir` | HAPI FHIR |

```sh
NURSE=$(grep '^nurse=' .tokens.local | cut -d= -f2)
curl -i http://localhost:8080/requests/PA-001/evidence                            # 401 Unauthenticated
curl -H "Authorization: Bearer $NURSE" http://localhost:8080/requests/PA-001/evidence
curl -H "Authorization: Bearer $NURSE" http://localhost:8080/audit                 # 403 forbidden (admin only)
```

```sh
pnpm lint      # ESLint (with the import boundaries) + TypeScript
pnpm test      # vitest: rules engine, API, audit, auth, loader, guard tests
pnpm test:ui   # Playwright against Vite with a mocked API   (review: pnpm test:ui:report)
pnpm test:e2e  # Playwright against the running stack (make up) (review: pnpm test:e2e:report)
```
