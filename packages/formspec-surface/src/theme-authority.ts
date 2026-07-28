/**
 * @filedesc The runtime half of THEME-ROUTE-CLASS: the only place a shell is
 * allowed to read a tenant Theme.
 *
 * ## The shape, and why it is a factory rather than a function
 *
 * `THEME-ROUTE-CLASS` shipped as an authoring-time validator rule with no
 * runtime owner. A renderer that honours it "carefully" honours it until
 * someone adds a prop. What makes the boundary hold is structure, not care:
 *
 * - {@link createThemeAuthority} takes the tenant Theme **once**, closes over
 *   it, and returns an object whose only output is a {@link ThemeGrant}.
 * - On a refusing route class, the grant's `themeDocument` is built from the
 *   platform theme alone. The tenant's tokens are not merged, not overridden,
 *   not defaulted — the closure's tenant branch never runs. There is nothing
 *   for a careless prop downstream to leak, because nothing tenant-shaped was
 *   ever constructed on that path.
 * - Every route yields the same grant *type*, so there is no `null` arm inviting
 *   a later "just pass the theme when it's missing" fix.
 *
 * A host holding a `ThemeGrant` cannot get back to the tenant Theme through it.
 * That is the whole design.
 *
 * ## The rule is imported, never restated
 *
 * `ROUTE_CLASS_THEME_AUTHORITY` (`@formspec-org/app-graph`) decides. This module
 * reads it and supplies the words a person sees; it does not carry a second copy
 * of which classes admit. A shell that restated the map would be a shell that
 * could disagree with the validator that signed the bundle off.
 */
import { PLATFORM_TOKEN_KEYS, ROUTE_CLASS_THEME_AUTHORITY } from '@formspec-org/app-graph';
import { buildPlatformTheme } from '@formspec-org/layout';
import type { SurfaceDocument, ThemeDocument } from '@formspec-org/types';
import {
  surfaceDiagnostic,
  type SurfaceDiagnostic,
  type SurfaceDiagnosticSite,
} from './diagnostics.js';
import type { SurfaceRoute } from './route-path.js';

export type RouteClass = NonNullable<SurfaceDocument['routes'][number]['routeClass']>;

export type ThemeTokens = Record<string, string | number>;

/**
 * Three postures, not two. `unclassified` is a first-class state:
 * `surface-spec.md` §3 makes `routeClass` optional with no default and says
 * processors MUST NOT read absence as `operation`. Collapsing it into `refuses`
 * would lose the information that nobody has stated what the route is.
 */
export type ThemeAuthorityPosture = 'admits' | 'refuses' | 'unclassified';

export interface ThemeGrant {
  routeClass: RouteClass | undefined;
  posture: ThemeAuthorityPosture;
  /** True only on `admits`. The single boolean a renderer branches on. */
  admitsTenantTheme: boolean;
  /** Plain-language reason, for the person on the page. */
  reason: string;
  /** The ONLY theme document that crosses into the route. */
  themeDocument: ThemeDocument;
  /** Tenant-contributed token keys inside `themeDocument`. Empty unless `admits`. */
  tenantTokenKeys: readonly string[];
  /**
   * What resolving this grant had to report. `THEME-UNCLASSIFIED-REFUSED` when
   * a tenant Theme was withheld for want of a class.
   *
   * Per-grant rather than on the authority object because the report is about
   * one route, and a diagnostic surfaced only as on-screen copy has not been
   * reported at all — it cannot be logged, alarmed on, counted, or fed back to
   * an author (surface-shell-spec §7.1).
   */
  diagnostics: readonly SurfaceDiagnostic[];
}

/**
 * One sentence per class, in the language of the person reading the page rather
 * than of the spec. Keyed exhaustively over `RouteClass` by construction — a new
 * or renamed class fails to compile HERE, the same discipline
 * `ROUTE_CLASS_THEME_AUTHORITY` uses at its own decision site.
 *
 * The reasons are shipped rather than left to hosts because a refusal is a trust
 * claim: *"this signing page is not branded, so what you are agreeing to cannot
 * be dressed up."* Every host writing its own wording means one normative rule
 * reaches people as several different promises. Which class admits is still the
 * imported map's call; this only supplies the words.
 */
export const ROUTE_CLASS_THEME_REASON = {
  intake:
    'This page collects information from the person filling it in, so it carries the organisation’s branding.',
  proof:
    'This page is a receipt the platform issued. It looks the same for everyone, so nobody can be shown a receipt styled to look more official than it is.',
  ceremony:
    'This page is where you sign. Signing pages are not branded, so what you are agreeing to cannot be dressed up.',
  verification:
    'This page checks something independently. An independent check carrying the checked party’s branding is not independent.',
  attestation:
    'This page is a claim the platform makes about itself. The platform, not a customer, is accountable for how it looks.',
  authentication:
    'This page asks for credentials. Its appearance is the anti-phishing control, so it is not a customer’s to change.',
  operation:
    'This page is an internal work screen, so customer branding does not apply to it.',
} as const satisfies Record<RouteClass, string>;

/**
 * What a shell says when nobody classified the route.
 *
 * ADR 0161 §6 declares absence a distinct state and then leaves the renderer
 * posture undefined. Reading absence as "admit" would let an unclassified
 * receipt route carry tenant branding — fail-open on the one vocabulary whose
 * whole purpose is a trust rule. Reading it as "refuse" costs a tenant their
 * branding on a page nobody has classified, which is recoverable by classifying
 * it. This package refuses, and says why in those terms. The spec should state
 * this; until it does, the choice is here rather than in every host.
 */
export const UNCLASSIFIED_THEME_REASON =
  'Nobody has said what this page is for, so it stays in platform styling until someone does.';

export interface ThemeAuthorityInput {
  /** The tenant Theme from the bundle. Read here and nowhere else. */
  tenantTheme?: ThemeDocument | undefined;
  /** Defaults to `buildPlatformTheme()` from `@formspec-org/layout`. */
  platformTheme?: ThemeDocument | undefined;
  /**
   * Host-supplied token aliases: authored key → platform key(s).
   *
   * NOT a platform rule and deliberately not populated by default. The
   * surface-render-v10 spike measured a tenant authoring `color.accent` against
   * a platform vocabulary whose brand token is `color.primary`, with nothing
   * mapping between them — accepted by authoring, passed by validation, signed,
   * emitted, and read by nothing (gap ledger `theme-token-vocabulary-bridge`).
   * Shipping a default alias table here would paper over a vocabulary decision
   * that belongs to the token registry and the authoring tools. What this
   * package does instead is refuse to be silent: an unaliased token outside
   * `PLATFORM_TOKEN_KEYS` raises `THEME-TOKEN-UNKNOWN` — the render-time twin
   * of the authoring-time `THEME-TOKEN-UNREGISTERED`
   * (`token-registry-spec.md` §5.3). Same fact, two moments: a bundle can be
   * validated before a host adds an alias and rendered after.
   */
  tokenAliases?: Readonly<Record<string, readonly string[]>> | undefined;
}

export interface ThemeAuthority {
  /**
   * The grant for one route. The only way out of this object.
   *
   * `site` is where the grant's own diagnostics point. Call this once per
   * route **at the route boundary** — never per slot and never for an embedded
   * route, because §4.4 makes the host route's grant the operative one for
   * every embedded subtree, and §7.3 keys `THEME-UNCLASSIFIED-REFUSED`'s
   * does-not-fire branch on exactly that call site.
   */
  grantFor(route: SurfaceRoute, site?: SurfaceDiagnosticSite): ThemeGrant;
  /** Tenant token keys after aliasing. Empty when there is no tenant Theme. */
  readonly tenantTokenKeys: readonly string[];
  /** Tenant token values, for a host that wants to assert their absence. */
  readonly tenantTokenValues: readonly string[];
  readonly diagnostics: readonly SurfaceDiagnostic[];
}

function tokensOf(theme: ThemeDocument | undefined): ThemeTokens {
  const tokens = (theme as { tokens?: ThemeTokens } | undefined)?.tokens;
  return tokens ?? {};
}

export function createThemeAuthority(input: ThemeAuthorityInput = {}): ThemeAuthority {
  const platformTheme = input.platformTheme ?? (buildPlatformTheme() as ThemeDocument);
  const platformTokens = tokensOf(platformTheme);
  const diagnostics: SurfaceDiagnostic[] = [];

  // The tenant Theme is read exactly here, into a plain token map. Nothing
  // below this line holds the document.
  const authored = tokensOf(input.tenantTheme);
  const aliases = input.tokenAliases ?? {};
  const tenantTokens: ThemeTokens = {};

  for (const [key, value] of Object.entries(authored)) {
    tenantTokens[key] = value;
    for (const target of aliases[key] ?? []) {
      if (tenantTokens[target] === undefined) tenantTokens[target] = value;
    }
    // The platform's declared vocabulary, imported rather than derived from
    // whichever tokens `buildPlatformTheme()` happens to emit — those are the
    // platform's VALUES; `PLATFORM_TOKEN_KEYS` is the registry's declared KEY
    // set, which is the thing an authored token is or is not a member of.
    const knownToPlatform = PLATFORM_TOKEN_KEYS.has(key) || key.startsWith('x-');
    const aliased = (aliases[key] ?? []).length > 0;
    if (!knownToPlatform && !aliased) {
      diagnostics.push(
        surfaceDiagnostic(
          'THEME-TOKEN-UNKNOWN',
          `The tenant theme sets "${key}", which the platform token vocabulary does not carry. It will be emitted and read by nothing.`,
          { source: 'theme' },
          { token: key },
        ),
      );
    }
  }

  const tenantTokenKeys = Object.keys(tenantTokens);
  const tenantTokenValues = Object.values(tenantTokens).map(String);

  function platformOnlyGrant(
    routeClass: RouteClass | undefined,
    posture: 'refuses' | 'unclassified',
    reason: string,
    grantDiagnostics: readonly SurfaceDiagnostic[] = [],
  ): ThemeGrant {
    return {
      routeClass,
      posture,
      admitsTenantTheme: false,
      reason,
      // Built from the platform tokens alone. `tenantTokens` is not spread,
      // not merged, not consulted — this expression cannot be edited into
      // leaking without the edit being obvious.
      themeDocument: { ...platformTheme, tokens: { ...platformTokens } } as ThemeDocument,
      tenantTokenKeys: [],
      diagnostics: grantDiagnostics,
    };
  }

  return {
    tenantTokenKeys,
    tenantTokenValues,
    diagnostics,
    grantFor(route: SurfaceRoute, site: SurfaceDiagnosticSite = {}): ThemeGrant {
      const routeClass = route.routeClass;

      if (routeClass === undefined) {
        // §7.3: fires when the shell resolves a grant for a route declaring no
        // `routeClass` AND a tenant Theme is present — nothing was withheld
        // when there was nothing to withhold. `info`, because it reports what
        // the shell did rather than judging the document: ADR 0161 §9 item 4 is
        // deliberately silent on an authoring-time unclassified diagnostic.
        const withheld =
          tenantTokenKeys.length > 0
            ? [
                surfaceDiagnostic(
                  'THEME-UNCLASSIFIED-REFUSED',
                  `Route "${site.surfaceId ?? ''}/${site.routeId ?? route.id}" declares no routeClass, so tenant theming was withheld from it. A permission cannot be derived from silence; declaring a routeClass restores the branding on any class that admits it.`,
                  site,
                  { routeId: route.id, withheldTokenKeys: tenantTokenKeys },
                ),
              ]
            : [];
        return platformOnlyGrant(undefined, 'unclassified', UNCLASSIFIED_THEME_REASON, withheld);
      }
      if (ROUTE_CLASS_THEME_AUTHORITY[routeClass] === 'refuses') {
        return platformOnlyGrant(routeClass, 'refuses', ROUTE_CLASS_THEME_REASON[routeClass]);
      }

      // Admitted. The platform theme goes UNDER the tenant's, because
      // `FormspecForm`'s `themeDocument` prop REPLACES rather than layers:
      // handing it a one-token tenant Theme drops every platform token and the
      // form loses its spacing, radii and colours (gap ledger
      // `platform-theme-merge`). The cascade belongs beside `buildPlatformTheme`
      // in `@formspec-org/layout`; until it lands there, it is here, once,
      // rather than in every host.
      return {
        routeClass,
        posture: 'admits',
        admitsTenantTheme: true,
        reason: ROUTE_CLASS_THEME_REASON[routeClass],
        themeDocument: {
          ...platformTheme,
          tokens: { ...platformTokens, ...tenantTokens },
        } as ThemeDocument,
        tenantTokenKeys,
        diagnostics: [],
      };
    },
  };
}
