/** @filedesc Filing status reads and links operate through the maintained Surface app. */
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
import { dereferenceBundleExport, type FilingDraftObservation, type FilingStatusObservation, type FilingStatusReader } from '@formspec-org/surface';
import { BrowserSurfaceApp } from '../src/BrowserSurfaceApp.js';
import { SurfaceApp } from '../src/SurfaceApp.js';
import { render } from './render.js';

const counts = {
  total: 4, filled: 2, prefilled: 0, missing: 1, missingReadonly: 0, toFix: 1, toCheck: 2,
};
const definition = {
  $formspec: '1.0', url: 'urn:application', version: '1.0.0', title: 'Application', status: 'active',
  description: 'Enter your annual totals.',
  items: [{
    key: 'details', type: 'group', label: 'Details',
    children: [{ key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' }],
  }],
};
function filingBundle({ shadowApplication = false, version = '0.4', duplicate = false, reportSize = 1 } = {}) {
  const tracker = { id: 'filing-map', slotType: 'filing-status', binding: {
    groups: [{ id: 'annual', label: 'Annual filings', forms: [
      { routeRef: 'application', slotRef: 'form', hint: 'Keep your totals handy.',
        ...(shadowApplication ? { params: { unit: { value: 'north' } } } : {}) },
      { routeRef: 'renewal', slotRef: 'form' },
    ] }, { id: 'supporting', label: 'Supporting forms', forms: [
      { routeRef: 'report', slotRef: 'form' },
      ...(duplicate ? [{ routeRef: 'report', slotRef: 'form' }] : []),
    ] }],
  } };
  return dereferenceBundleExport({
    manifest: { $formspecBundle: '2.4', id: 'urn:filing-app', surfaces: [{ url: 'urn:surface' }],
      definitions: ['application', 'renewal', 'report'].map(name => ({ url: `urn:${name}`, version: '1.0.0' })) },
    documents: {
      'urn:surface': { $formspecSurface: version, id: 'app', entry: 'home',
        routes: [{ id: 'home', path: '/', slots: [tracker] },
          ...['application', 'renewal', 'report'].map(name => ({
            id: name, path: `/${name}`, routeClass: 'intake',
            ...(shadowApplication && name === 'application' ? {
              path: '/application/{unit}', params: [{ name: 'unit', type: 'string' }],
            } : {}),
            navigation: { visible: false, label: name },
            slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: `urn:${name}` } }],
          })),
          ...(shadowApplication ? [{ id: 'shadow', path: '/application/north', slots: [] }] : []),
        ] },
      'urn:application': definition,
      'urn:renewal': { ...definition, url: 'urn:renewal' },
      'urn:report': { ...definition, url: 'urn:report', items: [{ ...definition.items[0],
        children: Array.from({ length: reportSize }, (_, index) => ({ key: `answer${index}`, type: 'field', dataType: 'string' })),
      }] },
    },
  });
}

function draftResults(entries: [string, FilingDraftObservation][]): ReadonlyMap<string, FilingStatusObservation> {
  return new Map(entries.map(([key, draft]) => [key, { draft, filing: { status: 'none' } }]));
}

function mount(reader?: FilingStatusReader) {
  return render(<SurfaceApp bundle={filingBundle()} location="/" onNavigate={() => {}} readSummaries={reader} />);
}

it('renders an accessible task and section list with partial counts and independent findings', async () => {
  const read = vi.fn<FilingStatusReader>(async (queries) => draftResults([
    [queries[0]!.key, { status: 'current', form: { ...counts, ready: false }, sections: { details: counts } }],
    [queries[1]!.key, { status: 'absent' }],
    [queries[2]!.key, { status: 'unavailable' }],
  ]));
  const dom = mount(read);
  await act(async () => {});
  expect(dom.textContent).toContain('In progress');
  expect(read).toHaveBeenCalledTimes(1);
  const task = dom.querySelector('a[href="/application?slot=form"]')!;
  expect(task.textContent).toBe('application');
  const status = task.getAttribute('aria-describedby')!;
  expect(dom.querySelector(`[id="${status}"]`)?.textContent).toBe('In progress');
  const row = task.closest('li')!;
  const [form, sections, progress] = row.children;
  expect(form?.textContent).toBe('applicationEnter your annual totals.Keep your totals handy.');
  expect(progress?.querySelector(`[id="${status}"]`)?.textContent).toBe('In progress');
  expect(progress?.textContent).toContain('2 of 4 answered');
  const strip = row.querySelector('[aria-hidden="true"]')!;
  expect(strip).not.toBeNull();
  expect(strip.hasAttribute('tabindex')).toBe(false);
  const segment = strip.querySelector('a[href="/application?slot=form&section=details"]');
  expect(segment?.getAttribute('tabindex')).toBe('-1');
  expect(segment?.getAttribute('title')).toBe('Details: 2 of 4 answered, 1 to fix, 2 to check');
  expect(strip.querySelector('[data-finding="fix"]')).not.toBeNull();
  expect(strip.querySelector('[data-finding="check"]')).toBeNull();
  const disclosure = sections?.querySelector('details');
  expect(disclosure?.hasAttribute('open')).toBe(false);
  // Include the form label so equal counts still identify distinct disclosures.
  expect(disclosure?.querySelector('summary')?.textContent).toBe('Sections (1) application');
  const section = disclosure?.querySelector('ul li a[href="/application?slot=form&section=details"]')!;
  expect(section.textContent).toContain('Details');
  expect(section.querySelector('.fs-surface-visually-hidden')?.textContent).toMatch(/2 of 4 answered.*1 to fix.*2 to check/i);
  const totals = dom.querySelector('.fs-surface-filing__totals dl');
  expect([...totals!.querySelectorAll('dt, dd')].map(node => node.textContent)).toEqual([
    'Answered', '2 of 5', 'To fix', '1', 'To check', '2',
  ]);
  expect(totals?.parentElement?.textContent).toContain('Some progress is unavailable');
  expect(dom.querySelector('.fs-surface-filing__legend')?.textContent).toMatch(/Answered.*Still to answer.*Has something to fix.*Has something to check/);
  expect(dom.querySelector('.fs-surface-filing__legend + p')?.textContent)
    .toBe('Each strip is one form, cut into its sections. Longer strips are bigger forms.');
  expect(dom.textContent?.match(/Not started/g)).toHaveLength(1);
  expect(dom.textContent).toContain('Not started, 1 question');
  expect(dom.textContent?.match(/Progress unavailable/g)).toHaveLength(1);
  expect(dom.querySelector('[aria-live], [role="status"]')?.textContent ?? '').not.toMatch(/of 4/);
});

it('keeps authored links when no read can confirm a draft or count', () => {
  const dom = mount();
  expect(dom.querySelector('a[href="/application?slot=form&section=details"]')).not.toBeNull();
  expect(dom.textContent).toContain('Progress unavailable');
  expect(dom.textContent).not.toContain('Not started');
});

it('keeps very small forms at eight percent of the strip width', () => {
  const dom = render(<SurfaceApp bundle={filingBundle({ reportSize: 200 })} location="/" onNavigate={() => {}} />);
  const strips = [...dom.querySelectorAll<HTMLElement>('.fs-surface-filing__strip')];
  expect(strips.map(strip => strip.style.inlineSize)).toEqual(['8%', '8%', '100%']);
});

it('keeps denied and stale results distinct from confirmed absence', async () => {
  const read: FilingStatusReader = async queries => draftResults([
    [queries[0]!.key, { status: 'denied' }],
    [queries[1]!.key, { status: 'stale' }],
  ]);
  const dom = mount(read);
  expect(dom.textContent).toContain('Loading progress');
  await act(async () => {});
  expect(dom.textContent).toContain('Progress access denied');
  expect(dom.textContent).toContain('Progress is out of date');
  expect(dom.textContent).toContain('Progress unavailable');
  expect(dom.textContent).not.toContain('Not started');
  expect(dom.textContent).not.toMatch(/\d of \d/);
});

it('opens a tracker section through the maintained hash navigation', () => {
  window.history.replaceState(null, '', '/preview/index.html#/');
  const renderForm = vi.fn(input => <output data-active-section>{input.activeSection}</output>);
  const dom = render(<BrowserSurfaceApp bundle={filingBundle()} adapters={{ mode: "hash",
        renderDefinitionForm: renderForm }} />);
  const href = '#/application?slot=form&section=details';
  const link = dom.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!;
  expect(link).not.toBeNull();
  expect(renderForm).not.toHaveBeenCalled();
  act(() => link.click());
  expect(window.location.hash).toBe(href);
  expect(dom.querySelector('[data-active-section]')?.textContent).toBe('details');
  window.history.replaceState(null, '', '/');
});

it('shows available counts without inferring whether a draft is ready', async () => {
  const dom = mount(async queries => draftResults([
    [queries[0]!.key, { status: 'current', form: { ...counts, filled: 4, ready: null, toFix: null, toCheck: null }, sections: {} }],
    [queries[1]!.key, { status: 'current', form: { ...counts, filled: 4, ready: true, toFix: 0, toCheck: 0 }, sections: {} }],
  ]));
  await act(async () => {});
  const rows = dom.querySelectorAll('.fs-surface-filing__row');
  expect(rows[0]!.textContent).toContain('Readiness unavailable');
  expect(rows[0]!.textContent).toContain('4 of 4 answered');
  expect(rows[0]!.textContent).not.toContain('In progress');
  expect(rows[1]!.textContent).toContain('Ready');
});

it('uses the same admitted Component for tracker sections and the form', () => {
  window.history.replaceState(null, '', '/preview/index.html#/');
  const component = {
    $formspecComponent: '1.0' as const,
    version: '1.0.0',
    targetDefinition: { url: definition.url },
    tree: { component: 'Stack', children: [{
      component: 'Section', id: 'component-section', title: 'Component section',
      children: [{ component: 'NumberInput', bind: 'details.amount' }],
    }] },
  };
  const renderForm = vi.fn(() => <output>Form mounted</output>);
  const dom = render(<BrowserSurfaceApp bundle={filingBundle()} adapters={{ mode: "hash",
        renderDefinitionForm: renderForm,
        resolveDefinitionComponent: ({ definition: target }) => target.url === definition.url ? component : undefined }} />);
  const link = dom.querySelector<HTMLAnchorElement>('details a[href="#/application?slot=form&section=component-section"]')!;
  expect(link?.textContent).toBe('Component section');
  expect(dom.querySelector('a[href="#/application?slot=form&section=details"]')).toBeNull();
  act(() => link.click());
  expect(renderForm).toHaveBeenCalledWith(expect.objectContaining({
    componentDocument: component, activeSection: 'component-section',
  }));
  window.history.replaceState(null, '', '/');
});

it('disables unreachable forms and missing Definitions while reading the remaining row', async () => {
  const read = vi.fn<FilingStatusReader>(async () => new Map());
  const resolved = filingBundle({ shadowApplication: true });
  const definitions = new Map(resolved.definitions);
  definitions.delete('urn:renewal');
  const bundle = { ...resolved, definitions };
  const dom = render(<SurfaceApp bundle={bundle} location="/" onNavigate={() => {}} readSummaries={read} />);
  await act(async () => {});
  const rows = dom.querySelectorAll('.fs-surface-filing__row');
  for (const [index, label, reason] of [[0, 'application', 'Form address unavailable'], [1, 'renewal', 'Form definition unavailable']] as const) {
    const row = rows[index]!;
    const disabled = row.querySelector('[role="link"][aria-disabled="true"]');
    expect(disabled?.textContent).toBe(label);
    expect(row.querySelector(`[id="${disabled?.getAttribute('aria-describedby')}"]`)?.textContent).toBe(reason);
    expect(row.querySelector('a')).toBeNull();
  }
  expect(rows[2]!.querySelector('a')?.textContent).toBe('report');
  expect(read).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ definitionUrl: 'urn:report' })], expect.anything());
});

it.each([['old dialect', { version: '0.3' }, 'surface-version-unsupported'], ['duplicate target', { duplicate: true }, 'duplicate-target']] as const)(
  'refuses the tracker for %s', async (_case, options, reason) => {
    const read = vi.fn<FilingStatusReader>(async () => new Map());
    const onDiagnostics = vi.fn();
    const dom = render(<SurfaceApp bundle={filingBundle(options)} location="/" onNavigate={() => {}}
      readSummaries={read} onDiagnostics={onDiagnostics} />);
    await act(async () => {});
    expect(dom.querySelector('[data-slot-type="filing-status"]')?.textContent).toBe('Progress unavailable');
    expect(onDiagnostics).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ details: { reason } })]));
    expect(read).not.toHaveBeenCalled();
  },
);

it('uses the active app and Definition Locales for tracker text', async () => {
  await initFormspecEngine();
  window.history.replaceState(null, '', '/preview/index.html#/');
  const dom = render(<BrowserSurfaceApp bundle={filingBundle()} adapters={{ mode: "hash",
        localeDocuments: [
    { $formspecLocale: '2.1', locale: 'fr', version: '1.0.0', target: { kind: 'definition', url: definition.url },
      strings: { 'details.label': 'Renseignements', '$form.description': 'Saisissez les totaux annuels.' } },
    { $formspecLocale: '2.1', locale: 'fr', version: '1.0.0', target: { kind: 'app', url: 'urn:filing-app' },
      strings: {
        '$module.x-formspec-surface.shell.filingLegendCaption': 'Chaque bande représente un formulaire.',
        '$module.x-formspec-surface.shell.filingSections': 'Rubriques ({{$count}})',
      } },
  ] }} />);
  const application = dom.querySelector('details a[href="#/application?slot=form&section=details"]');
  const report = dom.querySelector('details a[href="#/report?slot=form&section=details"]');
  expect(application?.textContent).toBe('Renseignements');
  expect(report?.textContent).toBe('Details');
  expect(dom.querySelector('.fs-surface-filing__legend + p')?.textContent).toBe('Chaque bande représente un formulaire.');
  // Keep the localized count and the form-specific accessible name together.
  expect(application?.closest('details')?.querySelector('summary')?.textContent).toBe('Rubriques (1) application');
  expect(application?.closest('.fs-surface-filing__row')?.textContent).toContain('Saisissez les totaux annuels.');
  window.history.replaceState(null, '', '/');
});


it('keeps the receipt and Filed state visible during a review outage', async () => {
  const dom = mount(async ([query]) => new Map([[query!.key, {
    draft: { status: 'absent' },
    filing: { status: 'filed', receiptRef: 'urn:response:sample', responseHash: 'sha256:' + '0'.repeat(64),
      review: 'unavailable', comments: [], sample: 'fixture' },
  }]]));
  await act(async () => {});
  const row = dom.querySelector('.fs-surface-filing__row')!;
  expect(row.textContent).toContain('Filed');
  expect(row.textContent).toContain('Receipt reference: urn:response:sample');
  expect(row.textContent).toContain('Sample filing');
  expect(row.textContent).toContain('Review status unavailable');
  expect(row.textContent).not.toContain('Not started');
});

it('keeps overview totals complete when a filing has no current draft', async () => {
  const dom = mount(async ([first, second, third]) => new Map<string, FilingStatusObservation>([
    [first!.key, { draft: { status: 'current', form: { ...counts, ready: false }, sections: {} }, filing: { status: 'none' } }],
    [second!.key, { draft: { status: 'absent' }, filing: { status: 'filed', review: 'available',
      receiptRef: 'urn:filing', responseHash: 'sha256:' + 'a'.repeat(64), comments: [] } }],
    [third!.key, { draft: { status: 'absent' }, filing: { status: 'none' } }],
  ]));
  await act(async () => {});
  expect(dom.querySelector('.fs-surface-filing__totals')?.textContent).toContain('Answered2 of 5');
  expect(dom.querySelector('.fs-surface-filing__totals')?.textContent).not.toContain('Some progress is unavailable');
});
