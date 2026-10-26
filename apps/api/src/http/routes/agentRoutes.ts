import { RequestIdSchema, formatAgentEvent, type AgentEvent } from '@pa/shared';
import { Router } from 'express';
import { AGENT_PROMPT_VERSION } from '../../agent/runAgent.js';
import { runAgentForRequest } from '../../agent/runAgentForRequest.js';
import { assertNoForbiddenTerms } from '../../core/safety/forbiddenTerms.js';
import type { AppDeps } from '../../app.js';
import { allow } from '../allow.js';
import { bearerTokenOf } from '../authenticate.js';
import { auditWhenDone } from '../auditEvents.js';
import { addLogFields } from '../locals.js';


export function agentRoutes(deps: AppDeps): Router {
  const router = Router();

  // An agent run, streamed: its tool calls as they happen, its checked packet, then the provider-request draft.
  // Server-sent events, so the UI can show progress (it reads the stream with fetch, which can send the token).
  router.post('/requests/:id/agent-runs', allow('evidence:read', deps.audit), async (req, res) => {
    const requestId = RequestIdSchema.parse(req.params.id);
    if (deps.models === undefined || deps.mcpUrl === undefined) {
      res.status(503).json({ error: 'internal_error' }); // this deployment has no model
      return;
    }
    if (!deps.requests.get(requestId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const model = deps.models.current(); // read once, so a reload mid-run cannot mix two versions
    const audited = {
      action: 'agent.run' as const,
      assembler: 'agent' as const,
      request_id: requestId,
      model: model.name,
      model_digest: model.digest,
      prompt_version: AGENT_PROMPT_VERSION,
    };
    auditWhenDone(res, deps.audit, audited);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    // Every event passes the same banned-word check as JSON responses.
    const send = (event: AgentEvent) => {
      const frame = formatAgentEvent(event);
      assertNoForbiddenTerms(frame);
      res.write(frame);
    };

    const started = performance.now();
    try {
      // The caller's own token goes to /mcp: the agent can do no more than the caller can.
      const bearerToken = bearerTokenOf(req.get('authorization')) ?? '';
      const result = await runAgentForRequest({
        deps,
        model,
        mcpUrl: deps.mcpUrl,
        bearerToken,
        requestId,
        onEvent: send,
      });
      Object.assign(audited, {
        route: result.route,
        warnings: result.warnings,
        cited_sources: result.criteria.flatMap((criterion) => criterion.sources),
        draft_source: result.draft?.source ?? null,
        draft_check_failures: result.draft?.check_failures ?? [],
      });
      addLogFields(res, { request_id: requestId, llm_ms: result.llmMs, sources: result.steps, route: result.route });
      send({ type: 'done', steps: result.steps, ms: Math.round(performance.now() - started) });
    } catch (error) {
      deps.logger.error({ error_type: error instanceof Error ? error.name : typeof error }, 'agent run failed');
      send({ type: 'error', error: 'internal_error' });
    }
    res.end();
  });

  return router;
}
