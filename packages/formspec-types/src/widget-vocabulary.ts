/**
 * Canonical widget vocabulary — single source of truth for widget ↔ component mappings.
 *
 * Lives in formspec-types so every package has access without adding dependencies.
 * All packages that need widget resolution import from here (via formspec-types
 * or re-exported through formspec-layout).
 */

/** Tier 1 widget tokens (normalized keys) and primary camelCase hint per component. */
const WIDGET_HINT_ENTRIES = [
    { component: 'TextInput', primaryHint: 'textInput', widgets: ['textinput', 'textarea', 'richtext', 'password', 'color', 'dateinput', 'datetimeinput', 'timeinput', 'urlinput'] },
    { component: 'NumberInput', primaryHint: 'numberInput', widgets: ['numberinput', 'stepper'] },
    { component: 'Slider', primaryHint: 'slider', widgets: ['slider'] },
    { component: 'Rating', primaryHint: 'rating', widgets: ['rating'] },
    { component: 'Toggle', primaryHint: 'toggle', widgets: ['checkbox', 'toggle', 'yesno'] },
    { component: 'DatePicker', primaryHint: 'datePicker', widgets: ['datepicker', 'datetimepicker', 'timepicker'] },
    { component: 'Select', primaryHint: 'dropdown', widgets: ['dropdown', 'autocomplete'] },
    { component: 'RadioGroup', primaryHint: 'radio', widgets: ['radio', 'segmented', 'likert'] },
    { component: 'CheckboxGroup', primaryHint: 'checkboxGroup', widgets: ['checkboxgroup', 'multiselect'] },
    { component: 'FileUpload', primaryHint: 'fileUpload', widgets: ['fileupload', 'camera'] },
    { component: 'Signature', primaryHint: 'signature', widgets: ['signature'] },
    { component: 'MoneyInput', primaryHint: 'moneyInput', widgets: ['moneyinput'] },
    { component: 'Stack', primaryHint: 'section', widgets: ['section', 'tab'] },
    { component: 'Card', primaryHint: 'card', widgets: ['card'] },
    { component: 'Accordion', primaryHint: 'accordion', widgets: ['accordion'] },
    { component: 'Heading', primaryHint: 'heading', widgets: ['heading'] },
    { component: 'Text', primaryHint: 'paragraph', widgets: ['paragraph'] },
    { component: 'Divider', primaryHint: 'divider', widgets: ['divider'] },
    { component: 'Alert', primaryHint: 'banner', widgets: ['banner'] },
] as const;

/** Layout components with no Tier 1 widgetHint — known for schema/planner checks only. */
const LAYOUT_ONLY_COMPONENT_TYPES = ['Collapsible', 'Tabs', 'Page'] as const;

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
 * Keys are always lowercase (normalized). Values are PascalCase component names.
 */
export const SPEC_WIDGET_TO_COMPONENT: Record<string, string> = buildSpecWidgetToComponent();

/**
 * Reverse map: PascalCase component → canonical camelCase hint.
 * These are the values stored in definition.presentation.widgetHint.
 * For components with multiple hints (e.g. TextInput → textInput, textarea, password),
 * this picks the primary/default hint.
 *
 * Note: SPEC_WIDGET_TO_COMPONENT keys are all-lowercase (normalized for lookup).
 * These values are camelCase (the authoring/storage form).
 */
export const COMPONENT_TO_HINT: Record<string, string> = buildComponentToHint();

export const KNOWN_COMPONENT_TYPES = new Set<string>([
    ...WIDGET_HINT_ENTRIES.map((entry) => entry.component),
    ...LAYOUT_ONLY_COMPONENT_TYPES,
]);

/**
 * Widget compatibility matrix: dataType → ordered list of compatible components.
 * First entry is the default widget for that dataType.
 */
export const COMPATIBILITY_MATRIX: Record<string, string[]> = {
    string: ['TextInput', 'Select', 'RadioGroup'],
    text: ['TextInput'],
    decimal: ['NumberInput', 'Slider', 'Rating', 'TextInput'],
    integer: ['NumberInput', 'Slider', 'Rating', 'TextInput'],
    boolean: ['Toggle'],
    date: ['DatePicker', 'TextInput'],
    dateTime: ['DatePicker', 'TextInput'],
    time: ['DatePicker', 'TextInput'],
    uri: ['TextInput'],
    choice: ['Select', 'RadioGroup', 'TextInput'],
    multiChoice: ['CheckboxGroup', 'Select'],
    attachment: ['FileUpload', 'Signature'],
    money: ['MoneyInput', 'NumberInput', 'TextInput'],
};

function normalizeWidgetToken(widget: string): string {
    return widget.replace(/[\s_-]+/g, '').toLowerCase();
}

/**
 * Convert a Tier 1 / theme widget token into a concrete component type.
 *
 * Accepts spec vocabulary (`radio`, `dropdown`) and extension ids (`x-*`).
 */
export function widgetTokenToComponent(widget: string | null | undefined): string | null {
    if (!widget) return null;
    if (widget.startsWith('x-')) return widget;
    return SPEC_WIDGET_TO_COMPONENT[normalizeWidgetToken(widget)] ?? null;
}
