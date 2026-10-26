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

## Defaults until the panel answers (plan §7; the candidate is emailing the panel)

1. **eGFR threshold.** The policy has `value_max: 30` but its note says "< 30". Default: strict `< 30`, using the latest eGFR on or before
   the request date, with no window.
2. **HbA1c.** Results dated after the request date are excluded. Results in mmol/mol don't qualify: mark `missing` with a warning and ask
   for the result in %. The most recent in-window result is the one used.
3. **Metformin months tolerance.** ±1 month between `metformin_trial_months` and the record's total duration (days / 30.44).
4. **Requested drug not on `covered_medications`.** Warning only, and the route is forced to `clinician_review`.
