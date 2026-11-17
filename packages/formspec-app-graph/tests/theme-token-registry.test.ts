/** @filedesc Canonical theme-token lint through the shared app-graph diagnostic mapper. */
import { beforeAll, describe, expect, it } from 'vitest';
import { initFormspecEngine, initFormspecEngineTools, lintDocument } from '@formspec-org/engine';
import {
  PLATFORM_BRAND_TOKEN_KEY,
  documentLintDiagnostics,
  type ResolvedArtifactHandle,
} from '../src/index.js';

function themeHandle(tokens: Record<string, string>): ResolvedArtifactHandle {
  return {
    slot: 'theme',
    artifactKind: 'theme',
    status: 'loaded',
    ref: { url: 'urn:formspec:doc:test:theme' },
    source: 'test://theme',
    document: { $formspecTheme: '1.0', tokens },
  };
}

// The native warning is replaced by W708. Keep its behavioral checks against the Rust owner;
// finding details now carry canonical lint metadata rather than the retired validator's fields.
function themeTokenDiagnostics(theme: ResolvedArtifactHandle) {
  return documentLintDiagnostics(lintDocument, theme, {}).filter((entry) => entry.code === 'W708');
}

describe('theme token registry lint', () => {
  beforeAll(async () => { await initFormspecEngine(); await initFormspecEngineTools(); });
  it('says nothing about a theme that names only declared platform tokens', () => {
    const diagnostics = themeTokenDiagnostics(
      themeHandle({ 'color.primary': '#7A1F3D', 'spacing.md': '1rem' }),
    );
    expect(diagnostics).toEqual([]);
  });

  it('says nothing about x- extension tokens', () => {
    const diagnostics = themeTokenDiagnostics(
      themeHandle({ 'x-agency.seal-color': '#002868' }),
    );
    expect(diagnostics).toEqual([]);
  });

  // The surface-render-v10 measurement, as a test. `color.accent` travelled the
  // whole chain — authoring, validation, signing, emission, cascade — and
  // painted nothing, with no diagnostic anywhere.
  it('reports an undeclared brand-lookalike token as a warning naming the real brand token', () => {
    const diagnostics = themeTokenDiagnostics(
      themeHandle({ 'color.accent': '#7A1F3D' }),
    );
    expect(diagnostics).toHaveLength(1);
    const [diagnostic] = diagnostics;
    expect(diagnostic.code).toBe('W708');
    expect(diagnostic.origin).toBe('x-formspec-lint');
    expect(diagnostic.severity).toBe('warning');
    expect(diagnostic.phase).toBe('cross-artifact');
    expect(diagnostic.message).toContain(PLATFORM_BRAND_TOKEN_KEY);
    expect(diagnostic.message).toContain('color.accent');
    expect(diagnostic.details?.lintPath).toBe('$.tokens.color.accent');
    expect(diagnostic.primarySource?.jsonPointer).toBe('/tokens/color.accent');
  });

  it('reports any other undeclared non-extension token', () => {
    const diagnostics = themeTokenDiagnostics(
      themeHandle({ 'color.sparkle': '#ff00ff' }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('color.sparkle');
  });
});
