'use client';

/** @filedesc useFocusField — programmatic field focus with wizard/tab/collapsible navigation. */
import { useCallback, useRef } from 'react';

export interface UseFocusFieldResult {
    /** Focus a field by its bind path. Returns true if found and focused. */
    focusField: (path: string) => boolean;
    /** Ref to attach to the form container for DOM queries. */
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useFocusField(): UseFocusFieldResult {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const focusField = useCallback((path: string): boolean => {
        const container = containerRef.current;
        return container ? focusFieldIn(container, path) : false;
    }, []);

    return { focusField, containerRef };
}

/**
 * Measure the bottom edge (in px) of stacked sticky/fixed top chrome bars overlapping the top of
 * the viewport so field/section jumps clear host headers without slicing headings or labels.
 */
export function measureStickyTopOffset(el: HTMLElement | null): number {
    if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return 0;
    const doc = el.ownerDocument;
    const viewportWidth = window.innerWidth || doc.documentElement?.clientWidth || 0;
    const viewportHeight = window.innerHeight || doc.documentElement?.clientHeight || 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) return 0;

    let maxBottom = 0;
    const candidates = doc.querySelectorAll<HTMLElement>(
        'header, nav, [role="banner"], [data-sticky], [data-sticky-header], .fs-surface-header, .fs-surface-top-bar, .fs-surface-nav-bar, .fs-surface-preview-banner, .formspec-workspace__mobile-findings-bar',
    );
    for (const candidate of candidates) {
        if (candidate.closest('.formspec-workspace__navigation, .formspec-workspace__findings')) continue;
        const style = window.getComputedStyle(candidate);
        if (style.position !== 'sticky' && style.position !== 'fixed') continue;
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const rect = candidate.getBoundingClientRect();
        if (rect.height <= 0 || rect.bottom <= 0) continue;
        if (rect.top < -1 || rect.top > viewportHeight * 0.45) continue;
        if (rect.width < viewportWidth * 0.5) continue;
        if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    }
    return maxBottom;
}

/** Sync `--formspec-sticky-offset` on `container` when stacked host top bars are detected. */
export function syncStickyOffsetVar(container: HTMLElement | null): number {
    const measured = measureStickyTopOffset(container);
    if (container && measured > 0) {
        container.style.setProperty('--formspec-sticky-offset', `${Math.ceil(measured)}px`);
    }
    return measured;
}

/** Scroll `target` into view cleanly below any measured sticky top chrome. */
export function scrollTargetIntoView(
    target: HTMLElement,
    block: ScrollLogicalPosition = 'center',
    stickyOffsetPx = 0,
): void {
    if (stickyOffsetPx > 0) {
        const minMargin = `${Math.ceil(stickyOffsetPx + 20)}px`;
        if (!target.style.scrollMarginTop) {
            target.style.scrollMarginTop = minMargin;
        }
    }
    const prefersReducedMotion =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;
    if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block });
    }
}

/**
 * Focus the field rendered at `path` (its `[data-name]` root) inside `container`, first revealing it:
 * open ancestor `<details>`, activate a hidden tab panel, or navigate a hidden wizard step.
 * Returns true if a focusable control was found and focused.
 */
export function focusFieldIn(container: HTMLElement, path: string): boolean {
    const fieldEl = container.querySelector<HTMLElement>(`[data-name="${path}"]`);
    if (!fieldEl) return false;

    // Open any ancestor <details> elements (collapsibles)
    let parent = fieldEl.parentElement;
    while (parent && parent !== container) {
        if (parent.tagName === 'DETAILS' && !(parent as HTMLDetailsElement).open) {
            (parent as HTMLDetailsElement).open = true;
        }
        parent = parent.parentElement;
    }

    // The tab selection commits through React. A caller can retry focus after it paints.
    const hiddenTabs = '[role="tabpanel"][hidden]';
    for (let tab = fieldEl.closest<HTMLElement>(hiddenTabs); tab; tab = tab.parentElement?.closest<HTMLElement>(hiddenTabs) ?? null) {
        container.querySelector<HTMLElement>(`[aria-controls="${tab.id}"]`)?.click();
    }
    if (fieldEl.closest(hiddenTabs)) return false;

    // If inside a hidden wizard panel, navigate to that step
    const wizardPanel = fieldEl.closest<HTMLElement>('.formspec-wizard-panel[hidden]');
    if (wizardPanel) {
        const panels = Array.from(wizardPanel.parentElement?.querySelectorAll('.formspec-wizard-panel') ?? []);
        const stepIndex = panels.indexOf(wizardPanel);
        if (stepIndex >= 0) {
            const stepButtons = container.querySelectorAll<HTMLElement>('.formspec-wizard-step');
            stepButtons[stepIndex]?.click();
        }
    }

    const stickyOffset = syncStickyOffsetVar(container);
    scrollTargetIntoView(fieldEl, 'center', stickyOffset);

    const input = fieldEl.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([disabled])');
    if (!input) return false;
    input.focus({ preventScroll: true });
    return input.ownerDocument.activeElement === input;
}

/** Enclosing group/repeat path of an instance path (`a[0].b` → `a[0]` → `a` → `''`). */
function parentInstancePath(path: string): string {
    const parent = path.replace(/(\[\d+\]|\.[^.[\]]+)$/, '');
    return parent === path ? '' : parent;
}

/**
 * Focus the first rendered field, in page order, carrying an error result on itself or an enclosing
 * group; report order follows binds and shapes, not layout. Falls back to the first error's path.
 * Same rule as formspec-webcomponent `submit/index.ts` firstInvalidFieldPath. O(fields × path depth).
 */
export function focusFirstInvalidField(
    container: HTMLElement,
    results: ReadonlyArray<{ path?: string; severity?: string }>,
): boolean {
    const errorPaths = results.filter((r) => r.severity === 'error' && r.path).map((r) => r.path!);
    if (errorPaths.length === 0) return false;
    const errorPathSet = new Set(errorPaths);
    for (const fieldEl of container.querySelectorAll<HTMLElement>('[data-name]')) {
        const name = fieldEl.dataset.name!;
        for (let path = name; path; path = parentInstancePath(path)) {
            if (errorPathSet.has(path)) return focusFieldIn(container, name);
        }
    }
    return focusFieldIn(container, errorPaths[0]);
}
