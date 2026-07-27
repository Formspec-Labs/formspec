/**
 * @filedesc Executes the shipped regeneration-merge conformance corpus — every scenario's expected merge output and report.
 *
 * The corpus at `tests/conformance/fixtures/regeneration-merge/` carries a full
 * three-way input triple plus `expected-merged.json` and `expected-report.json`
 * per scenario. Until this file existed, nothing read those expected outputs:
 * the only regeneration test in the repo validated the report SCHEMA and never
 * ran a merge. This runner is the acceptance suite for
 * `specs/component/regeneration-merge-spec.md` §11 Levels 1–3.
 *
 * `reason` is compared as "non-empty string", not by text. §11.3 requires the
 * field; §7 gives it no normative wording, and the fixtures carry bespoke
 * scenario prose ("Same-parent duplicate anchor set resolved to identityLabel
 * via stable id."). Pinning generated text to fixture prose would test the
 * copywriting, not the algorithm. Every other field — code, severity, anchors,
 * nodePath, propertyDeltas, reattachedTo, cascaded, detached, array placement,
 * and entry order — is compared exactly.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  regenerationMerge,
  type ComponentDocumentLike,
  type MergeEntry,
  type MergeReport,
  type RegenerationMergeContext,
} from '../src/regeneration-merge.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FORMSPEC_ROOT = resolve(HERE, '../../..');
const FIXTURE_ROOT = resolve(FORMSPEC_ROOT, 'tests/conformance/fixtures/regeneration-merge');
const REPORT_SCHEMA = resolve(FORMSPEC_ROOT, 'schemas/regeneration-merge-report.schema.json');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const scenarios = readdirSync(FIXTURE_ROOT)
  .filter(name => !name.startsWith('_') && statSync(resolve(FIXTURE_ROOT, name)).isDirectory())
  .sort();

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validateReport = ajv.compile(readJson(REPORT_SCHEMA) as object);

/** Everything a conforming processor must reproduce exactly. */
type ComparableEntry = Omit<MergeEntry, 'reason'> & { reattachedTo?: string; cascaded?: boolean; detached?: boolean };

function comparable(entries: readonly MergeEntry[]): ComparableEntry[] {
  return entries.map(entry => {
    const { reason: _reason, ...rest } = entry;
    return rest as ComparableEntry;
  });
}

function comparableReport(report: MergeReport): Record<string, unknown> {
  return {
    version: report.version,
    surviving: comparable(report.surviving),
    regenerated: comparable(report.regenerated),
    orphaned: comparable(report.orphaned),
    pendingReview: comparable(report.pendingReview),
    conflicts: comparable(report.conflicts),
  };
}

function allEntries(report: MergeReport): MergeEntry[] {
  return [
    ...report.surviving,
    ...report.regenerated,
    ...report.orphaned,
    ...report.pendingReview,
    ...report.conflicts,
  ];
}

interface Scenario {
  name: string;
  oldGenerated: ComponentDocumentLike | null;
  designerEdited: ComponentDocumentLike;
  newGenerated: ComponentDocumentLike;
  context: RegenerationMergeContext;
  expectedMerged: unknown;
  expectedReport: MergeReport;
}

function loadScenario(name: string): Scenario {
  const dir = resolve(FIXTURE_ROOT, name);
  const contextPath = resolve(dir, 'context.json');
  return {
    name,
    oldGenerated: readJson(resolve(dir, 'old-generated.json')) as ComponentDocumentLike | null,
    designerEdited: readJson(resolve(dir, 'designer-edited.json')) as ComponentDocumentLike,
    newGenerated: readJson(resolve(dir, 'new-generated.json')) as ComponentDocumentLike,
    context: existsSync(contextPath)
      ? { anchorMappings: readJson(contextPath) as RegenerationMergeContext['anchorMappings'] }
      : {},
    expectedMerged: readJson(resolve(dir, 'expected-merged.json')),
    expectedReport: readJson(resolve(dir, 'expected-report.json')) as MergeReport,
  };
}

describe('regeneration merge — conformance corpus', () => {
  it('found the shipped fixture corpus', () => {
    expect(scenarios.length).toBe(17);
  });

  for (const name of scenarios) {
    describe(name, () => {
      const fixture = loadScenario(name);

      it('produces the expected merged Component draft', () => {
        const { merged } = regenerationMerge(fixture, fixture.context);
        expect(merged).toEqual(fixture.expectedMerged);
      });

      it('produces the expected MergeReport', () => {
        const { report } = regenerationMerge(fixture, fixture.context);
        expect(comparableReport(report)).toEqual(comparableReport(fixture.expectedReport));
        for (const entry of allEntries(report)) {
          expect(typeof entry.reason, `${entry.code} carries a reason`).toBe('string');
          expect(entry.reason.length).toBeGreaterThan(0);
        }
      });

      it('emits a MergeReport that validates against the shipped schema (§11.3)', () => {
        const { report } = regenerationMerge(fixture, fixture.context);
        const valid = validateReport(report);
        expect(validateReport.errors ?? [], JSON.stringify(validateReport.errors)).toEqual([]);
        expect(valid).toBe(true);
      });

      it('is deterministic and does not mutate its inputs (§11.4)', () => {
        const before = JSON.stringify([fixture.oldGenerated, fixture.designerEdited, fixture.newGenerated, fixture.context]);
        const first = regenerationMerge(fixture, fixture.context);
        const second = regenerationMerge(fixture, fixture.context);
        expect(JSON.stringify(second.merged)).toBe(JSON.stringify(first.merged));
        expect(JSON.stringify(second.report)).toBe(JSON.stringify(first.report));
        const after = JSON.stringify([fixture.oldGenerated, fixture.designerEdited, fixture.newGenerated, fixture.context]);
        expect(after).toBe(before);
      });

      it('converges after a clean review (§11.4)', () => {
        const { merged, report } = regenerationMerge(fixture, fixture.context);
        if (report.conflicts.length > 0 || report.pendingReview.length > 0) return; // guarantee does not apply
        const second = regenerationMerge(
          {
            oldGenerated: fixture.newGenerated,
            designerEdited: merged as ComponentDocumentLike,
            newGenerated: fixture.newGenerated,
          },
          fixture.context,
        );
        expect(second.report.conflicts).toEqual([]);
        expect(second.report.pendingReview).toEqual([]);
        expect(second.merged).toEqual(merged);
      });
    });
  }
});

describe('regeneration merge — designer-edit survival', () => {
  /**
   * The corpus-level claim the moat rests on, asserted mechanically rather than
   * by scenario name: a string value present in `designer-edited` and absent
   * from `new-generated` is present in `merged`.
   */
  const designerOnlyValueSurvives = (fixture: Scenario, merged: unknown): boolean => {
    const values = (doc: unknown): Set<string> => {
      const found = new Set<string>();
      const walk = (value: unknown): void => {
        if (typeof value === 'string') {
          if (value.length > 3) found.add(value);
          return;
        }
        if (Array.isArray(value)) {
          for (const item of value) walk(item);
          return;
        }
        if (value !== null && typeof value === 'object') for (const item of Object.values(value)) walk(item);
      };
      walk(doc);
      return found;
    };
    const designer = values(fixture.designerEdited);
    const regenerated = values(fixture.newGenerated);
    const result = values(merged);
    for (const value of designer) if (!regenerated.has(value) && result.has(value)) return true;
    return false;
  };

  const preserving = scenarios
    .map(loadScenario)
    .filter(fixture => designerOnlyValueSurvives(fixture, fixture.expectedMerged));

  it('the corpus asserts designer-edit survival in 10 scenarios', () => {
    expect(preserving.map(f => f.name)).toEqual([
      'designer-only-property',
      'designer-precedes',
      'orphan-broken-binding',
      'orphan-cascade',
      'orphan-detached',
      'orphan-node-resolved-refs',
      'property-conflict',
      'rename-no-anchor-mapping',
      'subtree-children-add',
      'widget-swap',
    ]);
  });

  for (const fixture of preserving) {
    it(`${fixture.name}: the designer's value survives the merge`, () => {
      const { merged } = regenerationMerge(fixture, fixture.context);
      expect(designerOnlyValueSurvives(fixture, merged)).toBe(true);
    });
  }
});
