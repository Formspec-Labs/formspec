import { describe, expect, it } from 'vitest';
import {
  PLATFORM_BRAND_TOKEN_KEY,
  validateThemeTokenRegistry,
  type AppGraphContext,
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

function contextWith(handles: ResolvedArtifactHandle[]): AppGraphContext {
  return {
    manifest: { slot: 'app', artifactKind: 'appManifest', status: 'loaded' },
    handles,
    schemaResults: [],
    evidenceResults: [],
  };
}

describe('validateThemeTokenRegistry', () => {
  it('says nothing about a theme that names only declared platform tokens', () => {
    const diagnostics = validateThemeTokenRegistry(
      contextWith([themeHandle({ 'color.primary': '#7A1F3D', 'spacing.md': '1rem' })]),
    );
    expect(diagnostics).toEqual([]);
  });

  it('says nothing about x- extension tokens', () => {
    const diagnostics = validateThemeTokenRegistry(
      contextWith([themeHandle({ 'x-agency.seal-color': '#002868' })]),
    );
    expect(diagnostics).toEqual([]);
  });

  // The surface-render-v10 measurement, as a test. `color.accent` travelled the
  // whole chain — authoring, validation, signing, emission, cascade — and
  // painted nothing, with no diagnostic anywhere.
  it('reports an undeclared brand-lookalike token as a warning naming the real brand token', () => {
    const diagnostics = validateThemeTokenRegistry(
      contextWith([themeHandle({ 'color.accent': '#7A1F3D' })]),
    );
    expect(diagnostics).toHaveLength(1);
    const [diagnostic] = diagnostics;
    expect(diagnostic.code).toBe('THEME-TOKEN-UNREGISTERED');
    expect(diagnostic.severity).toBe('warning');
    expect(diagnostic.phase).toBe('cross-artifact');
    expect(diagnostic.message).toContain(PLATFORM_BRAND_TOKEN_KEY);
    expect(diagnostic.details).toMatchObject({
      token: 'color.accent',
      brandToken: 'color.primary',
      reason: 'brand-lookalike',
    });
    expect(diagnostic.primarySource?.jsonPointer).toBe('/tokens/color.accent');
  });

  it('reports any other undeclared non-extension token', () => {
    const diagnostics = validateThemeTokenRegistry(
      contextWith([themeHandle({ 'color.sparkle': '#ff00ff' })]),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.details).toMatchObject({ reason: 'unregistered-token' });
  });

  it('does NOT alias a lookalike onto the brand token — it only reports it', () => {
    const theme = themeHandle({ 'color.accent': '#7A1F3D' });
    validateThemeTokenRegistry(contextWith([theme]));
    const tokens = (theme.document as { tokens: Record<string, string> }).tokens;
    expect(tokens['color.primary']).toBeUndefined();
  });
});
