# pa-evidence

Evidence packets for utilization review of GLP-1 requests (synthetic data only).

Work in progress. The build plan is in [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md), the decisions are in
[DECISIONS.md](DECISIONS.md), and the hours are in [HOURS.md](HOURS.md). The full README is written in Phase 9.

## What runs so far

Needs Docker Desktop, Node 24 and pnpm 12.

```sh
pnpm install
make up        # HAPI FHIR + Postgres, then loads the Synthea sample and the 7 supplied bundles (about 3 minutes from clean)
make load      # reload; safe to repeat, counts do not change
make down      # stop (data kept)   |   make reset   # stop and delete the data
```

HAPI FHIR listens on `http://localhost:8090/fhir` (this machine only).

```sh
pnpm lint      # ESLint (with the import boundaries) + TypeScript
pnpm test      # vitest: shared package, loader, repo guard tests
pnpm test:ui   # Playwright against Vite with a mocked API
```
