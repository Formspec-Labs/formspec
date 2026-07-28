/**
 * @filedesc The closed code set, its fixed severities, and the document-root
 * report — `surface-shell-spec.md` §7.
 */
import { describe, expect, it } from 'vitest';
import {
  SURFACE_DIAGNOSTIC_CODES,
  SURFACE_DIAGNOSTIC_SEVERITY,
  documentRootContaminationDiagnostic,
  surfaceDiagnostic,
} from '../src/diagnostics.js';

/** The §7.2 table, transcribed. If this list and the source disagree, one is wrong. */
const SPEC_CODES = [
  'BUNDLE-DOCUMENT-MISSING',
  'BUNDLE-DOCUMENT-SHAPE',
  'SURFACE-ENTRY-UNRESOLVED',
  'ROUTE-PATH-COLLISION',
  'ROUTE-PARAM-GRAMMAR',
  'ROUTE-PARAM-UNDECLARED',
  'ROUTE-PARAM-NO-MARKER',
  'ROUTE-PARAM-UNSUPPLIED',
  'ROUTE-UNMATCHED',
  'EMBED-ROUTE-UNRESOLVED',
  'EMBED-ROUTE-CYCLE',
  'SLOT-BINDING-INCOMPLETE',
  'EXPERIENCE-UNIT-UNRESOLVED',
  'WIDGET-UNDECLARED',
  'WIDGET-UNIMPLEMENTED',
  'REGISTRY-ENTRY-NAME-COLLISION',
  'STATIC-IMAGE-NO-ALT',
  'THEME-TOKEN-UNKNOWN',
  'THEME-UNCLASSIFIED-REFUSED',
  'THEME-DOCUMENT-ROOT-CONTAMINATED',
  'TRANSITION-UNFIREABLE',
];

describe('the closed code set', () => {
  it('is exactly the spec’s §7.2 table — no more, no fewer', () => {
    // D5, D6, D7, D20 all added a code. The set is closed because a host that
    // wants to escalate some codes and ignore others needs the whole list.
    expect([...SURFACE_DIAGNOSTIC_CODES].sort()).toEqual([...SPEC_CODES].sort());
  });

  it('fixes a severity for every code', () => {
    // D3. Without severity the list is knowable and not actionable.
    for (const code of SURFACE_DIAGNOSTIC_CODES) {
      expect(SURFACE_DIAGNOSTIC_SEVERITY[code]).toMatch(/^(error|warning|info)$/);
    }
  });

  it('matches the spec’s severity for the codes §7.2 pins by name', () => {
    expect(SURFACE_DIAGNOSTIC_SEVERITY['ROUTE-UNMATCHED']).toBe('warning');
    expect(SURFACE_DIAGNOSTIC_SEVERITY['STATIC-IMAGE-NO-ALT']).toBe('warning');
    expect(SURFACE_DIAGNOSTIC_SEVERITY['TRANSITION-UNFIREABLE']).toBe('warning');
    expect(SURFACE_DIAGNOSTIC_SEVERITY['REGISTRY-ENTRY-NAME-COLLISION']).toBe('warning');
    expect(SURFACE_DIAGNOSTIC_SEVERITY['THEME-TOKEN-UNKNOWN']).toBe('warning');
    expect(SURFACE_DIAGNOSTIC_SEVERITY['THEME-UNCLASSIFIED-REFUSED']).toBe('info');
    expect(SURFACE_DIAGNOSTIC_SEVERITY['THEME-DOCUMENT-ROOT-CONTAMINATED']).toBe('error');
    expect(SURFACE_DIAGNOSTIC_SEVERITY['WIDGET-UNDECLARED']).toBe('error');
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
