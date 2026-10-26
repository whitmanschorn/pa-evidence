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

**D-011 (partly superseded by D-058) Playwright projects (Phase 0).** One config, two projects. `ui` starts Vite's dev server at `http://localhost:5173`; `e2e` targets
`http://localhost:8080` (`E2E_BASE_URL` overrides it). `pnpm test:e2e` sets `E2E=1` so Vite is not started for it, and passes
`--pass-with-no-tests` until Phase 8 adds the e2e specs. Specs navigate to `/ui/...` explicitly rather than relying on baseURL path joining.

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
`sha256:0ff86aac…`. The index has a native `linux/arm64` image (plan §15 verified), so no emulation. The image is distroless
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
It has 6 type 2 diabetes patients, above the plan's "about 5", so no extra Synthea generation. Details in `data/synthea/SOURCE.md`.
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

**D-028 C3 attestation conflicts apply on every path (Phase 2; accepted by the candidate 2026-10-26).** Supersedes plan §7 ("only a
warning" when C3 is met via path B or C); the plan file stays verbatim. With the plan's rule PA-004 would meet all five criteria, and the
brief says "Only one of the seven requests meets policy". The policy's `attestation_handling` ("mark the criterion conflicting and cite
both") and its precedence rule agree. PA-004 C3 is conflicting. Explained up front in the README; the Phase 9 README must keep that section near the top.

**D-029 The C3 months tolerance is one-sided (Phase 2; accepted by the candidate 2026-10-26).** Departs from the plan's ±1 month default (panel default 3).
Conflicting only when attested months exceed the record total by more than 1 month. A record showing more therapy than attested agrees.
Under the two-sided default PA-005 C3 would be conflicting (30 vs 32.52) with a provider ask that the chart already answers.
C2 stays two-sided (0.1).

**D-030 Packet fields beyond the plan's list (Phase 3).** Each criterion also carries `requirement` (the policy's words, so a
reviewer reads the rule next to the result), `window` and `threshold` (what was applied, checkable by the nurse; they also drive the UI
timeline), `paths` (each any_of alternative and its status, so the nurse sees every route to C3), and `missing_document` (the ask for this
criterion; the agent's draft check works per criterion). `considered` items add `end` (order intervals) and `numeric` (to plot values).
All of these get a line in the README's minimum-necessary justification (Phase 9).

**D-031 What the chart fetch asks for (Phase 3).** Each evaluator kind declares the resources it needs (`needs`), and `fetchChart` merges them,
so the fetch layer never knows which criterion asked. Observations are searched server-side by LOINC code, and labs match by code only (no
display fallback). Conditions, MedicationRequests and AllergyIntolerances are fetched whole for the member, because the display fallback
has to see every one.

**D-032 C1's "another diabetes type" lives in terminology, not in code (Phase 3).** The type 2 diabetes set names its broader concept
(73211009 diabetes mellitus) in `data/terminology/`, so the binding needs no code and the plan's C1 binding line is unchanged.
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

**D-039 Bindings are passed in, not imported (Phase 3).** `assemblePacket` takes `bindings` in its deps. The production map in
`bindings.ts` stays C1–C5 (the live drill adds C6 there), and the extension test adds its one C6 line in the test. `BINDINGS` is typed
`Record<string, Binding>` rather than the plan's `satisfies`, so it can be indexed by a policy's criterion id.

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
Supersedes the plan's "the supplied file stays where it is". One env var, `POLICIES_DIR`, replaces `POLICY_PATHS` and the config path;
a new policy (another drug class) is a new folder. The supplied `data/README.md` still names the old location; it is a supplied file and stays
unchanged. The layout inside the folder is now one subfolder per version (D-045).

**D-044 (superseded by D-045) One policy version loaded at a time (Phase 3 follow-up).** Supersedes plan §7.1 "Policy versions" (load
every version, pick the one in effect on the request date) and D-036. Each policy folder holds exactly `policy.json` and
`rules-engine-config.json`; anything else, including a second version file, is a load error, and two folders with the same policy id are an
error too. Why: multiple versions on the box only matter for a request dated before a policy change that is still worked after the change is
deployed. That case is surfaced instead: a request dated before the loaded policy's `effective` date gets the blocking warning
`request_before_policy_effective`, so it goes to clinician review. A policy update replaces the files; git history is the record; the version
inside `policy.json` goes into every packet and audit event, plus (Phase 4) a fingerprint of both files. The supplied file is renamed
`policy.json` because the folder already names the policy; the config dropped its own `version` field because it never had a meaning
separate from the policy's. Effect on the plan's live-change drills: drill 1 (120-day HbA1c window) becomes an edit of `policy.json`
(window and version); drill 8 becomes "a request dated before the loaded version's effective date is flagged for review".

**D-045 Policy versions are dropped-in folders (Phase 3 follow-up, the candidate's design).** Supersedes D-044 and restores the plan's
"version in effect on the request date". Layout: `data/policies/<policy id>/<effective date>_<version>/policy.json` plus its own
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
with five criteria (the plan's drill 8). Drill 1 is "drop in a 2026.2 folder with a 120-day window".

**D-046 node:sqlite needs no fallback (Phase 4).** On Node 24.22.1 `node:sqlite` loads without an experimental warning (plan §15), so
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
- Desktop only, 1440 x 900: nurses use approved desktop workstations, so there is no mobile layout and no mobile project. This supersedes
  the plan's 390 px narrow screenshots (§11 Phase 8 step 4) and its `apps/web/e2e/screenshots/` folder.
- The e2e project now has a smoke spec: the real API serves the app at `/ui`, including a client-side route.

**D-059 Default summary model (Phase 5).** `qwen3:4b-instruct-2507-q4_K_M` (Qwen3 4B, the non-thinking instruct build; 2.5 GB), digest
`0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`, pinned in `.env.example`. The other candidates exist in the registry
(phi4-mini:3.8b, llama3.2:3b, granite4:micro; qwen2.5:7b-instruct and llama3.1:8b as 7–8B reference points); Phase 7 measures them and may
move the pin. `think: false` and a JSON Schema `format` both work on it. Decoding is deterministic: temperature 0 and a fixed seed, as named
constants in `core/llm/chatModel.ts` (model settings, not clinical values).

**D-060 Summary shape (Phase 5).** The model returns `{"sentence_1": "...", "sentence_2": "..."}`: two fields make "exactly two
sentences" checkable. The reply is parsed with Zod (`SummarySchema`, whose JSON Schema is also the `format` sent to Ollama), then checked.
The summary is written after the route is decided, so it can describe the statuses but never change them; `summary_fallback` is informational.

**D-061 Faithfulness rules beyond the plan's four (Phase 5).** Besides two sentences, numbers and dates from the evidence, ids with the right
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

**D-065 `make model` and the containerized option (Phase 5).** `make up` now runs `make model`: Ollama must already be running natively (it
is never started by make), the pinned model is pulled (no-op if present), its digest is checked against the pin, and `.env` gets the model
and digest if it lacks them. For a machine without native Ollama there is an opt-in compose profile, `ollama-in-docker`
(`ollama/ollama:0.40.11` pinned by digest, no published port).

**D-066 A real-model test that skips itself (Phase 5).** `test/llm/ollama.integration.test.ts` runs the seven requests through the local
model when it is available and is skipped otherwise, so `pnpm test` never needs Ollama. `OLLAMA_TEST_MODEL` points it at another model.

## Defaults until the panel answers (plan §7; the candidate is emailing the panel)

1. **eGFR threshold.** The policy has `value_max: 30` but its note says "< 30". Default: strict `< 30`, using the latest eGFR on or before
   the request date, with no window.
2. **HbA1c.** Results dated after the request date are excluded. Results in mmol/mol don't qualify: mark `missing` with a warning and ask
   for the result in %. The most recent in-window result is the one used.
3. **Metformin months tolerance.** ±1 month between `metformin_trial_months` and the record's total duration (days / 30.44).
4. **Requested drug not on `covered_medications`.** Warning only, and the route is forced to `clinician_review`.
