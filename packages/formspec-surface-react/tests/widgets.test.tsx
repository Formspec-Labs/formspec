/**
 * @filedesc The starter widget set — what it draws, and what it refuses to draw.
 *
 * The bar every one of these holds: **no invented content.** A widget handed
 * nothing renders an empty state saying so, not a plausible placeholder. The
 * surface-render-v10 spike's queue table drew four applications with invented
 * rents and invented waiting times, and that was its most convincing lie.
 */
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CeremonyFrame,
  IntakeBanner,
  QueueTable,
  ReceiptPanel,
  STARTER_WIDGETS,
  StructuredPanel,
  readStructuredPanelPath,
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
    data: {},
    emitAction: () => {},
    admitsTenantTheme: true,
    ...overrides,
  };
}

describe('starter widget module', () => {
  it('keys widgets by widgetShape.widgetName, in both spellings a module may use', () => {
    expect(STARTER_WIDGETS['x-intake-banner']).toBe(IntakeBanner);
    expect(STARTER_WIDGETS.IntakeBanner).toBe(IntakeBanner);
    expect(STARTER_WIDGETS['x-queue-panel']).toBe(QueueTable);
    expect(STARTER_WIDGETS.StructuredPanel).toBe(StructuredPanel);
    expect(STARTER_WIDGETS['x-structured-panel']).toBe(StructuredPanel);
  });

  it('binds to whichever module id a bundle declares', () => {
    const module = starterWidgetModule('x-formspec-tenant-chrome');
    expect(module.moduleId).toBe('x-formspec-tenant-chrome');
    expect(module.widgets['x-receipt-panel']).toBe(ReceiptPanel);
    expect(module.contracts?.StructuredPanel?.renderedConfigNodes).toEqual(
      expect.arrayContaining([
        {
          pointerPattern: '/blocks/*/rowAction',
          kind: 'structured-panel-row-action',
        },
        {
          pointerPattern: '/stateViews/*',
          kind: 'module-widget-state-view',
        },
        {
          pointerPattern: '/stateViews/*/actions/*',
          kind: 'module-widget-state-action',
        },
      ]),
    );
    expect(module.contracts).toMatchObject({
      QueueTable: {
        deliveryContractId: '@formspec-org/surface-react/QueueTable@0.1',
        registryEntryVersion: '0.1.0',
        renderedConfigNodes: [
          { pointerPattern: '', kind: 'queue-table' },
          { pointerPattern: '/columns/*', kind: 'queue-table-column' },
          { pointerPattern: '/rowAction', kind: 'queue-table-row-action' },
        ],
      },
      ReceiptPanel: {
        deliveryContractId: '@formspec-org/surface-react/ReceiptPanel@0.1',
        registryEntryVersion: '0.1.0',
        renderedConfigNodes: [
          { pointerPattern: '', kind: 'receipt-panel' },
        ],
      },
      CeremonyFrame: {
        deliveryContractId: '@formspec-org/surface-react/CeremonyFrame@0.1',
        registryEntryVersion: '0.1.0',
        renderedConfigNodes: [
          { pointerPattern: '', kind: 'ceremony-frame' },
        ],
      },
    });
  });
});

describe('StructuredPanel', () => {
  const trace = {
    'x-generation': {
      anchors: ['need:understand-account@2'],
    },
  };

  it('renders generic blocks from safe data paths, route facts, and traced JSON configuration', () => {
    const container = render(
      <StructuredPanel
        {...props({
          route: {
            surfaceId: 's',
            routeId: 'account',
            routeClass: 'operation',
            params: { accountId: 'acct-7' },
          },
          config: {
            id: 'accountSummary',
            ...trace,
            eyebrow: 'Workspace',
            state: 'Active',
            title: 'Account summary',
            body: 'Current usage and access.',
            blocks: [
              {
                id: 'memberMetric',
                type: 'metric',
                label: 'Members',
                path: 'summary.members',
                ...trace,
              },
              {
                id: 'facts',
                type: 'key-value',
                items: [
                  { id: 'plan', label: 'Plan', path: 'summary.plan', ...trace },
                  { id: 'account', label: 'Account', routeParam: 'accountId', ...trace },
                ],
                ...trace,
              },
              {
                id: 'features',
                type: 'list',
                path: 'summary.features',
                ...trace,
              },
              {
                id: 'invoices',
                type: 'table',
                path: 'billing.invoices',
                caption: 'Recent invoices',
                columns: [
                  { id: 'period', label: 'Period', path: 'period', ...trace },
                  { id: 'amount', label: 'Amount', path: 'amount', numeric: true, ...trace },
                ],
                ...trace,
              },
              {
                id: 'usage',
                type: 'progress',
                label: 'Usage',
                path: 'summary.usage',
                max: 100,
                suffix: '%',
                ...trace,
              },
            ],
          },
          data: {
            summary: {
              members: 12,
              plan: 'Team',
              features: ['Forms', 'Exports'],
              usage: 64,
            },
            billing: {
              invoices: [{ period: 'July', amount: 24 }],
            },
          },
        })}
      />,
    );

    expect(textOf(container.querySelector('.fs-structured-panel__title'))).toBe(
      'Account summary',
    );
    expect(textOf(container.querySelector('[data-block-id="memberMetric"]'))).toContain(
      'Members12',
    );
    expect(textOf(container.querySelector('[data-field-id="account"]'))).toBe(
      'Accountacct-7',
    );
    expect(container.querySelectorAll('.fs-structured-panel__list li')).toHaveLength(2);
    expect(textOf(container.querySelector('.fs-structured-panel__table tbody td'))).toBe(
      'July',
    );
    expect(container.querySelector('progress')?.getAttribute('value')).toBe('64');
    expect(
      container
        .querySelector('[data-block-id="invoices"]')
        ?.getAttribute('data-need-anchors'),
    ).toBe('need:understand-account@2');
    expect(container.querySelector('[data-panel-id="accountSummary"]')?.getAttribute('data-trace-state')).toBe(
      'present',
    );
  });

  it('takes action ordering and emphasis from panel data, but button text from Response Actions', () => {
    const emitAction = vi.fn();
    const container = render(
      <StructuredPanel
        {...props({
          config: {
            ...trace,
            actions: [
              { outputName: 'delete', order: 2, emphasis: 'danger', ...trace },
              { outputName: 'save', order: 1, emphasis: 'primary', ...trace },
            ],
          },
          actions: [
            {
              outputName: 'delete',
              actionRef: 'deleteAccount',
              intent: 'x-delete',
              label: { literal: 'Delete account' },
            },
            {
              outputName: 'save',
              actionRef: 'saveAccount',
              intent: 'save-draft',
              label: { literal: 'Save changes' },
            },
          ],
          emitAction,
        })}
      />,
    );
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map(textOf)).toEqual(['Save changes', 'Delete account']);
    expect(buttons[0]?.getAttribute('data-emphasis')).toBe('primary');
    expect(buttons[0]?.getAttribute('data-action-ref')).toBe('saveAccount');
    expect(buttons[0]?.getAttribute('data-action-intent')).toBe('save-draft');
    expect(buttons[0]?.getAttribute('data-need-ids')).toBe('understand-account');
    buttons[0]?.click();
    expect(emitAction).toHaveBeenCalledWith('save');
  });

  it('uses structured data for responsive tables, progress maxima, and action payloads', () => {
    const emitAction = vi.fn();
    const container = render(
      <StructuredPanel
        {...props({
          config: {
            ...trace,
            blocks: [
              {
                id: 'resources',
                type: 'table',
                path: 'resources',
                responsiveMode: 'stack',
                columns: [
                  { id: 'name', label: 'Resource', path: 'name', ...trace },
                  { id: 'status', label: 'Status', path: 'status', ...trace },
                ],
                rowAction: {
                  outputName: 'open',
                  columnLabel: 'Open resource',
                  payload: {
                    resourceId: { path: 'id' },
                    resource: { path: '' },
                  },
                  ...trace,
                },
                ...trace,
              },
              {
                id: 'usage',
                type: 'progress',
                path: 'usage.current',
                maxPath: 'usage.limit',
                ...trace,
              },
            ],
            actions: [
              {
                outputName: 'export',
                payload: {
                  resourceIds: { path: 'resourceIds' },
                },
                ...trace,
              },
            ],
          },
          data: {
            resources: [{ id: 'resource-7', name: 'Guide', status: 'Ready' }],
            resourceIds: ['resource-7'],
            usage: { current: 7, limit: 10 },
          },
          actions: [
            {
              outputName: 'open',
              actionRef: 'openResource',
              intent: 'review',
              label: { literal: 'Open' },
            },
            {
              outputName: 'export',
              actionRef: 'exportResources',
              intent: 'x-export',
              label: { literal: 'Export' },
            },
          ],
          emitAction,
        })}
      />,
    );

    const tableRegion = container.querySelector('[data-responsive-mode="stack"]');
    expect(tableRegion).not.toBeNull();
    expect(
      [...container.querySelectorAll<HTMLTableCellElement>('tbody td')]
        .map((cell) => cell.dataset.columnLabel),
    ).toEqual(['Resource', 'Status', 'Open resource']);
    expect(container.querySelector('progress')?.getAttribute('max')).toBe('10');

    container.querySelector<HTMLButtonElement>('[data-row-action]')?.click();
    expect(emitAction).toHaveBeenCalledWith('open', {
      resourceId: 'resource-7',
      resource: { id: 'resource-7', name: 'Guide', status: 'Ready' },
    });
    container.querySelector<HTMLButtonElement>('[data-action-output="export"]')?.click();
    expect(emitAction).toHaveBeenCalledWith('export', {
      resourceIds: ['resource-7'],
    });
  });

  it('renders authored pending, failure, and success action feedback', async () => {
    let finish:
      | ((feedback: { status: 'completed' | 'failed' }) => void)
      | undefined;
    const emitAction = vi.fn(() => ({
      started: true,
      completion: new Promise<{ status: 'completed' | 'failed' }>((resolve) => {
        finish = resolve;
      }),
    }));
    const container = render(
      <StructuredPanel
        {...props({
          config: {
            ...trace,
            actions: [{
              outputName: 'save',
              pendingLabel: 'Saving…',
              successMessage: 'Saved',
              failureMessage: 'Try again',
              ...trace,
            }],
          },
          actions: [{
            outputName: 'save',
            actionRef: 'save',
            intent: 'save-draft',
            label: { literal: 'Save' },
          }],
          emitAction,
        })}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-action-output="save"]',
    );

    act(() => {
      button?.click();
    });
    expect(button?.textContent).toBe('Saving…');
    expect(button?.disabled).toBe(true);
    await act(async () => {
      finish?.({ status: 'failed' });
      await Promise.resolve();
    });
    expect(button?.textContent).toBe('Try again');
    expect(button?.disabled).toBe(false);

    act(() => {
      button?.click();
    });
    await act(async () => {
      finish?.({ status: 'completed' });
      await Promise.resolve();
    });
    expect(button?.textContent).toBe('Saved');
    expect(button?.getAttribute('data-action-status')).toBe('completed');
  });

  it('turns a rejected action completion into authored failure feedback', async () => {
    const emitAction = vi.fn(() => ({
      started: true,
      completion: Promise.reject(new Error('executor unavailable')),
    }));
    const container = render(
      <StructuredPanel
        {...props({
          config: {
            ...trace,
            actions: [{
              outputName: 'save',
              pendingLabel: 'Saving…',
              failureMessage: 'Try again',
              ...trace,
            }],
          },
          actions: [{
            outputName: 'save',
            actionRef: 'save',
            intent: 'save-draft',
            label: { literal: 'Save' },
          }],
          emitAction,
        })}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>(
      '[data-action-output="save"]',
    );

    await act(async () => {
      button?.click();
      await Promise.resolve();
    });

    expect(button?.textContent).toBe('Try again');
    expect(button?.getAttribute('data-action-status')).toBe('failed');
    expect(button?.disabled).toBe(false);
  });

  it('uses block and action need anchors when the panel has no product-level copy', () => {
    const container = render(
      <StructuredPanel
        {...props({
          config: {
            blocks: [
              {
                id: 'status',
                type: 'metric',
                label: 'Open',
                path: 'summary.open',
                'x-generation': { anchors: ['need:see-status@1'] },
              },
            ],
            actions: [
              {
                outputName: 'open',
                'x-generation': { anchors: ['need:manage-record@3'] },
              },
            ],
          },
          data: { summary: { open: 4 } },
          actions: [
            {
              outputName: 'open',
              actionRef: 'openRecord',
              intent: 'review',
              label: { literal: 'Open record' },
            },
          ],
        })}
      />,
    );
    expect(container.querySelector('[data-block-id="status"]')?.getAttribute('data-need-ids')).toBe(
      'see-status',
    );
    expect(container.querySelector('button')?.getAttribute('data-need-ids')).toBe(
      'manage-record',
    );
    expect(container.querySelector('[data-widget="structured-panel"]')?.getAttribute('data-need-ids')).toBe(
      'see-status manage-record',
    );
  });

  it('does not let a parent Need trace authorize an untraced field or action', () => {
    const container = render(
      <StructuredPanel
        {...props({
          config: {
            ...trace,
            blocks: [{
              id: 'facts',
              type: 'key-value',
              ...trace,
              items: [
                { id: 'hidden', label: 'Hidden', path: 'hidden' },
                { id: 'shown', label: 'Shown', path: 'shown', ...trace },
              ],
            }],
            actions: [
              { outputName: 'hiddenAction' },
              { outputName: 'shownAction', ...trace },
            ],
          },
          data: { hidden: 'Must not render', shown: 'Visible' },
          actions: [{
            outputName: 'hiddenAction',
            actionRef: 'hidden',
            intent: 'review',
            label: { literal: 'Hidden action' },
          }, {
            outputName: 'shownAction',
            actionRef: 'shown',
            intent: 'review',
            label: { literal: 'Shown action' },
          }],
        })}
      />,
    );

    expect(textOf(container)).not.toContain('Must not render');
    expect(textOf(container)).not.toContain('Hidden action');
    expect(textOf(container)).toContain('ShownVisible');
    expect(textOf(container)).toContain('Shown action');
  });

  it('fails closed for missing trace, missing data, and unresolved label references', () => {
    const withoutTrace = render(
      <StructuredPanel
        {...props({
          config: {
            title: 'Must not render',
            blocks: [{ id: 'secret', type: 'metric', path: 'secret' }],
          },
          data: { secret: 'Must not render' },
        })}
      />,
    );
    expect(textOf(withoutTrace)).not.toContain('Must not render');
    expect(withoutTrace.querySelector('[data-widget="structured-panel"]')).toBeNull();

    const missingData = render(
      <StructuredPanel
        {...props({
          config: {
            ...trace,
            blocks: [
              {
                id: 'missing',
                type: 'metric',
                path: 'summary.missing',
                emptyMessage: 'No current value.',
                ...trace,
              },
            ],
            actions: [{ outputName: 'save', label: 'Config label is ignored' }],
          },
          data: { summary: {} },
          actions: [
            {
              outputName: 'save',
              actionRef: 'save',
              intent: 'save-draft',
              label: { ref: '$actions.save' },
            },
          ],
        })}
      />,
    );
    expect(textOf(missingData.querySelector('[data-widget-empty]'))).toBe('No current value.');
    expect(textOf(missingData)).not.toContain('undefined');
    expect(missingData.querySelector('button')).toBeNull();
    expect(textOf(missingData)).not.toContain('Config label is ignored');
  });

  it('rejects unsafe and inherited paths', () => {
    const inherited = Object.create({ leaked: 'no' }) as Record<string, unknown>;
    inherited.own = { value: 'yes' };
    expect(readStructuredPanelPath(inherited, 'own.value')).toBe('yes');
    expect(readStructuredPanelPath(inherited, 'leaked')).toBeUndefined();
    expect(readStructuredPanelPath({}, '__proto__.polluted')).toBeUndefined();
    expect(readStructuredPanelPath({}, 'constructor.name')).toBeUndefined();
    expect(readStructuredPanelPath({}, 'bad[0]')).toBeUndefined();
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
          data: {
            receipt: {
              caseRef: 'RA-2026-0412',
              issuer: 'City Housing',
              facts: [{ label: 'Amount', value: '£1,850' }],
            },
          },
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
    const container = render(
      <ReceiptPanel
        {...props({ data: { receipt: { facts: [{ label: 'ok' }, 'nope'] } } })}
      />,
    );
    expect(container.querySelector('[data-widget-empty]')).not.toBeNull();
  });

  it('does not treat unqualified host data as an admitted named input', () => {
    const container = render(
      <ReceiptPanel
        {...props({
          data: { caseRef: 'UNQUALIFIED' },
          route: { surfaceId: 's', routeId: 'r', routeClass: 'proof', params: {} },
        })}
      />,
    );
    expect(container.querySelector('[data-probe="receipt-facts"]')).toBeNull();
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

  it('keeps stable row identity separate from a duplicate human-readable row header', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const container = render(
      <QueueTable
        {...props({
          config: {
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'version', label: 'Version' },
            ],
            rowHeaderKey: 'name',
            rowKey: 'id',
          },
          data: {
            rows: [
              { id: 'one', name: 'Shared name', version: 1 },
              { id: 'two', name: 'Shared name', version: 2 },
            ],
          },
        })}
      />,
    );

    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
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

  it('emits detached row-relative payload through exactly one declared output', () => {
    const emitAction = vi.fn();
    const mutableRow = {
      response_id: 'response-7',
      summary: { status: 'accepted' },
    };
    const container = render(
      <QueueTable
        {...props({
          config: {
            columns: [{ key: 'response_id', label: 'Response' }],
            rowHeaderKey: 'response_id',
            rowAction: {
              outputName: 'openResponse',
              columnLabel: 'Action',
              payload: {
                responseId: { path: 'response_id' },
                response: { path: '' },
              },
              emphasis: 'primary',
              'x-generation': { anchors: ['need:review-responses@1'] },
            },
          },
          data: { rows: [mutableRow] },
          actions: [{
            outputName: 'openResponse',
            actionRef: 'openResponse',
            intent: 'review',
            label: { literal: 'Open' },
            needAnchors: ['need:open-response@2'],
          }],
          emitAction,
        })}
      />,
    );

    container.querySelector<HTMLButtonElement>('[data-row-action]')?.click();
    const input = emitAction.mock.calls[0]?.[1] as Record<string, unknown>;
    mutableRow.response_id = 'changed';
    mutableRow.summary.status = 'changed';

    expect(emitAction).toHaveBeenCalledTimes(1);
    expect(input).toEqual({
      responseId: 'response-7',
      response: {
        response_id: 'response-7',
        summary: { status: 'accepted' },
      },
    });
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.response)).toBe(true);
    expect(container.querySelector('[data-action-column]')?.getAttribute('data-need-anchors')).toBe(
      'need:review-responses@1 need:open-response@2',
    );
  });

  it('refuses missing and duplicate action declarations', () => {
    const config = {
      columns: [{ key: 'ref', label: 'Reference' }],
      rowAction: {
        outputName: 'open',
        columnLabel: 'Action',
        'x-generation': { anchors: ['need:review-responses@1'] },
      },
    };
    const missing = render(
      <QueueTable {...props({ config, data: { rows } })} />,
    );
    expect(missing.querySelector('[data-action-column]')).toBeNull();
    expect(missing.querySelector('button')).toBeNull();

    const duplicate = render(
      <QueueTable
        {...props({
          config,
          data: { rows },
          actions: [
            { outputName: 'open', actionRef: 'one', intent: 'review', label: { literal: 'Open' } },
            { outputName: 'open', actionRef: 'two', intent: 'review', label: { literal: 'Open' } },
          ],
        })}
      />,
    );
    expect(duplicate.querySelector('[data-action-column]')).toBeNull();
    expect(duplicate.querySelector('button')).toBeNull();
  });

  it('keeps row actions keyboard reachable and table-labelled', () => {
    const emitAction = vi.fn();
    const container = render(
      <QueueTable
        {...props({
          config: {
            columns: [{ key: 'ref', label: 'Reference' }],
            caption: 'Submitted responses',
            rowAction: {
              outputName: 'open',
              columnLabel: 'Review response',
              'x-generation': { anchors: ['need:review-responses@1'] },
            },
          },
          data: { rows: [rows[0]!] },
          actions: [{
            outputName: 'open',
            actionRef: 'openResponse',
            intent: 'review',
            label: { literal: 'Open' },
          }],
          emitAction,
        })}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>('[data-row-action]');
    const actionHeader = container.querySelector<HTMLTableCellElement>('thead [data-action-column]');

    button?.focus();
    expect(document.activeElement).toBe(button);
    expect(button?.type).toBe('button');
    expect(button?.tabIndex).toBe(0);
    expect(button?.getAttribute('aria-label')).toBe('Open: RA-1');
    expect(actionHeader?.getAttribute('scope')).toBe('col');
    expect(textOf(actionHeader)).toBe('Review response');
    expect(container.querySelector('.fs-surface-queue__scroll')?.getAttribute('aria-label')).toBe(
      'Submitted responses',
    );
  });

  it('renders pending, completed, and failed row-action feedback', async () => {
    let finish:
      | ((feedback: { status: 'completed' | 'failed' }) => void)
      | undefined;
    const emitAction = vi.fn(() => ({
      started: true,
      completion: new Promise<{ status: 'completed' | 'failed' }>((resolve) => {
        finish = resolve;
      }),
    }));
    const container = render(
      <QueueTable
        {...props({
          config: {
            columns: [{ key: 'ref', label: 'Reference' }],
            rowAction: {
              outputName: 'open',
              columnLabel: 'Action',
              pendingLabel: 'Opening…',
              successMessage: 'Opened',
              failureMessage: 'Try again',
              'x-generation': { anchors: ['need:review-responses@1'] },
            },
          },
          data: { rows: [rows[0]!] },
          actions: [{
            outputName: 'open',
            actionRef: 'openResponse',
            intent: 'review',
            label: { literal: 'Open' },
          }],
          emitAction,
        })}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>('[data-row-action]');

    act(() => button?.click());
    expect(textOf(button)).toBe('Opening…');
    expect(button?.disabled).toBe(true);
    await act(async () => {
      finish?.({ status: 'completed' });
      await Promise.resolve();
    });
    expect(textOf(button)).toBe('Opened');
    expect(button?.getAttribute('data-action-status')).toBe('completed');

    act(() => button?.click());
    await act(async () => {
      finish?.({ status: 'failed' });
      await Promise.resolve();
    });
    expect(textOf(button)).toBe('Try again');
    expect(button?.getAttribute('data-action-status')).toBe('failed');
    expect(button?.disabled).toBe(false);
  });

  it('keeps the legacy queue unchanged when rowAction is absent', () => {
    const emitAction = vi.fn();
    const container = render(
      <QueueTable {...props({ data: { rows }, emitAction })} />,
    );
    expect([...container.querySelectorAll('thead th')].map(textOf)).toEqual([
      'ref',
      'household',
      'waiting',
    ]);
    expect(container.querySelector('[data-action-column]')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(emitAction).not.toHaveBeenCalled();
  });
});
