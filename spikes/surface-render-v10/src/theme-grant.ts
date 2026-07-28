/**
 * @filedesc The runtime half of THEME-ROUTE-CLASS, and the only place in this
 * app where the tenant's Theme document is allowed to be read.
 *
 * ## Why this is one module and not a prop
 *
 * Bar R3 says tenant tokens must be **structurally** absent from the `proof`
 * and `ceremony` routes, not merely invisible. Cosmetic absence is a styling
 * choice and one careless prop restores it. Structural absence means there is
 * no code path from the tenant Theme to those routes at all.
 *
 * The shape that buys it: `resolveThemeGrant()` is called once per route, at
 * the route boundary, and everything below the boundary receives only
 * `grant.themeDocument`. On a refusing class that value is the platform theme —
 * a different object, built from the platform token registry, that never saw
 * the tenant's tokens. The tenant Theme is imported by this file and by no
 * other file in the app. Checkable with grep; the spike's README says so.
 *
 * ## Where the rule comes from
 *
 * `ROUTE_CLASS_THEME_AUTHORITY` is the shipped map, read from
 * `@formspec-org/app-graph`, not restated here. It is exhaustive over the
 * schema-generated `routeClass` union by construction, so a vocabulary change
 * breaks compilation at its decision site rather than silently admitting a new
 * value.
 *
 * Reading it required reaching past the package's `exports` field into `dist/`,
 * because the map is not on the public export surface — gap ledger
 * `theme-authority-unexported`. That is the finding, not an accident of style:
 * a rule only a validator can import is a rule that only fires at authoring
 * time, which is exactly the state this spike found the platform in.
 */
// eslint-disable-next-line import/no-relative-packages -- see file docstring; the map is not exported from the package index.
import { ROUTE_CLASS_THEME_AUTHORITY } from '../../../packages/formspec-app-graph/dist/ui-graph-policy.js';
import { buildPlatformTheme } from '@formspec-org/layout';
import type { SurfaceDocument, ThemeDocument } from '@formspec-org/types';
import { tenantTheme } from './bundle.ts';

type Route = SurfaceDocument['routes'][number];
type RouteClass = NonNullable<Route['routeClass']>;

type TokenMap = Record<string, string | number>;

/** The platform theme, derived from the shipped token registry. Built once. */
const platformTheme = buildPlatformTheme() as ThemeDocument & { tokens?: TokenMap };

/**
 * The bundle's Theme authors `color.accent`. The platform token registry has no
 * `accent` — its brand token is `color.primary`, and that is the one every
 * shipped stylesheet reads (`--formspec-default-primary` and friends in
 * `formspec-layout/src/styles/default.tokens.css`).
 *
 * So a tenant theme that authors `color.accent` is accepted by authoring,
 * passes validation, is emitted by the renderer as `--formspec-color-accent`,
 * and is then read by nothing. The brand silently does not apply.
 *
 * This table is the bridge, and it is a hand-built one — gap ledger
 * `theme-token-vocabulary-bridge`. It is listed there as the most dangerous
 * thing the spike found, because the failure mode is silence.
 */
const TOKEN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'color.accent': ['color.primary'],
};

function bridgeTenantTokens(tokens: TokenMap): TokenMap {
  const bridged: TokenMap = { ...tokens };
  for (const [authored, targets] of Object.entries(TOKEN_ALIASES)) {
    const value = tokens[authored];
    if (value === undefined) continue;
    for (const target of targets) {
      if (bridged[target] === undefined) bridged[target] = value;
    }
  }
  return bridged;
}

/** Tokens the tenant Theme actually contributes, after bridging. Computed once. */
const tenantTokens: TokenMap = bridgeTenantTokens(
  ((tenantTheme as { tokens?: TokenMap } | undefined)?.tokens ?? {}) as TokenMap,
);

/**
 * The theme document a route's slots may see, plus the reason.
 *
 * `themeDocument` is what crosses the boundary. `tenantTokenKeys` is empty on
 * every refusing route by construction, and the UI shows it so the refusal is
 * legible to a person looking at the screen rather than only to a reader of
 * this file.
 */
export interface ThemeGrant {
  routeClass: RouteClass | undefined;
  admitsTenantTheme: boolean;
  /** Product-language explanation, shown in the UI. */
  reason: string;
  /** The ONLY theme any slot renderer receives. */
  themeDocument: ThemeDocument;
  /** Tenant token keys present in `themeDocument`. Empty ⇒ nothing tenant-supplied. */
  tenantTokenKeys: readonly string[];
}

const REFUSAL_REASON: Readonly<Record<RouteClass, string>> = {
  intake: '',
  proof: 'This page is a receipt the platform issued. It looks the same for everyone, so nobody can be shown a receipt that was styled to look more official than it is.',
  ceremony:
    'This page is where you sign. Signing pages are not branded, so what you are agreeing to cannot be dressed up.',
  verification:
    'This page checks something independently. An independent check that carries the checked party’s branding is not independent.',
  attestation:
    'This page is a claim the platform makes about itself. The platform, not a customer, is accountable for how it looks.',
  authentication:
    'This page asks for credentials. Its appearance is the anti-phishing control, so it is not a customer’s to change.',
  operation: 'This page is an internal work screen, so customer branding does not apply to it.',
};

const PLATFORM_ONLY_UNCLASSIFIED =
  'Nobody has said what this page is, so it renders in platform styling until someone does.';

/**
 * The one decision site. Called once per route by the shell; nothing downstream
 * ever sees `tenantTheme`.
 */
export function resolveThemeGrant(route: Route): ThemeGrant {
  const routeClass = route.routeClass;
  const platformTokens = (platformTheme.tokens ?? {}) as TokenMap;

  // Unclassified: no rule keyed on a class fires (ADR 0161 §6 — absence is a
  // distinct state, and processors MUST NOT read it as `operation`). This app's
  // bundle classifies every route, so this arm is unreached here; it is written
  // out because reading absence as "refuse" would be as wrong as reading it as
  // "admit", and a shell has to pick.
  if (routeClass === undefined) {
    return {
      routeClass: undefined,
      admitsTenantTheme: false,
      reason: PLATFORM_ONLY_UNCLASSIFIED,
      themeDocument: { ...platformTheme, tokens: { ...platformTokens } } as ThemeDocument,
      tenantTokenKeys: [],
    };
  }

  if (ROUTE_CLASS_THEME_AUTHORITY[routeClass] === 'refuses') {
    // The tenant tokens are not merged, not overridden, not set to a default —
    // they are never read on this path. `themeDocument` is built from the
    // platform registry alone.
    return {
      routeClass,
      admitsTenantTheme: false,
      reason: REFUSAL_REASON[routeClass],
      themeDocument: { ...platformTheme, tokens: { ...platformTokens } } as ThemeDocument,
      tenantTokenKeys: [],
    };
  }

  // Admitted. The platform theme goes UNDER the tenant's: `FormspecForm`'s
  // `themeDocument` prop replaces rather than layers, so handing it the tenant
  // Theme alone would drop every platform token — gap ledger
  // `platform-theme-merge`.
  return {
    routeClass,
    admitsTenantTheme: true,
    reason:
      'This page collects information from the person filling it in, so it carries the organisation’s branding.',
    themeDocument: {
      ...platformTheme,
      tokens: { ...platformTokens, ...tenantTokens },
    } as ThemeDocument,
    tenantTokenKeys: Object.keys(tenantTokens),
  };
}

/** Every tenant token value, for the R3 falsification probe. */
export const TENANT_TOKEN_VALUES: readonly string[] = Object.values(tenantTokens).map(String);

/**
 * Scrubs tenant theme tokens off `<html>` when the current route refuses them.
 *
 * ## Why a shell has to do this at all
 *
 * `FormspecProvider` — the shipped React renderer's own provider — runs
 * `emitThemeTokens(themeDocument.tokens)` with no target, and that function
 * defaults to `document.documentElement`. It has no cleanup on unmount.
 *
 * So the moment `/apply` renders once, the tenant's `color.primary: #7A1F3D` is
 * an inline custom property on the `<html>` element, and it stays there for the
 * life of the page. Navigate to the `proof` route and the token is still in the
 * cascade, inheriting into every element on a page that is supposed to refuse
 * it. Measured: `evidence/r3-document-root-leak.json` — 0 tokens on a fresh
 * load, 46 after the intake route renders, still 46 on the receipt route.
 *
 * **A structurally correct shell cannot prevent this from outside.** The
 * boundary in `resolveThemeGrant` is real — nothing tenant-shaped crosses into
 * a refusing route's props or subtree — and it is defeated anyway, by a global
 * side effect inside the renderer the shell is composing with.
 *
 * Nothing visibly changes in this app, because the shell's own chrome reads no
 * `--formspec-color-*` property and the stub widgets read none either.
 *
 * **And putting a `definition-form` slot on a `proof` route would not change
 * that** — measured, not assumed. It is schema-valid and nothing forbids it,
 * but the slot receives the refusing route's grant, so `FormspecProvider`
 * re-emits the platform tokens over the leaked ones on `<html>` and
 * `FormspecForm` writes the platform values inline on its own container.
 * Reproduced in the running app with the tenant value on the document root and
 * the platform value on the container: the form and every field inside it
 * resolve the platform `#27594f`. The receipt renders in platform styling. The
 * exposure is the unscoped write itself — it outlives the component, a host can
 * only clean up after it, and it reaches everything OUTSIDE a
 * `.formspec-container`. See `evidence/r3-document-root-leak.json`
 * `correction.measurement`.
 *
 * This function is the workaround, and it is a workaround: gap ledger
 * `renderer-emits-tenant-tokens-to-document-root`. The fix belongs in
 * `formspec-react`, which should scope the emission to its own container (it
 * already does exactly that, correctly and with cleanup, in `FormspecForm`) and
 * stop writing to the document root at all.
 */
export function enforceDocumentRootThemeBoundary(grant: ThemeGrant): void {
  if (grant.admitsTenantTheme) return;
  const root = document.documentElement;
  for (let i = root.style.length - 1; i >= 0; i -= 1) {
    const property = root.style[i];
    if (property.startsWith('--formspec-')) root.style.removeProperty(property);
  }
}
