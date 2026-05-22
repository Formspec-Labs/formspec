import { describe, it, expect } from 'vitest';
import { normalizeState } from '../src/state-normalizer.js';
import type { ProjectState } from '../src/types.js';

function makeState(overrides: any = {}): ProjectState {
  return {
    definition: { url: 'urn:formspec:test', $formspec: '1.0', version: '0.1.0', title: '', items: [], ...overrides.definition },
    component: { targetDefinition: { url: '' }, ...overrides.component },
    theme: { targetDefinition: { url: '' }, ...overrides.theme },
    mappings: {},
    selectedMappingId: 'default',
    extensions: { registries: [] },
    versioning: { baseline: { $formspec: '1.0', url: '', version: '0.1.0', title: '', items: [] } as any, releases: [] },
  } as any;
}

describe('normalizeState', () => {
  it('syncs targetDefinition URLs from definition', () => {
    const state = makeState();
    normalizeState(state);
    expect(state.component.targetDefinition!.url).toBe('urn:formspec:test');
    expect((state.theme as any).targetDefinition.url).toBe('urn:formspec:test');
  });

  it('sorts theme breakpoints by minWidth ascending', () => {
    const state = makeState({
      theme: { targetDefinition: { url: '' }, breakpoints: { lg: 1024, sm: 640, md: 768 } },
    });
    normalizeState(state);
    const keys = Object.keys(state.theme.breakpoints!);
    expect(keys).toEqual(['sm', 'md', 'lg']);
  });

  it('does not inherit theme breakpoints into component state', () => {
    const state = makeState({
      theme: { targetDefinition: { url: '' }, breakpoints: { sm: 640 } },
      component: { targetDefinition: { url: '' } },
    });
    normalizeState(state);
    expect(state.theme.breakpoints).toEqual({ sm: 640 });
    expect(state.component.breakpoints).toBeUndefined();
  });

  it('sorts component breakpoints without merging theme breakpoints into them', () => {
    const state = makeState({
      theme: { targetDefinition: { url: '' }, breakpoints: { sm: 640 } },
      component: { targetDefinition: { url: '' }, breakpoints: { lg: 1024, md: 768 } },
    });
    normalizeState(state);
    expect(state.component.breakpoints).toEqual({ md: 768, lg: 1024 });
    expect(state.theme.breakpoints).toEqual({ sm: 640 });
  });

  it('handles missing targetDefinition gracefully', () => {
    const state = makeState({
      component: {},
      theme: {},
    });
    // Should not throw
    normalizeState(state);
  });

  it('handles missing theme breakpoints gracefully', () => {
    const state = makeState();
    normalizeState(state);
    // No breakpoints on either — should not add any
    expect(state.component.breakpoints).toBeUndefined();
  });
});
