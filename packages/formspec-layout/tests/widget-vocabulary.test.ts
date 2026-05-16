import { describe, it, expect } from 'vitest';
import {
  widgetTokenToComponent,
  KNOWN_COMPONENT_TYPES,
  SPEC_WIDGET_TO_COMPONENT,
  COMPONENT_TO_HINT,
  COMPATIBILITY_MATRIX,
} from '@formspec-org/types';

// ── widgetTokenToComponent (existing) ─────────────────────────────

describe('widgetTokenToComponent', () => {
  it('resolves spec hints to components', () => {
    // Tier 1 widgetHint "checkbox" / "toggle" / "yesNo" → Toggle (no standalone Checkbox component)
    expect(widgetTokenToComponent('checkbox')).toBe('Toggle');
    expect(widgetTokenToComponent('toggle')).toBe('Toggle');
    expect(widgetTokenToComponent('radio')).toBe('RadioGroup');
    expect(widgetTokenToComponent('dropdown')).toBe('Select');
  });

  it('does not accept raw PascalCase component names that are not widget tokens', () => {
    // "Toggle" still normalizes to the canonical "toggle" widget token.
    expect(widgetTokenToComponent('Toggle')).toBe('Toggle');
    expect(widgetTokenToComponent('RadioGroup')).toBeNull();
  });

  it('normalizes Checkbox to checkbox hint and resolves to Toggle', () => {
    expect(widgetTokenToComponent('Checkbox')).toBe('Toggle');
  });

  it('returns null for unknown tokens', () => {
    expect(widgetTokenToComponent('banana')).toBeNull();
    expect(widgetTokenToComponent(null)).toBeNull();
    expect(widgetTokenToComponent(undefined)).toBeNull();
  });
});

// ── COMPONENT_TO_HINT (new export) ────────────────────────────────

describe('COMPONENT_TO_HINT — reverse map from component to canonical hint', () => {
  it('maps Toggle to toggle (boolean single-value control)', () => {
    expect(COMPONENT_TO_HINT['Toggle']).toBe('toggle');
  });

  it('maps Select to dropdown', () => {
    expect(COMPONENT_TO_HINT['Select']).toBe('dropdown');
  });

  it('maps RadioGroup to radio', () => {
    expect(COMPONENT_TO_HINT['RadioGroup']).toBe('radio');
  });

  it('every KNOWN_COMPONENT_TYPES field/input component has a hint entry', () => {
    // Layout-only components (Tabs, Page, Collapsible) don't need hints
    const layoutOnly = new Set(['Tabs', 'Page', 'Collapsible']);
    for (const comp of KNOWN_COMPONENT_TYPES) {
      if (layoutOnly.has(comp)) continue;
      expect(COMPONENT_TO_HINT[comp], `${comp} should have a hint`).toBeDefined();
    }
  });

  it('is consistent with SPEC_WIDGET_TO_COMPONENT (hint normalizes to valid lookup key)', () => {
    // For every component→hint entry, normalizing the camelCase hint to lowercase
    // should produce a valid key in SPEC_WIDGET_TO_COMPONENT
    for (const [component, hint] of Object.entries(COMPONENT_TO_HINT)) {
      const normalized = hint.replace(/[\s_-]+/g, '').toLowerCase();
      const resolved = SPEC_WIDGET_TO_COMPONENT[normalized];
      expect(resolved, `hint "${hint}" (normalized: "${normalized}") for ${component} should exist in SPEC_WIDGET_TO_COMPONENT`).toBeDefined();
      expect(KNOWN_COMPONENT_TYPES.has(resolved!), `resolved "${resolved}" should be known`).toBe(true);
    }
  });
});

// ── COMPATIBILITY_MATRIX (new export) ─────────────────────────────

describe('COMPATIBILITY_MATRIX — dataType to compatible components', () => {
  it('boolean uses Toggle', () => {
    expect(COMPATIBILITY_MATRIX['boolean']).toEqual(['Toggle']);
  });

  it('choice supports Select, RadioGroup, TextInput', () => {
    expect(COMPATIBILITY_MATRIX['choice']).toEqual(['Select', 'RadioGroup', 'TextInput']);
  });

  it('every component in the matrix is a known component type', () => {
    for (const [dataType, components] of Object.entries(COMPATIBILITY_MATRIX)) {
      for (const comp of components) {
        expect(
          KNOWN_COMPONENT_TYPES.has(comp),
          `${comp} in matrix[${dataType}] should be a known component`,
        ).toBe(true);
      }
    }
  });

  it('first entry is the default widget for that dataType', () => {
    // The first component in each list is the default
    expect(COMPATIBILITY_MATRIX['boolean'][0]).toBe('Toggle');
    expect(COMPATIBILITY_MATRIX['string'][0]).toBe('TextInput');
    expect(COMPATIBILITY_MATRIX['integer'][0]).toBe('NumberInput');
    expect(COMPATIBILITY_MATRIX['choice'][0]).toBe('Select');
  });
});
