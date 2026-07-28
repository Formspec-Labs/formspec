/**
 * @filedesc Diagnostics a Surface shell reports instead of failing quietly.
 *
 * The surface-render-v10 spike's sharpest finding was not a missing feature —
 * it was silence. A tenant's brand colour was accepted by authoring, passed
 * validation, was signed into the release, emitted by the renderer, resolved in
 * the cascade, and painted nothing, **with no diagnostic anywhere in that
 * chain**. This module exists so a shell never repeats that shape: every place
 * the shell has to make a call the platform does not state, it renders what it
 * can AND says what it did.
 *
 * These are runtime-composition diagnostics, distinct from
 * `AppGraphDiagnostic` (authoring-time, `@formspec-org/app-graph`) and from
 * lint codes (`crates/formspec-lint`). A shell sees things neither can: which
 * route the browser is actually on, whether a host supplied a transition
 * executor, whether two Surfaces collided in one URL space.
 *
 * ## Severity is a property of the code, not of the call site
 *
 * `thoughts/specs/2026-07-28-surface-shell-spec.md` §7.1 requires every
 * diagnostic to carry a severity "fixed per code", which hosts "MAY elevate,
 * MUST NOT demote". Fixed per code means the caller does not get to pick:
 * {@link surfaceDiagnostic} reads {@link SURFACE_DIAGNOSTIC_SEVERITY}, a total
 * map over the closed code set, so two sites reporting the same code cannot
 * disagree about how loud it is. A closed list a host can enumerate but not
 * rank is knowable and not actionable.
 */

/**
 * Closed set of runtime-composition diagnostic codes. Closed because an open
 * set is a set nothing can exhaustively handle — a host that wants to escalate
 * some codes and ignore others needs to know the whole list.
 *
 * The set is the shell spec's §7.2 table and nothing else. A code that is not
 * in that table is not in this array.
 */
export const SURFACE_DIAGNOSTIC_CODES = [
  /** A bundle manifest slot names a URL absent from `documents`. */
  'BUNDLE-DOCUMENT-MISSING',
  /** A manifest slot resolved to something that is not the artifact it claims. */
  'BUNDLE-DOCUMENT-SHAPE',
  /** `entry` names no route in its Surface. */
  'SURFACE-ENTRY-UNRESOLVED',
  /** Two or more composed routes produce the same URL pattern. */
  'ROUTE-PATH-COLLISION',
  /** A route path uses a parameter grammar Surface v0.1 does not pin. */
  'ROUTE-PARAM-GRAMMAR',
  /** A `{name}` marker in `path` has no matching `params[]` declaration. */
  'ROUTE-PARAM-UNDECLARED',
  /** A `params[]` entry has no matching marker in `path`. */
  'ROUTE-PARAM-NO-MARKER',
  /** Entering a parameterised route with no value for one of its parameters. */
  'ROUTE-PARAM-UNSUPPLIED',
  /** No composed route matched the incoming path. */
  'ROUTE-UNMATCHED',
  /** An `embed-route` binding names no route in the same Surface. */
  'EMBED-ROUTE-UNRESOLVED',
  /** An `embed-route` chain revisited a route it had already entered. */
  'EMBED-ROUTE-CYCLE',
  /** A slot binding is missing the field its slotType requires. */
  'SLOT-BINDING-INCOMPLETE',
  /** An `experience-unit` binding names no unit in the resolved Experience. */
  'EXPERIENCE-UNIT-UNRESOLVED',
  /** A `module-widget` binding names a widget no Registry in the bundle declares. */
  'WIDGET-UNDECLARED',
  /** The Registry declares the widget; nothing the host registered implements it. */
  'WIDGET-UNIMPLEMENTED',
  /** Two Registry documents declare the same entry `name`. */
  'REGISTRY-ENTRY-NAME-COLLISION',
  /** A `static-content` slot with `kind: image` has no authored alternative text. */
  'STATIC-IMAGE-NO-ALT',
  /** A tenant Theme token key the platform token vocabulary does not carry. */
  'THEME-TOKEN-UNKNOWN',
  /** Tenant theming was withheld because the route declares no `routeClass`. */
  'THEME-UNCLASSIFIED-REFUSED',
  /** Formspec custom properties observed on the document root, which no conforming emitter writes. */
  'THEME-DOCUMENT-ROOT-CONTAMINATED',
  /** A declared transition with no trigger source and no host executor. */
  'TRANSITION-UNFIREABLE',
] as const;

export type SurfaceDiagnosticCode = (typeof SURFACE_DIAGNOSTIC_CODES)[number];

/**
 * `error`, `warning`, `info` — shell spec §7.1. Hosts MAY elevate and MUST NOT
 * demote, which is a host rule; the shell's job is to state the floor.
 */
export type SurfaceDiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * Severity per code, exactly as the shell spec's §7.2 table fixes it.
 *
 * Total over the closed set by construction: a code added to
 * {@link SURFACE_DIAGNOSTIC_CODES} without a row here fails to compile, which is
 * the same discipline `ROUTE_CLASS_THEME_AUTHORITY` uses at its own decision
 * site. A `default` arm would let a new code arrive with an invented weight.
 */
export const SURFACE_DIAGNOSTIC_SEVERITY = {
  'BUNDLE-DOCUMENT-MISSING': 'error',
  'BUNDLE-DOCUMENT-SHAPE': 'error',
  'SURFACE-ENTRY-UNRESOLVED': 'error',
  'ROUTE-PATH-COLLISION': 'error',
  'ROUTE-PARAM-GRAMMAR': 'error',
  'ROUTE-PARAM-UNDECLARED': 'error',
  'ROUTE-PARAM-NO-MARKER': 'error',
  'ROUTE-PARAM-UNSUPPLIED': 'error',
  'ROUTE-UNMATCHED': 'warning',
  'EMBED-ROUTE-UNRESOLVED': 'error',
  'EMBED-ROUTE-CYCLE': 'error',
  'SLOT-BINDING-INCOMPLETE': 'error',
  'EXPERIENCE-UNIT-UNRESOLVED': 'error',
  'WIDGET-UNDECLARED': 'error',
  'WIDGET-UNIMPLEMENTED': 'error',
  'REGISTRY-ENTRY-NAME-COLLISION': 'warning',
  'STATIC-IMAGE-NO-ALT': 'warning',
  'THEME-TOKEN-UNKNOWN': 'warning',
  'THEME-UNCLASSIFIED-REFUSED': 'info',
  'THEME-DOCUMENT-ROOT-CONTAMINATED': 'error',
  'TRANSITION-UNFIREABLE': 'warning',
} as const satisfies Record<SurfaceDiagnosticCode, SurfaceDiagnosticSeverity>;

/**
 * Where a diagnostic happened, in the vocabulary of the documents rather than
 * of the renderer. A host reporting one of these back to an author needs to be
 * able to point at the artifact, not at a component tree.
 */
export interface SurfaceDiagnosticSite {
  surfaceId?: string;
  routeId?: string;
  slotId?: string;
  /** Manifest slot or document URL, when the diagnostic is about an artifact. */
  source?: string;
}

export interface SurfaceDiagnostic {
  code: SurfaceDiagnosticCode;
  /** Fixed per code by the spec's §7.2 table, never by the call site. */
  severity: SurfaceDiagnosticSeverity;
  /** One sentence, addressed to whoever can fix it. */
  message: string;
  site: SurfaceDiagnosticSite;
  details?: Readonly<Record<string, unknown>>;
}

export function surfaceDiagnostic(
  code: SurfaceDiagnosticCode,
  message: string,
  site: SurfaceDiagnosticSite,
  details?: Readonly<Record<string, unknown>>,
): SurfaceDiagnostic {
  const severity = SURFACE_DIAGNOSTIC_SEVERITY[code];
  return details === undefined
    ? { code, severity, message, site }
    : { code, severity, message, site, details };
}

/** Prefix every Formspec custom property carries. */
const FORMSPEC_CUSTOM_PROPERTY_PREFIX = '--formspec-';

/**
 * The `THEME-DOCUMENT-ROOT-CONTAMINATED` report, from a list of property names
 * a caller read off the document root.
 *
 * The read is the caller's because the core assumes no medium (shell spec
 * §1.2); the *judgement* is here so two bindings cannot disagree about what
 * counts. Non-DOM callers never call it, which is §7.3's "does not fire in a
 * non-DOM medium".
 *
 * **This reports and never repairs.** §4.5: a shell that scrubs the root
 * manufactures the property it claims to hold, and the leak it silently fixes
 * stays broken for every consumer that is not this shell.
 */
export function documentRootContaminationDiagnostic(
  properties: readonly string[],
  site: SurfaceDiagnosticSite = {},
): SurfaceDiagnostic | undefined {
  const formspecProperties = properties.filter((property) =>
    property.startsWith(FORMSPEC_CUSTOM_PROPERTY_PREFIX),
  );
  if (formspecProperties.length === 0) return undefined;
  return surfaceDiagnostic(
    'THEME-DOCUMENT-ROOT-CONTAMINATED',
    `The document root carries ${formspecProperties.length} Formspec custom ${
      formspecProperties.length === 1 ? 'property' : 'properties'
    }, which no conforming emitter writes. Something on this page is styling every route at once, including routes that refuse tenant theming.`,
    site,
    { properties: formspecProperties },
  );
}
