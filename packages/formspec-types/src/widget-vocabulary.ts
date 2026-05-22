/**
 * Canonical widget vocabulary — single source of truth for widget ↔ component mappings.
 *
 * Lives in formspec-types so every package has access without adding dependencies.
 * All packages that need widget resolution import from here (via formspec-types
 * or re-exported through formspec-layout).
 */

import { UI_POLICY } from './ui-policy.js';

/** Tier 1/2 widget tokens and canonical PascalCase hint per component. */
const WIDGET_HINT_ENTRIES = UI_POLICY.components.map((entry) => ({
    component: entry.name,
    primaryHint: entry.primaryHint,
    widgets: [...entry.widgets],
}));

function buildSpecWidgetToComponent(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const { component, widgets } of WIDGET_HINT_ENTRIES) {
        for (const widget of widgets) {
            map[widget] = component;
        }
    }
    return map;
}

function buildComponentToHint(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const { component, primaryHint } of WIDGET_HINT_ENTRIES) {
        map[component] = primaryHint;
    }
    return map;
}

/**
 * Spec-normative Tier 1 widgetHint → Tier 3 component name.
 * Keys and values are canonical PascalCase component names.
 */
export const SPEC_WIDGET_TO_COMPONENT: Record<string, string> = buildSpecWidgetToComponent();

/**
 * Reverse map: PascalCase component → canonical PascalCase hint.
 * These are the values stored in definition.presentation.widgetHint.
 */
export const COMPONENT_TO_HINT: Record<string, string> = buildComponentToHint();

export const KNOWN_COMPONENT_TYPES = new Set<string>([
    ...WIDGET_HINT_ENTRIES.map((entry) => entry.component),
]);

/**
 * Widget compatibility matrix: dataType → ordered list of compatible components.
 * First entry is the default widget for that dataType.
 */
export const COMPATIBILITY_MATRIX: Record<string, string[]> = Object.fromEntries(
    Object.entries(UI_POLICY.compatibilityByDataType).map(([dataType, components]) => [
        dataType,
        [...components],
    ]),
);

/**
 * Convert a Tier 1 / theme widget token into a concrete component type.
 *
 * Accepts canonical PascalCase built-ins and extension ids (`x-*`).
 */
export function widgetTokenToComponent(widget: string | null | undefined): string | null {
    if (!widget) return null;
    if (widget.startsWith('x-')) return widget;
    return SPEC_WIDGET_TO_COMPONENT[widget] ?? null;
}
