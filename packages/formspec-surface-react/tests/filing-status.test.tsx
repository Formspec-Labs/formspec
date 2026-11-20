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

function periodOverviewBundle() {
  const planDef = {
    ...definition,
    url: 'urn:period-plan',
    title: 'Period Plan',
    subject: {
      type: 'urn:period-plan',
      keys: { first_ffy: { dataType: 'integer' }, last_ffy: { dataType: 'integer' } },
    },
  };
  const annualDef = {
    ...definition,
    url: 'urn:annual-report',
    title: 'Annual Report',
    subject: { type: 'urn:annual-report', keys: { ffy: { dataType: 'integer' } } },
  };
  return dereferenceBundleExport({
    manifest: {
      $formspecBundle: '2.4', id: 'urn:period-app', surfaces: [{ url: 'urn:surface' }],
      definitions: [{ url: planDef.url, version: '1.0.0' }, { url: annualDef.url, version: '1.0.0' }],
    },
    documents: {
      'urn:surface': {
        $formspecSurface: '0.4', id: 'app', entry: 'overview',
        routes: [
          {
            id: 'overview', path: '/years/{ffy}', params: [{ name: 'ffy', type: 'string' }],
            slots: [{
              id: 'filing-map', slotType: 'filing-status',
              binding: {
                groups: [
                  {
                    id: 'plan', label: 'Period plan',
                    forms: [{
                      routeRef: 'plan', slotRef: 'form',
                      subject: [
                        { key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' } },
                        { key: 'last_ffy', op: 'ge', from: { routeParam: 'ffy' } },
                      ],
                    }],
                  },
                  {
                    id: 'annual', label: 'Annual report',
                    forms: [{ routeRef: 'annual', slotRef: 'form', params: { ffy: { routeParam: 'ffy' } } }],
                  },
                ],
              },
            }],
          },
          {
            id: 'plan', path: '/plans/{first_ffy}/{last_ffy}', routeClass: 'intake',
            params: [{ name: 'first_ffy', type: 'string' }, { name: 'last_ffy', type: 'string' }],
            navigation: { visible: false, label: 'Period plan' },
            slots: [{
              id: 'form', slotType: 'definition-form',
              binding: { definitionRef: planDef.url, subjectKeys: { first_ffy: 'first_ffy', last_ffy: 'last_ffy' } },
            }],
          },
          {
            id: 'annual', path: '/years/{ffy}/annual', routeClass: 'intake',
            params: [{ name: 'ffy', type: 'string' }],
            navigation: { visible: false, label: 'Annual report' },
            slots: [{
              id: 'form', slotType: 'definition-form',
              binding: { definitionRef: annualDef.url, subjectKeys: { ffy: 'ffy' } },
            }],
          },
        ],
      },
      [planDef.url]: planDef,
      [annualDef.url]: annualDef,
    },
  });
}

it('links a year-scoped overview entry to the matched multi-year plan unit and handles unmatched or ambiguous units', async () => {
  const bundle = periodOverviewBundle();
  const navigate = vi.fn();
  const hash = ('sha256:' + 'b'.repeat(64)) as `sha256:${string}`;

  const matchedDom = render(<SurfaceApp
    bundle={bundle}
    location="/years/2025"
    onNavigate={navigate}
    readSummaries={async (queries) => new Map(queries.map(query => query.subjectMatch ? [query.key, {
      subject: { type: 'urn:period-plan', keys: { first_ffy: 2024, last_ffy: 2026 } },
      subjectMatch: 'matched' as const,
      draft: { status: 'current' as const, form: { ...counts, ready: false }, sections: { details: counts } },
      filing: { status: 'returned' as const, receiptRef: 'urn:plan:2024-2026', responseHash: hash, review: 'available' as const, comments: ['Update budget'] },
    }] : [query.key, { draft: { status: 'absent' as const }, filing: { status: 'none' as const } }]))}
  />);
  await act(async () => {});
  const planLink = matchedDom.querySelector<HTMLAnchorElement>('a[href="/plans/2024/2026?slot=form"]');
  expect(planLink?.textContent).toBe('Period plan');
  const sectionLink = matchedDom.querySelector<HTMLAnchorElement>('details a[href="/plans/2024/2026?slot=form&section=details"]');
  expect(sectionLink).not.toBeNull();
  const planRow = planLink!.closest('.fs-surface-filing__row')!;
  expect(planRow.textContent).toContain('Returned');
  expect(planRow.textContent).toContain('In progress');
  expect(planRow.textContent).toContain('Update budget');
  act(() => planLink!.click());
  expect(navigate).toHaveBeenCalledWith('/plans/2024/2026?slot=form');

  for (const subjectMatch of ['none', 'ambiguous'] as const) {
    const unmatchedDom = render(<SurfaceApp
      bundle={bundle}
      location="/years/2025"
      onNavigate={() => {}}
      readSummaries={async (queries) => new Map(queries.map(query => query.subjectMatch ? [query.key, {
        subjectMatch,
        draft: subjectMatch === 'none' ? { status: 'absent' as const } : { status: 'unavailable' as const },
        filing: subjectMatch === 'none' ? { status: 'none' as const } : { status: 'unavailable' as const },
      }] : [query.key, { draft: { status: 'absent' as const }, filing: { status: 'none' as const } }]))}
    />);
    await act(async () => {});
    const rows = unmatchedDom.querySelectorAll('.fs-surface-filing__row');
    const disabled = rows[0]!.querySelector('[role="link"][aria-disabled="true"]');
    expect(disabled?.textContent).toBe('Period plan');
    expect(rows[0]!.querySelector('a')).toBeNull();
    expect(rows[0]!.querySelector(`[id="${disabled?.getAttribute('aria-describedby')}"]`)?.textContent)
      .toBe('Filing unit unavailable');
    expect(rows[1]!.querySelector('a[href="/years/2025/annual?slot=form"]')).not.toBeNull();
  }
});

it.each([0, 1])('counts one flat question for unsectioned group %i without generating section links', async (groupIndex) => {
  const bundle = periodOverviewBundle();
  const tracker = bundle.surfaces[0]!.routes[0]!.slots[0]!.binding as { groups: unknown[] };
  tracker.groups = [tracker.groups[groupIndex]];
  const def = bundle.definitions.get(groupIndex === 0 ? 'urn:period-plan' : 'urn:annual-report')!;
  def.items = [{ key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' }];
  const dom = render(<SurfaceApp
    bundle={bundle}
    location="/years/2025"
    onNavigate={() => {}}
    readSummaries={async (queries) => new Map(queries.map(query => [
      query.key,
      {
        ...(query.subjectMatch
          ? { subjectMatch: 'matched' as const, subject: { type: 'urn:period-plan', keys: { first_ffy: 2024, last_ffy: 2026 } } }
          : {}),
        draft: { status: 'absent' as const },
        filing: { status: 'none' as const },
      },
    ]))}
  />);
  await act(async () => {});
  expect(dom.querySelector('.fs-surface-filing__row a')).not.toBeNull();
  expect(dom.querySelectorAll('a[href*="section="]')).toHaveLength(0);
  expect(dom.querySelector('.fs-surface-filing__totals dd')?.textContent).toBe('0 of 1');
});

it('requires confirmed matched subject on range rows, verifies decoded URL params, and refuses colliding resolved units across groups or roster members', async () => {
  const match = {
    subjectMatch: 'matched' as const,
    subject: { type: 'urn:period-plan', keys: { first_ffy: 2024, last_ffy: 2026 } },
  };
  const absent = { draft: { status: 'absent' as const }, filing: { status: 'none' as const } };
  const hash = ('sha256:' + 'a'.repeat(64)) as `sha256:${string}`;
  const mountRange = async (bundle: ReturnType<typeof periodOverviewBundle>, observation: FilingStatusObservation) => {
    const dom = render(<SurfaceApp
      bundle={bundle}
      location="/years/2025"
      onNavigate={() => {}}
      readSummaries={async qs => new Map(qs.map(q => [q.key, q.subjectMatch ? observation : absent]))}
    />);
    await act(async () => {});
    return dom;
  };

  // Matched absent draft + filing renders Not started with an active link; exact-only or unconfirmed reader observations do not.
  const matchedAbsentDom = await mountRange(periodOverviewBundle(), { ...match, ...absent });
  expect(matchedAbsentDom.querySelector('a[href="/plans/2024/2026?slot=form"]')?.closest('li')?.textContent).toContain('Not started');

  const unconfirmedAbsentDom = await mountRange(periodOverviewBundle(), absent);
  expect(unconfirmedAbsentDom.querySelector('.fs-surface-filing__row')?.textContent).not.toContain('Not started');
  expect(unconfirmedAbsentDom.querySelector('a[href="/plans/2024/2026?slot=form"]')).toBeNull();

  const bareSubjectDom = await mountRange(periodOverviewBundle(), {
    subject: match.subject,
    draft: { status: 'current', form: { ...counts, ready: true }, sections: {} },
    filing: { status: 'filed', receiptRef: 'urn:leak', responseHash: hash, review: 'available', comments: ['Leaked comment'] },
  });
  expect(bareSubjectDom.querySelector('a[href="/plans/2024/2026?slot=form"]')).toBeNull();
  expect(bareSubjectDom.textContent).not.toContain('urn:leak');
  expect(bareSubjectDom.textContent).not.toContain('Leaked comment');

  // All 5 completed filing statuses render with active links when matched.
  const statusLabels = {
    filed: 'Filed',
    accepted: 'Accepted',
    returned: 'Returned',
    reopened: 'Reopened',
    'closed-without-acceptance': 'Closed without acceptance',
  } as const;
  for (const [status, expectedLabel] of Object.entries(statusLabels) as [keyof typeof statusLabels, string][]) {
    const dom = await mountRange(periodOverviewBundle(), {
      ...match,
      draft: { status: 'absent' },
      filing: { status, receiptRef: 'urn:receipt:test', responseHash: hash, review: 'available', comments: [] },
    });
    expect(dom.querySelector('a[href="/plans/2024/2026?slot=form"]')?.closest('li')?.textContent).toContain(expectedLabel);
  }

  // Destination URL missing a subject parameter marker fails decoded URL subject round-trip.
  const truncatedPathBundle = periodOverviewBundle();
  (truncatedPathBundle.surfaces[0]!.routes[1] as { path: string }).path = '/plans/{first_ffy}';
  const truncatedDom = await mountRange(truncatedPathBundle, { ...match, ...absent });
  expect(truncatedDom.querySelector('a[href="/plans/2024?slot=form"]')).toBeNull();

  // Two distinct queries resolving to one final (route, slot, params) tuple are refused.
  const duplicateQueryBundle = periodOverviewBundle();
  const groups = (duplicateQueryBundle.surfaces[0]!.routes[0]!.slots[0]!.binding as { groups: any[] }).groups;
  const extra = structuredClone(groups[0]);
  extra.id = 'another-period';
  extra.forms[0].subject.forEach((p: any) => { p.from = { value: '2024' }; });
  groups.push(extra);
  const duplicateQueryDom = await mountRange(duplicateQueryBundle, { ...match, ...absent });
  expect(duplicateQueryDom.querySelectorAll('a[href="/plans/2024/2026?slot=form"]').length).toBe(0);

  // Conflicting matched subjects across forms in one group disable the entire group rather than leaving the first form clickable.
  const conflictingGroupBundle = periodOverviewBundle();
  const budgetDef = structuredClone(conflictingGroupBundle.definitions.get('urn:period-plan')!);
  (budgetDef as { url: string }).url = 'urn:period-budget';
  (conflictingGroupBundle.definitions as Map<string, typeof budgetDef>).set('urn:period-budget', budgetDef);
  (conflictingGroupBundle.surfaces[0]!.routes[1]!.slots as any[]).push({
    ...structuredClone(conflictingGroupBundle.surfaces[0]!.routes[1]!.slots[0]!),
    id: 'second',
    binding: { definitionRef: 'urn:period-budget', subjectKeys: { first_ffy: 'first_ffy', last_ffy: 'last_ffy' } },
  });
  const firstGroupForms = (conflictingGroupBundle.surfaces[0]!.routes[0]!.slots[0]!.binding as { groups: any[] }).groups[0].forms;
  firstGroupForms.push({ ...structuredClone(firstGroupForms[0]), slotRef: 'second' });
  const conflictDom = render(<SurfaceApp
    bundle={conflictingGroupBundle}
    location="/years/2025"
    onNavigate={() => {}}
    readSummaries={async qs => new Map(qs.map(q => {
      if (!q.subjectMatch) return [q.key, absent];
      const start = q.definitionUrl === 'urn:period-plan' ? 2024 : 2025;
      return [q.key, {
        subjectMatch: 'matched' as const,
        subject: { type: 'urn:period-plan', keys: { first_ffy: start, last_ffy: start + 2 } },
        ...absent,
      }];
    }))}
  />);
  await act(async () => {});
  expect(conflictDom.querySelectorAll('a[href^="/plans/"]').length).toBe(0);

  // Roster members whose distinct search years resolve to one covering period are refused, while distinct periods list waiting members.
  const rosterSource = {
    id: 'response:members', kind: 'definition-response' as const, owner: 'host' as const, definitionRef: 'urn:directory',
    scope: 'route' as const, availability: { level: 'app' as const },
    schema: { type: 'object', properties: { units: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, id: { type: 'integer' } } } } } },
    runtime: { delivery: 'draft' as const, authorizationBoundary: 'host' as const, failureMode: 'block-render' as const,
      cache: { mode: 'draft' as const }, provenance: { kind: 'definition-response' as const, source: 'urn:directory' } },
  };
  const rosterBundle = dereferenceBundleExport({
    manifest: { $formspecBundle: '2.4', id: 'urn:roster-app', surfaces: [{ url: 'urn:surface' }],
      definitions: [{ url: 'urn:report' }, { url: 'urn:directory' }], dataSources: [{ url: 'urn:roster' }] },
    documents: {
      'urn:roster': { $formspecDataSources: '1.0', id: 'urn:roster', version: '1.0.0', sources: [rosterSource] },
      'urn:report': { $formspec: '1.0', url: 'urn:report', version: '1.0.0', title: 'Report',
        items: [{ key: 'count', type: 'field', dataType: 'integer' }],
        subject: { type: 'urn:unit', keys: { start: { dataType: 'integer' }, end: { dataType: 'integer' } } } },
      'urn:directory': { $formspec: '1.0', url: 'urn:directory', version: '1.0.0', title: 'Directory', items: [
        { key: 'units', type: 'group', repeatable: true, children: [
          { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
          { key: 'id', type: 'field', dataType: 'string', label: 'Unit identifier' },
        ] },
      ] },
      'urn:surface': { $formspecSurface: '0.4', id: 'app', entry: 'home', routes: [
        { id: 'home', path: '/', slots: [{ id: 'tracker', slotType: 'filing-status', binding: { groups: [
          { id: 'directory', label: 'Directory', forms: [{ routeRef: 'directory', slotRef: 'form' }] },
          { id: 'reports', label: 'Unit reports', repeat: {
            catalogRef: 'urn:roster', sourceRef: 'response:members', rowsField: 'units', labelField: 'name', waitingLabel: 'Waiting for',
          }, forms: [{ routeRef: 'report', slotRef: 'form', subject: [
            { key: 'start', op: 'le', from: { rowField: 'id' } },
            { key: 'end', op: 'ge', from: { rowField: 'id' } },
          ] }] },
        ] } }] },
        { id: 'directory', path: '/directory', slots: [
          { id: 'form', slotType: 'definition-form', binding: { definitionRef: 'urn:directory' } },
        ] },
        { id: 'report', path: '/report/{start}/{end}', params: [{ name: 'start', type: 'string' }, { name: 'end', type: 'string' }], slots: [
          { id: 'form', slotType: 'definition-form', binding: { definitionRef: 'urn:report', subjectKeys: { start: 'start', end: 'end' } } },
        ] },
      ] },
    },
  });
  const visitRoster = async (years: number[]) => {
    const dom = render(<SurfaceApp
      bundle={rosterBundle}
      location="/"
      onNavigate={() => {}}
      readSummaries={async qs => new Map(qs.map(q => {
        if (!q.subjectMatch) return [q.key, absent];
        const year = Number(q.subjectMatch.predicates[0]!.value);
        const start = year <= 2026 ? 2024 : 2027;
        return [q.key, {
          subjectMatch: 'matched' as const,
          subject: { type: 'urn:unit', keys: { start, end: start + 2 } },
          draft: { status: 'current' as const, form: { total: 1, filled: 1, ready: true, toFix: 0, toCheck: 0 }, sections: {} },
          filing: { status: 'none' as const },
        }];
      }))}
      dataSourceLoader={async () => ({ status: 'loaded', freshness: 'fresh', value: { units: years.map(id => ({ name: String(id), id })) } })}
      validateDataSourcePayload={() => ({ valid: true })}
      authorizeDataSource={() => ({ status: 'authorized' })}
    />);
    await act(async () => {});
    return dom;
  };
  const distinctRosterDom = await visitRoster([2024, 2027]);
  expect([...distinctRosterDom.querySelectorAll('[data-state="waiting-on-named-members"] li')].map(item => item.textContent)).toEqual(['2024', '2027']);
  expect(distinctRosterDom.querySelectorAll('a[href="/report/2024/2026?slot=form"]').length).toBe(1);

  const collidingRosterDom = await visitRoster([2024, 2025]);
  expect(collidingRosterDom.querySelectorAll('a[href="/report/2024/2026?slot=form"]').length).toBe(0);

  // Explicit denial on a confirmed matched range observation disables the row and suppresses links, receipts, comments, and counts.
  const deniedDraftObservation: FilingStatusObservation = {
    // @ts-expect-error matched observations cannot carry denied draft status
    subjectMatch: 'matched',
    subject: match.subject,
    draft: { status: 'denied' },
    filing: { status: 'filed', receiptRef: 'urn:denied:leak', responseHash: hash, review: 'available', comments: ['Denied leak'] },
  };
  const deniedFilingObservation: FilingStatusObservation = {
    // @ts-expect-error matched observations cannot carry denied filing status
    subjectMatch: 'matched',
    subject: match.subject,
    draft: { status: 'current', form: { ...counts, ready: true }, sections: {} },
    filing: { status: 'denied' },
  };
  for (const deniedObs of [deniedDraftObservation, deniedFilingObservation]) {
    const deniedDom = await mountRange(periodOverviewBundle(), deniedObs);
    expect(deniedDom.querySelector('a[href="/plans/2024/2026?slot=form"]')).toBeNull();
    const firstRow = deniedDom.querySelector('.fs-surface-filing__row')!;
    expect(firstRow.querySelector('[role="link"][aria-disabled="true"]')).not.toBeNull();
    expect(deniedDom.textContent).not.toContain('urn:denied:leak');
    expect(deniedDom.textContent).not.toContain('Denied leak');
    expect(deniedDom.textContent).not.toContain('2 of 4 answered');
  }

  // Two distinct routes to the same one-question filing with different Component section layouts count once in totals (0 of 1).
  const dualLayoutBundle = periodOverviewBundle();
  const planRoute = dualLayoutBundle.surfaces[0]!.routes[1]!;
  (dualLayoutBundle.surfaces[0]!.routes as any[]).push({
    ...structuredClone(planRoute),
    id: 'plan-alt',
    path: '/plans-alt/{first_ffy}/{last_ffy}',
  });
  (dualLayoutBundle.surfaces[0]!.routes[0]!.slots[0]!.binding as { groups: any[] }).groups = [{
    id: 'plan', label: 'Period plan',
    forms: [
      {
        routeRef: 'plan', slotRef: 'form',
        subject: [
          { key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' } },
          { key: 'last_ffy', op: 'ge', from: { routeParam: 'ffy' } },
        ],
      },
      {
        routeRef: 'plan-alt', slotRef: 'form',
        subject: [
          { key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' } },
          { key: 'last_ffy', op: 'ge', from: { routeParam: 'ffy' } },
        ],
      },
    ],
  }];
  const layoutComponent = (sectionId: string) => ({
    $formspecComponent: '1.0' as const,
    version: '1.0.0',
    targetDefinition: { url: 'urn:period-plan' },
    tree: {
      component: 'Stack',
      children: [{
        component: 'Section', id: sectionId, title: sectionId,
        children: [{ component: 'NumberInput', bind: 'details.amount' }],
      }],
    },
  });
  const seenSections: unknown[] = [];
  const dualLayoutDom = render(<SurfaceApp
    bundle={dualLayoutBundle}
    location="/years/2025"
    onNavigate={() => {}}
    resolveDefinitionComponent={({ routeId }) =>
      routeId === 'plan' ? layoutComponent('section-a') : layoutComponent('section-b')}
    readSummaries={async qs => {
      seenSections.push(...qs.map(q => q.sections));
      return new Map(qs.map(q => [q.key, { ...match, ...absent }]));
    }}
  />);
  await act(async () => {});
  expect(seenSections.length).toBe(2);
  expect(seenSections[0]).not.toEqual(seenSections[1]);
  expect(dualLayoutDom.querySelector('a[href="/plans/2024/2026?slot=form"]')).not.toBeNull();
  expect(dualLayoutDom.querySelector('a[href="/plans-alt/2024/2026?slot=form"]')).not.toBeNull();
  expect(dualLayoutDom.querySelector('.fs-surface-filing__totals dd')?.textContent).toBe('0 of 1');

  // Saved draft across two section layouts reports 1 of 1 in totals regardless of whether stale or current layout comes first.
  for (const savedFirst of [true, false]) {
    const orderedBundle = structuredClone(dualLayoutBundle);
    if (!savedFirst) {
      const forms = (orderedBundle.surfaces[0]!.routes[0]!.slots[0]!.binding as { groups: { forms: any[] }[] }).groups[0]!.forms;
      forms.reverse();
    }
    const readStates: string[] = [];
    const orderedDom = render(<SurfaceApp
      bundle={orderedBundle}
      location="/years/2025"
      onNavigate={() => {}}
      resolveDefinitionComponent={({ routeId }) =>
        routeId === 'plan' ? layoutComponent('section-a') : layoutComponent('section-b')}
      readSummaries={async qs => new Map(qs.map(q => {
        const isCurrent = q.sections[0]?.id === 'section-a';
        readStates.push(isCurrent ? 'current' : 'stale');
        return [q.key, {
          ...match,
          draft: isCurrent
            ? { status: 'current' as const, form: { total: 1, filled: 1, prefilled: 0, missing: 0, missingReadonly: 0, toFix: 0, toCheck: 0, ready: true }, sections: {} }
            : { status: 'stale' as const },
          filing: { status: 'none' as const },
        }];
      }))}
    />);
    await act(async () => {});
    expect(readStates).toEqual(savedFirst ? ['current', 'stale'] : ['stale', 'current']);
    expect(orderedDom.querySelector('.fs-surface-filing__totals dd')?.textContent, `savedFirst=${savedFirst}`).toBe('1 of 1');
  }

  // An untouched two-question unit across unequal layouts counts distinct authored field templates regardless of route order (0 of 2).
  for (const mode of ['subset', 'disjoint'] as const) {
    for (const largerFirst of [true, false]) {
      const multiFieldBundle = structuredClone(dualLayoutBundle);
      const planDef = multiFieldBundle.definitions.get('urn:period-plan')!;
      const detailsGroup = planDef.items[0] as { children: unknown[] };
      detailsGroup.children.push({ key: 'second', type: 'field', label: 'Second', dataType: 'integer' });
      if (!largerFirst) {
        const forms = (multiFieldBundle.surfaces[0]!.routes[0]!.slots[0]!.binding as { groups: { forms: any[] }[] }).groups[0]!.forms;
        forms.reverse();
      }
      const multiFieldComponent = (sectionId: string, binds: readonly string[]) => ({
        $formspecComponent: '1.0' as const,
        version: '1.0.0',
        targetDefinition: { url: 'urn:period-plan' },
        tree: {
          component: 'Stack',
          children: [{
            component: 'Section', id: sectionId, title: sectionId,
            children: binds.map(bind => ({ component: 'NumberInput', bind })),
          }],
        },
      });
      const untouchedDom = render(<SurfaceApp
        bundle={multiFieldBundle}
        location="/years/2025"
        onNavigate={() => {}}
        resolveDefinitionComponent={({ routeId }) => routeId === 'plan'
          ? multiFieldComponent('section-a', mode === 'subset' ? ['details.amount', 'details.second'] : ['details.amount'])
          : multiFieldComponent('section-b', mode === 'subset' ? ['details.amount'] : ['details.second'])}
        readSummaries={async qs => new Map(qs.map(q => [q.key, { ...match, ...absent }]))}
      />);
      await act(async () => {});
      expect(
        untouchedDom.querySelector('.fs-surface-filing__totals dd')?.textContent,
        `mode=${mode}, largerFirst=${largerFirst}`,
      ).toBe('0 of 2');
    }
  }
});

it('exposes returned status badge and reviewer comment callout hooks', async () => {
  const dom = mount(async ([query]) => new Map([[query!.key, {
    draft: { status: 'current', form: { ...counts, ready: false }, sections: { details: counts } },
    filing: {
      status: 'returned',
      receiptRef: 'urn:response:returned-1',
      responseHash: 'sha256:' + 'b'.repeat(64),
      review: 'available',
      comments: ['Please verify the total before resubmitting.'],
    },
  }]]));
  await act(async () => {});
  const row = dom.querySelector('.fs-surface-filing__row[data-filing-status="returned"]');
  expect(row).not.toBeNull();
  const badge = row?.querySelector('.fs-surface-filing__badge[data-filing-status="returned"]');
  expect(badge?.textContent).toBe('Returned');
  const comment = row?.querySelector('.fs-surface-filing__comment');
  expect(comment?.textContent).toBe('Please verify the total before resubmitting.');
  const receipt = row?.querySelector('.fs-surface-filing__meta[data-receipt-ref]');
  expect(receipt?.textContent).toContain('urn:response:returned-1');
});

it('renders filled strips, finding marks, counts, and KPI totals for returned and reopened filings without an editable draft', async () => {
  const hash = ('sha256:' + 'd'.repeat(64)) as `sha256:${string}`;
  const dom = mount(async ([first, second, third]) => new Map<string, FilingStatusObservation>([
    [first!.key, {
      draft: { status: 'absent' },
      filing: {
        status: 'returned',
        receiptRef: 'urn:response:returned-no-draft',
        responseHash: hash,
        review: 'available',
        comments: ['Verify section totals.'],
        progress: {
          status: 'current',
          form: { total: 4, filled: 2, toFix: 1, toCheck: 2, ready: false },
          sections: { details: { total: 4, filled: 2, toFix: 1, toCheck: 2 } },
        },
      },
    }],
    [second!.key, {
      draft: { status: 'absent' },
      filing: {
        status: 'reopened',
        receiptRef: 'urn:response:reopened-no-draft',
        responseHash: hash,
        review: 'available',
        comments: [],
        progress: {
          status: 'current',
          form: { total: 4, filled: 3, toFix: 0, toCheck: 1, ready: false },
          sections: { details: { total: 4, filled: 3, toFix: 0, toCheck: 1 } },
        },
      },
    }],
    [third!.key, { draft: { status: 'absent' }, filing: { status: 'none' } }],
  ]));
  await act(async () => {});

  const rows = dom.querySelectorAll('.fs-surface-filing__row');
  const returnedRow = rows[0]!;
  expect(returnedRow.getAttribute('data-filing-status')).toBe('returned');
  expect(returnedRow.querySelector<HTMLElement>('.fs-surface-filing__fill')?.style.inlineSize).toBe('50%');
  expect(returnedRow.querySelector('.fs-surface-filing__mark[data-finding="fix"]')).not.toBeNull();
  expect(returnedRow.querySelector('.fs-surface-filing__counts')?.textContent).toContain('2 of 4 answered');
  expect(returnedRow.querySelector('.fs-surface-filing__counts')?.textContent).toContain('1 to fix');
  expect(returnedRow.querySelector('.fs-surface-filing__counts')?.textContent).toContain('2 to check');

  const reopenedRow = rows[1]!;
  expect(reopenedRow.getAttribute('data-filing-status')).toBe('reopened');
  expect(reopenedRow.querySelector<HTMLElement>('.fs-surface-filing__fill')?.style.inlineSize).toBe('75%');
  expect(reopenedRow.querySelector('.fs-surface-filing__mark[data-finding="check"]')).not.toBeNull();
  expect(reopenedRow.querySelector('.fs-surface-filing__counts')?.textContent).toContain('3 of 4 answered');

  // Top summary KPI band rolls up returned + reopened progress without counting them as Filed.
  const totals = dom.querySelector('.fs-surface-filing__totals dl')!;
  expect([...totals.querySelectorAll('dt, dd')].map(node => node.textContent)).toEqual([
    'Answered', '5 of 9', 'To fix', '1', 'To check', '3',
  ]);
  expect(dom.querySelector('.fs-surface-filing__totals dd[data-filing-completed]')).toBeNull();
});

it('places the compact strip legend right beneath the top summary band and above the first filing group', async () => {
  const dom = mount(async ([first, second, third]) => draftResults([
    [first!.key, { status: 'current', form: { ...counts, ready: false }, sections: { details: counts } }],
    [second!.key, { status: 'absent' }],
    [third!.key, { status: 'absent' }],
  ]));
  await act(async () => {});

  const totals = dom.querySelector('.fs-surface-filing__totals')!;
  const key = dom.querySelector('.fs-surface-filing__key')!;
  const firstGroup = dom.querySelector('.fs-surface-filing__group')!;
  expect(totals).not.toBeNull();
  expect(key).not.toBeNull();
  expect(firstGroup).not.toBeNull();
  expect(totals.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(key.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('retains previous observations across same-session revision refreshes without flashing Loading progress', async () => {
  let resolveSecond!: (value: ReadonlyMap<string, FilingStatusObservation>) => void;
  const secondPromise = new Promise<ReadonlyMap<string, FilingStatusObservation>>(resolve => {
    resolveSecond = resolve;
  });
  let call = 0;
  let lastQueries: Parameters<FilingStatusReader>[0] = [];
  const reader: FilingStatusReader = vi.fn(async (queries) => {
    call += 1;
    lastQueries = queries;
    if (call === 1) {
      return draftResults([
        [queries[0]!.key, { status: 'current', form: { total: 4, filled: 1, toFix: 0, toCheck: 0, ready: false }, sections: { details: { total: 4, filled: 1, toFix: 0, toCheck: 0 } } }],
        [queries[1]!.key, { status: 'absent' }],
        [queries[2]!.key, { status: 'absent' }],
      ]);
    }
    return secondPromise;
  });

  const bundle = filingBundle();
  const { createRoot } = await import('react-dom/client');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<SurfaceApp bundle={bundle} location="/" onNavigate={() => {}} readSummaries={reader} filingDraftRevision={1} />);
    });
    expect(container.textContent).toContain('1 of 4 answered');
    expect(container.textContent).not.toContain('Loading progress');

    await act(async () => {
      root.render(<SurfaceApp bundle={bundle} location="/" onNavigate={() => {}} readSummaries={reader} filingDraftRevision={2} />);
    });
    // While the second batch is in-flight for the same session/reader, prior observations remain visible without flashing Loading progress.
    expect(reader).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('1 of 4 answered');
    expect(container.textContent).not.toContain('Loading progress');

    await act(async () => {
      resolveSecond(draftResults([
        [lastQueries[0]!.key, { status: 'current', form: { total: 4, filled: 3, toFix: 0, toCheck: 0, ready: false }, sections: { details: { total: 4, filled: 3, toFix: 0, toCheck: 0 } } }],
        [lastQueries[1]!.key, { status: 'absent' }],
        [lastQueries[2]!.key, { status: 'absent' }],
      ]));
    });
    expect(container.textContent).toContain('3 of 4 answered');
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
