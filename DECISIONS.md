# DECISIONS.md

Decisions the build plan ([docs/BUILD-PLAN.md](docs/BUILD-PLAN.md)) did not settle, plus the dependency allowlist.
Locked decisions live in the plan (§2) and are not repeated here. Newest entries go at the bottom of each section.

## Toolchain (Phase 0, verified 2026-10-26)

| Tool | Version | How it got here |
|---|---|---|
| macOS | 26.5.2, arm64 (M3 Pro) | — |
| Node | 24.22.1 (LTS "Krypton") | installed with nvm, set as nvm default (was 22.12.0) |
| pnpm | 12.12.1 | `npm i -g pnpm@12.12.1`; pinned in `package.json#packageManager` |
| git | 2.50.1 (Apple Git-155) | already present |
| Docker Desktop | 4.96.3 (Engine 29.9.2, Compose v5.6.1, 8 GB VM) | Homebrew cask `docker-desktop`; installed by the candidate because the cask needs `sudo` |
| Ollama | 0.40.11 | Homebrew formula `ollama`, run with `brew services` (native, Metal) |

## Dependency allowlist (exact versions)

**Pinning rule:** the newest stable release published at least 14 days before install (a supply-chain
cooldown), unless compatibility forces an older one. Versions are exact in every `package.json`, and
`savePrefix: ''` in `pnpm-workspace.yaml` keeps `pnpm add` exact too.

| Scope | Package | Version | Notes |
|---|---|---|---|
| api | express | 5.3.0 | |
| api | zod | 4.6.6 | also used by `@pa/shared`; fills Pydantic's role |
| api | pino | 10.4.0 | |
| api | pino-http | 11.0.0 | |
| api | jose | 6.2.12 | SMART client assertion (Phase 4) |
| api | ollama | 0.6.4 | |
| api | @modelcontextprotocol/sdk | 1.32.1 | peer `zod ^3.25 \|\| ^4.0`, so it works with Zod 4 (plan §15) |
| api | built-ins | — | `node:sqlite`, `node:crypto`, global `fetch` |
| web | react, react-dom | 19.3.0 | |
| web | react-router | 8.4.0 | still exports `BrowserRouter`/`Routes`/`Route`, so the UI uses plain declarative routing |
| web | @mantine/core, @mantine/hooks, @mantine/charts | 9.7.2 | charts peer: `recharts >=3.2.1`, React ^19.2 (plan §15) |
| web | recharts | 3.10.1 | |
| web | @tabler/icons-react | 3.49.0 | |
| web | swr | 2.5.1 | |
| web | vite | 8.3.4 | |
| web | @vitejs/plugin-react | 6.1.2 | peer `vite ^8` |
| dev | typescript | 6.0.3 | **not 7.x**, see D-002 |
| dev | tsx | 4.23.15 | |
| dev | vitest | 5.0.3 | |
| dev | supertest, @types/supertest | 7.3.1, 7.2.1 | |
| dev | @types/express | 5.0.6 | |
| dev | @types/node | 24.19.2 | matches the Node 24 runtime, see D-003 |
| dev | @types/fhir | 0.0.44 | |
| dev | @types/react, @types/react-dom | 19.3.0 | |
| dev | eslint | 10.12.0 | |
| dev | typescript-eslint | 8.71.1 | |
| dev | @playwright/test | 1.64.0 | Chromium installed with `playwright install chromium` |
| dev | @axe-core/playwright | 4.13.0 | |

### Added beyond the allowlist

| Package | Version | Why |
|---|---|---|
| @eslint/js | 10.0.1 | ESLint's own `recommended` rule set; flat config needs it as a separate package. Published by the ESLint project. |
| globals | 17.13.0 | Node and browser global names for the flat config. Standard companion to ESLint flat config. |

Not added: `postcss-preset-mantine` / `postcss-simple-vars`. They are only needed for Mantine's mixins inside our own
CSS modules; the UI is styled through component props. Add them if a CSS module ever needs `rem()` or mixins.

## Decisions log

**D-001 Version cooldown (Phase 0).** Pin each dependency to its newest release that is at least 14 days old (see the rule above).
Brand-new releases are where broken or malicious publishes show up first. pnpm is pinned the same way (12.12.1, not 12.15.0).

**D-002 TypeScript 6.0.3, not 7.0.2 (Phase 0).** `typescript-eslint@8.71.1` declares `typescript >=4.8.4 <6.1.0`.
TypeScript 7 is the native (Go) compiler and the lint tooling has not caught up. 6.0.3 is the newest version inside the supported range.

**D-003 `@types/node` 24.x (Phase 0).** The newest `@types/node` is 26.x, but it describes Node 26 APIs. 24.19.2 matches the runtime we run.

**D-004 Ollama via the Homebrew formula and `brew services` (Phase 0).** The plan allows the app or Homebrew. The formula is scriptable from
`make` (no GUI), runs natively with Metal, and listens on `127.0.0.1:11434` only (checked with `lsof`). A container reached it at
`host.docker.internal:11434` (checked with a curl container), so we never need `OLLAMA_HOST=0.0.0.0`.
On first start `brew services start ollama` loaded the launch agent but did not run it; `launchctl kickstart -k gui/$UID/sh.brew.ollama` did.

**D-005 pnpm build scripts (Phase 0).** pnpm 12 refuses to install while a dependency's install script is unapproved.
`allowBuilds: { esbuild: true }` in `pnpm-workspace.yaml` approves exactly one: esbuild (via tsx), whose postinstall only checks its platform binary.

**D-006 Test layout (Phase 0).** `pnpm test` builds `@pa/shared` and then runs each package's own vitest (`pnpm -r --if-present test`).
Repo-wide guard tests live in `apps/api/test/guards/`, because the API package is the one that reads the data.

**D-007 Two guard tests start in Phase 0, not Phase 3 (Phase 0).** They cost almost nothing and guard from the first line of code:
- `dataChecksums.test.ts`: every supplied file still matches `data/CHECKSUMS.sha256` (invariant 13).
- `criterionIds.test.ts`: `C1`…`C9` appear only in `core/rules/bindings.ts`, tests and fixtures (invariant 14).
  It scans comments too, on purpose: a comment like "C3 is special" is the first step toward code that special-cases C3.

**D-008 One definition of the banned words (Phase 0).** `findForbiddenTerms()` lives in `@pa/shared`, so the API's `outputGuard`
(Phase 4) and the UI specs use the same pattern. It matches `approv*` and `*authori[sz]*` anywhere in a word (catching "Unauthorized" and
"preauthorization"), and the deny family (deny, denies, denied, denying, denial, denials) as whole words only, so "denominator" is allowed.

**D-009 `pnpm lint` also typechecks (Phase 0).** `pnpm lint` runs ESLint and then `tsc --noEmit` in every package, so one command catches boundary
violations and type errors.

**D-010 Module resolution (Phase 0).** The API and `@pa/shared` use `NodeNext` with `.js` import specifiers; that output runs on plain Node
and under tsx. The web app uses `Bundler` resolution (Vite). `tsconfig.base.json` sets `types: []` and each package opts in
(`node`, `vite/client`), so browser code never sees Node types by accident.

**D-011 Playwright projects (Phase 0).** One config, two projects. `ui` starts Vite's dev server at `http://localhost:5173`; `e2e` targets
`http://localhost:8080` (`E2E_BASE_URL` overrides it). `pnpm test:e2e` sets `E2E=1` so Vite is not started for it, and passes
`--pass-with-no-tests` until Phase 8 adds the e2e specs. Specs navigate to `/ui/...` explicitly rather than relying on baseURL path joining.

**D-012 API paths in one list (Phase 0).** `apps/web/src/apiPaths.ts` lists the API's path prefixes. The Vite dev proxy and the Playwright mock
read the same list. In the `ui` project, an API call the spec did not mock is answered with 501 and recorded, and specs assert there were none.

**D-013 Accessible "dimmed" text (Phase 0).** axe flagged Mantine's default dimmed colour (gray.6, about 3.3:1 on white). The theme's
`cssVariablesResolver` maps `--mantine-color-dimmed` to gray.7 (about 8:1) for the whole app.

**D-014 Data copy (Phase 0).** `data/` is an `rsync` of `../fde-v2-data/` without macOS `.DS_Store` files. `data/CHECKSUMS.sha256` covers all 17
supplied files. The brief itself is one level up (`../FDE_Assignment_v2_Prior_Auth_Evidence_Packet.md`), not inside `fde-v2-data`, and is not committed.

**D-015 Tentative choices to confirm in later phases (Phase 0).**
- `AUTH_TOKENS` format `role:subject:sha256hex`, comma-separated (Phase 4).
- The UI header needs the caller's identity and role. Tentatively `GET /me` with `allow('health:read')`, which every role holds (Phase 4).
  `/me` is already in the API path list.
- API on port 8080. HAPI is `hapi:8080` inside compose and gets a different host port in Phase 1.

**D-016 Git identity (Phase 0).** No global git identity was configured. The repo-local identity is Whitman Schorn <me@wschorn.com>.

## Defaults until the panel answers (plan §7; the candidate is emailing the panel)

1. **eGFR threshold.** The policy has `value_max: 30` but its note says "< 30". Default: strict `< 30`, using the latest eGFR on or before
   the request date, with no window.
2. **HbA1c.** Results dated after the request date are excluded. Results in mmol/mol don't qualify: mark `missing` with a warning and ask
   for the result in %. The most recent in-window result is the one used.
3. **Metformin months tolerance.** ±1 month between `metformin_trial_months` and the record's total duration (days / 30.44).
4. **Requested drug not on `covered_medications`.** Warning only, and the route is forced to `clinician_review`.
