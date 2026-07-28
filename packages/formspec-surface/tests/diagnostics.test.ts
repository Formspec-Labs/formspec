/**
 * @filedesc The closed code set, its fixed severities, and the document-root
 * report — `surface-shell-spec.md` §7.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SURFACE_DIAGNOSTIC_CODES,
  SURFACE_DIAGNOSTIC_SEVERITY,
  documentRootContaminationDiagnostic,
  surfaceDiagnostic,
} from '../src/diagnostics.js';

function normativeSeverityMap(): Readonly<Record<string, string>> {
  const specification = readFileSync(
    new URL('../../../specs/surface/surface-shell-spec.md', import.meta.url),
    'utf8',
  );
  const section = specification
    .split('### 7.2 The Codes')[1]
    ?.split('### 7.3 Fire / Does-Not-Fire Conditions')[0];
  if (section === undefined) throw new Error('Surface Shell §7.2 was not found.');

  const rows = [...section.matchAll(/^\| `([^`]+)` \| `(error|warning|info)` \|/gm)];
  if (rows.length === 0) throw new Error('Surface Shell §7.2 contains no diagnostic rows.');
  return Object.fromEntries(rows.map((row) => [row[1], row[2]]));
}

describe('the closed code set', () => {
  it('matches every code and severity in the normative §7.2 table exactly', () => {
    const specification = normativeSeverityMap();
    expect(Object.keys(specification).sort()).toEqual([...SURFACE_DIAGNOSTIC_CODES].sort());
    expect(specification).toEqual(SURFACE_DIAGNOSTIC_SEVERITY);
  });
});

describe('surfaceDiagnostic', () => {
  it('stamps the severity from the code, not from the caller', () => {
    // D3. Two sites reporting the same code cannot disagree about how loud it
    // is, because neither site gets to say.
    expect(surfaceDiagnostic('ROUTE-UNMATCHED', 'm', {}).severity).toBe('warning');
    expect(surfaceDiagnostic('WIDGET-UNDECLARED', 'm', {}).severity).toBe('error');
  });

  it('carries code, severity, message and site on every diagnostic', () => {
    const diagnostic = surfaceDiagnostic('BUNDLE-DOCUMENT-MISSING', 'm', { surfaceId: 's' });
    expect(Object.keys(diagnostic).sort()).toEqual(['code', 'message', 'severity', 'site']);
  });
});

describe('documentRootContaminationDiagnostic', () => {
  it('says nothing when the root is clean — that is the conforming path', () => {
    // D7's does-not-fire branch (§7.3): properties on an element the shell owns
    // are correct, and a non-DOM medium never calls this at all.
    expect(documentRootContaminationDiagnostic([])).toBeUndefined();
    expect(documentRootContaminationDiagnostic(['--tenant-brand', 'color'])).toBeUndefined();
  });

  it('reports the Formspec properties it was handed', () => {
    // D7. The read-don't-scrub posture was implemented and had no code, so a
    // production host could not alarm on it — only a CI test could assert it.
    const diagnostic = documentRootContaminationDiagnostic([
      '--formspec-color-primary',
      '--other',
      '--formspec-spacing-md',
    ]);
    expect(diagnostic?.code).toBe('THEME-DOCUMENT-ROOT-CONTAMINATED');
    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.details?.properties).toEqual([
      '--formspec-color-primary',
      '--formspec-spacing-md',
    ]);
  });

  it('returns a report and never a repair', () => {
    // §4.5: a shell that manufactures the property it reports is not measuring
    // anything. The signature is `-> diagnostic`, with no target to mutate.
    const properties = ['--formspec-color-primary'];
    documentRootContaminationDiagnostic(properties);
    expect(properties).toEqual(['--formspec-color-primary']);
  });
});
