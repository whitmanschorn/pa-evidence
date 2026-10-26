# HOURS.md

Time box: 8 hours (brief). If the running total passes about 6 hours before Phase 8, the UI gets trimmed first.
Times are America/Chicago (CDT). "Items" are the brief's numbered deliverables (1–8).

| Phase | Items | Start | End | Elapsed | Running total |
|---|---|---|---|---|---|
| 0 Environment and guardrails | overhead | 2026-10-26 10:15 | 2026-10-26 10:37 | 0:22 | 0:22 |
| 1 FHIR server and loader | 1 | 2026-10-26 10:41 | 2026-10-26 10:57 | 0:16 | 0:38 |
| 2 Answer key | 5 (prep) | 2026-10-26 11:00 | 2026-10-26 11:03 | 0:03 | 0:41 |
| 3 Rules engine and packet | 2 | 2026-10-26 11:08 | 2026-10-26 11:36 | 0:28 | 1:09 |
| 3 follow-up: numbers to data, policy folder, one version | 2 | 2026-10-26 11:48 | 2026-10-26 12:02 | 0:14 | 1:23 |
| 3 follow-up: policy version folders | 2 | 2026-10-26 12:10 | 2026-10-26 12:13 | 0:03 | 1:26 |
| 4 API and enterprise minimum | 2, 8 | 2026-10-26 12:16 | 2026-10-26 12:29 | 0:13 | 1:39 |
| 5 Model summary and safety | 4 | 2026-10-26 12:42 | 2026-10-26 12:51 | 0:09 | 1:48 |
| 6 MCP, agent, model versions, first UI | 3 | 2026-10-26 12:59 | 2026-10-26 13:50 | 0:51 | 2:39 |
| 7 Evaluation, model comparison, eval reports; drafts of PLAN.md and the README's item 3, 7 and 8 sections | 5, 6, 7, 8 | 2026-10-26 13:47 | 2026-10-26 17:17 | 2:07 (3:30 less 1:23 not counted) | 4:46 |
| 9 README, results and model tables, PLAN.md cut list, findings statuses | 5, 6, overhead | 2026-10-26 17:20 | 2026-10-26 17:35 | 0:15 | 5:01 |

## Not counted: Apple Silicon GPU and Ollama faults (the candidate's rule)

Time lost to this Mac's Metal GPU faulting under Ollama is not counted as work: it is a problem of this laptop, not of the
assignment (D-085, D-090). Phase 7's elapsed time leaves these windows out.

| Window | What happened | Time |
|---|---|---|
| 14:28 to 15:21 | first GPU faults; batch and flash-attention tests, restarts, the macOS update; a CPU-only Ollama found | 0:53 |
| 16:21 to 16:24 | GPU retest after the update (128 to 2048 tokens) | 0:03 |
| 16:39 to 17:06 | the Metal comparison hung the GPU; restart, terminal crashes, a reboot, recovery | 0:27 |
| **Total** | | **1:23** |

## Hours per brief item

Phases 7 and 9 each touched several items. They are split by the session's message timestamps: in Phase 7, PLAN.md was drafted
15:55–16:11 and the README's item 3, 7 and 8 sections 16:11–16:21; in Phase 9, the cut list took 0:03 and the results and model
tables 0:06.

| Item | What | Hours |
|---|---|---|
| overhead | environment, guardrails, process docs, the README's run and demo sections | 0:28 |
| 1 | FHIR server + loader | 0:16 |
| 2 | evidence endpoint | 0:45 (rules engine) |
| 3 | MCP tools + agent | 0:51 (incl. model version folders and the first UI) |
| 4 | safety | 0:09 |
| 5 | evaluation | 1:50 (answer key 0:03; Phase 7 1:41; Phase 9 0:06) |
| 6 | plan for Payer A | 0:19 |
| 7 | security notes | 0:10 (with the README's item 3 and 8 sections) |
| 8 | enterprise readiness | 0:13 (API, auth, audit, health, FHIR auth, Docker) |
| **Total** | | **5:01** |
