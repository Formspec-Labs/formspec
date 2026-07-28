/**
 * @filedesc Reads the document root and reports what is on it. Spike
 * scaffolding — gap ledger `shell-visual-design`.
 *
 * **It does not write.** This used to be `enforceDocumentRootThemeBoundary`, and
 * it scrubbed `--formspec-*` off `<html>` on every refusing route, because
 * `FormspecProvider` called `emitThemeTokens(themeDocument.tokens)` with no
 * target — the helper defaults to `document.documentElement` — and never cleaned
 * up. One render of `/apply` left the tenant's brand colour inline on `<html>`
 * for the life of the page: 0 properties on a fresh load, 46 after the intake
 * route rendered, still 46 after navigating to the receipt route. A structurally
 * correct shell could not prevent that from outside, only clean up after it.
 *
 * `FormspecProvider` now emits onto a `display: contents` element it owns, with
 * cleanup, and never touches the document root — so there is nothing left to
 * scrub. `@formspec-org/surface-react` deliberately ships **no** document-root
 * scrub either: a shell that manufactures the property it reports is not
 * measuring anything.
 *
 * The theme grant itself is no longer here. `createThemeAuthority`
 * (`@formspec-org/surface`) is the one reader of the tenant Theme, and it is
 * constructed inside `SurfaceApp` from `bundle.tenantTheme` — the boundary moved
 * from "one file in this spike" to "one function in the shipped package", which
 * is the stronger version of the same claim and is held by
 * `packages/formspec-surface/tests/theme-authority.test.ts`.
 */
import { resolvedBundle } from './bundle.ts';

/**
 * Every value the tenant Theme authors, for the R3 probe to grep the DOM for.
 * Read straight off the bundle: the question the probe asks is whether any
 * value the TENANT wrote appears somewhere it should not.
 */
export const TENANT_TOKEN_VALUES: readonly string[] = Object.values(
  (resolvedBundle.tenantTheme as { tokens?: Record<string, string | number> } | undefined)?.tokens ??
    {},
).map(String);

export function documentRootThemeProperties(): readonly string[] {
  const root = document.documentElement;
  const properties: string[] = [];
  for (let i = 0; i < root.style.length; i += 1) {
    const property = root.style[i]!;
    if (property.startsWith('--formspec-')) properties.push(property);
  }
  return properties;
}
