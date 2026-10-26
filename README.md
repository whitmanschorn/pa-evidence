# pa-evidence

Evidence packets for utilization review of GLP-1 requests (synthetic data only).

Work in progress. The build plan is in [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md), the decisions are in
[DECISIONS.md](DECISIONS.md), and the hours are in [HOURS.md](HOURS.md). The full README is written in Phase 9.

## Checks available so far

```sh
pnpm install
pnpm lint      # ESLint (with the import boundaries) + TypeScript
pnpm test      # vitest: shared package + repo guard tests
pnpm test:ui   # Playwright against Vite with a mocked API
```
