# DECISIONS.md

Technical decisions made while building, plus the dependency allowlist. Newest entries go at the bottom of each section.

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
| api | ollama | 0.6.4 | replaced in Phase 6 by the Vercel AI SDK (D-067) |
| api | @modelcontextprotocol/sdk | 1.32.1 | peer `zod ^3.25 \|\| ^4.0`, so it works with Zod 4 |
| api | built-ins | — | `node:sqlite`, `node:crypto`, global `fetch` |
| web | react, react-dom | 19.3.0 | |
| web | react-router | 8.4.0 | still exports `BrowserRouter`/`Routes`/`Route`, so the UI uses plain declarative routing |
| web | @mantine/core, @mantine/hooks, @mantine/charts | 9.7.2 | charts peer: `recharts >=3.2.1`, React ^19.2 |
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
| ai, @ai-sdk/openai-compatible, @ai-sdk/mcp, @ai-sdk/provider (dev) | 7.0.137, 3.0.67, 2.0.73, 4.0.26 | The Vercel AI SDK for every model call and the agent loop; replace `ollama` from the list above. See D-067. |
| eventsource-parser (in `@pa/shared`) | 3.1.1 | Parses the agent run's server-sent events in the UI and the CLI. The parser the AI SDK itself uses (already in the lockfile). See D-074. |

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
- `criterionIds.test.ts`: `C1`…`C9` appear only in tests and fixtures, never in source code (invariant 14; until D-097, also in
  `core/rules/bindings.ts`).
  It scans comments too, on purpose: a comment like "C3 is special" is the first step toward code that special-cases C3.

**D-008 One definition of the banned words (Phase 0).** `findForbiddenTerms()` lives in `@pa/shared`, so the API's `outputGuard`
(Phase 4) and the UI specs use the same pattern. It matches `approv*` and `*authori[sz]*` anywhere in a word (catching "Unauthorized" and
"preauthorization"), and the deny family (deny, denies, denied, denying, denial, denials) as whole words only, so "denominator" is allowed.

**D-009 `pnpm lint` also typechecks (Phase 0).** `pnpm lint` runs ESLint and then `tsc --noEmit` in every package, so one command catches boundary
violations and type errors.

**D-010 Module resolution (Phase 0).** The API and `@pa/shared` use `NodeNext` with `.js` import specifiers; that output runs on plain Node
and under tsx. The web app uses `Bundler` resolution (Vite). `tsconfig.base.json` sets `types: []` and each package opts in
(`node`, `vite/client`), so browser code never sees Node types by accident.

**D-011 (partly superseded by D-058) Playwright projects (Phase 0).** One config, two projects. `ui` starts Vite's dev server at `http://localhost:5173`; `e2e` targets
`http://localhost:8080` (`E2E_BASE_URL` overrides it). `pnpm test:e2e` sets `E2E=1` so Vite is not started for it, and passes
`--pass-with-no-tests` until the first e2e spec exists. Specs navigate to `/ui/...` explicitly rather than relying on baseURL path joining.

**D-012 (mock mechanism superseded by D-058) API paths in one list (Phase 0).** `apps/web/src/apiPaths.ts` lists the API's path prefixes. The Vite dev proxy and the Playwright mock
read the same list. In the `ui` project, an API call the spec did not mock is answered with 501 and recorded, and specs assert there were none.

**D-013 Accessible "dimmed" text (Phase 0).** axe flagged Mantine's default dimmed colour (gray.6, about 3.3:1 on white). The theme's
`cssVariablesResolver` maps `--mantine-color-dimmed` to gray.7 (about 8:1) for the whole app.

**D-014 Data copy (Phase 0).** `data/` is an `rsync` of `../fde-v2-data/` without macOS `.DS_Store` files. `data/CHECKSUMS.sha256` covers all 17
supplied files. The brief itself is one level up (`../FDE_Assignment_v2_Prior_Auth_Evidence_Packet.md`), not inside `fde-v2-data`, and is not committed.

**D-015 Tentative choices to confirm in later phases (Phase 0).**
- `AUTH_TOKENS` format `role:subject:sha256hex`, comma-separated (Phase 4).
- The UI header needs the caller's identity and role. Settled in Phase 4 as `GET /userinfo` (D-047).
- API on port 8080. HAPI is `hapi:8080` inside compose and gets a different host port in Phase 1.

**D-016 Git identity (Phase 0).** No global git identity was configured. The repo-local identity is Whitman Schorn <me@wschorn.com>.

**D-017 HAPI image (Phase 1).** `hapiproject/hapi:v8.12.0-2` (released 2026-10-02), pinned by its multi-arch index digest
`sha256:0ff86aac…`. The index has a native `linux/arm64` image (verified), so no emulation. The image is distroless
(no shell, no curl) and ships a `HealthCheck` Java class that probes `/actuator/health`; the compose healthcheck runs it, which is
what lets `docker compose up --wait` block until HAPI is ready.

**D-018 HAPI stores its data in Postgres, not the built-in H2 (Phase 1).** The image runs as non-root user 65532 and has no
`/app/target` directory, so a named volume for H2's file would be created root-owned and HAPI could not write to it. Postgres
(`postgres:17.11-alpine`, pinned by digest) manages its own volume, so data survives `make down` and `make reset` deletes it.
It has no password (`POSTGRES_HOST_AUTH_METHOD: trust`) because it publishes no port and is reachable only on the compose network.
A real deployment uses a managed database with credentials from a secret store (PLAN.md, week 6).

**D-019 HAPI search cache off (Phase 1).** `hapi.fhir.reuse_cached_search_results_millis: 0`, so a search never returns a result set
cached before a reload. The FHIR client will also send `Cache-Control: no-cache` (Phase 3); either alone is enough.

**D-020 HAPI is host-only (Phase 1).** The port mapping is `127.0.0.1:8090:8080`: reachable from this machine, never from the network.
Inside compose the API will reach it as `http://hapi:8080/fhir`.

**D-021 Synthea sample: the official one, pinned to a commit (Phase 1).** The "latest" download URL is regenerated by Synthea's CI
several times a week (it changed on 2026-10-21), so a sha256 against it would break. The raw GitHub URL at commit `84f59805` never
changes; `make synthea` downloads it, checks `data/synthea/SHA256SUMS`, and unzips into the gitignored `data/synthea/cache/fhir/`.
It has 6 type 2 diabetes patients, enough that no extra Synthea generation was needed. Details in `data/synthea/SOURCE.md`.
The 14-day cooldown (D-001) is for code; this is data, so the newest sample was fine.

**D-022 Docker images are pinned at today's digest (Phase 1).** Official Docker images are rebuilt in place for base-image patches, so
"at least 14 days old" doesn't map onto them cleanly. The digest makes the build reproducible; upgrading is an explicit digest change.

**D-023 The loader is a workspace package run on the host (Phase 1).** `@pa/scripts` (`scripts/`) runs with tsx: `pnpm load`. It posts to
`FHIR_LOAD_URL` (default `http://localhost:8090/fhir`). Bundles load one at a time, in a fixed order, so failures are easy to read.
Progress shows positions, not file names, because Synthea file names contain (synthetic) patient names.

**D-024 FHIR types via the global `fhir4` namespace (Phase 1).** `@types/fhir` declares R4 as a global namespace. Under `NodeNext` the
extensionless `fhir/r4` import does not resolve, so packages list `"fhir"` in tsconfig `types` and write `fhir4.Bundle`.

**D-025 Every Synthea bundle is rewritten, and every loaded type is counted (Phase 1).** The plan said hospital and practitioner
bundles could load as-is. Their Organizations, Locations and Practitioners are conditional creates (`ifNoneExist`) and are idempotent,
but the practitioner bundle's 267 PractitionerRoles are plain POSTs, and the first reload created 267 duplicates. The fixed
count list didn't include PractitionerRole, so the counts still looked unchanged; only the `201` in the reload's entry statuses gave it away.
Now `rewritePostToPut` runs on every Synthea bundle (plain POST becomes PUT, conditional creates stay as they are), and the loader
counts every resource type it saw rather than a hand-picked list.

**D-026 The criterion-id guard skips `node_modules` and `dist` (Phase 1).** Found when `scripts/` became a package with its own
`node_modules`: the guard matched hex strings inside `@types/node`.

**D-027 Answer key conventions (Phase 2).** `eval/expected/PA-00X.json` holds, per criterion, the status, sources and a one-line
reason, plus missing_documents, route, evidence_complete and warnings. Day counts are `end − start`, so a full 365-day window reads
"365 of 365". Metformin months are total record days across all orders (not clipped) / 30.44. Rationale and ambiguities: `eval/expected/NOTES.md`.

**D-028 C3 attestation conflicts apply on every path (Phase 2; accepted by the candidate 2026-10-26).** A first reading made a months
mismatch only a warning when C3 is met via path B or C. With that rule PA-004 would meet all five criteria, and the
brief says "Only one of the seven requests meets policy". The policy's `attestation_handling` ("mark the criterion conflicting and cite
both") and its precedence rule agree. PA-004 C3 is conflicting. Explained in the README's Evaluation section.

**D-029 The C3 months tolerance is one-sided (Phase 2; accepted by the candidate 2026-10-26).** The first reading was a two-sided ±1 month (panel default 3).
Conflicting only when attested months exceed the record total by more than 1 month. A record showing more therapy than attested agrees.
Under the two-sided default PA-005 C3 would be conflicting (30 vs 32.52) with a provider ask that the chart already answers.
C2 stays two-sided (0.1).

**D-030 Packet fields added for the nurse (Phase 3).** Each criterion also carries `requirement` (the policy's words, so a
reviewer reads the rule next to the result), `window` and `threshold` (what was applied, checkable by the nurse; they also drive the UI
timeline), `paths` (each any_of alternative and its status, so the nurse sees every route to C3), and `missing_document` (the ask for this
criterion; the agent's draft check works per criterion). `considered` items add `end` (order intervals) and `numeric` (to plot values).
All of these get a line in the README's minimum-necessary justification (Phase 9).

**D-031 What the chart fetch asks for (Phase 3).** Each evaluator kind declares the resources it needs (`needs`), and `fetchChart` merges them,
so the fetch layer never knows which criterion asked. Observations are searched server-side by LOINC code, and labs match by code only (no
display fallback). Conditions, MedicationRequests and AllergyIntolerances are fetched whole for the member, because the display fallback
has to see every one.

**D-032 C1's "another diabetes type" lives in terminology, not in code (Phase 3).** The type 2 diabetes set names its broader concept
(73211009 diabetes mellitus) in `data/terminology/`, so the binding needs no code for it.
Prediabetes is not diabetes: a prediabetes-only record is `missing` for C1. A record with active type 2 diabetes but a form claiming another
diagnosis is `conflicting`.

**D-033 (superseded by D-042) Conflict tolerances sat in bindings.ts (Phase 3).** Replaced the same day: no clinical number lives in code.

**D-034 Metformin duration details (Phase 3).** Days are `end − start`; overlapping orders count once (union). Record months for the
attestation check are the unclipped union up to the request date / 30.44. If the known days fall short but some orders have unknown
durations (stopped or completed with no end date), the status is `missing` (ask for fill history), not `not_met`: the record can't show
the criterion failing. Synthea's many `completed` orders without end dates will exercise this in Phase 7.

**D-035 Blocking warnings (Phase 3).** `source_unverified`, `medication_not_in_policy_list`, `member_reference_mismatch`,
`request_before_policy_effective` and `implausible_deceased_before_request` keep a fully met request in clinician review. The others
(`display_match`, `other_in_window_result`, `medication_end_unknown`, `unit_mismatch`, `observation_date_from_issued`) inform the nurse but
do not change the route. The list is in `core/rules/route.ts`.

**D-036 (restored by D-045) A request dated before every policy version (Phase 3).** It uses the earliest version and gets the blocking warning
`request_before_policy_effective`, so the nurse reviews it rather than the service refusing it.

**D-037 Source verification is one batch request (Phase 3).** Every cited source and every considered reference is checked with a single
FHIR `batch` of reads. The HTTP client follows paging `next` links only on the configured server's origin, so a bearer token is never
sent anywhere else.

**D-038 Dates (Phase 3).** A dateTime's calendar day is the day as written in the record (its first ten characters). Day arithmetic is done
on UTC midnights, so time zones and daylight saving never move a day. The Patient's birth date never enters the packet; C5 shows only the age.

**D-039 (superseded by D-097) Bindings are passed in, not imported (Phase 3).** `assemblePacket` takes `bindings` in its deps. The production map in
`bindings.ts` stays C1–C5 (a sixth criterion is one line there), and the extension test adds its one C6 line in the test. `BINDINGS` is typed
`Record<string, Binding>` rather than checked with `satisfies`, so it can be indexed by a policy's criterion id.

**D-040 Allergy evidence (Phase 3).** Any metformin AllergyIntolerance with acceptable verification counts, whatever its clinicalStatus,
as the plan states.

**D-041 Fixtures (Phase 3).** `pnpm fixtures` writes real packets to `apps/web/e2e/fixtures/packets/` using the same in-memory wiring as the
tests. `fixturesCurrent.test.ts` fails if a committed fixture differs from today's rules engine, so the Playwright mocks cannot drift.

**D-042 No clinical numbers in code: the rules engine config (Phase 3 follow-up, at the candidate's request).** The age limit (18), the HbA1c
conflict tolerance (0.1) and the metformin months tolerance (1, one-sided) live in
`data/policies/MP-SYN-021/rules-engine-config.json` (see D-043), so they change without a code change, like the criteria. The config mirrors
the policy's `fhir` blocks and is merged into each criterion's params when the policy loads, so each kind reads
all its numbers from one params object and the startup check validates them like any other param (a missing value stops the service). The
config may only add values: one that would change a value the payer's policy sets fails at load. Bindings now hold no numbers, only the kind,
the comparison direction, the attested form-field paths and the provider-request wording. CLAUDE.md invariant 6 was amended to match (the plan
file stays verbatim). What remains in code are calendar and unit constants (ms per day, 365.25 / 12 days per month) and float-comparison
precision. The config has no version of its own (D-044): Phase 4 records a sha256 fingerprint of policy.json plus the config in the audit
event, so an edit to either is traceable even without a version bump.
(First named "policy supplement"; renamed to "rules engine config" at the candidate's request so the file name says what it is.)

**D-043 One folder per policy (Phase 3 follow-up, at the candidate's request).** `data/policies/MP-SYN-021/` holds the supplied policy
(moved from `data/` byte-identical; `CHECKSUMS.sha256` lists the new path and still guards it) and its `rules-engine-config.json`.
One env var, `POLICIES_DIR`, replaces `POLICY_PATHS` and the config path;
a new policy (another drug class) is a new folder. The supplied `data/README.md` still names the old location; it is a supplied file and stays
unchanged. The layout inside the folder is now one subfolder per version (D-045).

**D-044 (superseded by D-045) One policy version loaded at a time (Phase 3 follow-up).** Replaces loading
every version and picking the one in effect on the request date, and D-036. Each policy folder holds exactly `policy.json` and
`rules-engine-config.json`; anything else, including a second version file, is a load error, and two folders with the same policy id are an
error too. Why: multiple versions on the box only matter for a request dated before a policy change that is still worked after the change is
deployed. That case is surfaced instead: a request dated before the loaded policy's `effective` date gets the blocking warning
`request_before_policy_effective`, so it goes to clinician review. A policy update replaces the files; git history is the record; the version
inside `policy.json` goes into every packet and audit event, plus (Phase 4) a fingerprint of both files. The supplied file is renamed
`policy.json` because the folder already names the policy; the config dropped its own `version` field because it never had a meaning
separate from the policy's.

**D-045 Policy versions are dropped-in folders (Phase 3 follow-up, the candidate's design).** Supersedes D-044 and restores
"the version in effect on the request date". Layout: `data/policies/<policy id>/<effective date>_<version>/policy.json` plus its own
`rules-engine-config.json`, so the config is versioned together with the policy. An update is one new folder, the way rules are often handed
off (e.g. an SFTP drop); a folder can arrive before its effective date and stays inert until requests reach that date. A new folder is picked up
at the next start. The loader (`core/policy/loadPolicyVersions.ts`) refuses to start when:
- a version folder's name disagrees with the effective date or version inside its `policy.json`
- a policy id disagrees with its parent folder
- two versions take effect on the same day, or version order contradicts effective-date order (`compareVersions`: 2026.10 > 2026.9)
- a version folder has no `policy.json`, or holds any other file
Dotfiles (`.DS_Store`, partial-upload markers) are ignored. A request dated before every version uses the earliest with the blocking
`request_before_policy_effective` warning (D-036). The C6 extension fixture is now a second version folder (`2026-09-01_2026.9`) dropped in
next to the supplied one from `apps/api/test/fixtures/extension/policies/`, and a test shows a request dated 2026-08-15 still gets 2026.1
with five criteria. A changed window is likewise a new folder, such as a 2026.2 with a 120-day window.

**D-046 node:sqlite needs no fallback (Phase 4).** On Node 24.22.1 `node:sqlite` loads without an experimental warning, so
there is no better-sqlite3 and no `--disable-warning` flag.

**D-047 `GET /userinfo` (Phase 4, renamed at the candidate's request).** The UI header needs the caller's identity and role. The endpoint is
named after the OpenID Connect UserInfo endpoint and shares its `sub` claim, so it stays conventional when OIDC replaces the static tokens.
It needs `health:read`, which every role holds. (First built as `/me`.)

**D-048 Tokens (Phase 4).** `AUTH_TOKENS` is `role:subject:sha256(token)`, comma-separated (confirms D-015). `make tokens` also writes
`PROBE_TOKEN` in plaintext to `.env` (gitignored, mode 600) so the API container's healthcheck can call `/health`; the probe role can read
health and nothing else. Tokens are compared as sha256 digests with `timingSafeEqual`, checking every entry without stopping early.

**D-049 No banned word in the status line either (Phase 4).** Express's default reason phrase for 401 is "Unauthorized", which `curl -i`
shows. The refusal sets it to "Unauthenticated", so invariant 5 holds for everything on the wire, not only bodies.

**D-050 Audit details (Phase 4).**
- Each event has every field, `null` when it does not apply, so the hashed JSON always has the same shape.
- Two fields beyond the plan: `rules_fingerprint` (sha256 of the canonical JSON of the policy version with its rules engine config merged
  in, D-042) and `loaded_versions` (for the new `policies.reload` action).
- A request's event is written when its response closes, with the final status code. So a packet request gets exactly one event whether
  it succeeds, is not found, fails later, or has its body replaced by the output guard. Refusals are written at refusal time.
- The table stores the canonical JSON body plus indexed `request_id` and `action` columns; triggers reject UPDATE and DELETE.

**D-051 Readiness (Phase 4).** FHIR, the audit store and the policies are required; the model is not, because summaries fall back to the code
template (Phase 5). Not ready answers 503. Only `health:detail` sees the per-dependency detail; everyone else sees the status.

**D-052 Source view is minimum necessary (Phase 4).** `GET /requests/:id/sources/:type/:fhirId` serves only references the packet cites
or considered, so it cannot browse the chart. It strips `text`, `note` and attachment contents from every resource (PA-006's Condition
note carries an injected instruction containing a banned word), and shows a Patient with only birth date, deceased and gender (no name, MRN or
address). It rebuilds the packet to know what may be shown: simple, and it costs one more set of FHIR searches.

**D-053 Policy reload (Phase 4, at the candidate's request).** `POST /admin/policies/reload` (new permission `policies:reload`, admin only)
re-reads `POLICIES_DIR` and runs the binding check. If anything is wrong, nothing changes, the previous versions keep serving, and the problems
come back in the response (`invalid_request` with `problems`) and in `/ready`. Every reload is audited with the versions loaded. Compose mounts
`./data/policies` read-only into the container, so a dropped-in folder needs no rebuild; `make reload-policies` calls the endpoint with
the admin token.

**D-054 Logging (Phase 4).** The URL is never logged (a source URL holds FHIR resource ids); the route pattern is. The error handler logs an
error's class name only. pino-http calls `customProps` twice (at the start and at the finish), so the fields are added only once headers
are sent; a test checks each key appears once.

**D-055 HTTP hardening (Phase 4).** `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` on every
API response; `x-powered-by` off; JSON bodies parsed only after authentication, capped at 100 kB.

**D-056 API image (Phase 4).** `node:24.22.1-bookworm-slim` pinned by digest (Debian rather than Alpine: pnpm 12 ships a native binary).
Multi-stage: the build stage compiles shared, web and API; the runtime stage installs production dependencies only, runs as `node`, and keeps
the audit database on a named volume. A new env var, `TERMINOLOGY_DIR`, joins `.env.example`.

**D-057 ESLint allows unused `_`-prefixed parameters (Phase 4).** Express recognises an error handler only by its four parameters.

**D-058 UI tests use standard Playwright conventions, desktop only (Phase 4 follow-up, at the candidate's request).**
- Specs import `test` and `expect` from `apps/web/e2e/test.ts`, a `test.extend` fixture file. Its automatic `api` fixture mocks every API
  call in the `ui` project (`api.mock('GET', '/requests', body)`); an unmocked call fails the test at teardown. In `e2e` nothing is mocked.
- Screenshots: `attachScreenshot('step name')` attaches a full-page screenshot to the test inside `test.step`, so the HTML report shows
  each step's picture in order. The config also records `trace: 'on'` and `screenshot: 'on'`. Review with `pnpm test:ui:report` or
  `pnpm test:e2e:report`; each suite has its own report and output folder, so one run never erases the other. (Not named `screenshot`:
  that is Playwright's own option and the names collide.)
- Page checks are custom matchers: `await expect(page).toPassAxe()` and `await expect(page).toHaveNoForbiddenTerms()`.
- Desktop only, 1440 x 900: nurses use managed desktop workstations, so there is no mobile layout and no mobile project.
- The e2e project now has a smoke spec: the real API serves the app at `/ui`, including a client-side route.

**D-059 Default summary model (Phase 5).** `qwen3:4b-instruct-2507-q4_K_M` (Qwen3 4B, the non-thinking instruct build; 2.5 GB), digest
`0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`, pinned in `.env.example`. The other candidates exist in the registry
(phi4-mini:3.8b, llama3.2:3b, granite4:micro; qwen2.5:7b-instruct and llama3.1:8b as 7–8B reference points); Phase 7 measures them and may
move the pin. `think: false` and a JSON Schema `format` both work on it. Decoding is deterministic: temperature 0 and a fixed seed, as named
constants in `core/llm/chatModel.ts` (model settings, not clinical values).

**D-060 Summary shape (Phase 5).** The model returns `{"sentence_1": "...", "sentence_2": "..."}`: two fields make "exactly two
sentences" checkable. The reply is parsed with Zod (`SummarySchema`, whose JSON Schema is also the `format` sent to Ollama), then checked.
The summary is written after the route is decided, so it can describe the statuses but never change them; `summary_fallback` is informational.

**D-061 Faithfulness rules beyond the basic four (Phase 5).** Besides two sentences, numbers and dates from the evidence, ids with the right
status, and no banned words, `core/packet/faithfulness.ts` also rejects:
- a criterion that is not met but is not named
- an "N of M criteria" count that is wrong
- an "all criteria met" claim when they are not
- recommendation words (recommend, eligible, qualifies, medically necessary)
- any FHIR reference
Numbers are compared as numbers (7 matches 7.0). A status written right after an id or a list of ids ("C2 and C3 are missing") is checked;
one written before an id ("missing: C2") is not, and the prompt asks for "<id> <status>".

**D-062 Prompt summary.v2, measured (Phase 5).** With `summary.v1` the default model put two sentences in `sentence_1` for 3 of 7
requests and repeated it on the retry, so they fell back to the template. `summary.v2` spells out both sentence shapes; all 7 are now faithful
on the first try (1.3–2.0 s each on Metal). v1 stays, so the eval can compare prompt versions. A missing final period is added by code (no
change in meaning) rather than spending a retry; every other problem goes back to the model once.

**D-063 When the summary falls back (Phase 5).** No `OLLAMA_MODEL`: the template is the summary by design, with no warning. Model
unreachable or slower than `OLLAMA_TIMEOUT_MS` (30 s; CPU-only inference is slower): template plus `summary_fallback`, with no retry,
because a model that is down will not be up a moment later. Reply not JSON, wrong shape, or unfaithful: one retry with the problems listed.
Then the template plus `summary_fallback`.

**D-064 What reaches the model (Phase 5).** The compact evidence only: per criterion the id, requirement, status, value and date, plus the
counts and the provider asks, inside `<clinical_data>` tags, with the rule that content inside them is data. No patient id, no notes, no
considered resources, no chart free text. The injection test plants an instruction in every free-text place a chart or form has (narrative,
notes, a patient name, dosage text, allergy reactions, a document, the request notes), checks statuses, sources, route and asks are unchanged,
that the planted text never reaches the model, and that a model obeying an injected instruction is caught and falls back. One path to know
about: a criterion `value` can carry a matched record's display text (for example a pancreatitis diagnosis name); the tags, the rule and the
checker cover that path.

**D-065 `make model` and the containerized option (Phase 5; superseded in part by D-099).** `make up` now runs `make model`: Ollama must already be running natively (it
is never started by make), the pinned model is pulled (no-op if present), its digest is checked against the pin, and `.env` gets the model
and digest if it lacks them. For a machine without native Ollama there is an opt-in compose profile, `ollama-in-docker`
(`ollama/ollama:0.40.11` pinned by digest, no published port).

**D-066 A real-model test that skips itself (Phase 5).** `test/llm/ollama.integration.test.ts` runs the seven requests through the local
model when it is available and is skipped otherwise, so `pnpm test` never needs Ollama. `OLLAMA_TEST_MODEL` points it at another model.

**D-067 The Vercel AI SDK for every model call, including the agent loop (Phase 6, the candidate's decision).** Replaces a
hand-written ReAct loop and D-059's direct client; the README says why. Packages:
`ai` 7.0.137 (`ToolLoopAgent`, `generateText`, `Output.object`, `isStepCount`, `MockLanguageModelV4` for tests),
`@ai-sdk/openai-compatible` 3.0.67 (Ollama's OpenAI-compatible `/v1`, `supportsStructuredOutputs`), `@ai-sdk/mcp` 2.0.73
(`createMCPClient` with an `http` transport and the caller's `Authorization` header), and `@ai-sdk/provider` 4.0.26 (dev, for the mock's
result type). They replace the `ollama` package (Phase 5) and the `openai` package (briefly, Phase 6). The rule (the candidate's words):
custom code has to justify itself by being simpler or more secure than what the SDK offers. What stays custom and why is in the README,
"Why the agent loop is the AI SDK's". Model calls follow OpenAI patterns (the candidate's request): `response_format` json_schema for
structured output, OpenAI-style tools, `temperature` 0 and a fixed `seed`.

**D-068 Model text is accepted or rejected, never edited (Phase 6, at the candidate's request).** Phase 5 briefly added a missing final
period in code. Removed: a summary marked `model` must be exactly what the model wrote. A missing period is a failed check and costs the
one retry. Constraining the period through a JSON Schema `pattern` was considered; Ollama's documentation does not cover `pattern`, so
the check stays the guard.

**D-069 The agent's packet is built from the tool results, not restated by the model (Phase 6).** The first version asked the model
for a final answer restating every status and source, then checked it. Measured on the default model: slow (PA-001 76 s, PA-004 about
120 s) and unreliable (PA-001 reported C4 as "unsupported"; PA-004's answer failed the schema). Now the code builds the agent's packet from
the `evaluate_criterion` results the agent actually received, marks any criterion it never evaluated as `not_evaluated`, and compares each
with the rules engine (`agrees_with_rules`). The model's only written output is the draft's asks. Measured after: PA-001 12 s, PA-004
14 to 19 s, both 8 tool calls, packets matching the rules engine.

**D-070 Model versions are data folders, like policies (Phase 6, the candidate's request).** `data/models/<effective date>_<version>/model.json`:
model name and pinned digest, call settings (temperature, seed), output caps (summary, tool step, draft), timeouts (one call; a whole agent
run) and the agent's step limit. Validated like policy folders (Zod, strict, so a misspelt setting is an error; the folder name must agree
with the file; anything else in the folder is an error; dotfiles ignored; version order must agree with date order). The version in use
is the latest dated on or before today (the server's UTC date). That is deployment, not clinical logic, so invariant 7 does not apply,
and a later-dated folder is staged. `POST /admin/models/reload` (new permission `models:reload`, admin; audit action `models.reload`) and
`make reload-models` pick up a new folder without a restart, keeping the old versions if the new folder fails. `make model` pulls the
model of the current and any staged version and checks each digest. `/ready` shows the folders and the last reload. Removed from `.env`:
`OLLAMA_MODEL`, `OLLAMA_MODEL_DIGEST`, `OLLAMA_TIMEOUT_MS` (supersedes those parts of D-063 and D-065); added `MODELS_DIR`. The service
always has a model now; it falls back to templates when the model is unreachable, as before.

**D-071 Prompts stay in code (Phase 6, the candidate's call).** They briefly moved into the model folders. The candidate pointed out that
`<clinical_data>` is something the code and the prompt must agree on, a shibboleth a prompt writer would have to know. More of the
same: the reply shapes are Zod schemas in code, the summary rules are enforced by the checker, and the agent loop stops on
`verify_sources`, which only works if the prompt makes it the last step. The data-not-instructions rule is also a security control. So
a prompt change is a code change, reviewed and tested. Guards: `test/llm/prompts.test.ts` (every prompt names the tags and the rule) and
the `/mcp` test (the agent prompt names every tool, and `verify_sources` is introduced last). The audit's `prompt_version` stays the file
name (`summary.v2`, `agent.v1`).

**D-072 How an agent run stops (Phase 6).** The loop stops at the `verify_sources` call (`hasToolCall`) or after `agent.max_steps`.
Output caps per call (`max_output_tokens`) stop a looping model before its timeout: an uncapped final step once ran about 120 s. One
deadline per run (`timeouts_ms.agent_run`, 180 s, the candidate's limit) is shared by the loop and the draft; each call also has its own
timeout. When the deadline passes, the run still ends cleanly: criteria it never reached show `not_evaluated`, the warning is
`agent_time_limit`, and the draft is the template. The test uses a model that never answers.

**D-073 The draft's number check ignores the digits in FHIR ids (Phase 6, a bug the tests found).** The broken-draft test with an
invented "9 months" passed the check, because the allowed numbers were taken from the criterion's evidence text, FHIR ids included
(`…9d69…`). References are now removed before the numbers are collected.

**D-074 SSE is read with eventsource-parser, in `@pa/shared` (Phase 6).** The browser's `EventSource` cannot send a bearer token, so the
UI reads the stream with `fetch`. Rather than hand-parse SSE frames, `readAgentEvents` pipes the body through `TextDecoderStream` and
eventsource-parser's `EventSourceParserStream` (the parser the AI SDK uses) and validates each event with the shared schema. The UI, the
CLI (`pnpm agent`) and the API tests use it. `@pa/shared` now compiles with the DOM lib for the stream types (Node 24 has them too).

**D-075 A first UI in Phase 6 (the candidate's request).** The candidate wanted Phase 6 to end with a Playwright test of the whole
flow, agent included. So the sign-in, queue, packet view and "Draft provider request" panel exist now. Contrast, found by axe: indigo shade 8 as the primary colour (shade 6 with white text is about
4:1), and status badges with dark labels, the colour carried by the tint and the icon (green 9 text on its own tint is about 4.2:1).
`pnpm fixtures` also writes the queue and two agent runs (a checked draft and a template fallback), recorded through the real app with a
scripted model, for the mocked UI tests.

**D-076 No planning shorthand in code (Phase 6, the candidate's request).** Comments never say "door 1" or "door 2", or rely on any other
term from our planning; they say what the code does and why.

**D-077 Lint: `ignoreRestSiblings` (Phase 6).** `const { notes, ...attested } = form` is how the code leaves a field out (free-text notes
never reach a model). ESLint's `no-unused-vars` now allows it instead of requiring `_notes`.

**D-078 Things the code and prompts share are defined once (Phase 7, the candidate's request).** The `<clinical_data>` tag is
`CLINICAL_DATA_TAG` with one `wrapClinicalData()` (summary, tool results, draft). The prompt files still spell the tag out: each file
is the exact text the model receives, which is what `prompt_version` in the audit points to, so a placeholder would make the file
something else. A test reads the constant and fails if a prompt does not name the tag and the data-not-instructions rule. Also
defined once now: the request-id, date and FHIR-reference patterns (`@pa/shared`; the schemas and the text scanners are both built
from them), the checks on model-written text (`core/safety/claimsInText.ts`: dates, numbers, references, recommendations, shared by
the summary and draft checkers), roles and permissions (moved to shared, so the web tests stop copying them), the SSE frame format
(next to the reader), bearer-token parsing, the reload response, the tool names (`TOOL`), and the test helpers for the model version in
effect. Not merged: the policy and model registries (two explicit 60-line modules beat one generic one here).

**D-079 Prompts may only name what the code uses (Phase 7).** `<criteria_with_evidence>` and the like in the summary prompt are not
tags; they name fields of the JSON the code sends. `test/llm/prompts.test.ts` takes every snake_case name in each prompt and checks it
exists in what that prompt is sent or replies with (evidence fields, reply schema, tool names and inputs, statuses). Renaming a field
in code fails the test until the prompt follows. Suggested, not done: write placeholders as `{field}` in the next prompt versions, so
they cannot be mistaken for the real `<clinical_data>` delimiter (a measured prompt change, not a silent one).

**D-080 The Synthea eval set (Phase 7; SYN-011 added by D-089).** Ten request forms in `eval/synthea-requests/`, one per sample patient chosen to cover what the
supplied seven do not: an outside-lab HbA1c, an attested HbA1c contradicted on the same date, a request before the policy took effect,
diabetes recorded only as complications (display match), prediabetes only, no diabetes, a member under 18, metformin orders without end
dates, an eGFR contraindication, and a deceased member. The key was derived by hand from the bundles before the first run. After it, the
key was corrected in three places where it, not the service, was wrong; every correction is listed in `eval/expected/SYNTHEA-NOTES.md`.
No sample patient can be evidence complete (no HbA1c of 7 % or more in 2026; F-005).

**D-081 How the eval measures (Phase 7).** `pnpm eval` goes through the running service's HTTP API, as a nurse would: statuses,
sources and warnings against the key; each cited source fetched through the source endpoint; the summary re-checked with the service's
own faithfulness checker; the banned-word scan over the whole response; latency. The model, digest and prompt version of each summary
come from the audit trail. Output: `eval/results/<run id>.json`, with shared Zod schemas (`@pa/shared` eval.ts) that
the reports read. `EVAL.md` is generated from the JSON (`pnpm eval:report`) and never edited by hand.

**D-082 Audit events stay readable when the schema grows (Phase 7, a bug the eval found).** Reading the audit trail failed with 400 once
it reached events written before Phase 6, which lack `tool_name` and the draft fields. Fields that can be "does not apply" now default
to null or [] when read. `verify()` hashes the stored text, so the chain is unaffected; a test writes an old-shape row and checks both.

**D-083 Two rules fixes from the eval (Phase 7).** (1) F-001: an attested metformin duration longer than the known orders is no longer a
conflict when some orders have unknown length (they could cover the difference); there is nothing to compare, so C3 is missing. (2)
F-002: `display_match` is raised only when a display-matched Condition is cited, and an unused related condition is labelled
`related_condition`, not `not_active`. Both have unit tests; the supplied seven are unchanged.

**D-084 The model comparison runs on Metal only (Phase 7, the candidate's call).** The plan asked for Metal and CPU-only runs because the
brief sizes the model for "no GPU". The candidate reads that as no datacenter or gaming GPU (an A100, an RTX card); a Mac's own GPU is
fine. Ollama's documentation also lists no `num_gpu` Modelfile parameter, so a CPU-only variant would have rested on undocumented
behaviour. Candidates, pinned by digest: qwen3:4b-instruct-2507-q4_K_M (the default), phi4-mini:3.8b-q4_K_M,
llama3.2:3b-instruct-q4_K_M, granite4:micro, and llama3.1:8b-instruct-q4_K_M as the 8B reference; all list tool calling. Each runs with
the prompts, settings, caps and timeouts of model version `2026-10-26_1`, so only the model differs; 17 requests × 3 runs; the first
call (loading the model) is not counted. In-process (`pnpm eval:models`), against the real HAPI server and the real `/mcp`.

**D-085 The comparison ran on CPU after this Mac's GPU began faulting; one run; an HTML page per comparison (Phase 7, the
candidate's call). Amends D-084.** From 14:28 the M3 Pro's GPU firmware logged resets ("firmware-detected lockup", "progress
timeout"; the gpuEvent reports blame WindowServer and iTerm2 as well as Ollama). From then on every Metal prompt over a few hundred
tokens failed with `kIOGPUCommandBufferCallbackErrorInnocentVictim`, and Ollama's runner stayed broken until restarted. It persisted
through a reboot, with every other app closed, with flash attention off, and after updating macOS 26.5.2 to 26.7.2; earlier the same
setup had run about 20,000 calls cleanly. CPU inference is unaffected, and with the same weights and temperature 0 its answers should
match the GPU's closely (only floating-point order differs), so the quality columns stand; the time columns are CPU times.
`make ollama-cpu` starts a second Ollama on 127.0.0.1:11435 whose runner (llama.cpp's llama-server) is told by its documented
`LLAMA_ARG_*` environment variables to use no GPU (`LLAMA_ARG_N_GPU_LAYERS=0`, `LLAMA_ARG_DEVICE=none`); verified: 0/37 layers
offloaded and 0 MB in GPU memory. Ollama 0.40.11's own `OLLAMA_LLM_LIBRARY=cpu` and an oversized `OLLAMA_GPU_OVERHEAD` both still
put every layer on the GPU. The table's "Where" column records cpu or metal per model. One run per request rather than three:
decoding is deterministic, so extra runs mostly measure timing, and one run of the five candidates takes about an hour on CPU. A
test run on one request (PA-004, about 5 % of the data) came first, as the candidate asked. Every comparison also writes a
self-contained HTML page next to its JSON (no scripts or external files; `pnpm eval:models:html` re-renders one), so results can be
read in a browser. Open finding F-011 (a GPU reset leaves Ollama's
runner broken and `/ready` doesn't notice) still applies to the running service, which uses the GPU Ollama on :11434.

**D-086 Eval results are static files: EVAL.md and EVAL.html; no live eval dashboard (Phase 7, the candidate's call).**
The brief's "What to build" is the source of truth. Item 5 asks to record each criterion's
score, whether sources resolve and whether the summary is faithful, audit by hand and document the findings. It asks for no
dashboard, and its time box ranks "the dashboard you were thinking of adding" below the endpoint, the eval, the enterprise minimum and
the plan. `pnpm eval:report` (run by `pnpm eval` and `pnpm eval:models`) now writes EVAL.html beside EVAL.md, from the same JSON in the
same call, so the two cannot disagree. It is one self-contained page (no scripts, no external files) with EVAL.md's sections, rendered
with the UI's status colours and icons; a disagreement keeps the service's chip, outlined, with the key's status under it. The model
comparison sections are shared with the per-comparison page (D-085); `scripts/reportHtml.ts` holds what both pages share (escaping,
page shell, chips, count cells). The status and route labels move to `@pa/shared` (`STATUS_LABEL`, `ROUTE_LABEL`), used by the UI's
badges, EVAL.md and EVAL.html, so EVAL.md now reads "Not met" as the UI does. PHI: the
eval JSON and both pages hold clinical values. Here every value is synthetic (and no eval output is committed, D-091); with Payer A's data,
eval output is stored like any PHI (access-controlled), never under the unauthenticated `/ui`.

**D-087 The UI stays as built in Phase 6; docs come next (Phase 7, the candidate's call).** The brief's "What to build" asks for no UI,
and the panel demo (a request, a refused call, the audit event, the log line) works with the Phase 6 UI or curl. After Phase 7 the
work goes to the docs (Phase 9: items 6 and 7, the README parts of item 8 and the brief's "Sharing" list).

**D-088 TypeScript instead of the suggested Python stack (the candidate's call, made before Phase 0; recorded in Phase 7).** The
brief suggests "Python with FastAPI, Pydantic, Docker Compose and FastMCP, unless you are faster in something else". The service is
TypeScript end to end for two reasons: one language covers the API, the MCP server, the agent, the eval scripts and the UI; and the
candidate has used TypeScript more intensively than Python, so they can read and check every line Claude Code writes, including code
that comes out obscure. Express stands in for FastAPI, Zod for Pydantic (every model output is parsed before use, invariant 9), and the
MCP TypeScript SDK for FastMCP; Docker Compose is used as suggested (`compose.yaml`), and `package.json` stands in for the pyproject.

**D-089 SYN-011: one Synthea chart with a result added by hand, so the eval covers `evidence_complete` (Phase 7, the candidate's
request).** No sample patient can be evidence complete (F-005): only 2 of the 112 ever have an HbA1c of 7 % or more, the latest on
2025-03-01, before the policy takes effect. SYN-011 is SYN-001 resubmitted after the HbA1c the nurse asked for was recorded:
`eval/synthea-overlays/SYN-011.json` adds one Observation (HbA1c 7.6 % on 2026-10-23) to that patient. How:
- The Synthea files are never edited (their checksums still match). The overlay is a separate transaction bundle that `pnpm load`
  PUTs after the Synthea patients, so reloading is safe, and the Observation carries the tag `urn:pa-evidence:eval|synthea-overlay`.
- It is an eleventh request: the brief's ten Synthea requests stay exactly as Synthea generated their charts.
- All six type 2 diabetics in the sample were already among the ten, so SYN-011 shares SYN-001's patient. The added result is dated
  after SYN-001's request date (2026-10-20), and results after the request date are excluded, so SYN-001's packet is unchanged
  (checked after the load: C2 missing, the same ask).
- The key was written by hand before the run, and the service matches it. EVAL.md, EVAL.html, the README and
  `eval/synthea-overlays/README.md` name the overlaid chart.

**D-090 The GPU works in short bursts but hangs under sustained load: the comparison reruns on CPU, all five models, all 18
requests; a counting fix and two traces (Phase 7, all five at the candidate's request).** After the macOS update and restarts, the
Metal GPU ran the real-model tests (28 calls), generations of 128 to 2048 tokens at about 43 tokens/s, and `pnpm eval` on all 18
requests (p50 3.1 s). But a Metal comparison hung the GPU after 14 requests, about ten minutes of steady load
(`kIOGPUCommandBufferCallbackErrorHang`), and the script stopped itself after three failed requests in a row, as designed. So the
comparison reruns on CPU as in D-085, one run, all 18 requests, with the fix below. Running models side by side was considered and
not done: on one machine they share the CPU and memory bandwidth, so the total time barely drops, each model's latency would be
measured while another competes, and five models with their caches come close to the 36 GB of memory. The first CPU run (17
requests, `eval/results/models-2026-10-26T20-27-19-344Z_524f0aa.json`) stays in eval/results/ but is superseded. Before the rerun:
- **A counting fix.** A call the MCP server rejects comes back as an error result (`isError`) with a plain-text message. The agent
  counted only SDK errors and our own `{ error }` answers as invalid, so the CPU run reported llama3.1's calls as 130/130 valid
  while it agreed with the rules engine on 0 of 85 criteria. `isToolError()` now counts both kinds, and a test sends a call
  without `request_id` through the real MCP server.
- **`--trace`** on `pnpm eval:models` prints every agent event, to see what a model actually did.
- **llama3.1:8b** calls `evaluate_criterion` with only `criterion_id`, leaving out the required `request_id`, every time, and does
  not correct itself after the error. **phi4-mini** writes its tool calls as text in a code block instead of making them (Ollama
  lists tool support for it). Both are model limits, not ours.
- **No more GPU.** Restarted after the hang, the Metal GPU failed again within two minutes, crashed the terminal (which draws with
  Metal) and the Mac had to reboot. From then on every model call is CPU-only: the Homebrew service stays stopped and
  `make ollama-cpu OLLAMA_CPU_PORT=11434` takes its port, so the API, the tests and `make up` are unchanged. `pnpm eval` re-ran on
  CPU (90/90 statuses, 18/18 routes, p50 9.1 s), then the comparison. Time lost to all this is not counted (HOURS.md).

**D-091 Eval outputs are generated, never committed (Phase 7, the candidate's call).** `EVAL.md`, `EVAL.html` and everything in
`eval/results/` are gitignored: they describe one machine's run (its timings, its hardware, its model digests), and a repo that ships
them is showing a screenshot, not a system. Every run writes them again, the same way: `pnpm eval` writes the run's JSON and both
reports, `pnpm eval:models` writes the comparison's JSON and HTML and both reports, and `pnpm eval:report` rebuilds both reports from
the latest files. Both writers create `eval/results/` when it is missing, so a fresh clone works. What a person wrote or decided is
committed: the answer key, the Synthea forms and overlay, the findings, the hand audit and its instructions (`eval/HAND-AUDIT.md`).
Amends D-086, which named the two report files but not whether they were committed.

**D-092 The default model stays qwen3:4b-instruct-2507, on measurements (Phase 9; numbers from the rerun after Phase 10).** D-059
left the pin for Phase 7 to measure. The comparison the README quotes (`models-2026-10-26T22-55-40-092Z_83d473a`: five models,
CPU-only, all 18 requests, after the counting fix in D-090) has qwen3:4b as the only candidate with a faithful summary on all 18,
agent agreement with the rules engine on 90 of 90 criteria, and 12 of 13 drafts passing. granite4:micro ties on the agent and is
faster and smaller, but 2 of its 18 summaries failed the check; the summary is on every packet, the agent runs only on a click. The
earlier 17-request run (`models-2026-10-26T20-27-19-344Z_524f0aa`) ranked them the same way. One run per model is enough: calls use
temperature 0 and seed 42, and three `pnpm eval` runs (one on Metal, two on CPU) wrote the same 18 summaries word for word. A rerun
was restarted once because another process ran the real-model tests at the same time and the agent steps timed out.

**D-093 The README carries one snapshot of the results (Phase 9, the candidate's call; amends D-091).** The brief's Sharing list asks
for "the evaluation results", and item 5 for a per-request record, so a reviewer with only the repo link must see them. The README has
two tables copied from named runs: per request from `pnpm eval` run `2026-10-26T22-53-17-187Z_83d473a` (CPU; its statuses, sources
and routes match the earlier `2026-10-26T22-09-18-951Z_f8c4cf8` exactly), and per model from the comparison in D-092. EVAL.md,
EVAL.html and `eval/results/` stay generated and uncommitted, as D-091 says; the README names the run each table came from.

**D-094 Fixes from a review before sharing (Phase 10).**
- The agent's route goes through `decideRoute` with the rules engine's warnings. The tools return statuses, not warnings, so a
  packet with every criterion met but held in review by a blocking warning (a drug not on the policy list, a deceased member)
  showed the agent disagreeing with the rules engine for the wrong reason. `decideRoute` takes any list of statuses, null for a
  criterion the agent never evaluated. Test: PA-001 with a drug not on the list.
- A client that hangs up before the response is sent is audited as `error`, not `success`: the status is still the default
  200 at that point, so `auditWhenDone` also checks `res.writableFinished`. Test: an agent run aborted mid-stream.
- compose.yaml takes `OLLAMA_BASE_URL` from `.env`, defaulting to the host's Ollama. The value under `environment:` used to win
  over `env_file`, so the `ollama-in-docker` profile's instructions did not work.
- `make demo` runs the README's demo lines and ends with `GET /audit/verify`.
- Left as is: the faithfulness checker's id pattern is case-insensitive because the status words need the flag; a lowercase id
  matches no criterion, so nothing changes. F-015 stays open and listed in the README.

**D-095 The packet page shows the criteria before the summary (Phase 11, the candidate's request).** The page waited for the
whole packet, and the model's summary takes about 8 to 15 s on CPU, so the criteria the rules engine has in milliseconds waited too.
`GET /requests/{id}/evidence?summary=template` returns the packet with the template summary and never calls the model; without it
the endpoint is unchanged (the model's summary, as item 2 asks), and any other value is `invalid_request`. The page sends both requests
at once: the quick one fills the criteria, citations and asks, and the summary box keeps its own spinner until the full packet
arrives and takes over (same rules, same criteria). Cost: opening a packet writes two `packet.read` audit events, the quick one with
no model or prompt version, and the FHIR reads run twice (about 20 ms each). Spinners are centred, with padding and a line saying
what is loading (`CenteredLoader`, role `status`); the queue's spinner matches. The mocked-API fixture now matches query strings and
can hold a reply back, so the spec screenshots each loading state. `/eval`, left in the UI's API path list, is removed.

**D-096 The agent's steps read as sentences, not JSON (Phase 12, the candidate's request).** The panel printed each tool call as
`get_request {"request_id":"PA-002"} → {...} (7951 ms)`. `AgentStepList` turns each step into a title from the call ("Evaluated
criterion C3"), the status as the same badge the packet uses, and a line from the result ("Sources: MedicationRequest,
AllergyIntolerance", "5 of 5 cited sources are on the FHIR server"). Sources show their resource types only: the ids mean nothing
to a reader there, and the packet's table lists them; a source the FHIR server lacks keeps its full reference, so it can be found.
A call the MCP server refused (an `error`, or an empty result) says so in red. The tool's name and time stay underneath, small, so
each line still maps to an MCP call. Only the UI changes: the SSE events, the terminal's `pnpm agent` and the eval trace keep the
JSON, which is what a developer reading them wants. The UI spec checks the sentences, that the list has no JSON characters, and a
run with a refused call, an empty result and a missing source.

**D-097 Bindings are data, in each policy version's rules-engine-config.json (Phase 13, the candidate's request).** Supersedes
D-039. `core/rules/bindings.ts` bound each criterion to an evaluator kind, with the comparison direction, the form fields checked
for conflicts and the provider-request wording. That is part of what the criterion means, so it now sits under `bindings` in the
version folder's `rules-engine-config.json`, keyed by criterion id, next to the numbers (`criteria`). `core/rules/bindingSchema.ts`
parses it, and the binding types are inferred from that schema. Its objects are strict, so a misspelt key stops the load. The code
map had three faults beyond where it lived:
- It was one map for every policy, so a second policy's `C1` would have been evaluated as this policy's `C1`.
- It was not versioned, so a changed comparison applied to every policy version at once.
- It was outside `rules_fingerprint`, so it could change outcomes without changing the fingerprint.

The loader attaches each version's bindings to that version, `assemblePacket` reads `policy.bindings`, and the startup check runs
per version. It also names a binding for a criterion the policy does not have, since a typo would otherwise be ignored. `bindings`
left the packet and app dependencies. The C6 extension now needs no code at all: its binding is in the fixture folder's config.
No source file names a criterion id (invariant 14 amended). JSON has no comments, so a binding may carry a `note` that code never
reads; C3's eGFR path uses it to say why `value_max` 30 reads as strict `< 30`. The 2026.1 folder's config was edited rather than
a new version added, because the rules did not change: every UI fixture packet is identical. Its fingerprint did change, so audit
events before and after this change show different fingerprints for the same rules:
- before: `a3a3abbc1204ec593b9970fa259b6e51b16e46edd6417b895cc528e9ce1f2e4f`
- after: `28a4144e09d76b8bab29e623332442e6c6d2a908a3c9f256bb5638dd511fd35b`

**D-098 The demo's second terminal: a log tail, and a log tail with audit events (Phase 14, the candidate's request).** The demo
shows a packet, a refused call, the packet's audit event and the log line it produced. `make demo` prints them after the fact;
these two show them as they happen, in a second terminal started before the UI is opened:
- `make tail-log`: the API's log lines as written (`docker compose logs -f` through jq), unchanged, without the health probe
  (every 10 s) and the UI's static files (2xx and 3xx with no route pattern). Refusals before routing (401, `unmatched`) stay in.
- `make tail-log-and-audit` (`scripts/tail-log-and-audit.ts`): the same lines, each followed by the audit event its request wrote.
  A log line carries no audit event id and an event no X-Request-Id, so `scripts/logAudit.ts` pairs them by action (from the
  route and status), request id and time. Both are written as the response ends, within a few milliseconds in every run so far;
  the pairing takes the closest within a second. `/mcp` is not paired: its requests include the protocol's handshake as well as
  tool calls, and the agent run's own line and event cover the run.

The tail reads the audit trail through `GET /audit` as admin, not from the SQLite file, so it has no access a person would not
have, and each of its reads is audited and logged like any other. Its requests carry an X-Request-Id starting with `tail-`, which
is how it leaves its own log lines out. It reads the newest 50 events unfiltered and matches on its side: an audit read records
the request id it asked for, so filtering by request id would put its reads among that request's events. For the same reason
`make demo` and the README pick the refusals out of the newest ten events instead of taking the newest three.

**D-099 `make up` starts Ollama when none is running (Phase 15, the candidate's request).** Supersedes D-065's "never started by
make". The brief's item 8 asks for one command that starts the whole stack; since D-090 this Mac also needed `make ollama-cpu` in
a terminal of its own first. `make up` now begins with `make ollama-start`: if something answers on `127.0.0.1:11434` it is used
as it is (the Homebrew service, `make ollama-cpu`, or any other); otherwise `ollama serve` starts there in the background with
the `make ollama-cpu` settings (no GPU layers, no GPU device, the same context, flash attention and KV cache), its log in
`var/ollama.log` and its process id in `var/ollama.pid`, and `make up` waits up to 30 s for it to answer. `make down` and
`make reset` stop that process, and only that one: the id must still belong to an `ollama serve`, and an Ollama that was
already running is never stopped. It stays native, not in Docker, for the reasons in D-004 and D-065; it binds to localhost only.

## Defaults until the panel answers (the candidate is emailing the panel)

1. **eGFR threshold.** The policy has `value_max: 30` but its note says "< 30". Default: strict `< 30`, using the latest eGFR on or before
   the request date, with no window.
2. **HbA1c.** Results dated after the request date are excluded. Results in mmol/mol don't qualify: mark `missing` with a warning and ask
   for the result in %. The most recent in-window result is the one used.
3. **Metformin months tolerance.** ±1 month between `metformin_trial_months` and the record's total duration (days / 30.44).
4. **Requested drug not on `covered_medications`.** Warning only, and the route is forced to `clinician_review`.
