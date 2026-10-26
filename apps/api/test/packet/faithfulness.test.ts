import { beforeAll, describe, expect, it } from 'vitest';
import { assemblePacket } from '../../src/core/packet/assemblePacket.js';
import { checkSummary, type SummaryEvidence } from '../../src/core/packet/faithfulness.js';
import { summaryEvidence } from '../../src/core/packet/writeSummary.js';
import { suppliedDeps } from '../support/suppliedWorld.js';

// PA-004: C3 conflicting (attested 6 months, 21 days in the record); four criteria met.
let evidence: SummaryEvidence;
beforeAll(async () => {
  const { packet } = await assemblePacket(suppliedDeps(), 'PA-004');
  evidence = summaryEvidence(packet.criteria, packet.missing_documents);
});

const FAITHFUL_1 = 'Evidence found for 4 of 5 criteria; C3 conflicting.';
const FAITHFUL_2 = 'Request from the provider the metformin prescription or pharmacy fill history supporting the reported 6 months.';

describe('checkSummary', () => {
  it('accepts a faithful summary, with decimals inside a sentence', () => {
    expect(checkSummary([FAITHFUL_1, FAITHFUL_2], evidence)).toEqual([]);
    expect(checkSummary(['Evidence found for 4 of 5 criteria, with HbA1c 8.4 % on 2026-09-15; C3 conflicting.', FAITHFUL_2], evidence)).toEqual([]);
  });

  it('wants exactly one sentence in each field', () => {
    expect(checkSummary(['Evidence found for 4 of 5 criteria. C3 conflicting.', FAITHFUL_2], evidence)).toContain(
      'sentence_1 has 2 sentences; make it one sentence by joining the parts with a semicolon.',
    );
    expect(checkSummary([FAITHFUL_1, 'Nothing more'], evidence)).toContain('sentence_2 must end with a period.');
  });

  it('rejects a number or date that is not in the evidence', () => {
    expect(checkSummary([FAITHFUL_1, 'Request fill history supporting the reported 9 months.'], evidence)).toContain(
      'The number 9 is not in the data.',
    );
    expect(checkSummary(['Evidence found for 4 of 5 criteria on 2026-01-01; C3 conflicting.', FAITHFUL_2], evidence)).toContain(
      'The date 2026-01-01 is not in the data.',
    );
  });

  it('rejects a wrong status, a list with a wrong status, and an unknown criterion', () => {
    expect(checkSummary(['Evidence found for 4 of 5 criteria; C3 missing.', FAITHFUL_2], evidence)).toContain('C3 is conflicting, not missing.');
    expect(checkSummary(['Evidence found for 4 of 5 criteria; C1 and C3 are conflicting.', FAITHFUL_2], evidence)).toContain(
      'C1 is met, not conflicting.',
    );
    expect(checkSummary(['Evidence found for 4 of 5 criteria; C3 conflicting and C9 missing.', FAITHFUL_2], evidence)).toContain(
      'C9 is not a criterion in the data.',
    );
  });

  it('wants every criterion that is not met named', () => {
    expect(checkSummary(['Evidence found for 4 of 5 criteria.', FAITHFUL_2], evidence)).toContain('Name C3, whose status is conflicting.');
  });

  it('rejects wrong counts and "all criteria met" when they are not', () => {
    expect(checkSummary(['Evidence found for 5 of 5 criteria; C3 conflicting.', FAITHFUL_2], evidence)).toContain(
      'Evidence was found for 4 of 5 criteria.',
    );
    expect(checkSummary(['All criteria are met except that C3 conflicting is noted.', FAITHFUL_2], evidence)).toContain(
      'Not every criterion is met.',
    );
  });

  it('rejects FHIR references, banned words and recommendations', () => {
    expect(checkSummary([FAITHFUL_1, 'See MedicationRequest/061087a3-cb71-5a24-9142-ff5c46ddfc92 for the 6 months.'], evidence)).toContain(
      'Do not mention FHIR references.',
    );
    expect(checkSummary([FAITHFUL_1, 'The request can be approved once the 6 months are shown.'], evidence)).toContain(
      'Do not use any form of approve, deny or authorize.',
    );
    expect(checkSummary([FAITHFUL_1, 'The member appears eligible once the 6 months are shown.'], evidence)).toContain(
      'Do not recommend or suggest a decision.',
    );
  });
});
