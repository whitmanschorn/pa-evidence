import type { Response } from 'express';
import type { Identity } from '../core/auth/identityVerifier.js';

// Typed access to what middleware leaves on res.locals, so no handler reads an untyped bag.

export function setRequestId(res: Response, requestId: string): void {
  res.locals.requestId = requestId;
}

export function requestIdOf(res: Response): string {
  return res.locals.requestId as string;
}

export function setIdentity(res: Response, identity: Identity): void {
  res.locals.identity = identity;
}

export function identityOf(res: Response): Identity | undefined {
  return res.locals.identity as Identity | undefined;
}

// Extra fields for this request's log line: ids, timings and counts only.
export type LogFields = {
  request_id?: string;
  fhir_ms?: number;
  llm_ms?: number;
  sources?: number;
  warnings?: number;
  route?: string;
  output_policy_violation?: number;
};

export function addLogFields(res: Response, fields: LogFields): void {
  res.locals.logFields = { ...(res.locals.logFields as LogFields | undefined), ...fields };
}

export function logFieldsOf(res: Response): LogFields {
  return (res.locals.logFields as LogFields | undefined) ?? {};
}
