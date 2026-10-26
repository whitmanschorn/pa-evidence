// Public surface of @pa/shared: schemas and helpers used by both the API and the web app.
export { CriterionStatusSchema, RouteSchema, STATUS_LABEL, ROUTE_LABEL } from './status.js';
export type { CriterionStatus, Route } from './status.js';
export { findForbiddenTerms } from './forbiddenTerms.js';
export {
  AttestedSchema,
  ConsideredItemSchema,
  CriterionResultSchema,
  ExpectedPacketSchema,
  FHIR_REF,
  FhirRefSchema,
  ISO_DATE,
  IsoDateSchema,
  PacketSchema,
  REQUEST_ID,
  RequestIdSchema,
  PathResultSchema,
  ThresholdSchema,
  WindowSchema,
} from './packet.js';
export type { Attested, ConsideredItem, CriterionResult, ExpectedPacket, Packet, PathResult } from './packet.js';
export { AuditActionSchema, AuditEventSchema, AuditVerifySchema } from './audit.js';
export type { AuditAction, AuditEvent, AuditVerify } from './audit.js';
export {
  DependencyCheckSchema,
  ErrorBodySchema,
  LoadedVersionSchema,
  ReadySchema,
  ReloadResultSchema,
  ModelReloadResultSchema,
  RequestSummarySchema,
  SourceViewSchema,
  UserInfoSchema,
} from './api.js';
export type { ErrorBody, ModelReloadResult, Ready, ReloadResult, RequestSummary, SourceViewResponse, UserInfo } from './api.js';
export {
  AgentCriterionSchema,
  AgentEventSchema,
  AgentPacketEventSchema,
  AgentStepEventSchema,
  DoneEventSchema,
  DraftEventSchema,
  DraftItemSchema,
  ErrorEventSchema,
} from './agent.js';
export type { AgentCriterion, AgentEvent, DraftEvent, DraftItem } from './agent.js';
export { formatAgentEvent, readAgentEvents } from './agentStream.js';
export { PERMISSIONS, ROLES, hasPermission, permissionsOf } from './permissions.js';
export type { Permission, Role } from './permissions.js';
export {
  EvalCriterionSchema,
  EvalRequestSchema,
  EvalRunSchema,
  EvalTotalsSchema,
  FindingSchema,
  FindingsSchema,
  HandAuditEntrySchema,
  HandAuditSchema,
  ModelComparisonSchema,
  ModelResultSchema,
} from './eval.js';
export type { EvalCriterion, EvalRequest, EvalRun, Finding, HandAuditEntry, ModelComparison, ModelResult } from './eval.js';
