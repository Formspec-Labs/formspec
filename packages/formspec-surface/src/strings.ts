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
 * **This module is not localisation and does not attempt it.** It is the seam
 * localisation lands on. The substrate has a Locale tier and the shell's own
 * vocabulary has no route into it — recorded as **finding F7** in the spec's
 * Appendix B.3, owned by Locale plus the shell spec's next revision. Closing F7
 * means either a host override map (which is this) wired to a Locale document,
 * or `$module.*` Locale keys owned by the shell's module (ADR 0150 §4.10
 * module-aware addressing). Either way the closed key set below is the thing
 * that gets addressed, which is what makes F7 tractable rather than open-ended.
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
  /** A `module-widget` nothing in the bundle declares. */
  'slotUnavailableWidgetUndeclared',
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
 * Host override. A plain string replaces the default outright; `{name}`
 * placeholders in it are interpolated from the same vars the default receives,
 * so a translator never has to write a function.
 */
export type SurfaceStringOverride = string | SurfaceStringTemplate;

export type SurfaceStringOverrides = Partial<Record<SurfaceStringKey, SurfaceStringOverride>>;

/** A total table: every key resolves, whether or not the host overrode it. */
export type SurfaceStrings = (key: SurfaceStringKey, vars?: SurfaceStringVars) => string;

function interpolate(template: string, vars: SurfaceStringVars): string {
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? (vars[name] as string) : whole,
  );
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
  slotUnavailableWidgetUndeclared: (vars) =>
    `This page asks for a component called “${vars.widgetName ?? ''}” that nothing in this release describes.`,
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
    if (typeof override === 'string') return interpolate(override, vars);
    if (typeof override === 'function') return override(vars);
    return DEFAULT_SURFACE_STRINGS[key](vars);
  };
}
