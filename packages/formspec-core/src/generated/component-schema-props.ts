/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/component.schema.json by scripts/generate-component-schema-props.mjs.
 * Re-run: npm run codegen:component-props (from packages/formspec-core)
 */

export const COMPONENT_BASE_PROP_NAMES = [
  'accessibility',
  'component',
  'cssClass',
  'id',
  'responsive',
  'style',
  'when',
] as const;

export const COMPONENT_SCHEMA_PROPS: Record<string, readonly string[]> = {
  Accordion: ['allowMultiple', 'defaultOpen', 'labels'],
  Alert: ['dismissible', 'severity', 'text'],
  Badge: ['text', 'variant'],
  Card: ['elevation', 'subtitle', 'title'],
  CheckboxGroup: ['columns', 'selectAll'],
  Collapsible: ['defaultOpen', 'title'],
  Columns: ['gap', 'widths'],
  ConditionalGroup: ['fallback'],
  DataTable: ['allowAdd', 'allowRemove', 'columns', 'showRowNumbers'],
  DatePicker: ['format', 'maxDate', 'minDate', 'placeholder', 'showTime'],
  Divider: ['label'],
  FileUpload: ['accept', 'dragDrop', 'maxSize', 'multiple'],
  Grid: ['columns', 'gap', 'rowGap'],
  Heading: ['level', 'text'],
  Modal: ['closable', 'headingLevel', 'placement', 'size', 'title', 'trigger', 'triggerLabel'],
  MoneyInput: ['currency', 'locale', 'max', 'min', 'placeholder', 'showCurrency', 'showStepper', 'step'],
  NumberInput: ['locale', 'max', 'min', 'placeholder', 'showStepper', 'step'],
  Page: ['description', 'title'],
  Panel: ['position', 'title', 'width'],
  Popover: ['placement', 'triggerBind', 'triggerLabel'],
  ProgressBar: ['label', 'max', 'showPercent', 'value'],
  RadioGroup: ['columns', 'orientation'],
  Rating: ['allowHalf', 'icon', 'max'],
  Select: ['clearable', 'multiple', 'placeholder', 'searchable'],
  Signature: ['clearable', 'height', 'penWidth', 'strokeColor'],
  Slider: ['max', 'min', 'showTicks', 'showValue', 'step'],
  Spacer: ['size'],
  Stack: ['align', 'direction', 'gap', 'wrap'],
  SubmitButton: ['disableWhenPending', 'emitEvent', 'label', 'mode', 'pendingLabel'],
  Summary: ['items'],
  Tabs: ['defaultTab', 'position', 'tabLabels'],
  Text: ['format', 'text'],
  TextInput: ['inputMode', 'maxLines', 'placeholder', 'prefix', 'suffix', 'variant'],
  Toggle: ['offLabel', 'onLabel'],
  ValidationSummary: ['dedupe', 'jumpLinks', 'mode', 'showFieldErrors', 'source'],
};

