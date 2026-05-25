import { describe, expect, it } from 'vitest';
import {
  evaluateActorPostureAdmission,
  evaluateModulePostureAdmission,
} from '../src/posture-admission.js';

describe('posture-admission matcher', () => {
  it('admits document module when posture only pins id and version', () => {
    expect(evaluateModulePostureAdmission(
      {
        id: 'x-a',
        version: '1.0.0',
        publisher: 'https://example.org/',
        lockHash: 'sha256:abc',
      },
      [{ id: 'x-a', version: '1.0.0' }],
    )).toEqual({ admitted: true });
  });

  it('denies when module id is absent from posture allowlist', () => {
    expect(evaluateModulePostureAdmission(
      { id: 'x-other', version: '1.0.0' },
      [{ id: 'x-a', version: '1.0.0' }],
    )).toEqual({ admitted: false, reason: 'not-listed' });
  });

  it('denies actor urn absent from allowedActors', () => {
    expect(evaluateActorPostureAdmission(
      'urn:formspec:actor:ai-agent:wireframes',
      ['urn:formspec:actor:human:editor'],
    )).toBe(false);
  });
});
