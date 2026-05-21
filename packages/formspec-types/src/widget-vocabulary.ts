/**
 * Canonical widget vocabulary — single source of truth for widget ↔ component mappings.
 *
 * Lives in formspec-types so every package has access without adding dependencies.
 * All packages that need widget resolution import from here (via formspec-types
 * or re-exported through formspec-layout).
 */

/** Tier 1/2 widget tokens and canonical PascalCase hint per component. */
const WIDGET_HINT_ENTRIES = [
    { component: 'Section', primaryHint: 'Section', widgets: ['Section'] },
    { component: 'Stack', primaryHint: 'Stack', widgets: ['Stack'] },
    { component: 'Grid', primaryHint: 'Grid', widgets: ['Grid'] },
    { component: 'TextInput', primaryHint: 'TextInput', widgets: ['TextInput'] },
    { component: 'NumberInput', primaryHint: 'NumberInput', widgets: ['NumberInput'] },
    { component: 'DatePicker', primaryHint: 'DatePicker', widgets: ['DatePicker'] },
    { component: 'Select', primaryHint: 'Select', widgets: ['Select'] },
    { component: 'CheckboxGroup', primaryHint: 'CheckboxGroup', widgets: ['CheckboxGroup'] },
    { component: 'Toggle', primaryHint: 'Toggle', widgets: ['Toggle'] },
    { component: 'FileUpload', primaryHint: 'FileUpload', widgets: ['FileUpload'] },
    { component: 'Heading', primaryHint: 'Heading', widgets: ['Heading'] },
    { component: 'Text', primaryHint: 'Text', widgets: ['Text'] },
    { component: 'Divider', primaryHint: 'Divider', widgets: ['Divider'] },
    { component: 'Card', primaryHint: 'Card', widgets: ['Card'] },
    { component: 'Collapsible', primaryHint: 'Collapsible', widgets: ['Collapsible'] },
    { component: 'ConditionalGroup', primaryHint: 'ConditionalGroup', widgets: ['ConditionalGroup'] },
    { component: 'Tabs', primaryHint: 'Tabs', widgets: ['Tabs'] },
    { component: 'SubmitButton', primaryHint: 'SubmitButton', widgets: ['SubmitButton'] },
    { component: 'Accordion', primaryHint: 'Accordion', widgets: ['Accordion'] },
    { component: 'RadioGroup', primaryHint: 'RadioGroup', widgets: ['RadioGroup'] },
    { component: 'MoneyInput', primaryHint: 'MoneyInput', widgets: ['MoneyInput'] },
    { component: 'Slider', primaryHint: 'Slider', widgets: ['Slider'] },
    { component: 'Rating', primaryHint: 'Rating', widgets: ['Rating'] },
    { component: 'Signature', primaryHint: 'Signature', widgets: ['Signature'] },
    { component: 'Alert', primaryHint: 'Alert', widgets: ['Alert'] },
    { component: 'Badge', primaryHint: 'Badge', widgets: ['Badge'] },
    { component: 'ProgressBar', primaryHint: 'ProgressBar', widgets: ['ProgressBar'] },
    { component: 'Summary', primaryHint: 'Summary', widgets: ['Summary'] },
    { component: 'ValidationSummary', primaryHint: 'ValidationSummary', widgets: ['ValidationSummary'] },
    { component: 'DataTable', primaryHint: 'DataTable', widgets: ['DataTable'] },
    { component: 'Panel', primaryHint: 'Panel', widgets: ['Panel'] },
    { component: 'Modal', primaryHint: 'Modal', widgets: ['Modal'] },
    { component: 'Popover', primaryHint: 'Popover', widgets: ['Popover'] },
] as const;

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
