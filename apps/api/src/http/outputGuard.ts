import type { RequestHandler } from 'express';
import { OutputPolicyError, assertNoForbiddenTerms } from '../core/safety/forbiddenTerms.js';
import { addLogFields } from './locals.js';

// Every JSON response is scanned before it leaves. A response with any form of approve, deny or
// authorize is replaced by a 500 with the fixed error code; the log line records only how many terms were found.
export function outputGuard(): RequestHandler {
  return (_req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = (body: unknown) => {
      try {
        assertNoForbiddenTerms(JSON.stringify(body));
      } catch (error) {
        if (!(error instanceof OutputPolicyError)) throw error;
        addLogFields(res, { output_policy_violation: error.termCount });
        res.status(500);
        return sendJson({ error: 'output_policy_violation' });
      }
      return sendJson(body);
    };
    next();
  };
}
