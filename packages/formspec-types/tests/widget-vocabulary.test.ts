/** @filedesc Tests for widget vocabulary — ensures spec-compliance of component↔hint mappings. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPONENT_TO_HINT,
  KNOWN_COMPONENT_TYPES,
  SPEC_WIDGET_TO_COMPONENT,
  COMPATIBILITY_MATRIX,
} from '../src/widget-vocabulary.js';
import { UI_POLICY } from '../src/ui-policy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  it('exports the generated UI policy from specs/ui-policy.json without drift', () => {
    const policyPath = resolve(__dirname, '../../../specs/ui-policy.json');
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    expect(UI_POLICY).toEqual(policy);
  });

  it('builds compatibility matrix from the shared UI policy', () => {
    expect(COMPATIBILITY_MATRIX).toEqual(UI_POLICY.compatibilityByDataType);
  });

  it('keeps compatibilityByDataType strict rather than authoring-loose', () => {
    expect(COMPATIBILITY_MATRIX.string).toEqual(['TextInput']);
    expect(COMPATIBILITY_MATRIX.choice).toEqual(['Select', 'RadioGroup']);
    expect(COMPATIBILITY_MATRIX.money).toEqual(['MoneyInput']);
    expect(COMPATIBILITY_MATRIX.integer).toEqual(['NumberInput', 'MoneyInput', 'Slider', 'Rating']);
  });

  it('declares every compatibilityByDataType entry on the component policy', () => {
    const inputPolicies = UI_POLICY.inputComponents as Record<
      string,
      { strictDataTypes: readonly string[]; authoringDataTypes: readonly string[] }
    >;

    for (const [dataType, components] of Object.entries(UI_POLICY.compatibilityByDataType)) {
      for (const component of components) {
        const policy = inputPolicies[component];
        expect(policy, `${component} in compatibilityByDataType.${dataType} must be an input component`).toBeDefined();
        expect(
          [...policy.strictDataTypes, ...policy.authoringDataTypes],
          `${component}/${dataType} must be declared on inputComponents`,
        ).toContain(dataType);
      }
    }
  });
});
