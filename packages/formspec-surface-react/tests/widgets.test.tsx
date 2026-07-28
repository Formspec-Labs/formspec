/**
 * @filedesc The starter widget set — what it draws, and what it refuses to draw.
 *
 * The bar every one of these holds: **no invented content.** A widget handed
 * nothing renders an empty state saying so, not a plausible placeholder. The
 * surface-render-v10 spike's queue table drew four applications with invented
 * rents and invented waiting times, and that was its most convincing lie.
 */
import { describe, expect, it } from 'vitest';
import {
  CeremonyFrame,
  IntakeBanner,
  QueueTable,
  ReceiptPanel,
  STARTER_WIDGETS,
  starterWidgetModule,
} from '../src/widgets/index.js';
import type { SurfaceWidgetProps } from '../src/widget-api.js';
import { render, textOf } from './render.js';

function props(overrides: Partial<SurfaceWidgetProps> = {}): SurfaceWidgetProps {
  return {
    moduleId: 'x-acme-chrome',
    widgetName: 'Widget',
    slot: { id: 'slot', title: undefined },
    route: { surfaceId: 's', routeId: 'r', routeClass: 'intake', params: {} },
    headingLevel: 2,
    config: {},
    data: undefined,
    admitsTenantTheme: true,
    ...overrides,
  };
}

describe('starter widget module', () => {
  it('keys widgets by widgetShape.widgetName, in both spellings a module may use', () => {
    expect(STARTER_WIDGETS['x-intake-banner']).toBe(IntakeBanner);
    expect(STARTER_WIDGETS.IntakeBanner).toBe(IntakeBanner);
    expect(STARTER_WIDGETS['x-queue-panel']).toBe(QueueTable);
  });

  it('binds to whichever module id a bundle declares', () => {
    const module = starterWidgetModule('x-formspec-tenant-chrome');
    expect(module.moduleId).toBe('x-formspec-tenant-chrome');
    expect(module.widgets['x-receipt-panel']).toBe(ReceiptPanel);
  });
});

describe('IntakeBanner', () => {
  it('renders only what the bundle configured', () => {
    const container = render(
      <IntakeBanner
        {...props({
          config: { eyebrow: 'Rent assistance', headline: 'Before you start', body: 'Ten minutes.' },
        })}
      />,
    );
    expect(textOf(container.querySelector('.fs-surface-banner__eyebrow'))).toBe('Rent assistance');
    expect(textOf(container.querySelector('.fs-surface-banner__body'))).toBe('Ten minutes.');
    expect(container.querySelector('[data-widget-empty]')).toBeNull();
  });

  it('takes its heading level from the composition', () => {
    const container = render(<IntakeBanner {...props({ headingLevel: 4, config: { headline: 'H' } })} />);
    expect(container.querySelector('.fs-surface-banner__headline')?.tagName).toBe('H4');
  });

  it('renders a checklist when one is configured, and none when not', () => {
    const withList = render(<IntakeBanner {...props({ config: { checklist: ['Payslips', 'Lease'] } })} />);
    expect(withList.querySelectorAll('.fs-surface-banner__checklist li')).toHaveLength(2);
    const without = render(<IntakeBanner {...props({ config: { headline: 'H' } })} />);
    expect(without.querySelector('.fs-surface-banner__checklist')).toBeNull();
  });

  it('says it has nothing rather than inventing reassurance copy', () => {
    const container = render(<IntakeBanner {...props()} />);
    const empty = container.querySelector('[data-widget-empty]');
    expect(empty).not.toBeNull();
    expect(textOf(empty)).toContain('nothing to read');
  });

  it('ignores config values of the wrong type instead of stringifying them', () => {
    const container = render(<IntakeBanner {...props({ config: { headline: 42, checklist: 'nope' } })} />);
    expect(container.querySelector('[data-widget-empty]')).not.toBeNull();
  });
});

describe('CeremonyFrame', () => {
  it('renders the statement being attested to', () => {
    const container = render(
      <CeremonyFrame {...props({ config: { statement: 'Everything I told you is true.' } })} />,
    );
    expect(textOf(container.querySelector('[data-probe="ceremony-statement"]'))).toBe(
      'Everything I told you is true.',
    );
  });

  it('says there is nothing to agree to when no declaration is configured', () => {
    const container = render(<CeremonyFrame {...props()} />);
    expect(container.querySelector('[data-probe="ceremony-statement"]')).toBeNull();
    expect(textOf(container.querySelector('[data-widget-empty]'))).toContain('nothing to agree to');
  });

  it('marks its theme posture in the DOM so refusal is measurable, not merely intended', () => {
    const container = render(<CeremonyFrame {...props({ admitsTenantTheme: false })} />);
    expect(container.querySelector('[data-widget="ceremony-frame"]')?.getAttribute('data-tenant-theme')).toBe(
      'refused',
    );
  });

  it('offers no control that would look like signing', () => {
    const container = render(<CeremonyFrame {...props({ config: { statement: 'x' } })} />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('ReceiptPanel', () => {
  it('shows only facts the host supplied', () => {
    const container = render(
      <ReceiptPanel
        {...props({
          data: { caseRef: 'RA-2026-0412', issuer: 'City Housing', facts: [{ label: 'Amount', value: '£1,850' }] },
        })}
      />,
    );
    const rows = [...container.querySelectorAll('.fs-surface-receipt__row')].map(textOf);
    expect(rows).toEqual(['Your referenceRA-2026-0412', 'Issued byCity Housing', 'Amount£1,850']);
  });

  it('reads the case reference from the URL, because the URL is the fact', () => {
    const container = render(
      <ReceiptPanel {...props({ route: { surfaceId: 's', routeId: 'r', routeClass: 'proof', params: { caseRef: 'R-9' } } })} />,
    );
    expect(textOf(container.querySelector('.fs-surface-receipt__row'))).toBe('Your referenceR-9');
  });

  it('invents no reference number when there is nothing to show', () => {
    const container = render(<ReceiptPanel {...props()} />);
    expect(container.querySelector('[data-probe="receipt-facts"]')).toBeNull();
    expect(textOf(container.querySelector('[data-widget-empty]'))).toContain('no receipt to show');
  });

  it('drops malformed fact rows rather than rendering "undefined"', () => {
    const container = render(<ReceiptPanel {...props({ data: { facts: [{ label: 'ok' }, 'nope'] } })} />);
    expect(container.querySelector('[data-widget-empty]')).not.toBeNull();
  });
});

describe('QueueTable', () => {
  const rows = [
    { ref: 'RA-1', household: 4, waiting: '3 days' },
    { ref: 'RA-2', household: 1, waiting: '6 days' },
  ];

  it('renders whatever rows it is given, with declared columns', () => {
    const container = render(
      <QueueTable
        {...props({
          config: {
            columns: [
              { key: 'ref', label: 'Reference' },
              { key: 'household', label: 'People', numeric: true },
            ],
            caption: 'Waiting for a decision',
          },
          data: { rows },
        })}
      />,
    );
    const headers = [...container.querySelectorAll('thead th')].map(textOf);
    expect(headers).toEqual(['Reference', 'People']);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(textOf(container.querySelector('caption'))).toBe('Waiting for a decision');
  });

  it('infers columns from the rows when the author declared none', () => {
    const container = render(<QueueTable {...props({ data: { rows } })} />);
    expect([...container.querySelectorAll('thead th')].map(textOf)).toEqual([
      'ref',
      'household',
      'waiting',
    ]);
  });

  it('accepts a bare array as well as {rows}', () => {
    const container = render(<QueueTable {...props({ data: rows })} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows an honest empty state and no table when there are no rows', () => {
    const container = render(<QueueTable {...props({ data: { rows: [] } })} />);
    expect(container.querySelector('[data-probe="queue-table"]')).toBeNull();
    expect(textOf(container.querySelector('[data-widget-empty]'))).toContain('Nothing is waiting');
    expect(container.querySelector('[data-widget="queue-table"]')?.getAttribute('data-row-count')).toBe('0');
  });

  it('shows an empty state when the host supplied nothing at all', () => {
    const container = render(<QueueTable {...props()} />);
    expect(container.querySelector('[data-widget-empty]')).not.toBeNull();
  });

  it('lets the author write the empty-state sentence', () => {
    const container = render(
      <QueueTable {...props({ config: { emptyMessage: 'No cases are open today.' }, data: { rows: [] } })} />,
    );
    expect(textOf(container.querySelector('[data-widget-empty]'))).toBe('No cases are open today.');
  });

  it('gives every row a row header and every column a scope', () => {
    const container = render(<QueueTable {...props({ data: { rows } })} />);
    expect([...container.querySelectorAll('thead th')].every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    expect(container.querySelectorAll('tbody th[scope="row"]')).toHaveLength(2);
  });

  it('makes the scroll container reachable and named for keyboard users', () => {
    const container = render(<QueueTable {...props({ config: { caption: 'Queue' }, data: { rows } })} />);
    const scroll = container.querySelector('.fs-surface-queue__scroll');
    expect(scroll?.getAttribute('tabindex')).toBe('0');
    expect(scroll?.getAttribute('aria-label')).toBe('Queue');
  });

  it('renders a missing cell as empty rather than "undefined"', () => {
    const container = render(
      <QueueTable {...props({ config: { columns: [{ key: 'ref', label: 'Ref' }, { key: 'ghost', label: 'Ghost' }] }, data: { rows } })} />,
    );
    const cells = [...container.querySelectorAll('tbody td')].map(textOf);
    expect(cells).toEqual(['', '']);
  });
});
