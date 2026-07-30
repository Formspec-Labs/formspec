/** @filedesc Focused coverage for built-in Experience referential-integrity validation. */

import { describe, expect, it } from 'vitest';
import {
  validateAppGraph,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const APP_URL = 'https://example.gov/apps/referential-integrity';
const EXPERIENCE_URL = `${APP_URL}/experience`;

function manifestHandle(): ResolvedArtifactHandle {
  return {
    slot: 'app',
    artifactKind: 'appManifest',
    status: 'loaded',
    source: 'memory://app/referential-integrity',
    document: {
      $formspecBundle: '2.3',
      id: APP_URL,
      version: '1.0.0',
      definitions: [],
      experience: {
        url: EXPERIENCE_URL,
        version: '1.0.0',
      },
    },
  };
}

function experienceHandle(document: Record<string, unknown>): ResolvedArtifactHandle {
  return {
    slot: 'experience',
    artifactKind: 'experience',
    status: 'loaded',
    source: 'memory://experience/referential-integrity',
    ref: {
      url: EXPERIENCE_URL,
      version: '1.0.0',
    },
    document: {
      $formspecExperience: '1.0',
      version: '1.0.0',
      ...document,
    },
  };
}

function validateExperience(document: Record<string, unknown>) {
  return validateAppGraph({
    manifest: manifestHandle(),
    artifacts: {
      experience: [experienceHandle(document)],
    },
    schemaValidators: () => ({ ok: true }),
  });
}

describe('built-in Experience referential-integrity validation', () => {
  it('fails the v12 actors:[] / tasks:[] shape at each unresolved unit reference', () => {
    const report = validateExperience({
      actors: [],
      tasks: [],
      units: [{
        id: 'respondJourney',
        kind: 'data-entry',
        actorRef: 'publicRespondent',
        taskRefs: [
          'setUpService',
          'submitResponse',
          'reviewResponse',
          'manageBilling',
        ],
      }],
    });

    expect(report.ok).toBe(false);
    expect(report.summary.graphErrors).toBe(5);
    expect(report.diagnostics).toHaveLength(5);
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'EXP-REFERENTIAL-INTEGRITY',
      'EXP-REFERENTIAL-INTEGRITY',
      'EXP-REFERENTIAL-INTEGRITY',
      'EXP-REFERENTIAL-INTEGRITY',
      'EXP-REFERENTIAL-INTEGRITY',
    ]);
    expect(report.diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/units/0/actorRef',
      '/units/0/taskRefs/0',
      '/units/0/taskRefs/1',
      '/units/0/taskRefs/2',
      '/units/0/taskRefs/3',
    ]);
    expect(report.diagnostics[0]).toMatchObject({
      severity: 'error',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      primarySource: {
        artifactSlot: 'experience',
        artifactKind: 'experience',
        source: 'memory://experience/referential-integrity',
        jsonPointer: '/units/0/actorRef',
        ref: {
          url: EXPERIENCE_URL,
          version: '1.0.0',
        },
      },
      relatedSources: [{
        artifactSlot: 'experience',
        artifactKind: 'experience',
        source: 'memory://experience/referential-integrity',
        jsonPointer: '/actors',
        ref: {
          url: EXPERIENCE_URL,
          version: '1.0.0',
        },
      }],
      details: {
        reason: 'reference-unresolved',
        ref: 'publicRespondent',
        target: 'actors',
        knownIds: [],
      },
    });
  });

  it('accepts unit actorRef and taskRefs that resolve in the same Experience', () => {
    const report = validateExperience({
      actors: [{ id: 'publicRespondent' }],
      tasks: [
        { id: 'setUpService', actorRefs: ['publicRespondent'] },
        { id: 'submitResponse', actorRefs: ['publicRespondent'] },
      ],
      units: [{
        id: 'respondJourney',
        kind: 'data-entry',
        actorRef: 'publicRespondent',
        taskRefs: ['setUpService', 'submitResponse'],
      }],
    });

    expect(report.ok).toBe(true);
    expect(report.summary.graphErrors).toBe(0);
    expect(report.diagnostics).toEqual([]);
    expect(report.phases).toContainEqual({
      phase: 'cross-artifact',
      status: 'completed',
    });
  });

  it('rejects an itemRef that does not resolve in the targeted Definition', () => {
    const definitionUrl = `${APP_URL}/definition`;
    const definition: ResolvedArtifactHandle = {
      slot: 'definitions[0]',
      artifactKind: 'definition',
      status: 'loaded',
      ref: { url: definitionUrl, version: '1.0.0' },
      document: {
        $formspec: '1.0',
        url: definitionUrl,
        version: '1.0.0',
        items: [{ key: 'known', type: 'field', label: 'Known' }],
      },
    };

    const report = validateAppGraph({
      manifest: manifestHandle(),
      artifacts: {
        experience: [experienceHandle({
          targetDefinition: { url: definitionUrl },
          units: [{
            id: 'review',
            kind: 'review-summary',
            itemRefs: [{ path: 'doesNotExist' }],
          }],
        })],
        definition: [definition],
      },
      schemaValidators: () => ({ ok: true }),
    });

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'EXP-ITEM-REF-UNRESOLVED',
      severity: 'error',
      primarySource: expect.objectContaining({
        jsonPointer: '/units/0/itemRefs/0/path',
      }),
      details: expect.objectContaining({
        reason: 'item-ref-unresolved',
        itemPath: 'doesNotExist',
        knownItemPaths: ['known'],
      }),
    }));
  });

  it('rejects an Experience unit that no Surface mounts', () => {
    const surface: ResolvedArtifactHandle = {
      slot: 'surfaces[0]',
      artifactKind: 'surface',
      status: 'loaded',
      document: {
        $formspecSurface: '0.2',
        id: 'main',
        entry: 'home',
        routes: [{
          id: 'home',
          path: '/',
          slots: [{
            id: 'content',
            slotType: 'static-content',
            binding: { kind: 'text', content: 'Home' },
          }],
        }],
      },
    };

    const report = validateAppGraph({
      manifest: manifestHandle(),
      artifacts: {
        experience: [experienceHandle({
          units: [{ id: 'orphan', kind: 'review-summary' }],
        })],
        surface: [surface],
      },
      schemaValidators: () => ({ ok: true }),
    });

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'EXP-UNIT-UNMOUNTED',
      severity: 'error',
      primarySource: expect.objectContaining({
        jsonPointer: '/units/0/id',
      }),
      details: expect.objectContaining({
        reason: 'experience-unit-unmounted',
        unitId: 'orphan',
      }),
    }));
  });
});
