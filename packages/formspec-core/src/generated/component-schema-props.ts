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
  'layout',
  'responsive',
  'style',
  'when',
] as const;

export const COMPONENT_SCHEMA_PROPS: Record<string, readonly string[]> = {
  Accordion: ['allowMultiple', 'defaultOpen', 'labels'],
  ActionButton: ['actionRef', 'disableWhenPending', 'label', 'pendingLabel'],
  Alert: ['dismissible', 'severity', 'text'],
  Badge: ['text', 'variant'],
  Card: ['background', 'border', 'elevation', 'padding', 'radius', 'subtitle', 'title'],
  CheckboxGroup: ['columns', 'selectAll'],
  Collapsible: ['defaultOpen', 'title'],
  ConditionalGroup: ['fallback'],
  DataTable: ['allowAdd', 'allowRemove', 'columns', 'showRowNumbers'],
  DatePicker: ['format', 'maxDate', 'minDate', 'placeholder', 'showTime'],
  Divider: ['label'],
  FileUpload: ['accept', 'dragDrop', 'maxSize', 'multiple'],
  Grid: ['background', 'border', 'columns', 'elevation', 'gap', 'padding', 'radius', 'rowGap'],
  Heading: ['level', 'text'],
  Modal: ['closable', 'headingLevel', 'placement', 'size', 'title', 'trigger', 'triggerLabel'],
  MoneyInput: ['currency', 'locale', 'max', 'min', 'placeholder', 'showCurrency', 'showStepper', 'step'],
  NumberInput: ['locale', 'max', 'min', 'placeholder', 'showStepper', 'step'],
  Panel: ['background', 'border', 'elevation', 'padding', 'placement', 'radius', 'title', 'width'],
  Popover: ['placement', 'triggerBind', 'triggerLabel'],
  ProgressBar: ['label', 'max', 'showPercent', 'value'],
  RadioGroup: ['columns', 'orientation'],
  Rating: ['allowHalf', 'icon', 'max'],
  Section: ['background', 'border', 'description', 'elevation', 'padding', 'radius', 'title'],
  Select: ['clearable', 'multiple', 'placeholder', 'searchable'],
  Signature: ['clearable', 'height', 'penWidth', 'strokeColor'],
  Slider: ['max', 'min', 'showTicks', 'showValue', 'step'],
  Stack: ['align', 'background', 'border', 'direction', 'elevation', 'gap', 'justify', 'padding', 'radius', 'wrap'],
  Summary: ['items'],
  Tabs: ['defaultTab', 'placement', 'tabLabels'],
  Text: ['format', 'text'],
  TextInput: ['inputMode', 'maxLines', 'placeholder', 'prefix', 'suffix', 'variant'],
  Toggle: ['offLabel', 'onLabel'],
  ValidationSummary: ['dedupe', 'jumpLinks', 'mode', 'showFieldErrors', 'source'],
};

