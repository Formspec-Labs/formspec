/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, TargetDefinition, Tokens, Breakpoints, StyleMap, AccessibilityBlock, Extensions, VisualSurfaceProps } from './common.js';
import type { ConceptRef } from './experience.js';
/**
 * A Formspec Component Document per the Component Specification. Defines a Tier 3 parallel presentation tree of UI components bound to a Formspec Definition's items via slot binding or to Surface routes via Component 1.2 route identity. The component tree controls layout and widget selection but cannot override core behavioral semantics (required, relevant, readonly, calculate, constraint) from the Definition.
 */
export type ComponentDocument =
  | (ComponentDocumentBase & {
      /**
       * Component specification version. MUST be '1.0', '1.1', or '1.2'. Version 1.2 admits Surface-route identity while preserving form-bound 1.0/1.1 documents.
       */
      $formspecComponent: '1.0' | '1.1';
      targetDefinition: TargetDefinition;
      targetSurfaceRoutes?: never;
    })
  | (ComponentDocumentBase & {
      /**
       * Component specification version. MUST be '1.0', '1.1', or '1.2'. Version 1.2 admits Surface-route identity while preserving form-bound 1.0/1.1 documents.
       */
      $formspecComponent: '1.2';
    } & (
      | {
          targetDefinition: TargetDefinition;
          targetSurfaceRoutes?: [SurfaceRouteTarget, ...SurfaceRouteTarget[]];
        }
      | {
          targetDefinition?: TargetDefinition;
          targetSurfaceRoutes: [SurfaceRouteTarget, ...SurfaceRouteTarget[]];
        }
    ));

export interface ComponentDocumentBase {
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash for posture admission). Omitting modules[] is identical to declaring the core module set, which preserves form-only documents.
   */
  modules?: ModuleRef[];
  /**
   * Canonical URI identifier for this Component Document.
   */
  url?: string;
  /**
   * Machine-friendly short identifier.
   */
  name?: string;
  /**
   * Human-readable name.
   */
  title?: string;
  /**
   * Human-readable description.
   */
  description?: string;
  /**
   * Version of this Component Document.
   */
  version: string;
  breakpoints?: Breakpoints;
  tokens?: Tokens;
  /**
   * Registry of custom component templates. Keys are PascalCase names (MUST NOT collide with built-in names). Each template has params and a tree that is instantiated with {param} interpolation.
   */
  components?: {
    [k: string]: CustomComponentDef;
  };
  tree: AnyComponent3;
  extensions?: Extensions;
  /**
   * This interface was referenced by the root JSON-Schema definition
   * via the pattern property "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * Component subtree instantiated when this custom component is used.
 */
export type AnyComponent = {
  component: string;
} & (
  | Section
  | Stack
  | Grid
  | TextInput
  | NumberInput
  | DatePicker
  | Select
  | CheckboxGroup
  | Toggle
  | FileUpload
  | Heading
  | Text
  | Divider
  | Card
  | Collapsible
  | ConditionalGroup
  | Tabs
  | ActionButton
  | Accordion
  | RadioGroup
  | MoneyInput
  | Slider
  | Rating
  | Signature
  | Alert
  | Badge
  | ProgressBar
  | Summary
  | ValidationSummary
  | DataTable
  | Panel
  | Modal
  | Popover
  | CustomComponentRef
);
/**
 * Top-level page/section container. In a multi-step form, each Section is one step. Sections MAY also be used standalone within a Stack for sectioned single-page forms.
 */
export type Section = ComponentBase & VisualSurfaceProps & {
  component: 'Section';
  /**
   * Section heading displayed at the top of the section.
   */
  title?: string;
  /**
   * Subtitle or description text rendered below the title.
   */
  description?: string;
  children?: ChildrenArray;
};
/**
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "AnyComponent".
 */
export type AnyComponent1 = {
  component: string;
} & AnyComponent2;
export type AnyComponent2 =
  | Section
  | Stack
  | Grid
  | TextInput
  | NumberInput
  | DatePicker
  | Select
  | CheckboxGroup
  | Toggle
  | FileUpload
  | Heading
  | Text
  | Divider
  | Card
  | Collapsible
  | ConditionalGroup
  | Tabs
  | ActionButton
  | Accordion
  | RadioGroup
  | MoneyInput
  | Slider
  | Rating
  | Signature
  | Alert
  | Badge
  | ProgressBar
  | Summary
  | ValidationSummary
  | DataTable
  | Panel
  | Modal
  | Popover
  | CustomComponentRef;
/**
 * Flexbox stacking container arranging children vertically or horizontally. The most common layout primitive — typically used as the root component.
 */
export type Stack = ComponentBase & VisualSurfaceProps & {
  component: 'Stack';
  /**
   * Stack axis.
   */
  direction?: 'vertical' | 'horizontal';
  /**
   * Spacing between children. String for CSS values or $token refs, number for pixels.
   */
  gap?: string | number;
  /**
   * Cross-axis alignment.
   */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /**
   * Main-axis distribution.
   */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  /**
   * Whether children wrap to new lines when direction is horizontal.
   */
  wrap?: boolean;
  children?: ChildrenArray;
};
/**
 * Multi-column grid layout distributing children across columns in source order, wrapping to new rows as needed.
 */
export type Grid = ComponentBase & VisualSurfaceProps & {
  component: 'Grid';
  /**
   * Column count, explicit track array, or CSS grid-template-columns value. Numeric array entries normalize to fr weights.
   */
  columns?: string | number | [GridTrack, ...GridTrack[]];
  /**
   * Spacing between grid cells.
   */
  gap?: string | number;
  /**
   * Vertical spacing between rows. Inherits gap if absent.
   */
  rowGap?: string | number;
  children?: ChildrenArray;
};
/**
 * A grid track fragment. String values are CSS track fragments or token references; numeric values normalize to fr weights.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "GridTrack".
 */
export type GridTrack = string | number;
/**
 * Bordered surface that visually groups related content with optional header.
 */
export type Card = ComponentBase & VisualSurfaceProps & {
  component: 'Card';
  /**
   * Card header title.
   */
  title?: string;
  /**
   * Card header subtitle, rendered below the title.
   */
  subtitle?: string;
  children?: ChildrenArray;
};
/**
 * Side panel for supplementary content, help text, or contextual actions. Positioned alongside the main content.
 */
export type Panel = ComponentBase & VisualSurfaceProps & {
  component: 'Panel';
  /**
   * Panel placement relative to main content.
   */
  placement?: 'left' | 'right';
  /**
   * Panel header title.
   */
  title?: string;
  /**
   * Panel width. String for CSS value, number for pixels.
   */
  width?: string | number;
  children?: ChildrenArray;
};
/**
 * Ordered list of child components. Renderers MUST preserve array order.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "ChildrenArray".
 */
export type ChildrenArray = AnyComponent1[];
/**
 * Root component node of the presentation tree. MUST be a single component object (wrap multiple children in Stack or Section).
 */
export type AnyComponent3 = {
  component: string;
} & (
  | Section
  | Stack
  | Grid
  | TextInput
  | NumberInput
  | DatePicker
  | Select
  | CheckboxGroup
  | Toggle
  | FileUpload
  | Heading
  | Text
  | Divider
  | Card
  | Collapsible
  | ConditionalGroup
  | Tabs
  | ActionButton
  | Accordion
  | RadioGroup
  | MoneyInput
  | Slider
  | Rating
  | Signature
  | Alert
  | Badge
  | ProgressBar
  | Summary
  | ValidationSummary
  | DataTable
  | Panel
  | Modal
  | Popover
  | CustomComponentRef
);
/**
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "SurfaceRouteTarget".
 */
export interface SurfaceRouteTarget {
  surface: SurfaceRef;
  /**
   * Surface routes[].id targeted by this Component. This is not the URL path.
   */
  route: string;
  /**
   * Optional slot key on the target route. When omitted, the Component targets the whole route projection.
   */
  slot?: string;
  /**
   * Role of this route target in the initial Component 1.2 contract.
   */
  role: 'route' | 'slot' | 'app-shell';
}
/**
 * Surface sibling identity for the route target.
 */
export interface SurfaceRef {
  /**
   * Canonical URL of a Surface document included in the enclosing App Manifest surfaces[].
   */
  url: string;
  /**
   * Optional exact version or range expression compatible with the App Manifest Surface pin.
   */
  version?: string;
}
/**
 * A reusable component template. Instantiated by using the registry key as the component value and providing params. Templates MUST NOT reference themselves (directly or indirectly).
 *
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^[A-Z][a-zA-Z0-9]*$".
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "CustomComponentDef".
 */
export interface CustomComponentDef {
  /**
   * Parameter names accepted by this template. Each name MUST match [a-zA-Z][a-zA-Z0-9_]*. Referenced in allowed string props via {paramName} interpolation.
   */
  params?: string[];
  tree: AnyComponent;
}
/**
 * Single-line or multi-line text input. Default input for string-type fields. When maxLines > 1, renders as textarea.
 */
export interface TextInput extends ComponentBase {
  component: 'TextInput';
  /**
   * Item key from the target Definition. Renderer inherits label, required, readonly, relevant, and validation.
   */
  bind: string;
  /**
   * Placeholder text displayed when the field is empty.
   */
  placeholder?: string;
  /**
   * Maximum visible lines. 1 = single-line input, >1 = multi-line textarea.
   */
  maxLines?: number;
  /**
   * Input mode hint for virtual keyboards.
   */
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'search';
  /**
   * Static text rendered before the input (e.g. 'https://').
   */
  prefix?: string;
  /**
   * Static text rendered after the input (e.g. '.com').
   */
  suffix?: string;
  /**
   * Content-type variant. `plain` (default) accepts unstyled text. `richtext` accepts formatted text with runtime-defined serialization. `markdown` accepts Markdown source — portable, diffable, degrades gracefully. `latex` accepts LaTeX source — authoritative for math and scientific documents; degrades to raw source. All formatted variants (`richtext`, `markdown`, `latex`) MUST bind to a field whose `dataType` is `string` or `text`.
   */
  variant?: 'plain' | 'richtext' | 'markdown' | 'latex';
}
/**
 * Numeric input with optional step controls. Suitable for integers, decimals, and monetary values (when paired with prefix/suffix).
 */
export interface NumberInput extends ComponentBase {
  component: 'NumberInput';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Placeholder text displayed when the field is empty.
   */
  placeholder?: string;
  /**
   * Increment/decrement step value.
   */
  step?: number;
  /**
   * Minimum allowed value.
   */
  min?: number;
  /**
   * Maximum allowed value.
   */
  max?: number;
  /**
   * Whether to show increment/decrement buttons.
   */
  showStepper?: boolean;
  /**
   * Locale for number formatting (e.g. 'en-US').
   */
  locale?: string;
}
/**
 * Date, datetime, or time picker. Mode is automatically determined by the bound item's dataType (date → date picker, dateTime → date+time, time → time picker).
 */
export interface DatePicker extends ComponentBase {
  component: 'DatePicker';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Placeholder text displayed when the field is empty, when the host platform exposes placeholders for date/time controls.
   */
  placeholder?: string;
  /**
   * Display format hint (e.g. 'MM/DD/YYYY'). Does not affect stored value (always ISO 8601).
   */
  format?: string;
  /**
   * Earliest selectable date (ISO 8601).
   */
  minDate?: string;
  /**
   * Latest selectable date (ISO 8601).
   */
  maxDate?: string;
  /**
   * Whether to include time selection (relevant for dateTime).
   */
  showTime?: boolean;
}
/**
 * Dropdown selection control. Options are read from the bound item's options array or optionSet reference in the Definition.
 */
export interface Select extends ComponentBase {
  component: 'Select';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Use a combobox (text input + listbox) with optional type-ahead filtering. When false and multiple is false, a native <select> is used.
   */
  searchable?: boolean;
  /**
   * Allow multiple values (array). Bind to a multiChoice field. Implies a combobox list with checkboxes; combine with searchable for filtering.
   */
  multiple?: boolean;
  /**
   * Placeholder text when no option is selected.
   */
  placeholder?: string;
  /**
   * Whether the user can clear the selection to null.
   */
  clearable?: boolean;
}
/**
 * Group of checkboxes for multi-select fields. Options are read from the bound item's options or optionSet.
 */
export interface CheckboxGroup extends ComponentBase {
  component: 'CheckboxGroup';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Number of columns to arrange checkboxes in.
   */
  columns?: number;
  /**
   * Whether to display a 'Select All' control.
   */
  selectAll?: boolean;
}
/**
 * Boolean switch/toggle control for yes/no, on/off, or true/false fields.
 */
export interface Toggle extends ComponentBase {
  component: 'Toggle';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Label displayed when toggle is true.
   */
  onLabel?: string;
  /**
   * Label displayed when toggle is false.
   */
  offLabel?: string;
}
/**
 * File upload control for attachment-type fields. Supports single or multiple file selection with optional type and size constraints.
 */
export interface FileUpload extends ComponentBase {
  component: 'FileUpload';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Accepted MIME types (comma-separated, e.g. 'image/*,application/pdf').
   */
  accept?: string;
  /**
   * Maximum file size in bytes.
   */
  maxSize?: number;
  /**
   * Whether multiple files may be uploaded.
   */
  multiple?: boolean;
  /**
   * Whether to display a drag-and-drop zone.
   */
  dragDrop?: boolean;
}
/**
 * Section heading element for visual hierarchy. Purely presentational — does not bind to data.
 */
export interface Heading extends ComponentBase {
  component: 'Heading';
  /**
   * Heading level 1–6. Corresponds to HTML <h1>–<h6> semantics.
   */
  level: number;
  /**
   * Heading text content.
   */
  text: string;
}
/**
 * Static or data-bound text block. When bind is present, displays the bound item's current value as read-only. When absent, displays the static text prop.
 */
export interface Text extends ComponentBase {
  component: 'Text';
  /**
   * Item key. When present, displays the bound item's formatted value (read-only).
   */
  bind?: string;
  /**
   * Static text content. Ignored when bind is present.
   */
  text?: string;
  /**
   * Text format. 'markdown' enables basic Markdown rendering (bold, italic, links, lists). Renderers MUST sanitize to prevent script injection.
   */
  format?: 'plain' | 'markdown';
}
/**
 * Horizontal rule separating sections of the form.
 */
export interface Divider extends ComponentBase {
  component: 'Divider';
  /**
   * Optional label text centered on the divider line.
   */
  label?: string;
}
/**
 * Expandable/collapsible section. User toggles child visibility via clickable header. Collapsed children stay in DOM — bound data is preserved.
 */
export interface Collapsible extends ComponentBase {
  component: 'Collapsible';
  /**
   * Collapsible section header. Visible regardless of open/closed state.
   */
  title: string;
  /**
   * Whether the section is initially expanded.
   */
  defaultOpen?: boolean;
  children?: ChildrenArray;
}
/**
 * Container whose visibility is controlled by a REQUIRED when expression. Exists solely to conditionally show/hide a group of children. Data-bound children retain values when hidden (unlike Bind relevant).
 */
export interface ConditionalGroup extends ComponentBase {
  component: 'ConditionalGroup';
  /**
   * Text displayed when the condition is false.
   */
  fallback?: string;
  children?: ChildrenArray;
}
/**
 * Tabbed navigation container. Each child is one tab's content. Tab labels from child Section titles or tabLabels array. All children stay mounted — switching changes visibility, not lifecycle.
 */
export interface Tabs extends ComponentBase {
  component: 'Tabs';
  /**
   * Tab bar placement.
   */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Explicit tab labels. When absent, reads title from each child Section.
   */
  tabLabels?: string[];
  /**
   * Zero-based index of the initially active tab.
   */
  defaultTab?: number;
  children?: ChildrenArray;
}
/**
 * Button that invokes a named Action from the loaded Response Actions document. Validation and host event behavior come from the resolved Action, not from widget-local policy.
 */
export interface ActionButton extends ComponentBase {
  component: 'ActionButton';
  /**
   * Id of the Action in the loaded Response Actions document that this button invokes on click. MUST satisfy the Action.id pattern.
   */
  actionRef: string;
  /**
   * Button label as a locale reference or literal string wrapper.
   */
  label?:
    | {
        ref: string;
      }
    | {
        literal: string;
      };
  /**
   * Label shown while the resolved Action is invoking, as a locale reference or literal string wrapper.
   */
  pendingLabel?:
    | {
        ref: string;
      }
    | {
        literal: string;
      };
  /**
   * When true, the button is disabled while the invocation is in flight. When false, the button may be clicked again; Response Actions idempotency prevents duplicate side effects.
   */
  disableWhenPending?: boolean;
}
/**
 * Vertical list of collapsible sections. By default only one expanded at a time. Children SHOULD have title props (Section, Card, Collapsible) for section headers.
 */
export interface Accordion extends ComponentBase {
  component: 'Accordion';
  /**
   * Optional bind path to a repeating group. When provided, each instance becomes one accordion section.
   */
  bind?: string;
  /**
   * Whether multiple sections may be expanded simultaneously. When false, expanding one collapses others.
   */
  allowMultiple?: boolean;
  /**
   * Zero-based index of the initially expanded section.
   */
  defaultOpen?: number;
  /**
   * Section header labels. labels[i] is the summary text for children[i]. Falls back to 'Section {i+1}' when absent.
   */
  labels?: string[];
  children?: ChildrenArray;
}
/**
 * Radio buttons for single-select choice fields. All options visible simultaneously — suitable for short lists (typically ≤7 items).
 */
export interface RadioGroup extends ComponentBase {
  component: 'RadioGroup';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Number of columns to arrange radio buttons in.
   */
  columns?: number;
  /**
   * Layout direction of the radio buttons.
   */
  orientation?: 'horizontal' | 'vertical';
}
/**
 * Currency-aware numeric input displaying currency symbol and formatted number. Stores raw numeric value without formatting.
 */
export interface MoneyInput extends ComponentBase {
  component: 'MoneyInput';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Placeholder text displayed in the amount input when the field is empty.
   */
  placeholder?: string;
  /**
   * Increment/decrement step value (applies to amount).
   */
  step?: number;
  /**
   * Minimum allowed amount.
   */
  min?: number;
  /**
   * Maximum allowed amount.
   */
  max?: number;
  /**
   * Whether to show increment/decrement buttons (amount input).
   */
  showStepper?: boolean;
  /**
   * ISO 4217 currency code (e.g. 'USD', 'EUR', 'GBP').
   */
  currency?: string;
  /**
   * Whether to display the currency symbol.
   */
  showCurrency?: boolean;
  /**
   * Locale for number/currency formatting (e.g. 'en-US').
   */
  locale?: string;
}
/**
 * Range slider for selecting a numeric value within a continuous range.
 */
export interface Slider extends ComponentBase {
  component: 'Slider';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Minimum value.
   */
  min?: number;
  /**
   * Maximum value.
   */
  max?: number;
  /**
   * Step increment.
   */
  step?: number;
  /**
   * Whether to display the current numeric value adjacent to the slider.
   */
  showValue?: boolean;
  /**
   * Whether to display tick marks at step intervals.
   */
  showTicks?: boolean;
}
/**
 * Star (or icon) rating control for selecting an integer value within a small range (typically 1–5 or 1–10).
 */
export interface Rating extends ComponentBase {
  component: 'Rating';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Maximum rating value (number of icons).
   */
  max?: number;
  /**
   * Icon type. Renderers MAY support additional icons.
   */
  icon?: 'star' | 'heart' | 'circle';
  /**
   * Whether half-values are allowed (stored as decimal, e.g. 3.5).
   */
  allowHalf?: boolean;
}
/**
 * Signature capture pad recording a drawn signature as an image attachment.
 */
export interface Signature extends ComponentBase {
  component: 'Signature';
  /**
   * Item key from the target Definition.
   */
  bind: string;
  /**
   * Stroke color for the signature pen (e.g. '#000000').
   */
  strokeColor?: string;
  /**
   * Height of the signature pad. Number for pixels, string for CSS value.
   */
  height?: string | number;
  /**
   * Stroke width in pixels.
   */
  penWidth?: number;
  /**
   * Whether to show a clear/reset control.
   */
  clearable?: boolean;
}
/**
 * Status message block for informational banners, warnings, error summaries, or success messages.
 */
export interface Alert extends ComponentBase {
  component: 'Alert';
  /**
   * Alert severity. Determines visual styling and ARIA role (alert for error/warning, status for info/success).
   */
  severity: 'info' | 'success' | 'warning' | 'error';
  /**
   * Alert message text.
   */
  text: string;
  /**
   * Whether the user can dismiss the alert.
   */
  dismissible?: boolean;
}
/**
 * Small label badge for status indicators, counts, or tags.
 */
export interface Badge extends ComponentBase {
  component: 'Badge';
  /**
   * Badge label text.
   */
  text: string;
  /**
   * Visual variant controlling color/style.
   */
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
}
/**
 * Visual progress indicator. When bound, reads value from data. When unbound, uses static value prop.
 */
export interface ProgressBar extends ComponentBase {
  component: 'ProgressBar';
  /**
   * Item key. When present, reads current value from data.
   */
  bind?: string;
  /**
   * Current progress value. Ignored when bind is present.
   */
  value?: number;
  /**
   * Maximum value (100% completion).
   */
  max?: number;
  /**
   * Accessible label for the progress bar.
   */
  label?: string;
  /**
   * Whether to display percentage text.
   */
  showPercent?: boolean;
}
/**
 * Key-value summary display showing multiple field labels and current values. Useful for review pages.
 */
export interface Summary extends ComponentBase {
  component: 'Summary';
  /**
   * Array of summary entries. Each has a display label, a bind key for the value, and optional optionSet for resolving choice values to labels.
   */
  items?: {
    /**
     * Display label shown next to the value.
     */
    label: string;
    /**
     * Item key whose current value to display.
     */
    bind: string;
    /**
     * Named option set from the Definition. When set, the raw bound value is resolved to its display label.
     */
    optionSet?: string;
  }[];
}
/**
 * Validation message panel for live validation or the latest submit result. Can render jump links to focus affected fields.
 */
export interface ValidationSummary extends ComponentBase {
  component: 'ValidationSummary';
  /**
   * Validation source. 'live' reads continuous engine state; 'submit' reads the latest formspec-submit event detail.
   */
  source?: 'live' | 'submit';
  /**
   * Validation mode used when source is 'live'.
   */
  mode?: 'continuous' | 'submit';
  /**
   * Whether to include bind-level field errors in addition to shape-level findings.
   */
  showFieldErrors?: boolean;
  /**
   * Whether to render clickable links/buttons that call focusField(path) for jumpable targets.
   */
  jumpLinks?: boolean;
  /**
   * Whether duplicate messages (same severity/path/message) are collapsed.
   */
  dedupe?: boolean;
}
/**
 * Tabular display of repeatable group data. Each repeat instance becomes a row; each column displays a field within the repeat. One of the few components that MAY bind to a repeatable group.
 */
export interface DataTable extends ComponentBase {
  component: 'DataTable';
  /**
   * Repeatable group item key. Each repeat instance becomes a table row.
   */
  bind?: string;
  /**
   * Column definitions. Each specifies a header label and a field key within the repeat group.
   */
  columns?: {
    /**
     * Column header text.
     */
    header: string;
    /**
     * Item key within the repeat group.
     */
    bind: string;
    /**
     * Optional minimum value for numeric inputs.
     */
    min?: number;
    /**
     * Optional maximum value for numeric inputs.
     */
    max?: number;
    /**
     * Optional step for numeric inputs.
     */
    step?: number;
  }[];
  /**
   * Whether to display row numbers.
   */
  showRowNumbers?: boolean;
  /**
   * Whether to show an 'Add row' control.
   */
  allowAdd?: boolean;
  /**
   * Whether to show per-row 'Remove' controls.
   */
  allowRemove?: boolean;
}
/**
 * Dialog overlay displaying content above the main form. Requires explicit user action to open/close. Traps focus while open.
 */
export interface Modal extends ComponentBase {
  component: 'Modal';
  /**
   * Modal dialog title.
   */
  title: string;
  /**
   * Modal size.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /**
   * 'button': dedicated open button. 'auto': opens automatically based on when.
   */
  trigger?: 'button' | 'auto';
  /**
   * Label for the trigger button when trigger is 'button'.
   */
  triggerLabel?: string;
  /**
   * Whether the modal can be dismissed by the user.
   */
  closable?: boolean;
  /**
   * Heading level for the modal title (default 2).
   */
  headingLevel?: number;
  /**
   * When set, anchors the opened dialog near the trigger with fixed positioning; omit for native centered modal.
   */
  placement?: 'top' | 'right' | 'bottom' | 'left';
  children?: ChildrenArray;
}
/**
 * Lightweight anchored overlay showing contextual content when trigger is activated.
 */
export interface Popover extends ComponentBase {
  component: 'Popover';
  /**
   * Bind key whose live value is used as trigger text.
   */
  triggerBind?: string;
  /**
   * Fallback label for the trigger control.
   */
  triggerLabel?: string;
  /**
   * Preferred popover placement relative to the trigger.
   */
  placement?: 'top' | 'right' | 'bottom' | 'left';
  children?: ChildrenArray;
}
/**
 * Reference to a custom component defined in the components registry. The component name is looked up in the registry, params are interpolated into the template, and the resolved subtree replaces this reference.
 */
export type CustomComponentName =
  | `A${string}`
  | `B${string}`
  | `C${string}`
  | `D${string}`
  | `E${string}`
  | `F${string}`
  | `G${string}`
  | `H${string}`
  | `I${string}`
  | `J${string}`
  | `K${string}`
  | `L${string}`
  | `M${string}`
  | `N${string}`
  | `O${string}`
  | `P${string}`
  | `Q${string}`
  | `R${string}`
  | `S${string}`
  | `T${string}`
  | `U${string}`
  | `V${string}`
  | `W${string}`
  | `X${string}`
  | `Y${string}`
  | `Z${string}`;

export interface CustomComponentRef extends ComponentBase {
  /**
   * Custom component name. MUST be a key in the components registry. MUST be PascalCase. MUST NOT be a built-in component name or a reserved component identifier.
   */
  component: CustomComponentName;
  /**
   * Parameter values to interpolate into the template. Keys MUST match the template's declared params. Values MUST be strings.
   */
  params?: {
    [k: string]: string;
  };
}
/**
 * Breakpoint-keyed prop overrides. Keys are breakpoint names; values are objects of component-specific props to shallow-merge at that breakpoint. MUST NOT contain component, bind, when, children, or responsive.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "ResponsiveOverrides".
 */
export interface ResponsiveOverrides {
  [k: string]: unknown;
}
/**
 * Base properties shared by all component objects. Every component inherits these via $ref.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "ComponentBase".
 */
export interface ComponentBase {
  /**
   * Optional unique identifier for this node. Used for locale string addressing ($component.<id>.prop), test selectors, and accessibility anchoring. **Uniqueness scope is bundle-graph-wide when present** — every authored `id` MUST be unique across every Component document reachable from a single App Manifest, not merely unique within its own tree. JSON Schema cannot enforce graph-level uniqueness across multiple documents; the invariant is upheld by linter rule E605 (COMP-BUNDLE-ID-COLLISION) which walks the bundle graph and hard-fails on duplicates. This is a precondition for cross-document move and copy maps: the target document must have no collision. Inside repeat templates (DataTable, Accordion), the id identifies the template node — all rendered instances share the same id, which counts as a single id occurrence for collision purposes.
   */
  id?: string;
  /**
   * Optional reference to an Experience Unit.id. Report-only metadata; does not affect rendering, binding, validation, or Response semantics.
   */
  unitRef?: string;
  /**
   * Optional references to Experience Task.id values. Report-only metadata; order is authoring/reporting order only.
   */
  taskRefs?: string[];
  /**
   * Optional concept references using the Experience ConceptRef shape. Host-policy metadata; does not execute validation or mapping logic.
   */
  conceptRefs?: ConceptRef[];
  extensions?: Extensions;
  /**
   * Optional generation provenance metadata. Renderers MUST ignore this object for default runtime output.
   */
  'x-generation'?: {
    /**
     * Generator source label, such as an Experience Unit, prompt, template, or generator input bundle.
     */
    source?: string;
    /**
     * Generator strategy identifier, such as unit-to-section or a host-defined strategy name.
     */
    strategy?: string;
    /**
     * Generator name and version, service id, or other producer identifier.
     */
    generatedBy?: string;
    /**
     * Generation timestamp. Authors SHOULD use an RFC 3339 date-time string.
     */
    generatedAt?: string;
    /**
     * Source anchors with a standard prefix and source-layer-owned suffix.
     */
    anchors?: string[];
    [k: string]: unknown;
  };
  /**
   * Component type name. MUST be a built-in name or a key in the components registry.
   */
  component: string;
  /**
   * FEL boolean expression for conditional rendering. false/null hides the component and all children. Presentation-only — does NOT affect data (unlike Bind relevant which may clear data). When BOTH when and relevant apply: relevant=false always wins; when=false hides but preserves data.
   */
  when?: string;
  responsive?: ResponsiveOverrides;
  style?: StyleMap;
  accessibility?: AccessibilityBlock;
  /**
   * CSS class name(s) applied to root element. Additive to renderer-generated classes. Non-web renderers MAY ignore. Values MAY contain $token. references.
   */
  cssClass?: string | string[];
  layout?: ComponentLayout;
}
/**
 * Typed structural placement hints. Grid placement applies when the node is a child of a Grid or another documented grid context.
 */
export interface ComponentLayout {
  grid?: {
    span?: number;
    start?: number;
    rowSpan?: number;
    rowStart?: number;
  };
}
