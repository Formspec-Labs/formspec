/** @filedesc Browser entry, history, preview scope, and shared Surface chrome. */
import { act, useEffect, useState } from 'react';
import { invokeResponseAction } from '@formspec-org/engine';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { dereferenceBundleExport } from '@formspec-org/surface';
import type { ComponentDocument } from '@formspec-org/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserSurfaceApp, SURFACE_APPEARANCE_SCRIPT, SurfaceApp, renderDefaultDefinitionForm,
  type SurfaceDefinitionFormRenderInput,
} from '../src/index.js';
import { render } from './render.js';

const appId = 'https://example.test/filing';
const definitionUrl = `${appId}/form`;
const surfaceUrl = `${appId}/surface`;
const actionsUrl = `${appId}/actions`;
const appearanceKey = 'formspec:surface-appearance:v1';
const definitions = [{
  $formspec: '1.0', url: definitionUrl, version: '1.0.0', title: 'Filing',
  items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
}];
const definitionSlot = (id: string) => ({
  id, slotType: 'definition-form', binding: { definitionRef: definitionUrl },
});

function bundle(title = 'FY25 Filing', multipleForms = false, withRoot = false) {
  const locales = [
    { locale: 'en', target: { kind: 'app', url: appId }, strings: { '$module.x-formspec-surface.shell.appearanceLabel': 'Display' } },
    { locale: 'fr', target: { kind: 'app', url: appId }, strings: { '$module.x-formspec-surface.shell.appearanceLabel': 'Affichage' } },
    { locale: 'fr-CA', target: { kind: 'app', url: appId }, strings: {}, fallback: 'fr' },
    { locale: 'fr', target: { kind: 'definition', url: definitionUrl }, strings: { 'name.label': 'Nom' } },
    { locale: 'de', target: { kind: 'definition', url: definitionUrl }, strings: { 'name.label': 'Name auf Deutsch' } },
  ];
  return dereferenceBundleExport({
    manifest: {
      $formspecBundle: '2.4', id: appId, title, entrySurface: surfaceUrl,
      surfaces: [{ url: surfaceUrl }], definitions: [{ url: definitionUrl }],
      responseActionDocuments: [{ url: actionsUrl }],
      theme: { url: `${appId}/theme` },
      locales: locales.map(({ locale }, index) => ({ locale, url: `${appId}/locale/${index}` })),
    },
    documents: {
      [definitionUrl]: definitions[0],
      [actionsUrl]: {
        $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response',
        targetDefinition: { url: definitionUrl },
        actions: [{ id: 'save', intent: 'save-draft', label: { literal: 'Save draft' }, effects: [{ type: 'hostEvent', eventName: 'draft-saved' }] }],
      },
      [`${appId}/theme`]: { tokens: { 'color.primary': '#123456' } },
      ...Object.fromEntries(locales.map((locale, index) => [`${appId}/locale/${index}`, {
        $formspecLocale: '2.1', version: '1.0.0', ...locale,
      }])),
      [surfaceUrl]: {
        $formspecSurface: '0.2', id: 'filing', entry: 'home', routes: [
          { id: 'form', path: '/forms/{state}', routeClass: 'intake', title: 'Form',
            navigation: { label: 'File a report', order: 2 },
            params: [{ name: 'state' }],
            slots: multipleForms ? [definitionSlot('other'), definitionSlot('report')] : [definitionSlot('report')] },
          { id: 'admin', path: '/admin', routeClass: 'operation', title: 'Administration',
            navigation: { scope: 'staff' }, slots: [] },
          { id: 'hidden', path: '/hidden', routeClass: 'intake', title: 'Hidden',
            navigation: { visible: false }, slots: [] },
          { id: 'home', path: title === 'FY25 Filing' ? '/overview' : '/start', title: 'Overview',
            routeClass: 'intake', navigation: { label: 'Filing map', order: 1 }, slots: [] },
          ...(withRoot ? [
            { id: 'root', path: '/', routeClass: 'intake', title: 'Root', slots: [] },
            { id: 'literal', path: '/\\example.test', routeClass: 'intake', title: 'Literal', slots: [] },
            { id: 'dot', path: '/%2e%2e/other', routeClass: 'intake', title: 'Dot', slots: [] },
          ] : []),
        ],
      },
    },
  });
}

const originalAddress = window.location.href;

beforeAll(async () => { await initFormspecEngine(); });
beforeEach(() => {
  const entries = new Map<string, string>();
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
  } as Storage);
});
afterEach(() => {
  window.history.replaceState(null, '', originalAddress);
  vi.restoreAllMocks();
  for (const element of [document.documentElement, document.body]) {
    element.removeAttribute('data-fs-appearance');
    element.removeAttribute('data-fs-saved-appearance');
  }
});

function address(path: string) {
  window.history.replaceState(null, '', path);
}

function click(element: Element, options: MouseEventInit = {}) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...options });
  let defaultPrevented = false;
  // Happy DOM navigates the same window for clicks that open a new tab in a browser.
  const suppressNavigation = () => {
    defaultPrevented = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', suppressNavigation, { once: true });
  act(() => { element.dispatchEvent(event); });
  return { defaultPrevented };
}

function pop(path: string, type = 'popstate') {
  address(path);
  act(() => { window.dispatchEvent(new Event(type)); });
}

function select(element: HTMLSelectElement, value: string) {
  act(() => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function workspace(load = () => {}) {
  function Workspace(input: SurfaceDefinitionFormRenderInput) {
    const [draft, setDraft] = useState('');
    useEffect(() => { load(); }, []);
    const active = input.activeSection === 'staff & costs' ? 'staff & costs' : 'intro';
    return <div>
      <h2>{active}</h2>
      <output data-scope>{input.previewScope}</output>
      <output data-params>{JSON.stringify(input.route.params)}</output>
      <input aria-label="Draft answer" value={draft} onInput={event => setDraft(event.currentTarget.value)} />
      <a href={input.hrefForSection?.('staff & costs')} onClick={event => {
        event.preventDefault();
        input.onActiveSectionChange?.('staff & costs');
      }}>Jump to staff</a>
      <button onClick={() => input.reportSave?.('savedLocally')}>Save completed</button>
    </div>;
  }
  return (input: SurfaceDefinitionFormRenderInput) => <Workspace {...input} />;
}

const route = (container: HTMLElement) => container.querySelector('article')?.dataset.route;
const formLink = (container: HTMLElement) => container.querySelector<HTMLAnchorElement>('a[data-nav-route="form"]')!;

describe('BrowserSurfaceApp', () => {
  it.each([
    ['history', '/filing/', '/filing/overview', '/filing/forms/new%20york'],
    ['hash', '/filing/index.html#', '#/overview', '#/forms/new%20york'],
  ] as const)('opens authored entry and formats authored navigation in %s mode', (mode, bare, home, form) => {
    address(bare);
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ mode,
        basePath: "/filing/",
        routeParams: { state: 'new york' },
        renderDefinitionForm: workspace() }} />);

    expect(route(container)).toBe('home');
    const masthead = container.querySelector('header a')!;
    expect(masthead.textContent).toBe('FY25 Filing');
    expect(masthead.getAttribute('href')).toBe(home);
    expect([...container.querySelectorAll('nav a')].map(link => link.textContent)).toEqual(['Filing map', 'File a report']);
    expect(formLink(container).getAttribute('href')).toBe(form);
    for (const options of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(click(formLink(container), options).defaultPrevented).toBe(false);
      expect(route(container)).toBe('home');
    }
    expect(click(formLink(container)).defaultPrevented).toBe(true);
    expect(route(container)).toBe('form');
    expect(container.querySelector('[data-params]')?.textContent).toBe('{"state":"new york"}');
    expect(formLink(container).getAttribute('aria-current')).toBe('page');
  });

  it.each(['history', 'hash'] as const)('opens a %s deep link and keeps section history out of draft identity', mode => {
    const prefix = mode === 'history' ? '/filing' : '/filing/index.html#';
    const path = `${prefix}/forms/new%20york`;
    const load = vi.fn();
    address(`${path}?slot=report&section=staff%20%26%20costs&state=forged`);
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ mode,
        basePath: "/filing/",
        renderDefinitionForm: workspace(load) }} />);
    const heading = () => container.querySelector('h2')?.textContent;
    expect(heading()).toBe('staff & costs');
    expect(container.querySelector('[data-params]')?.textContent).toBe('{"state":"new york"}');
    expect(formLink(container).getAttribute('aria-current')).toBe('page');
    const input = container.querySelector('input');
    pop(`${path}?slot=report&section=removed`, mode === 'hash' ? 'hashchange' : 'popstate');
    expect(heading()).toBe('intro');
    pop(`${path}?slot=report&section=staff%20%26%20costs`);
    expect(heading()).toBe('staff & costs');
    pop(path);
    expect(heading()).toBe('intro');
    const link = container.querySelector<HTMLAnchorElement>('article a')!;
    expect(link.getAttribute('href')).toContain('slot=report&section=staff+%26+costs');
    click(link);
    expect(heading()).toBe('staff & costs');
    expect(container.querySelector('input')).toBe(input);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('addresses one exact form slot and leaves other forms at their default', () => {
    address('/forms/mi?slot=report&section=staff%20%26%20costs');
    const container = render(<BrowserSurfaceApp bundle={bundle('FY25 Filing', true)} adapters={{ renderDefinitionForm: workspace() }} />);
    const headings = () => [...container.querySelectorAll('h2')].map(el => el.textContent);
    expect(headings()).toEqual(['intro', 'staff & costs']);
    pop('/forms/mi?slot=removed&section=staff%20%26%20costs');
    expect(headings()).toEqual(['intro', 'intro']);
  });

  it('ignores a section callback retained by an earlier visit', () => {
    address('/forms/mi');
    let jump: SurfaceDefinitionFormRenderInput['onActiveSectionChange'];
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ renderDefinitionForm: input => {
      jump = input.onActiveSectionChange;
      return null;
    } }} />);
    pop('/overview');
    act(() => { jump?.('staff & costs'); });
    expect(route(container)).toBe('home');
    expect(window.location.pathname).toBe('/overview');
  });

  it('leaves paths outside the mount and unmatched deep links unavailable', () => {
    address('/filing-other/overview');
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ basePath: "/filing" }} />);
    expect(route(container)).toBeUndefined();
    pop('/filing/unknown');
    expect(route(container)).toBeUndefined();
    pop('/filing');
    expect(route(container)).toBe('home');
  });

  it.each(['/', '/portal/'])('distinguishes the bare history mount %s from its authored root route', mount => {
    address(mount);
    const container = render(<BrowserSurfaceApp bundle={bundle('FY25 Filing', false, true)} adapters={{ basePath: mount }} />);
    expect(route(container)).toBe('home');
    const rootLink = container.querySelector<HTMLAnchorElement>('a[data-nav-route="root"]')!;
    click(rootLink);
    expect(route(container)).toBe('root');
    const reopened = render(<BrowserSurfaceApp bundle={bundle('FY25 Filing', false, true)} adapters={{ basePath: mount }} />);
    expect(route(reopened)).toBe('root');
    pop(mount);
    expect(route(container)).toBe('home');
    const literal = container.querySelector<HTMLAnchorElement>('a[data-nav-route="literal"]')!;
    expect(new URL(literal.href).origin).toBe(window.location.origin);
    expect(container.querySelector('[data-nav-route="dot"]')?.getAttribute('aria-disabled')).toBe('true');
    click(literal);
    expect(route(container)).toBe('literal');
  });

  it.each([
    ['history', '/portal/', '/portal/?utm_source=x'],
    ['history', '/', '/?x=1'],
    ['hash', '/', '/index.html#/'],
  ] as const)('opens the authored entry in %s mode at %s for %s when no root route exists', (mode, basePath, url) => {
    address(url);
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ mode,
        basePath }} />);
    expect(route(container)).toBe('home');
  });

  it('keeps route, parameters, section and focus when the hash changes to an in-page anchor', () => {
    address('/index.html#/forms/mi?slot=report&section=staff%20%26%20costs');
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ mode: "hash",
        renderDefinitionForm: workspace() }} />);
    const input = container.querySelector('input')!;
    input.focus();
    pop('/index.html#main-content', 'hashchange');
    expect(route(container)).toBe('form');
    expect(container.querySelector('[data-params]')?.textContent).toBe('{"state":"mi"}');
    expect(container.querySelector('article h2')?.textContent).toBe('staff & costs');
    expect(container.querySelector('input')).toBe(input);
    expect(document.activeElement).toBe(input);
    click(container.querySelector('header a')!);
    expect(route(container)).toBe('home');
  });

  it('focuses the route heading after navigation and Back, leaving first load and section focus alone', () => {
    address('/overview');
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ routeParams: { state: 'mi' },
        renderDefinitionForm: workspace() }} />);
    const main = container.querySelector('main')!;
    expect(main.contains(document.activeElement)).toBe(false);
    click(formLink(container));
    const title = main.querySelector('h1')!;
    expect(title.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(title);
    const input = container.querySelector('input')!;
    input.focus();
    pop('/forms/mi?slot=report&section=removed');
    expect(document.activeElement).toBe(input);
    pop('/overview');
    expect(document.activeElement).toBe(main.querySelector('h1'));
    expect(document.title).toBe('Overview – FY25 Filing');
  });

  it('focuses the main landmark when the new route has no heading', () => {
    address('/overview');
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ headingBaseLevel: 1,
        routeParams: { state: 'mi' } }} />);
    click(formLink(container));
    const main = container.querySelector('main')!;
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(main);
  });

  it('uses per-edition scopes, preserves native history and asks the writer before leaving', async () => {
    address('/forms/mi?edition=fy25');
    const beforeLeave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const adapters = { beforeLeave, renderDefinitionForm: workspace() };
    const editions = [
      { scope: 'fy25', bundle: bundle(), adapters, initialPath: '/overview' },
      { scope: 'fy28', bundle: bundle('FY28 Filing'), adapters, initialPath: '/start' },
    ] as const;
    const container = render(<BrowserSurfaceApp previewEditions={editions} adapters={{ mode: "history" }} />);
    const picker = container.querySelector<HTMLSelectElement>('select[data-surface-edition]')!;
    expect([...picker.options].map(option => option.textContent)).toEqual(['FY25 Filing', 'FY28 Filing']);
    expect(container.querySelector('[data-scope]')?.textContent).toBe('fy25');

    await act(async () => { select(picker, 'fy28'); });
    expect(route(container)).toBe('form');
    expect(picker.value).toBe('fy25');
    await act(async () => { select(picker, 'fy28'); });
    expect(route(container)).toBe('home');
    expect(window.location.pathname + window.location.search).toBe('/start?edition=fy28');
    expect(beforeLeave).toHaveBeenLastCalledWith(expect.objectContaining({ previewScope: 'fy25' }));
    pop('/forms/mi?edition=fy28');
    expect(container.querySelector('[data-scope]')?.textContent).toBe('fy28');
    pop('/forms/mi?edition=fy25');
    expect(container.querySelector('[data-scope]')?.textContent).toBe('fy25');
    expect(beforeLeave).toHaveBeenCalledTimes(2);
  });

  it('refuses preview draft storage scoped to a different edition', () => {
    address('/#/overview');
    const port = { load: vi.fn(), save: vi.fn(), readSummaries: vi.fn() };
    expect(() => render(<BrowserSurfaceApp previewEditions={[{
      scope: 'current', bundle: bundle(), initialPath: '/overview',
      adapters: { draftStorage: { scope: 'other', port } },
    }]} />)).toThrow('Preview edition and storage scopes must match.');
  });

  it('keeps the active draft when another preview edition is replaced', async () => {
    address('/#/forms/mi?edition=first');
    const load = vi.fn(async () => ({ status: 'absent' as const }));
    const first = {
      scope: 'first', bundle: bundle(), initialPath: '/overview',
      adapters: { draftStorage: { scope: 'first', port: { load, save: vi.fn(), readSummaries: vi.fn() } } },
    };
    const second = { scope: 'second', bundle: bundle('Second'), initialPath: '/start', adapters: {} };
    const replacement = { ...second, bundle: bundle('Replacement') };
    let replaceEdition!: () => void;
    function Host() {
      const [edition, setEdition] = useState(second);
      replaceEdition = () => setEdition(replacement);
      return <BrowserSurfaceApp previewEditions={[first, edition]} />;
    }
    const container = render(<Host />);
    await act(async () => {});
    const input = container.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'unsaved');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { replaceEdition(); });
    expect(container.querySelector('input')?.value).toBe('unsaved');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('negotiates an offered language, cascades shell and Definition copy, and falls back to the app default', () => {
    address('/forms/mi');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-CA']);
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{  }} />);
    expect(container.querySelector('label:has(select[data-surface-appearance])')?.textContent).toContain('Affichage');
    expect(container.querySelector('.formspec-container')?.textContent).toContain('Nom');

    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de', 'ja']);
    const fallback = render(<BrowserSurfaceApp bundle={bundle()} adapters={{  }} />);
    expect(fallback.querySelector('label:has(select[data-surface-appearance])')?.textContent).toContain('Display');
    expect(fallback.querySelector('.formspec-container')?.textContent).toContain('Name');
    expect(fallback.querySelector('.formspec-container')?.textContent).not.toContain('Name auf Deutsch');
  });

  it('shares one appearance across the form and chrome, and applies the current grant', () => {
    address('/forms/mi');
    const media = new EventTarget() as MediaQueryList;
    Object.defineProperty(media, 'matches', { value: true, writable: true });
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ platformTheme: {
      tokens: { 'color.primary': '#234567' },
    } as never }} />);
    const root = container.querySelector<HTMLElement>('.fs-surface-app')!;
    const form = container.querySelector('.formspec-container')!;
    const chooser = container.querySelector<HTMLSelectElement>('select[data-surface-appearance]')!;
    const assertAppearance = (scheme: 'dark' | 'light') => {
      expect(root.dataset.fsAppearance).toBe(scheme);
      expect(form.classList.contains(`formspec-appearance-${scheme}`)).toBe(true);
    };
    expect(chooser.value).toBe('system');
    assertAppearance('dark');
    select(chooser, 'light');
    assertAppearance('light');
    select(chooser, 'dark');
    assertAppearance('dark');
    select(chooser, 'system');
    Object.defineProperty(media, 'matches', { value: false });
    act(() => { media.dispatchEvent(new Event('change')); });
    assertAppearance('light');
    expect(root.style.getPropertyValue('--formspec-color-primary')).toBe('#123456');
    pop('/admin');
    expect(root.style.getPropertyValue('--formspec-color-primary')).toBe('#234567');
    expect(container.querySelector<HTMLElement>('article')?.style.getPropertyValue('--formspec-color-primary')).toBe('#234567');
    expect(document.documentElement.style.getPropertyValue('--formspec-color-primary')).toBe('');
    expect([...container.querySelectorAll('nav a')].map(link => link.textContent)).toEqual(['Administration']);
  });

  it('restores the selected appearance after a fresh mount and defaults to system for empty storage', () => {
    address('/forms/mi');
    const app = bundle();
    const picker = (container: HTMLElement) => container.querySelector<HTMLSelectElement>('[data-surface-appearance]')!;
    const first = render(<BrowserSurfaceApp bundle={app} adapters={{  }} />);
    expect(picker(first).value).toBe('system');
    select(picker(first), 'dark');
    expect(window.localStorage.getItem(appearanceKey)).toBe('dark');
    const reopened = render(<BrowserSurfaceApp bundle={app} adapters={{  }} />);
    expect(picker(reopened).value).toBe('dark');
    expect(reopened.querySelector('.formspec-container')?.classList.contains('formspec-appearance-dark')).toBe(true);
  });

  it('renders system appearance when storage is refused and still applies a new choice for this visit', () => {
    address('/forms/mi');
    const storage = vi.spyOn(window, 'localStorage', 'get').mockClear().mockImplementation(() => { throw new Error('Storage refused'); });
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{  }} />);
    const picker = container.querySelector<HTMLSelectElement>('[data-surface-appearance]')!;
    expect(picker.value).toBe('system');
    select(picker, 'dark');
    expect(container.querySelector('.fs-surface-app')?.getAttribute('data-fs-appearance')).toBe('dark');
    expect(storage).toHaveBeenCalledTimes(2);
  });

  it('uses the nearest host appearance for the shell and form while retaining the saved choice', async () => {
    address('/forms/mi');
    window.localStorage.setItem(appearanceKey, 'light');
    document.documentElement.setAttribute('data-fs-appearance', 'light');
    document.body.setAttribute('data-fs-appearance', 'dark');
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{  }} />);
    const shell = container.querySelector('.fs-surface-app')!;
    expect(shell.getAttribute('data-fs-appearance')).toBe('dark');
    expect(container.querySelector('.formspec-container')?.classList.contains('formspec-appearance-dark')).toBe(true);
    expect(container.querySelector('[data-surface-appearance]')).toBeNull();
    await act(async () => {
      document.body.removeAttribute('data-fs-appearance');
      // Happy DOM delivers MutationObserver callbacks in a timer task.
      await new Promise<void>(resolve => window.setTimeout(resolve));
    });
    expect(shell.getAttribute('data-fs-appearance')).toBe('light');
    expect(container.querySelector('[data-surface-appearance]')).toBeNull();
    await act(async () => {
      document.documentElement.removeAttribute('data-fs-appearance');
      await new Promise<void>(resolve => window.setTimeout(resolve));
    });
    expect(container.querySelector<HTMLSelectElement>('[data-surface-appearance]')?.value).toBe('light');
    expect(window.localStorage.getItem(appearanceKey)).toBe('light');
  });

  it('exports a pre-paint script that applies a saved choice and tolerates storage refusal', () => {
    const apply = new Function('window', 'document', SURFACE_APPEARANCE_SCRIPT);
    const html = document.documentElement;
    apply(window, document);
    expect(html.hasAttribute('data-fs-saved-appearance')).toBe(false);
    window.localStorage.setItem(appearanceKey, 'dark');
    apply(window, document);
    expect(html.getAttribute('data-fs-saved-appearance')).toBe('dark');
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Storage refused'); });
    expect(() => apply(window, document)).not.toThrow();
  });

  it('keeps typed edits when checkpointPorts gets a new function identity', async () => {
    address('/forms/mi');
    const app = bundle();
    const load = vi.fn(async () => ({ status: 'absent' as const }));
    const draftStorage = { scope: 'test', port: { load, save: vi.fn(), readSummaries: vi.fn() } };
    let rerender!: () => void;
    function Host() {
      const [, setGeneration] = useState(0);
      rerender = () => setGeneration(value => value + 1);
      return <BrowserSurfaceApp bundle={app} adapters={{ draftStorage,
        checkpointPorts: ({ ports }) => ports }} />;
    }
    const container = render(<Host />);
    await act(async () => {});
    const input = container.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'typed');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { rerender(); });
    expect(container.querySelector('input')).toBe(input);
    expect(input.value).toBe('typed');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('announces exactly one result when a Definition action invoker handles Save draft', async () => {
    address('/forms/mi');
    const componentDocument: ComponentDocument = {
      $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definitionUrl },
      tree: { component: 'ActionButton', actionRef: 'save', label: { literal: 'Save draft' } },
    };
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ definitionActionInvoker: ({ document, actionRef, nodeId, ports }) => invokeResponseAction(document, actionRef, ports, nodeId),
        renderDefinitionForm: input => renderDefaultDefinitionForm({ ...input, componentDocument }) }} />);
    const button = [...container.querySelectorAll('button')].find(el => el.textContent === 'Save draft')!;
    await act(async () => { click(button); });
    const notices = [...container.querySelectorAll('[role="status"], [aria-live="polite"]')]
      .map(el => el.textContent?.trim()).filter(Boolean);
    expect(notices).toHaveLength(1);
  });

  it('keeps one polite save region mounted as the route changes', () => {
    address('/forms/mi');
    const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ renderDefinitionForm: workspace() }} />);
    const live = container.querySelectorAll('[role="status"], [aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toBe('');
    click([...container.querySelectorAll('button')].find(el => el.textContent === 'Save completed')!);
    expect(live[0]?.textContent).toBe('Draft saved in this browser.');
    click(container.querySelector('header a')!);
    expect(route(container)).toBe('home');
    expect(container.querySelector('[role="status"]')).toBe(live[0]);
    expect(live[0]?.textContent).toBe('Draft saved in this browser.');
  });
});

it.each([['mi', 'page'], ['ny', null]])('marks the controlled link for %s current only when its parameters match', (state, current) => {
  const container = render(<SurfaceApp bundle={bundle()} location="/forms/m%69"
    routeParams={{ state, extra: 'ignored' }} onNavigate={() => {}} />);
  expect(formLink(container).getAttribute('aria-current')).toBe(current);
});

it('mounts using the supplied browser adapter settings', () => {
  address('/unrelated#/forms/mi');
  const container = render(<BrowserSurfaceApp bundle={bundle()} adapters={{ mode: 'hash' }} />);
  expect(route(container)).toBe('form');
});
