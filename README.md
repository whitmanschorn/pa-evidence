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

## Why the agent loop is the AI SDK's

The agent runs on the Vercel AI SDK's `ToolLoopAgent`, with the SDK's MCP client and its OpenAI-compatible
provider for the local model. The original plan called for a hand-written ReAct loop, and writing one is easy: a
`for` loop, a `map` over tool calls, an array of messages. That ease is the problem. Like rolling your own crypto, it
is simple to write and simple to get subtly wrong: message bookkeeping, parallel tool calls, step limits, malformed
tool calls, timeouts, provider quirks. A loop we own also never improves on its own. The library's loop is shared,
tested and maintained, and we pick up its fixes and improvements by upgrading a pinned version.

We keep our own code only where it is simpler or more secure than what the SDK offers, and each piece is a control the
SDK cannot know about:
- tool results go back to the model inside `<clinical_data>` tags (prompt injection, OWASP LLM01)
- the agent's packet is built in code from the tool results it actually received (the model never restates a status),
  compared with the rules engine's packet, and the route is computed in code
- the summary and the provider-request draft are checked for faithfulness, retried once with the problems, and replaced
  by code templates if they still fail
- the browser receives only server-built, checked events over SSE, never the model's raw token stream

(Decision D-067 in [DECISIONS.md](DECISIONS.md).)

## Changing the model

Which model runs, and how it is called, is data, handled like a policy update: one folder per version,
`data/models/<effective date>_<version>/model.json`, holding the model's name and pinned digest, the call settings
(temperature, seed), the output caps, the timeouts (one call, and a whole agent run) and the agent's step limit. The
latest folder whose date is on or before today is the one in use; a later-dated folder is staged and takes over on
its day. To try a new model: copy the current folder to a new one, change the name and digest, run `make model`
(pulls it and checks the digest), then `make reload-models` (no restart; a folder that fails validation changes
nothing, and `/ready` names the problem). Old folders stay as the record of what ran when.

The prompts are not in that folder. They are code (`apps/api/src/core/llm/prompts/`), because the code depends on what
they say: the `<clinical_data>` tags the code wraps data in, the JSON shapes its schemas parse, the summary rules its
checker enforces, and the tool order the agent's stop condition relies on. A new model that needs different prompts is
a code change, which runs the tests and the eval. (D-070, D-071.)

## What runs so far

Needs Docker Desktop, Node 24 and pnpm 12.

```sh
pnpm install
make tokens    # nurse/admin/probe tokens: hashes to .env, plaintext to .tokens.local (both gitignored)
make up        # checks native Ollama + the pinned model, starts HAPI + Postgres + the API, loads the Synthea sample and the 7 bundles
make reload-policies   # pick up a dropped-in data/policies/<id>/<effective>_<version>/ folder without a restart
make reload-models     # pick up a dropped-in data/models/<effective>_<version>/ folder (run make model first)
pnpm agent PA-004      # run the agent from the terminal: its tool calls, its packet against the rules engine, the draft
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

The UI at `http://localhost:8080/ui`: paste a token from `.tokens.local` to sign in. A packet that needs clinician
review has a "Draft provider request" panel; the agent runs only when it is clicked, streams its tool calls, and
shows an editable draft (never sent automatically) and its packet next to the rules engine's.
```
