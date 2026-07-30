/**
 * @filedesc The shell's own person-facing vocabulary — enumerable, in one
 * place, and host-overridable.
 *
 * ## Why a shell authors any copy at all
 *
 * A shell renders what the bundle carries and invents nothing. But four states
 * exist that no artifact describes, because they are facts about the *render*
 * rather than about the app: a slot whose target is absent, a widget handed
 * nothing to show, a transition nothing can fire, an address the app does not
 * carry. Those need words, and the words are the shell's.
 *
 * ## Why they live here rather than beside the elements that render them
 *
 * `surface-shell-spec.md` §3.0: the set "MUST be small, MUST be enumerable, and
 * MUST be overridable by the host, because a shell that hard-codes them in one
 * language makes every deployment monolingual regardless of what the bundle's
 * Locale document says. The strings are the shell's; the language is not the
 * shell's to fix."
 *
 * Locale 2.0 addresses this inventory through
 * `$module.x-formspec-surface.shell.<SurfaceStringKey>`. The adapter at the end
 * of this module binds a target-aware Locale lookup and the host's FEL
 * evaluator to that exact family. The core still owns no locale selection or
 * expression engine.
 *
 * Deliberately NOT here: `ROUTE_CLASS_THEME_REASON` and
 * `UNCLASSIFIED_THEME_REASON` (`theme-authority.ts`). Those answer a different
 * requirement — §4.3.1 makes them keyed *by the route-class vocabulary* so they
 * cannot drift out of sync with it, and that keying is the point of where they
 * live.
 */

/** Interpolation inputs. Every value is already a string the shell can print. */
export type SurfaceStringVars = Readonly<Record<string, string>>;

/**
 * The closed key set. Small enough to translate in one sitting, which is the
 * property that makes F7 closable.
 */
export const SURFACE_STRING_KEYS = [
  /** A `definition-form` slot whose Definition the release does not contain. */
  'slotUnavailableDefinitionForm',
  /** An `experience-unit` slot whose unit does not resolve. */
  'slotUnavailableExperienceUnit',
  /** A `module-widget` the bundle declares and nothing implements. */
  'slotUnavailableWidgetUnimplemented',
  /** A delivered widget whose runtime declaration differs from the Registry. */
  'slotUnavailableWidgetIncompatible',
  /** A `module-widget` nothing in the bundle declares. */
  'slotUnavailableWidgetUndeclared',
  /** A `module-widget` whose required authorized data could not be delivered. */
  'slotUnavailableWidgetData',
  /** A `static-content` slot whose binding does not resolve to a kind. */
  'slotUnavailableStaticContent',
  /** An `embed-route` slot naming a route this Surface does not declare. */
  'slotUnavailableEmbedUnresolved',
  /** An `embed-route` chain that came back to a route already on it. */
  'slotUnavailableEmbedCycle',
  /** A widget with a resolved target and nothing to show. Not a defect. */
  'widgetEmpty',
  /** The address bar names something the app does not carry. */
  'notFoundTitle',
  'notFoundBody',
  /** The navigation landmark's accessible name. */
  'navigationLabel',
  /** The label on a `fireable` transition's control. */
  'transitionContinue',
  /** While the host's executor is running. */
  'transitionPending',
  /** The executor reported the action did not succeed and said nothing more. */
  'transitionFailed',
  /** `to` names no route in this Surface. */
  'transitionTargetUnresolved',
  /** The target route exists, but its URL is collision-refused. */
  'transitionTargetCollision',
  /** No Response Actions document is loaded, so no trigger can resolve. */
  'transitionNoResponseActions',
  /** A Response Actions document is loaded and does not publish this trigger. */
  'transitionTriggerUnresolved',
  /** More than one action claims the trigger. */
  'transitionTriggerAmbiguous',
  /** The trigger resolves; this deployment supplied no executor for it. */
  'transitionNoExecutor',
  /** The trigger resolves and a control already on the page raises it. */
  'transitionSuppliedBySlot',
  /** The trigger resolves and the shell's own control can raise it. */
  'transitionFireable',
] as const;

export type SurfaceStringKey = (typeof SURFACE_STRING_KEYS)[number];

/** One string, possibly interpolated from the vars its call site supplies. */
export type SurfaceStringTemplate = (vars: SurfaceStringVars) => string;

/**
 * Host override. A plain string replaces the default exactly. Dynamic host
 * overrides use a function; authored Locale strings use the FEL adapter below.
 */
export type SurfaceStringOverride = string | SurfaceStringTemplate;

export type SurfaceStringOverrides = Partial<Record<SurfaceStringKey, SurfaceStringOverride>>;

/** A total table: every key resolves, whether or not the host overrode it. */
export type SurfaceStrings = (key: SurfaceStringKey, vars?: SurfaceStringVars) => string;

/** Canonical Locale 2.0 prefix for the closed shell string family. */
export const SURFACE_LOCALE_KEY_PREFIX = '$module.x-formspec-surface.shell.';

/** Target-aware Locale lookup already bound to the active app and locale. */
export type SurfaceLocaleLookup = (key: string) => string | null | undefined;

/**
 * FEL interpolation supplied by the host's Locale engine.
 *
 * Keeping evaluation injected prevents the renderer-independent package from
 * owning a second FEL implementation. The implementation receives only the
 * shell variables declared by Locale 2.0.
 */
export type SurfaceLocaleInterpolator = (
  template: string,
  vars: SurfaceStringVars,
) => string;

export interface SurfaceLocaleStringsInput {
  lookup: SurfaceLocaleLookup;
  interpolate: SurfaceLocaleInterpolator;
}

/**
 * The shipped English defaults. Total over {@link SURFACE_STRING_KEYS} by
 * construction — a new key with no default fails to compile here.
 */
export const DEFAULT_SURFACE_STRINGS = {
  slotUnavailableDefinitionForm: () =>
    'The form for this page is not in this release, so it cannot be shown.',
  slotUnavailableExperienceUnit: () => 'This page refers to a step that is not in this release.',
  slotUnavailableWidgetUnimplemented: (vars) =>
    `This page asks for a component called “${vars.widgetName ?? ''}” that this release describes but nothing supplies.`,
  slotUnavailableWidgetIncompatible: (vars) =>
    `This page asks for a component called “${vars.widgetName ?? ''}”, but the supplied component does not match this release's declared interface.`,
  slotUnavailableWidgetUndeclared: (vars) =>
    `This page asks for a component called “${vars.widgetName ?? ''}” that nothing in this release describes.`,
  slotUnavailableWidgetData: () =>
    'This part of the page cannot load the information it needs.',
  slotUnavailableStaticContent: () => 'Part of this page could not be shown.',
  slotUnavailableEmbedUnresolved: () =>
    'Part of this page refers to a screen that is not in this Surface.',
  slotUnavailableEmbedCycle: () => 'Part of this page refers back to itself, so it is shown once.',
  widgetEmpty: () => 'There is nothing to show here yet.',
  notFoundTitle: () => 'This address is not part of this app.',
  notFoundBody: () => 'Pick a page from the list above.',
  navigationLabel: () => 'Pages in this app',
  transitionContinue: (vars) => `Continue to ${vars.target ?? ''}`,
  transitionPending: () => 'Working…',
  transitionFailed: () => 'That did not go through. Nothing has changed.',
  transitionTargetUnresolved: (vars) =>
    `This page says it moves on to “${vars.to ?? ''}”, which is not a page in this part of the app.`,
  transitionTargetCollision: (vars) =>
    `This page says it moves on to “${vars.to ?? ''}”, but that page shares its address with another page, so navigation is unavailable.`,
  transitionNoResponseActions: (vars) =>
    `This page says it moves on when “${vars.trigger ?? ''}” happens. Nothing in this release describes how “${vars.trigger ?? ''}” is done, so it cannot happen yet.`,
  transitionTriggerUnresolved: (vars) =>
    `Nothing in this release publishes “${vars.trigger ?? ''}”, so this page cannot move on.`,
  transitionTriggerAmbiguous: (vars) =>
    `More than one action claims “${vars.trigger ?? ''}”, so it is ambiguous which one this page means.`,
  transitionNoExecutor: (vars) =>
    `This page moves on once “${vars.trigger ?? ''}” has been done. This viewer cannot do it.`,
  transitionSuppliedBySlot: (vars) =>
    `This page moves on once “${vars.trigger ?? ''}” has been done, using the control already on this page.`,
  transitionFireable: (vars) => `This page moves on once “${vars.trigger ?? ''}” has been done.`,
} as const satisfies Record<SurfaceStringKey, SurfaceStringTemplate>;

/**
 * The table a shell reads. Overrides win; anything the host leaves out falls
 * back to the shipped default, so a partial translation degrades to mixed
 * language rather than to a blank page.
 */
export function resolveSurfaceStrings(overrides: SurfaceStringOverrides = {}): SurfaceStrings {
  return (key, vars = {}) => {
    const override = overrides[key];
    if (typeof override === 'string') return override;
    if (typeof override === 'function') return override(vars);
    return DEFAULT_SURFACE_STRINGS[key](vars);
  };
}

/**
 * Adapt the active app-target Locale cascade to the shell's closed string set.
 *
 * `lookup` owns target-aware regional/base fallback. This adapter adds only the
 * canonical key prefix, FEL evaluation, and the final built-in English default
 * when the target-local cascade has no value.
 */
export function resolveSurfaceLocaleStrings(
  input: SurfaceLocaleStringsInput,
): SurfaceStrings {
  const defaults = resolveSurfaceStrings();
  return (key, vars = {}) => {
    const localized = input.lookup(`${SURFACE_LOCALE_KEY_PREFIX}${key}`);
    if (typeof localized !== 'string') return defaults(key, vars);
    try {
      return input.interpolate(localized, vars);
    } catch {
      return localized;
    }
  };
}
