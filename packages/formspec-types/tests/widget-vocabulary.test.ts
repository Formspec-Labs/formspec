/** @filedesc Tests for widget vocabulary — ensures spec-compliance of component↔hint mappings. */
import { describe, it, expect } from 'vitest';
import {
  COMPONENT_TO_HINT,
  KNOWN_COMPONENT_TYPES,
  SPEC_WIDGET_TO_COMPONENT,
} from '../src/widget-vocabulary.js';

describe('widget-vocabulary', () => {
  it('COMPONENT_TO_HINT maps Collapsible to the canonical Collapsible hint', () => {
    expect(COMPONENT_TO_HINT['Collapsible']).toBe('Collapsible');
  });

  it('COMPONENT_TO_HINT Accordion maps to the canonical Accordion hint', () => {
    expect(COMPONENT_TO_HINT['Accordion']).toBe('Accordion');
  });

  it('Accordion hint in SPEC_WIDGET_TO_COMPONENT maps to Accordion', () => {
    expect(SPEC_WIDGET_TO_COMPONENT['Accordion']).toBe('Accordion');
  });

  it('round-trips Accordion without lossy collision with Collapsible', () => {
    const hint = COMPONENT_TO_HINT['Accordion'];
    const component = SPEC_WIDGET_TO_COMPONENT[hint];
    expect(component).toBe('Accordion');
  });

  it('SPEC_WIDGET_TO_COMPONENT values are all known component types', () => {
    for (const component of Object.values(SPEC_WIDGET_TO_COMPONENT)) {
      expect(KNOWN_COMPONENT_TYPES.has(component)).toBe(true);
    }
  });
});
