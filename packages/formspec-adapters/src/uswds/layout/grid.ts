/** @filedesc USWDS layout grid — `grid-row` / `grid-col-*` with optional token gaps; string `columns` falls back to default CSS grid. */
import type { AdapterContext, GridLayoutBehavior } from '@formspec-org/webcomponent';
import { renderDefaultLayoutGrid } from '@formspec-org/webcomponent';
import { USWDS_LAYOUT_ROW_CLASS, applyUSWDSSurfaceProps, renderUSWDSLayoutHeader, uswdsGridCellClassForChild } from './grid-shared';

function stripGridColumnFromChild<T extends { style?: Record<string, string> }>(child: T): T {
    if (child.style?.gridColumn === undefined) {
        return child;
    }
    const { gridColumn: _gc, ...rest } = child.style;
    if (Object.keys(rest).length === 0) {
        const { style: _s, ...noStyle } = child;
        return noStyle as T;
    }
    return { ...child, style: rest };
}

/**
 * Renders a USWDS flex row with responsive columns. Custom track templates delegate to {@link renderDefaultLayoutGrid}.
 */
export function renderUSWDSGrid(behavior: GridLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, descriptionText } = behavior;
    if (typeof comp.columns === 'string' || Array.isArray(comp.columns)) {
        renderDefaultLayoutGrid(behavior, parent, actx);
        return;
    }

    const n = typeof comp.columns === 'number' ? comp.columns : 2;

    const row = document.createElement('div');
    if (comp.id) row.id = comp.id;
    row.className = USWDS_LAYOUT_ROW_CLASS;
    if (comp.rowGap) row.style.rowGap = String(host.resolveToken(comp.rowGap));

    actx.applyCssClass(row, comp);
    actx.applyAccessibility(row, comp);
    actx.applyStyle(row, comp.style);
    applyUSWDSSurfaceProps(row, comp, host.resolveToken);

    renderUSWDSLayoutHeader(row, titleText, descriptionText);

    for (const child of comp.children || []) {
        const cell = document.createElement('div');
        cell.className = uswdsGridCellClassForChild(child.style, n);

        host.renderComponent(stripGridColumnFromChild(child), cell, host.prefix);
        row.appendChild(cell);
    }
    parent.appendChild(row);
}
