import { IsoDateSchema } from '@pa/shared';
import { z } from 'zod';
import { readJsonFiles } from '../files.js';

// A prior-request form as supplied. `prescriber_attestation` keeps unknown fields (catchall) so a new attested
// value, such as a BMI for a new criterion, gets through without a schema change.
// Free-text `notes` are parsed but never used by the rules and never sent to the model.
export const RequestFormSchema = z.object({
  request_id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
  request_date: IsoDateSchema,
  urgency: z.string(),
  policy_id: z.string(),
  member: z.object({
    patient_id: z.string(),
    fhir_reference: z.string(),
  }),
  requested_medication: z.object({ rxnorm: z.string(), display: z.string() }),
  diagnosis_claimed: z.object({ snomed: z.string(), display: z.string() }),
  prescriber_attestation: z
    .object({
      metformin_trial_months: z.number().optional(),
      hba1c_value: z.number().optional(),
      hba1c_date: IsoDateSchema.optional(),
      notes: z.string().optional(),
    })
    .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type RequestForm = z.infer<typeof RequestFormSchema>;

export type RequestStore = {
  get(requestId: string): RequestForm | undefined;
  list(): RequestForm[];
};

export function loadRequestStore(dirs: string[]): RequestStore {
  const forms = readJsonFiles(dirs).map(({ path, json }) => {
    const parsed = RequestFormSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid request form ${path}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  return requestStoreFrom(forms);
}

export function requestStoreFrom(forms: RequestForm[]): RequestStore {
  const byId = new Map(forms.map((form) => [form.request_id, form]));
  return {
    get: (requestId) => byId.get(requestId),
    list: () => [...forms].sort((a, b) => a.request_id.localeCompare(b.request_id)),
  };
}

// Reads a structured form value by its dotted path, e.g. "prescriber_attestation.hba1c_value".
// Bindings name attested fields this way, so no evaluator hard-codes a form field.
export function readFormField(form: RequestForm, path: string): unknown {
  let current: unknown = form;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
