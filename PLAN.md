<!-- Draft written during Phase 7. The cut list and hours are finalised in Phase 9 from DECISIONS.md and HOURS.md. -->
# Plan for Payer A

## What ships in week one

The packet, the agent, the eval, the audit trail and the roles already run. Week one moves them into Payer A's non-production
network. Member data waits for their security review, so week one uses de-identified charts.

1. **The stack next to their FHIR sandbox,** started with one command and reading FHIR over SMART Backend Services (configuration
   only). The model runs on a CPU node beside it, so nothing leaves their network.
2. **Their GLP-1 policy as a policy version folder.** Our code lists are hand-curated and not exhaustive, so each criterion's code
   sets are mapped to their value sets with their nurse lead. A changed threshold is a new folder, not a code change.
3. **An eval on 20–30 de-identified past requests,** labelled by their nurses before we run anything, against a bar agreed up front.
   Each disagreement becomes a binding fix or a written finding, and EVAL.html shows it.
4. **Nurses using the UI** on those cases, so their feedback starts in week one.
5. **The security review pack, on day one,** so the review runs in parallel with the work below.

## What ships by week six

- **TLS and private networking:** TLS ends at their ingress. The API, the model host and the audit store sit on a private subnet with
  no public route.
- **SSO group mapping to roles:** an OIDC token check replaces the static token map. IdP groups map to the existing roles (nurse,
  admin) plus a read-only auditor.
- **Retention and legal hold for audit records:** events are kept for their records schedule, and a legal hold suspends deletion. The
  hash chain is anchored on a schedule to write-once storage, so a rewrite, even by an administrator, shows up.
- **SIEM export:** audit events and the PHI-free logs stream to their SIEM.
- **Encryption at rest:** the audit store and its backups sit on encrypted volumes, with keys in their KMS.
- **Backup and restore of the audit store:** encrypted nightly backups, and a restore drill that re-verifies the hash chain.
- **BAA scope:** everything that sees member data runs inside Payer A: the API, the model host (it receives clinical values), the audit
  store (member references) and the logs. There is no external model provider. Adding one would need its own BAA and zero data
  retention.

With these in place and the review passed, live requests run in shadow mode first: packets appear on the case in their UM system and
change nothing in the decision process.

## What we would need from Payer A

- **For week one:** a FHIR sandbox with SMART credentials, the GLP-1 policy and their value sets, 20–30 de-identified past requests,
  and a nurse lead plus labelling time.
- **By week six:** the security review, IdP groups, hosting and a CPU model node, SIEM and KMS access, the BAA, and the integration
  point in their UM system.

## What we cut from this assignment, and why

_Finalised in Phase 9._ Nothing from the brief has been cut so far.

## Hours per part

_Copied from HOURS.md at Phase 9._

| Item | Hours |
|---|---|
| 1. FHIR server and loader | |
| 2. Evidence endpoint | |
| 3. MCP tools and agent | |
| 4. Safety | |
| 5. Evaluation | |
| 6. This plan | |
| 7. Security notes | |
| 8. Enterprise readiness | |
| Overhead (environment, guardrails, process) | |
| **Total** | |
