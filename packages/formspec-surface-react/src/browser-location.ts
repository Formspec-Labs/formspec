/** @filedesc Read and write Surface addresses through browser session history. */
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { serializeRoutePath } from '@formspec-org/surface';

export type SurfaceBrowserMode = 'history' | 'hash';

interface SurfaceLocation {
  path: string;
  query: URLSearchParams;
}

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener('hashchange', listener);
  window.addEventListener('formspec:navigate', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('formspec:navigate', listener);
  };
}

function useBrowserAddress(): string {
  return useSyncExternalStore(subscribe, () => window.location.href, () => '');
}

function isHashAnchor(mode: SurfaceBrowserMode, address: string): boolean {
  if (mode !== 'hash' || !address) return false;
  const { hash } = new URL(address);
  return hash.length > 1 && !hash.startsWith('#/') && !hash.startsWith('#?');
}

function retainedHashRoute(): string | undefined {
  const retained: unknown = window.history.state?.formspecHashRoute;
  return typeof retained === 'string' ? retained : undefined;
}

export function useSurfaceBrowserAddress(mode: SurfaceBrowserMode) {
  const address = useBrowserAddress();
  const lastRouteAddress = useRef('');
  const anchor = isHashAnchor(mode, address);
  const routeAddress = anchor ? retainedHashRoute() ?? lastRouteAddress.current : address;
  useLayoutEffect(() => {
    lastRouteAddress.current = routeAddress;
    // A native fragment link replaces the URL hash. Save the route on that
    // history entry so Back, Forward and reload can restore it independently.
    if (anchor && window.location.href === address && retainedHashRoute() === undefined) {
      window.history.replaceState({ ...window.history.state, formspecHashRoute: routeAddress }, '');
    }
  }, [address, anchor, routeAddress]);

  function currentRouteAddress() {
    const current = window.location.href;
    return isHashAnchor(mode, current) ? retainedHashRoute() ?? lastRouteAddress.current : current;
  }

  return { address, routeAddress, anchor, currentRouteAddress };
}

export function pushBrowserAddress(href: string, scroll: boolean): boolean {
  if (typeof window === 'undefined') return false;
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin) return false;
  if (target.href === window.location.href) return true;
  window.history.pushState(null, '', href);
  if (scroll) window.scrollTo(0, 0);
  window.dispatchEvent(new Event('formspec:navigate'));
  return true;
}

export function splitSurfaceLocation(location: string): SurfaceLocation {
  const queryAt = location.indexOf('?');
  return queryAt < 0
    ? { path: location, query: new URLSearchParams() }
    : { path: location.slice(0, queryAt), query: new URLSearchParams(location.slice(queryAt + 1)) };
}

/** The location with one query parameter set and the others kept. */
export function withSurfaceQuery(location: string, name: string, value: string): string {
  const { path, query } = splitSurfaceLocation(location);
  query.set(name, value);
  return `${path}?${query}`;
}

export function surfaceBrowserLocation(mode: SurfaceBrowserMode, basePath: string) {
  const base = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  return {
    read(address: string): SurfaceLocation | undefined {
      if (address === '') return splitSurfaceLocation('');
      const url = new URL(address);
      if (mode === 'hash') {
        const fragment = url.hash.slice(1);
        return splitSurfaceLocation(fragment.startsWith('/') || fragment.startsWith('?') ? fragment : '');
      }
      // A query separator distinguishes an explicitly linked root from the bare mount.
      if (url.pathname === base || (url.pathname === `${base}/` && !url.href.split('#', 1)[0]?.includes('?'))) {
        return { path: '', query: url.searchParams };
      }
      if (!url.pathname.startsWith(`${base}/`)) return undefined;
      return { path: url.pathname.slice(base.length), query: url.searchParams };
    },
    href(path: string, query: URLSearchParams): string | undefined {
      const pathname = serializeRoutePath(path.startsWith('/') ? path : `/${path}`);
      // History URL parsing removes dot segments before a route can match them.
      if (mode === 'history' && /\/(?:\.|%2e){1,2}(?=\/|$)/i.test(pathname)) return undefined;
      const search = query.toString();
      const prefix = mode === 'hash' ? '#' : base || (pathname.startsWith('//') ? '/.' : '');
      return `${prefix}${pathname}${search || (mode === 'history' && pathname === '/') ? `?${search}` : ''}`;
    },
  };
}

/** History pathname and navigation for an embedded controlled SurfaceApp. */
export function useBrowserLocation(fallback = '/'): [string, (href: string) => void] {
  const address = useBrowserAddress();
  const location = address ? new URL(address).pathname : fallback;
  const navigate = useCallback((href: string) => pushBrowserAddress(href, true), []);
  return [location, navigate];
}

export function isPlainLinkClick(event: MouseEvent): boolean {
  return !event.defaultPrevented && event.button === 0 &&
    !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
