/** @filedesc USWDS adapter layout — Grid USWDS row markup vs default fallback. */
import { describe, it, expect, vi } from 'vitest';
import type { GridLayoutBehavior } from '@formspec-org/webcomponent';
import { renderUSWDSGrid } from '../../src/uswds/layout/grid';
import { mockAdapterContext } from '../helpers';

function mockHost(): GridLayoutBehavior['host'] {
    return {
        renderComponent: vi.fn(),
        prefix: '',
        resolveToken: (v) => v,
        engine: {} as GridLayoutBehavior['host']['engine'],
        cleanupFns: [],
        findItemByKey: () => undefined,
    };
}

describe('renderUSWDSGrid', () => {
    it('renders grid-row grid-gap with equal tablet columns for 2 columns', () => {
        const parent = document.createElement('div');
        const host = mockHost();
        const behavior: GridLayoutBehavior = {
            comp: { columns: 2, children: [{ component: 'TextInput', bind: 'x' }] },
            host,
        };
        renderUSWDSGrid(behavior, parent, mockAdapterContext());
        const row = parent.querySelector('.grid-row.grid-gap');
        expect(row).toBeTruthy();
        const cell = parent.querySelector('.grid-col-12');
        expect(cell).toBeTruthy();
        expect(cell!.className).toContain('tablet:grid-col-6');
        expect(host.renderComponent).toHaveBeenCalledOnce();
    });

    it('uses tablet:grid-col-4 for 3 columns', () => {
        const parent = document.createElement('div');
        const behavior: GridLayoutBehavior = {
            comp: { columns: 3, children: [{ component: 'TextInput', bind: 'a' }] },
            host: mockHost(),
        };
        renderUSWDSGrid(behavior, parent, mockAdapterContext());
        const cell = parent.querySelector('.grid-col-12');
        expect(cell).toBeTruthy();
        expect(cell!.className).toContain('tablet:grid-col-4');
    });

    it('uses tablet:grid-col-fill for 5 equal columns (no 12-column divisor)', () => {
        const parent = document.createElement('div');
        const behavior: GridLayoutBehavior = {
            comp: { columns: 5, children: [{ component: 'TextInput', bind: 'x' }] },
            host: mockHost(),
        };
        renderUSWDSGrid(behavior, parent, mockAdapterContext());
        expect(parent.querySelector('.grid-row.grid-gap')).toBeTruthy();
        expect(parent.querySelector('.formspec-grid')).toBeNull();
        const cell = parent.querySelector('.grid-col-12');
        expect(cell?.className).toContain('tablet:grid-col-fill');
    });

    it('does not apply inline flex gap on USWDS grid rows', () => {
        const parent = document.createElement('div');
        const behavior: GridLayoutBehavior = {
            comp: { columns: 2, gap: '1rem', children: [] },
            host: mockHost(),
        };
        renderUSWDSGrid(behavior, parent, mockAdapterContext());
        const row = parent.querySelector('.grid-row.grid-gap') as HTMLElement;
        expect(row).toBeTruthy();
        expect(row.style.gap).toBe('');
        expect(parent.querySelector('.formspec-grid')).toBeNull();
    });

    it('applies visual surface props to the USWDS grid row', () => {
        const parent = document.createElement('div');
        const behavior: GridLayoutBehavior = {
            comp: { columns: 2, padding: '1rem', background: '#fff', children: [] },
            host: mockHost(),
        };
        renderUSWDSGrid(behavior, parent, mockAdapterContext());
        const row = parent.querySelector('.grid-row.grid-gap') as HTMLElement;
        expect(row.style.padding).toBe('1rem');
        expect(row.style.background).toBe('#fff');
    });

    it('maps child grid placement style to USWDS cell classes', () => {
        const parent = document.createElement('div');
        const host = mockHost();
        const child = {
            component: 'TextInput',
            bind: 'x',
            style: { gridColumn: '2 / span 4' },
        };
        const behavior: GridLayoutBehavior = {
            comp: { columns: 12, children: [child] },
            host,
        };
        renderUSWDSGrid(behavior, parent, mockAdapterContext());

        const cell = parent.querySelector('.grid-col-12') as HTMLElement | null;
        expect(cell).not.toBeNull();
        expect(cell?.className).toContain('tablet:grid-offset-1');
        expect(cell?.className).toContain('tablet:grid-col-4');
        expect(host.renderComponent).toHaveBeenCalledWith(
            { component: 'TextInput', bind: 'x' },
            cell,
            '',
        );
    });
});

describe('renderUSWDSGrid track templates', () => {
    it('falls back to formspec-grid when authored track arrays are set', () => {
        const parent = document.createElement('div');
        const behavior: GridLayoutBehavior = {
            comp: { columns: ['1fr', '2fr'], children: [] },
            host: mockHost(),
        };
        renderUSWDSGrid(behavior, parent, mockAdapterContext());
        expect(parent.querySelector('.formspec-grid')).toBeTruthy();
        expect(parent.querySelector('.grid-row.grid-gap')).toBeNull();
    });

});

describe('USWDS integration CSS layout grid', () => {
    it('includes layout grid utilities targeting USWDS row + column cells', async () => {
        const { readUswdsIntegrationCss } = await import('../helpers.js');
        const css = readUswdsIntegrationCss();
        expect(css).toContain('.grid-row');
        expect(css).toContain('.grid-row.grid-gap');
        expect(css).toContain('.usa-form-group');
    });

    it('does not strip USWDS form-group top margin inside grid rows (that spacing is between fields)', async () => {
        const { readUswdsIntegrationCss } = await import('../helpers.js');
        const css = readUswdsIntegrationCss();
        expect(css).not.toMatch(/\.grid-row\.grid-gap\s+\.usa-form-group\s*\{[^}]*margin-top:\s*0/);
        expect(css).not.toContain('.formspec-stack.grid-row.grid-gap .usa-form-group{margin-top:1.5rem}');
    });

    it('does not re-cap stack rows inside USWDS grid cells to a custom field max width', async () => {
        const { readUswdsIntegrationCss } = await import('../helpers.js');
        const css = readUswdsIntegrationCss();
        expect(css).not.toMatch(/\.formspec-stack\.grid-row\.grid-gap>\[class\*=grid-col\]>\.usa-form-group,[^}]*\{max-width:30rem\}/);
    });
});
