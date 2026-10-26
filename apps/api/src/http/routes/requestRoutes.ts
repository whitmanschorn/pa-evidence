import { Router } from 'express';
import { z } from 'zod';
import { NotFoundError, assemblePacket } from '../../core/packet/assemblePacket.js';
import { sourceView } from '../../core/packet/sourceView.js';
import { referencedRefs } from '../../core/packet/verifySources.js';
import { allow } from '../allow.js';
import { auditWhenDone } from '../auditEvents.js';
import { addLogFields } from '../locals.js';
import type { AppDeps } from '../../app.js';

const RequestIdParam = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const SourceParams = z.object({
  id: RequestIdParam,
  type: z.string().regex(/^[A-Z][A-Za-z]{1,40}$/),
  fhirId: z.string().regex(/^[A-Za-z0-9\-.]{1,64}$/),
});

export function requestRoutes(deps: AppDeps): Router {
  const router = Router();

  // The queue: what a nurse picks from.
  router.get('/requests', allow('evidence:read', deps.audit), (_req, res) => {
    const queue = deps.requests.list().map((form) => ({
      request_id: form.request_id,
      request_date: form.request_date,
      urgency: form.urgency,
      drug: form.requested_medication.display,
      policy_id: form.policy_id,
    }));
    res.json(queue);
  });

  // The evidence packet, built by the rules engine. One audit event per request.
  router.get('/requests/:id/evidence', allow('evidence:read', deps.audit), async (req, res) => {
    const requestId = RequestIdParam.parse(req.params.id);
    const audited = { action: 'packet.read' as const, request_id: requestId, assembler: 'rules' as const };
    auditWhenDone(res, deps.audit, audited);

    const { packet, metrics } = await assemblePacket({ ...deps, summaryModel: deps.models?.current() }, requestId);
    Object.assign(audited, {
      member_ref: packet.patient,
      policy_id: packet.policy_id,
      policy_version: packet.policy_version,
      rules_fingerprint: metrics.rulesFingerprint,
      cited_sources: packet.criteria.flatMap((criterion) => criterion.sources),
      route: packet.route,
      warnings: packet.warnings,
      model: metrics.summary.model,
      model_digest: metrics.summary.modelDigest,
      prompt_version: metrics.summary.promptVersion,
    });
    addLogFields(res, {
      request_id: requestId,
      fhir_ms: metrics.fhirMs,
      llm_ms: metrics.summary.llmMs,
      sources: metrics.sourceCount,
      warnings: packet.warnings.length,
      route: packet.route,
    });
    res.json(packet);
  });

  // A resource the packet cites or considered, minus free text and member identifiers. Anything else is not_found,
  // so this cannot be used to browse the chart.
  router.get('/requests/:id/sources/:type/:fhirId', allow('evidence:read', deps.audit), async (req, res) => {
    const params = SourceParams.parse(req.params);
    const ref = `${params.type}/${params.fhirId}`;
    const audited = { action: 'source.read' as const, request_id: params.id, cited_sources: [ref] };
    auditWhenDone(res, deps.audit, audited);

    // No summary: only the cited references matter here.
    const { packet, metrics } = await assemblePacket({ ...deps, summaryModel: undefined }, params.id);
    Object.assign(audited, {
      member_ref: packet.patient,
      policy_id: packet.policy_id,
      policy_version: packet.policy_version,
      rules_fingerprint: metrics.rulesFingerprint,
    });
    if (!referencedRefs(packet.criteria).includes(ref)) throw new NotFoundError('not in this packet');
    const resource = await deps.fhir.read(ref);
    if (resource === null) throw new NotFoundError('not on the FHIR server');

    addLogFields(res, { request_id: params.id, fhir_ms: metrics.fhirMs });
    res.json(sourceView(resource));
  });

  return router;
}
