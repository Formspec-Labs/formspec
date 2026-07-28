/** @filedesc Replays the shared needs fixture corpus against the real Needs coverage checker. */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateAppGraph,
  validateNeedsCoverage,
  type AppGraphContext,
  type AppGraphDiagnostic,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const FIXTURE_DIR = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/needs', import.meta.url)),
);

const NEEDS_SCHEMA_ID = 'https://formspec.org/schemas/needs/1.0';

/** The live v1 set (needs-spec S9.4). */
const LIVE_CODES = new Set([
  'NEED-GROUND-001',
  'NEED-DOC-001',
  'NEED-REF-001',
  'NEED-COVERAGE-001',
  'NEED-COVERAGE-002',
]);

/** Registered but unimplemented (S9.5). A v1 emission of either is a conformance failure (S11.3.4). */
const RESERVED_CODES = ['NEED-STALE-001', 'NEED-ORPHAN-001'];

const SEVERITY_BY_CODE: Record<string, AppGraphDiagnostic['severity']> = {
  'NEED-GROUND-001': 'error',
  'NEED-DOC-001': 'error',
  'NEED-REF-001': 'error',
  'NEED-COVERAGE-001': 'warning',
  'NEED-COVERAGE-002': 'info',
};

interface FixtureCase {
  id: string;
  description: string;
  specRow: string;
  needsDocument: unknown;
  bundle?: {
    experience?: Record<string, unknown>;
    generatedArtifacts?: unknown[];
  };
  expectSchemaValid: boolean | null;
  expectedCodes: string[];
  note?: string;
}

function loadCases(): FixtureCase[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.case.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), 'utf8')) as FixtureCase);
}

const BUNDLE_ID = 'https://benefits.example.gov/apps/assistance';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `fixture://${slot}`,
    // Every sibling carries the App Manifest ref URL it was resolved from.
    // Without it the shared validator refuses to infer membership at all, and
    // the resulting APP-GRAPH-COMPONENT-REF-MISSING error would mask whether
    // the NEED-* family blocks anything.
    ref: { url: `${BUNDLE_ID}/${slot}`, version: '1.0.0' },
    document,
  };
}

/**
 * Builds the context the checker sees. Only the manifest, the Experience
 * document, and any generated artifacts are bundle members; the Needs Document
 * enters as caller-paired host evidence (needs-spec S2.1), never as a slot.
 */
function contextFor(fixture: FixtureCase): AppGraphContext {
  const generated = fixture.bundle?.generatedArtifacts ?? [];
  const manifest = handle('manifest', 'appManifest', {
    $formspecBundle: '2.3',
    id: BUNDLE_ID,
    version: '1.0.0',
    ...(generated.length > 0
      ? {
        components: generated.map((_, index) => ({
          handle: `generated${index}`,
          url: `${BUNDLE_ID}/component[${index}]`,
          version: '1.0.0',
        })),
      }
      : {}),
  });
  const handles: ResolvedArtifactHandle[] = [manifest];
  if (fixture.bundle?.experience) {
    handles.push(handle('experience', 'experience', {
      $formspecExperience: '1.0',
      version: '1.0.0',
      ...fixture.bundle.experience,
    }));
  }
  generated.forEach((document, index) => {
    handles.push(handle(`component[${index}]`, 'component', {
      $formspecComponent: '1.0',
      version: '1.0.0',
      nodes: [document],
    }));
  });

  return {
    manifest,
    handles,
    schemaResults: [],
    evidenceResults: [],
    ...(fixture.needsDocument === null
      ? {}
      : {
        hostEvidence: {
          needsDocuments: [{
            schemaId: NEEDS_SCHEMA_ID,
            source: 'fixture://needs',
            document: fixture.needsDocument,
          }],
        },
      }),
  };
}

const CASES = loadCases();

describe('needs coverage checker — shared fixture corpus', () => {
  it('loads the corpus the Python schema runner reads', () => {
    expect(CASES.length).toBeGreaterThan(0);
  });

  for (const fixture of CASES) {
    describe(fixture.id, () => {
      const diagnostics = validateNeedsCoverage(contextFor(fixture));

      it('emits exactly the expected NEED-* codes', () => {
        const actual = diagnostics.map((d) => d.code).sort();
        expect(actual).toEqual([...fixture.expectedCodes].sort());
      });

      it('emits no reserved code', () => {
        for (const reserved of RESERVED_CODES) {
          expect(diagnostics.some((d) => d.code === reserved)).toBe(false);
        }
      });

      it('emits only live codes at their registered severity and phase', () => {
        for (const diagnostic of diagnostics) {
          expect(LIVE_CODES.has(diagnostic.code)).toBe(true);
          expect(diagnostic.severity).toBe(SEVERITY_BY_CODE[diagnostic.code]);
          expect(diagnostic.phase).toBe('cross-artifact');
          expect(diagnostic.origin).toBe('app-graph-validator');
        }
      });

      it('frames every row assertor / subject / criterion / outcome', () => {
        for (const diagnostic of diagnostics) {
          const details = diagnostic.details ?? {};
          expect(details.assertor).toBe('formspec-needs-coverage-checker');
          expect(typeof details.subject).toBe('string');
          expect(String(details.subject)).not.toHaveLength(0);
          expect(String(details.criterion)).toMatch(/^needs-spec S/);
          expect(['failed', 'cantTell']).toContain(details.outcome);
        }
      });

      it('points every row at a source a reader can open', () => {
        for (const diagnostic of diagnostics) {
          expect(diagnostic.primarySource).toBeDefined();
          expect(diagnostic.primarySource?.jsonPointer).toBeDefined();
        }
      });
    });
  }
});

describe('needs coverage rides the app-graph validation report', () => {
  const fixture = CASES.find((c) => c.id === 'appendix-a-worked-example')!;
  const context = contextFor(fixture);
  const report = validateAppGraph({
    manifest: context.manifest,
    artifacts: { siblings: context.handles.filter((h) => h.slot !== 'manifest') },
    hostEvidence: context.hostEvidence,
    schemaValidators: () => ({ ok: true }),
    evidenceSchemaValidators: () => ({ ok: true }),
  });

  it('carries the Appendix A coverage rows in report.diagnostics', () => {
    const needCodes = report.diagnostics.filter((d) => d.code.startsWith('NEED-')).map((d) => d.code).sort();
    expect(needCodes).toEqual(['NEED-COVERAGE-001', 'NEED-COVERAGE-002']);
  });

  it('counts them in the report summary at their registered severities', () => {
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.infos).toBe(1);
  });

  it('never blocks: coverage findings leave the report ok', () => {
    // needs-spec S9.3 / S11.4.2 — reportable, never blocking. `ok` tracks
    // errors only, and neither coverage code is one.
    expect(report.ok).toBe(true);
    expect(report.summary.errors).toBe(0);
  });

  it('schema-validates the paired Needs Document as host evidence, not as a bundle slot', () => {
    const slots = report.evidenceResults.map((result) => result.evidenceSlot);
    expect(slots).toContain('hostEvidence.needsDocuments[0]');
    expect(report.schemaResults.map((r) => r.artifactKind)).not.toContain('needs');
  });

  it('refuses a Needs Document declared under the wrong schema id', () => {
    const wrong = validateAppGraph({
      manifest: context.manifest,
      artifacts: { siblings: context.handles.filter((h) => h.slot !== 'manifest') },
      hostEvidence: {
        needsDocuments: [{
          schemaId: 'https://formspec.org/schemas/experience/1.0',
          source: 'fixture://needs',
          document: fixture.needsDocument,
        }],
      },
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: () => ({ ok: true }),
    });
    const codes = wrong.evidenceResults.flatMap((r) => r.diagnostics.map((d) => d.code));
    expect(codes).toContain('APP-GRAPH-EVIDENCE-SCHEMA-ID');
  });
});

describe('needs coverage checker — evidence that is not a Needs Document', () => {
  const paired = CASES.find((c) => c.id === 'warning-adopted-need-unserved')!;

  function withDocument(document: unknown): AppGraphContext {
    const context = contextFor(paired);
    return {
      ...context,
      hostEvidence: {
        needsDocuments: [{ schemaId: NEEDS_SCHEMA_ID, source: 'fixture://needs', document }],
      },
    };
  }

  it('reads the entry when the document declares the needs schema id', () => {
    // The falsifier for the two refusals below: the same bundle, the same
    // evidence slot, a document that does identify itself — findings appear.
    const codes = validateNeedsCoverage(withDocument(paired.needsDocument)).map((d) => d.code).sort();
    expect(codes).toEqual([...paired.expectedCodes].sort());
    expect(codes.length).toBeGreaterThan(0);
  });

  it('refuses an entry whose document carries no $formspecNeeds', () => {
    // An Experience Document parses as a record too. Reading needs[] off it
    // would invent coverage findings about an artifact nobody paired.
    const notANeedsDocument = {
      $formspecExperience: '1.0',
      version: '1.0.0',
      units: [],
      needs: [{ id: 'smuggled', status: 'adopted' }],
    };
    expect(validateNeedsCoverage(withDocument(notANeedsDocument))).toEqual([]);
  });

  it('refuses an entry pinned to a needs version this checker does not implement', () => {
    const futureVersion = { ...(paired.needsDocument as Record<string, unknown>), $formspecNeeds: '2.0' };
    expect(validateNeedsCoverage(withDocument(futureVersion))).toEqual([]);
  });

  it('leaves the mis-declared-entry report to the evidence phase, not to a NEED-* code', () => {
    // One defect, one code: APP-GRAPH-EVIDENCE-SCHEMA-ID owns the mis-declared
    // entry (validator.ts). The coverage checker's contribution is silence.
    const context = contextFor(paired);
    const report = validateAppGraph({
      manifest: context.manifest,
      artifacts: { siblings: context.handles.filter((h) => h.slot !== 'manifest') },
      hostEvidence: {
        needsDocuments: [{
          schemaId: 'https://formspec.org/schemas/experience/1.0',
          source: 'fixture://needs',
          document: { $formspecExperience: '1.0', version: '1.0.0', units: [] },
        }],
      },
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: () => ({ ok: true }),
    });
    const evidenceCodes = report.evidenceResults.flatMap((r) => r.diagnostics.map((d) => d.code));
    expect(evidenceCodes).toContain('APP-GRAPH-EVIDENCE-SCHEMA-ID');
    expect(report.diagnostics.filter((d) => d.code.startsWith('NEED-'))).toEqual([]);
  });
});

describe('needs coverage checker — the unpaired posture', () => {
  it('emits nothing at all when no Needs Document is paired', () => {
    const fixture = CASES.find((c) => c.id === 'valid-unpaired-emits-nothing');
    expect(fixture).toBeDefined();
    expect(validateNeedsCoverage(contextFor(fixture!))).toEqual([]);
  });

  it('fires on the same bundle once a document is paired', () => {
    // The falsifier for the test above: silence must be the pairing's absence,
    // not the bundle being clean. Same units, one paired document, and the
    // unresolved ref plus the uncited unit both surface.
    const fixture = CASES.find((c) => c.id === 'valid-unpaired-emits-nothing')!;
    const paired: FixtureCase = {
      ...fixture,
      needsDocument: {
        $formspecNeeds: '1.0',
        version: '1.0.0',
        needs: [],
      },
    };
    const codes = validateNeedsCoverage(contextFor(paired)).map((d) => d.code).sort();
    expect(codes).toEqual(['NEED-COVERAGE-002', 'NEED-REF-001']);
  });
});
