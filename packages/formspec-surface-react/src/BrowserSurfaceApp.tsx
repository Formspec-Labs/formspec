/** @filedesc Mount an admitted Surface with browser navigation, Locale, and a shared masthead. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { matchRoute, responseSourceLoader, routeHref, type ResolvedBundle } from '@formspec-org/surface';
import { SurfaceAppView, useSurfaceApp, type SurfaceAppProps } from './SurfaceApp.js';
import {
  pushBrowserAddress, splitSurfaceLocation, surfaceBrowserLocation, useSurfaceBrowserAddress,
  type SurfaceBrowserMode,
} from './browser-location.js';
import { useBrowserAppearance } from './browser-appearance.js';
import { resolveBrowserLocale } from './browser-locale.js';
import type { BrowserDraftPort } from '@formspec-org/surface';
import type { ResponseSelector } from '@formspec-org/types';
import { createDraftSession, type DraftSession, type SurfaceDraftStorage } from './draft-session.js';
import { fenceDraftWidgetActions } from './draft-widget-action.js';
import type { DraftCheckpointPorts } from './draft-writer.js';
import { readSessionDraft } from './draft-data-source.js';
import type { DataSourceLoader } from '@formspec-org/surface';
import type { SurfaceSaveNotice } from './SurfaceSlot.js';

export interface SurfacePreviewEdition {
  /** Stable browser draft scope, unique to this edition on the hosting origin. */
  scope: string;
  bundle: ResolvedBundle;
  adapters: SurfaceHostAdapters;
  initialPath: string;
}

export interface SurfaceBrowserVisit {
  path: string | undefined;
  previewScope: string | undefined;
}

export type SurfaceHostAdapters = Omit<SurfaceAppProps,
  'bundle' | 'location' | 'onNavigate' | 'resolveNavigationHref' | 'activeLocale' |
  'header' | 'appTitle' | 'strings' | 'resolveRouteTitle' | 'navigationLabel'> & {
  mode?: SurfaceBrowserMode;
  responses?: ResponseSelector;
  withResponseLoader?: (readResponse: DataSourceLoader) => DataSourceLoader;
  /** Storage selected by this composition. */
  draftStorage?: Omit<SurfaceDraftStorage, 'responses'> | undefined;
  /** Host preconditions and unrelated effects for actions that checkpoint a draft. */
  checkpointPorts?: DraftCheckpointPorts | undefined;
  /** Absolute mount pathname in history mode. Serve the app at deep paths under it. */
  basePath?: string;
  /** Await the current draft writer before controlled route and edition changes. */
  beforeLeave?: ((visit: SurfaceBrowserVisit) => boolean | Promise<boolean>) | undefined;
};

type PreviewEditions = readonly [SurfacePreviewEdition, ...SurfacePreviewEdition[]];

export type BrowserSurfaceAppProps =
  | { bundle: ResolvedBundle; adapters: SurfaceHostAdapters; previewEditions?: never }
  | { previewEditions: PreviewEditions; adapters?: Pick<SurfaceHostAdapters, 'mode'>; bundle?: never };

function isBrowserPort(port: SurfaceDraftStorage['port'] | undefined): port is BrowserDraftPort {
  return !!port && 'subscribe' in port && 'restart' in port;
}

function samePreviewSession(previous: SurfacePreviewEdition, current: SurfacePreviewEdition): boolean {
  const before = previous.adapters;
  const after = current.adapters;
  return previous.scope === current.scope && previous.bundle === current.bundle &&
    before.draftStorage?.port === after.draftStorage?.port && before.responses === after.responses &&
    before.draftStorage?.author?.id === after.draftStorage?.author?.id &&
    before.draftStorage?.author?.name === after.draftStorage?.author?.name &&
    before.sessionGeneration === after.sessionGeneration;
}

export function BrowserSurfaceApp(input: BrowserSurfaceAppProps) {
  const previewEditions = input.previewEditions;
  if (previewEditions && (!previewEditions.length || new Set(previewEditions.map(entry => entry.scope)).size !== previewEditions.length ||
    previewEditions.some(entry => !entry.scope))) throw new Error('Preview editions require distinct, non-empty draft scopes.');
  if (previewEditions?.some(({ scope, adapters }) => adapters.draftStorage && adapters.draftStorage.scope !== scope)) {
    throw new Error('Preview draft storage must match its edition scope.');
  }
  if (previewEditions?.some(({ scope, adapters }) => adapters.draftStorage && scope !== adapters.draftStorage.scope)) {
    throw new Error('Preview edition and storage scopes must match.');
  }
  const mode = input.adapters?.mode ?? (previewEditions ? 'hash' : 'history');
  const basePath = input.bundle ? input.adapters.basePath ?? '/' : '/';
  const browser = surfaceBrowserLocation(mode, basePath);
  const { address, routeAddress, anchor, currentRouteAddress } = useSurfaceBrowserAddress(mode);
  const location = browser.read(routeAddress);
  const query = location?.query ?? new URLSearchParams();
  const requestedScope = previewEditions ? query.get('edition') : null;
  const edition = previewEditions?.find(option => option.scope === requestedScope) ?? previewEditions?.[0];
  const bundle = edition?.bundle ?? input.bundle!;
  const props: SurfaceHostAdapters = edition?.adapters ?? input.adapters ?? {};
  const { beforeLeave, draftStorage, checkpointPorts, responses, withResponseLoader } = props;
  const previewScope = edition?.scope;
  const port = draftStorage?.port;
  const localPort = isBrowserPort(port) ? port : undefined;
  const author = draftStorage?.author;
  // Native history can leave a dirty editor without running controlled navigation.
  // Keep its writer until the host replaces the edition's storage or identity.
  const [retained, retain] = useState(() => ({ editions: previewEditions, sessions: new Map<string, DraftSession>() }));
  if (retained.editions !== previewEditions && (
    retained.editions?.length !== previewEditions?.length ||
    retained.editions?.some(previous => !previewEditions?.some(current => samePreviewSession(previous, current)))
  )) {
    const sessions = new Map<string, DraftSession>();
    for (const previous of retained.editions ?? []) {
      const session = retained.sessions.get(previous.scope);
      if (session && previewEditions?.some(current => samePreviewSession(previous, current))) {
        sessions.set(previous.scope, session);
      }
    }
    retain({ editions: previewEditions, sessions });
  }
  const checkpoint = useRef({ checkpointPorts, previewEditions });
  useLayoutEffect(() => { checkpoint.current = { checkpointPorts, previewEditions }; }, [checkpointPorts, previewEditions]);
  const liveSessions = useMemo(() => new Map<string, DraftSession>(),
    [port, responses, props.sessionGeneration, author?.id, author?.name]);
  const sessions = previewEditions ? retained.sessions : liveSessions;
  const scope = draftStorage?.scope ?? previewScope;
  const drafts = useMemo(() => {
    if (!scope || !port) return undefined;
    const retained = sessions.get(scope);
    if (retained) return retained;
    const session = createDraftSession({ scope, port, responses, ...(author && { author }) }, localPort, input => {
      const current = checkpoint.current;
      const ports = current.previewEditions ? current.previewEditions.find(entry => entry.scope === scope)?.adapters.checkpointPorts : current.checkpointPorts;
      return ports?.(input) ?? input.ports;
    });
    sessions.set(scope, session);
    return session;
  }, [scope, port, responses, sessions, localPort, author?.id, author?.name]);
  const attachedSessions = useRef<Map<string, DraftSession> | undefined>(undefined);
  useEffect(() => {
    attachedSessions.current = sessions;
    return () => {
      attachedSessions.current = undefined;
      queueMicrotask(() => {
        for (const [scope, session] of sessions) {
          if (attachedSessions.current?.get(scope) !== session) session.dispose();
        }
      });
    };
  }, [sessions]);
  const [draftRevision, setDraftRevision] = useState(0);
  useEffect(() => localPort?.subscribe(() => setDraftRevision(revision => revision + 1)), [localPort]);
  const dataSourceLoader = useMemo<DataSourceLoader | undefined>(() => {
    if (!drafts && !responses && !withResponseLoader) return props.dataSourceLoader;
    const baseline: DataSourceLoader = props.dataSourceLoader ?? (() => ({ status: 'unavailable', reason: 'Data source unavailable' }));
    const readResponse = responses && responseSourceLoader(responses);
    const load: DataSourceLoader = request => {
      if (drafts && request.descriptor.source.runtime.delivery === 'draft') return readSessionDraft(drafts, bundle.definitions, request);
      return readResponse && request.responseSelection ? readResponse(request) : baseline(request);
    };
    return withResponseLoader ? withResponseLoader(load) : load;
  }, [drafts, responses, withResponseLoader, bundle.definitions, props.dataSourceLoader]);
  const model = useSurfaceApp({ ...props, bundle });
  const entry = model.app.entry ? routeHref(model.app.entry, props.routeParams) : undefined;
  const entryPath = entry?.refusal === undefined ? entry?.href : undefined;
  const atEntry = location?.path === '' ||
    (location?.path === '/' && matchRoute(model.app, '/').refusal === 'unmatched');
  const path = requestedScope === null || requestedScope === previewScope
    ? atEntry ? edition?.initialPath ?? entryPath : location?.path
    : undefined;
  const localeDocuments = props.localeDocuments ?? bundle.localeDocuments;
  const locale = useMemo(() => resolveBrowserLocale(bundle, localeDocuments), [bundle, localeDocuments]);
  const { preference, appearance, choose } = useBrowserAppearance();
  const [save, setSave] = useState<{ scope: string | undefined; notice: SurfaceSaveNotice }>();
  const request = useRef(0);
  const visit = useMemo(() => ({}), [address, bundle, drafts, previewScope, props.sessionGeneration]);
  const currentVisit = useRef<typeof visit | undefined>(undefined);
  useLayoutEffect(() => {
    currentVisit.current = visit;
    return () => { currentVisit.current = undefined; };
  }, [visit]);

  const widgetActionExecutor = useMemo(() => drafts && props.widgetActionExecutor
    ? fenceDraftWidgetActions(props.widgetActionExecutor, drafts, bundle.definitions,
        () => currentVisit.current === visit && window.location.href === address)
    : props.widgetActionExecutor, [drafts, props.widgetActionExecutor, bundle.definitions, visit, address]);

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
    if (!leaving || (!beforeLeave && !drafts)) return pushBrowserAddress(target, leaving);
    return (async () => {
      try {
        return (!beforeLeave || await beforeLeave({ path, previewScope })) &&
          request.current === attempt && isCurrent() &&
          (!drafts || await drafts.leave()) &&
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
    navigate(selected.initialPath, scope);
  }

  function sectionDestination(slot: string, section: string) {
    const search = new URLSearchParams(query);
    search.set('slot', slot);
    search.set('section', section);
    return `${path}?${search}`;
  }

  return <SurfaceAppView
    {...props} bundle={bundle} model={model} location={path ?? ''}
    dataSourceLoader={dataSourceLoader}
    widgetActionExecutor={widgetActionExecutor}
    dataSourceRevision={request => {
      const ownerRevision = props.dataSourceRevision?.(request);
      const tracksDraft = drafts && (request.descriptor.source.runtime.delivery === 'draft' ||
        (responses && request.responseSelection !== undefined));
      if (!tracksDraft) return ownerRevision;
      if (ownerRevision === undefined) return draftRevision;
      return typeof ownerRevision === 'string' || Number.isFinite(ownerRevision)
        ? JSON.stringify([draftRevision, ownerRevision]) : ownerRevision;
    }}
    onNavigate={navigate} resolveNavigationHref={resolveHref}
    activeLocale={locale.activeLocale || undefined} strings={locale.strings}
    browser={{
      addressAvailable: path !== undefined,
      appearance,
      direction: locale.direction,
      entryPath,
      anchor,
      previewScope,
      drafts,
      draftRevision,
      navigate,
      reportSave: notice => {
        // Ignore an old edition's result even when Back changes the address during a write.
        const currentScope = previewEditions
          ? browser.read(currentRouteAddress())?.query.get('edition') ?? previewEditions[0].scope
          : undefined;
        if (currentScope === previewScope && currentVisit.current === visit) {
          setSave({ scope: previewScope, notice });
          if (!localPort && drafts && notice === 'saved') setDraftRevision(revision => revision + 1);
        }
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
