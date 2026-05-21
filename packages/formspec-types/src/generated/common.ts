/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "BuiltInWidgetName".
 */
export type BuiltInWidgetName =
  | 'Section'
  | 'Stack'
  | 'Grid'
  | 'TextInput'
  | 'NumberInput'
  | 'DatePicker'
  | 'Select'
  | 'CheckboxGroup'
  | 'Toggle'
  | 'FileUpload'
  | 'Heading'
  | 'Text'
  | 'Divider'
  | 'Card'
  | 'Collapsible'
  | 'ConditionalGroup'
  | 'Tabs'
  | 'SubmitButton'
  | 'Accordion'
  | 'RadioGroup'
  | 'MoneyInput'
  | 'Slider'
  | 'Rating'
  | 'Signature'
  | 'Alert'
  | 'Badge'
  | 'ProgressBar'
  | 'Summary'
  | 'ValidationSummary'
  | 'DataTable'
  | 'Panel'
  | 'Modal'
  | 'Popover';
/**
 * Custom widget identifier. Custom widgets must use the x- prefix.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "CustomWidgetName".
 */
export type CustomWidgetName = `x-${string}`;
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "WidgetName".
 */
export type WidgetName = BuiltInWidgetName | CustomWidgetName;
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "ThemeWidgetName".
 */
export type ThemeWidgetName = BuiltInWidgetName | CustomWidgetName | 'none';

/**
 * Shared schema definitions used by Formspec Definition, Theme, and Component documents.
 */
export interface CommonSchema {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "TargetDefinition".
 */
export interface TargetDefinition {
  /**
   * Canonical URL of the target Definition.
   */
  url: string;
  /**
   * Semver range expression describing which Definition versions this document supports.
   */
  compatibleVersions?: string;
}
/**
 * Flat design token map. Keys are dot-delimited names; values are strings or numbers.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Tokens".
 */
export interface Tokens {
  [k: string]: string | number;
}
/**
 * Named viewport breakpoints. Values are minimum viewport widths in pixels.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Breakpoints".
 */
export interface Breakpoints {
  [k: string]: number;
}
/**
 * Flat style map. Values may contain $token.path references.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "StyleMap".
 */
export interface StyleMap {
  [k: string]: string | number;
}
/**
 * Extension object whose keys must be prefixed with x-.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Extensions".
 */
export interface Extensions {
  [k: `x-${string}`]: unknown;
}
/**
 * Accessibility overrides applied to a rendered element.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "AccessibilityBlock".
 */
export interface AccessibilityBlock {
  /**
   * Accessibility role override.
   */
  role?: string;
  /**
   * Accessible description text.
   */
  description?: string;
  /**
   * Live-region behavior.
   */
  liveRegion?: 'off' | 'polite' | 'assertive';
}
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "VisualSurfaceProps".
 */
export interface VisualSurfaceProps {
  /**
   * Inner spacing for container content.
   */
  padding?: string | number;
  /**
   * Container background token or renderer value.
   */
  background?: string | number;
  /**
   * Container border token or renderer value.
   */
  border?: string | number;
  /**
   * Container corner radius token or renderer value.
   */
  radius?: string | number;
  /**
   * Container elevation token or renderer value.
   */
  elevation?: string | number;
}
