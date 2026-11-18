/** @filedesc Mount an admitted Surface with browser navigation, Locale, and a shared masthead. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { composeSurfaceApp, matchRoute, routeHref, type ResolvedBundle } from '@formspec-org/surface';
import { SurfaceAppView, useSurfaceApp, type SurfaceAppProps } from './SurfaceApp.js';
import {
  pushBrowserAddress, splitSurfaceLocation, surfaceBrowserLocation, useSurfaceBrowserAddress,
  type SurfaceBrowserMode,
} from './browser-location.js';
import { useBrowserAppearance } from './browser-appearance.js';
import { resolveBrowserLocale } from './browser-locale.js';
import type { SurfaceSaveNotice } from './SurfaceSlot.js';

export interface SurfacePreviewEdition {
  /** Stable browser draft scope, unique to this edition on the hosting origin. */
  scope: string;
  bundle: ResolvedBundle;
}

export interface SurfaceBrowserVisit {
  path: string | undefined;
  previewScope: string | undefined;
}

type BrowserSurfaceOptions = Omit<SurfaceAppProps,
  'bundle' | 'location' | 'onNavigate' | 'resolveNavigationHref' | 'activeLocale' |
  'header' | 'appTitle' | 'strings' | 'resolveRouteTitle' | 'navigationLabel'> & {
  mode?: SurfaceBrowserMode;
  /** Absolute mount pathname in history mode. Serve the app at deep paths under it. */
  basePath?: string;
  /** Await the current draft writer before controlled route and edition changes. */
  beforeLeave?: ((visit: SurfaceBrowserVisit) => boolean | Promise<boolean>) | undefined;
};

export type BrowserSurfaceAppProps = BrowserSurfaceOptions & (
  | { bundle: ResolvedBundle; previewEditions?: never }
  | { bundle?: never; previewEditions: readonly [SurfacePreviewEdition, ...SurfacePreviewEdition[]] }
);

export function BrowserSurfaceApp({
  mode = 'history', basePath = '/', beforeLeave, previewEditions, ...props
}: BrowserSurfaceAppProps) {
  const browser = surfaceBrowserLocation(mode, basePath);
  const { address, routeAddress, anchor, currentRouteAddress } = useSurfaceBrowserAddress(mode);
  const location = browser.read(routeAddress);
  const query = location?.query ?? new URLSearchParams();
  const requestedScope = previewEditions ? query.get('edition') : null;
  const edition = previewEditions?.find(option => option.scope === requestedScope) ?? previewEditions?.[0];
  const bundle = edition?.bundle ?? props.bundle!;
  const previewScope = edition?.scope;
  const model = useSurfaceApp({ ...props, bundle });
  const entry = model.app.entry ? routeHref(model.app.entry, props.routeParams) : undefined;
  const entryPath = entry?.refusal === undefined ? entry?.href : undefined;
  const atEntry = location?.path === '' ||
    (location?.path === '/' && matchRoute(model.app, '/').refusal === 'unmatched');
  const path = requestedScope === null || requestedScope === previewScope
    ? atEntry ? entryPath : location?.path
    : undefined;
  const localeDocuments = props.localeDocuments ?? bundle.localeDocuments;
  const locale = useMemo(() => resolveBrowserLocale(bundle, localeDocuments), [bundle, localeDocuments]);
  const { preference, appearance, choose } = useBrowserAppearance();
  const [save, setSave] = useState<{ scope: string | undefined; notice: SurfaceSaveNotice }>();
  const request = useRef(0);
  const visit = useMemo(() => ({}), [address, bundle, props.sessionGeneration]);
  const currentVisit = useRef<typeof visit | undefined>(undefined);
  useLayoutEffect(() => {
    currentVisit.current = visit;
    return () => { currentVisit.current = undefined; };
  }, [visit]);

  function resolveHref(href: string, scope = previewScope): string | undefined {
    const { path, query } = splitSurfaceLocation(href);
    if (scope !== undefined) query.set('edition', scope);
    else query.delete('edition');
    return browser.href(path, query);
  }

  function navigate(href: string, scope = previewScope): boolean | Promise<boolean> {
    const isCurrent = () => currentVisit.current === visit && window.location.href === address;
    if (!isCurrent()) return false;
    const destination = splitSurfaceLocation(href);
    const leaving = destination.path !== path || scope !== previewScope;
    const target = resolveHref(href, scope);
    if (target === undefined) return false;
    const attempt = ++request.current;
    if (!leaving || !beforeLeave) return pushBrowserAddress(target, leaving);
    return (async () => {
      try {
        return await beforeLeave({ path, previewScope }) &&
          request.current === attempt && isCurrent() && pushBrowserAddress(target, true);
      } catch {
        // The writer reports the failed save. The current visit stays active.
        return false;
      }
    })();
  }

  function switchEdition(scope: string) {
    const selected = previewEditions?.find(option => option.scope === scope);
    if (!selected || scope === previewScope) return;
    const { entry } = composeSurfaceApp(selected.bundle.surfaces, { entrySurface: selected.bundle.entrySurface });
    const target = entry ? routeHref(entry, props.routeParams) : undefined;
    if (target && !target.refusal) navigate(target.href, scope);
  }

  function sectionDestination(slot: string, section: string) {
    const search = new URLSearchParams(query);
    search.set('slot', slot);
    search.set('section', section);
    return `${path}?${search}`;
  }

  if (previewEditions && (new Set(previewEditions.map(option => option.scope)).size !== previewEditions.length ||
    previewEditions.some(option => !option.scope))) {
    throw new Error('Preview editions require distinct, non-empty draft scopes.');
  }

  return <SurfaceAppView
    {...props} bundle={bundle} model={model} location={path ?? ''}
    onNavigate={navigate} resolveNavigationHref={resolveHref}
    activeLocale={locale.activeLocale || undefined} strings={locale.strings}
    browser={{
      addressAvailable: path !== undefined,
      appearance,
      direction: locale.direction,
      entryPath,
      anchor,
      previewScope,
      navigate,
      reportSave: notice => {
        // Ignore an old edition's result even when Back changes the address during a write.
        const currentScope = previewEditions
          ? browser.read(currentRouteAddress())?.query.get('edition') ?? previewEditions[0].scope
          : undefined;
        if (currentScope === previewScope) setSave({ scope: previewScope, notice });
      },
      workspace: {
        slot: query.get('slot') ?? undefined,
        activeSection: query.get('section') ?? undefined,
        hrefForSection: (slot, section) => resolveHref(sectionDestination(slot, section)),
        onActiveSectionChange: (slot, section) => navigate(sectionDestination(slot, section)),
      },
      editionPicker: previewEditions && previewEditions.length > 1 && (
        <label>
          {locale.strings('previewEditionLabel')}
          <select data-surface-edition="" value={previewScope} onChange={event => switchEdition(event.currentTarget.value)}>
            {previewEditions.map(option => <option key={option.scope} value={option.scope}>
              {option.bundle.title ?? option.scope}
            </option>)}
          </select>
        </label>
      ),
      appearancePicker: (
        <label>
          {locale.strings('appearanceLabel')}
          <select data-surface-appearance="" value={preference} onChange={event => choose(event.currentTarget.value)}>
            <option value="system">{locale.strings('appearanceSystem')}</option>
            <option value="light">{locale.strings('appearanceLight')}</option>
            <option value="dark">{locale.strings('appearanceDark')}</option>
          </select>
        </label>
      ),
      saveNotice: save && save.scope === previewScope ? locale.strings(save.notice) : '',
    }}
    sessionGeneration={JSON.stringify([previewScope, props.sessionGeneration])}
  />;
}
