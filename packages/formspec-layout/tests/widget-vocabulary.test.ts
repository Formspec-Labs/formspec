import { describe, it, expect } from 'vitest';
import {
  widgetTokenToComponent,
  KNOWN_COMPONENT_TYPES,
  SPEC_WIDGET_TO_COMPONENT,
  COMPONENT_TO_HINT,
  COMPATIBILITY_MATRIX,
} from '@formspec-org/types';

// ── widgetTokenToComponent ────────────────────────────────────────

describe('widgetTokenToComponent', () => {
  it('resolves canonical PascalCase widget tokens to components', () => {
    expect(widgetTokenToComponent('Toggle')).toBe('Toggle');
    expect(widgetTokenToComponent('RadioGroup')).toBe('RadioGroup');
    expect(widgetTokenToComponent('Select')).toBe('Select');
  });

  it('rejects removed alias tokens', () => {
    expect(widgetTokenToComponent('checkbox')).toBeNull();
    expect(widgetTokenToComponent('toggle')).toBeNull();
    expect(widgetTokenToComponent('radio')).toBeNull();
    expect(widgetTokenToComponent('dropdown')).toBeNull();
  });

  it('returns null for unknown tokens', () => {
    expect(widgetTokenToComponent('banana')).toBeNull();
    expect(widgetTokenToComponent(null)).toBeNull();
    expect(widgetTokenToComponent(undefined)).toBeNull();
  });
});

// ── COMPONENT_TO_HINT (new export) ────────────────────────────────

describe('COMPONENT_TO_HINT — reverse map from component to canonical hint', () => {
  it('maps Toggle to the canonical PascalCase hint', () => {
    expect(COMPONENT_TO_HINT['Toggle']).toBe('Toggle');
  });

  it('maps Select to Select', () => {
    expect(COMPONENT_TO_HINT['Select']).toBe('Select');
  });

  it('maps RadioGroup to RadioGroup', () => {
    expect(COMPONENT_TO_HINT['RadioGroup']).toBe('RadioGroup');
  });

  it('every known component type has a canonical hint entry', () => {
    for (const comp of KNOWN_COMPONENT_TYPES) {
      expect(COMPONENT_TO_HINT[comp], `${comp} should have a hint`).toBeDefined();
    }
  });

  it('is consistent with SPEC_WIDGET_TO_COMPONENT', () => {
    for (const [component, hint] of Object.entries(COMPONENT_TO_HINT)) {
      const resolved = SPEC_WIDGET_TO_COMPONENT[hint];
      expect(resolved, `hint "${hint}" for ${component} should exist in SPEC_WIDGET_TO_COMPONENT`).toBeDefined();
      expect(KNOWN_COMPONENT_TYPES.has(resolved!), `resolved "${resolved}" should be known`).toBe(true);
    }
  });
});

// ── COMPATIBILITY_MATRIX (new export) ─────────────────────────────

describe('COMPATIBILITY_MATRIX — dataType to compatible components', () => {
  it('boolean uses Toggle', () => {
    expect(COMPATIBILITY_MATRIX['boolean']).toEqual(['Toggle']);
  });

  it('choice supports Select and RadioGroup', () => {
    expect(COMPATIBILITY_MATRIX['choice']).toEqual(['Select', 'RadioGroup']);
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
    expect(COMPATIBILITY_MATRIX['money'][0]).toBe('MoneyInput');
  });
});
