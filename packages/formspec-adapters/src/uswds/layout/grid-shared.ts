/** @filedesc Shared USWDS 12-column row helpers for Grid layout adapters (tablet col span classes). */

/** Equal column counts that map cleanly to USWDS’s 12-column row (12 % n === 0). */
export const USWDS_EQUAL_COL_COUNTS = new Set([1, 2, 3, 4, 6]);

export function tabletColClass(n: number): string {
    const span = 12 / n;
    return `tablet:grid-col-${span}`;
}

/** USWDS layout row only (`usa-layout-grid`); integration SCSS targets `.grid-row.grid-gap` without a Formspec bridge class. */
export const USWDS_LAYOUT_ROW_CLASS = 'grid-row grid-gap';

export function applyUSWDSSurfaceProps(
    el: HTMLElement,
    comp: Record<string, unknown>,
    resolveToken: (value: unknown) => unknown,
): void {
    if (comp.padding != null) el.style.padding = String(resolveToken(comp.padding));
    if (comp.background != null) el.style.background = String(resolveToken(comp.background));
    if (comp.border != null) el.style.border = String(resolveToken(comp.border));
    if (comp.radius != null) el.style.borderRadius = String(resolveToken(comp.radius));
    if (comp.elevation != null) el.dataset.elevation = String(resolveToken(comp.elevation));
}

/**
 * Full-width on small screens; on tablet+, equal columns — either explicit 12/n spans or `grid-col-fill` for other counts.
 */
export function equalGridCellClass(columnCount: number): string {
    const n = Math.max(1, Math.floor(columnCount));
    if (USWDS_EQUAL_COL_COUNTS.has(n)) {
        return `grid-col-12 ${tabletColClass(n)}`;
    }
    return 'grid-col-12 tablet:grid-col-fill';
}

function clampGridSpan(span: number): number {
    if (!Number.isFinite(span)) return 12;
    return Math.min(12, Math.max(1, Math.floor(span)));
}

/**
 * Theme page regions attach `style.gridColumn` to the child Stack (`span N` or `start / span N`).
 * USWDS theme grids wrap each child in a flex row cell: `grid-column` on the inner Stack has no
 * effect, and `tablet:grid-col-fill` on every cell squeezes all regions into one row. Map planner
 * output to USWDS column (+ optional offset) classes on the **cell** instead.
 */
export function uswdsGridCellClassForChild(
    childStyle: Record<string, string> | undefined,
    columnCount: number,
): string {
    const raw = childStyle?.gridColumn?.trim();
    if (!raw) {
        return equalGridCellClass(columnCount);
    }

    const spanOnly = /^span\s+(\d+)$/i.exec(raw);
    if (spanOnly) {
        const span = clampGridSpan(Number(spanOnly[1]));
        return `grid-col-12 tablet:grid-col-${span}`;
    }

    const startSpan = /^(\d+)\s*\/\s*span\s+(\d+)$/i.exec(raw);
    if (startSpan) {
        const startLine = Number(startSpan[1]);
        const span = clampGridSpan(Number(startSpan[2]));
        const offset = Math.min(11, Math.max(0, Math.floor(startLine) - 1));
        const parts: string[] = ['grid-col-12'];
        if (offset > 0) {
            parts.push(`tablet:grid-offset-${offset}`);
        }
        parts.push(`tablet:grid-col-${span}`);
        return parts.join(' ');
    }

    return equalGridCellClass(columnCount);
}

/** Internal helper to render standard USWDS layout title/description headers. */
export function renderUSWDSLayoutHeader(el: HTMLElement, titleText: string | null, descriptionText: string | null): void {
    if (titleText) {
        const h = document.createElement('h3');
        h.className = 'formspec-layout-title';
        h.textContent = titleText;
        el.appendChild(h);
    }
    if (descriptionText) {
        const p = document.createElement('p');
        p.className = 'usa-hint formspec-layout-description';
        p.textContent = descriptionText;
        el.appendChild(p);
    }
}
