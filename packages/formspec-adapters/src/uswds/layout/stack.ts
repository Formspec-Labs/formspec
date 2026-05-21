/** @filedesc USWDS Stack layout — vertical stack as full-width row cells; horizontal as auto-width cells on tablet+. */
import type { AdapterContext, StackLayoutBehavior } from '@formspec-org/webcomponent';
import { USWDS_LAYOUT_ROW_CLASS, applyUSWDSSurfaceProps, renderUSWDSLayoutHeader } from './grid-shared';

function horizontalCellClass(child: any): string {
    const explicitWidth = child?.width ?? child?.style?.width;
    return explicitWidth ? 'grid-col-12 tablet:grid-col-auto' : 'grid-col-12 tablet:grid-col-fill';
}

function stackJustifyContent(value: unknown): string | undefined {
    switch (value) {
        case 'between':
            return 'space-between';
        case 'around':
            return 'space-around';
        case 'evenly':
            return 'space-evenly';
        case 'start':
        case 'center':
        case 'end':
            return String(value);
        default:
            return undefined;
    }
}

export function renderUSWDSStack(behavior: StackLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, descriptionText } = behavior;
    const row = document.createElement('div');
    if (comp.id) row.id = comp.id;
    const horizontal = comp.direction === 'horizontal';
    row.className = [
        'formspec-stack',
        USWDS_LAYOUT_ROW_CLASS,
        horizontal ? 'formspec-stack--horizontal' : '',
        comp.wrap ? 'formspec-stack--wrap' : '',
    ]
        .filter(Boolean)
        .join(' ');
    if (comp.align) row.dataset.align = comp.align;
    const justifyContent = stackJustifyContent(comp.justify);
    if (justifyContent) row.style.justifyContent = justifyContent;
    if (comp.gap) {
        const resolvedGap = String(host.resolveToken(comp.gap));
        if (horizontal) {
            row.style.columnGap = resolvedGap;
        } else {
            row.style.setProperty('--formspec-uswds-stack-gap', resolvedGap);
        }
    }

    actx.applyCssClass(row, comp);
    actx.applyAccessibility(row, comp);
    actx.applyStyle(row, comp.style);
    applyUSWDSSurfaceProps(row, comp, host.resolveToken);

    renderUSWDSLayoutHeader(row, titleText, descriptionText);

    for (const child of comp.children || []) {
        const cell = document.createElement('div');
        cell.className = horizontal ? horizontalCellClass(child) : 'grid-col-12';
        host.renderComponent(child, cell, host.prefix);
        row.appendChild(cell);
    }

    parent.appendChild(row);
}
