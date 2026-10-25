/** @filedesc Opens a `trigger: "auto"` Modal only while its `when` holds and its place in the form is rendered. */

/** The open-state controller for one auto-trigger `<dialog>`. */
export interface AutoModal {
    /** The Modal's `when` result (`true` when it has none). */
    setCondition(holds: boolean): void;
    dispose(): void;
}

/**
 * Component spec §6.16 opens a `trigger: "auto"` Modal "based on `when`", and §8.1 hides a component
 * whose ancestor is hidden: the dialog is open exactly while `when` holds AND its page, tab panel or
 * `when` wrapper is rendered. `showModal()` inside a hidden wizard page leaves an invisible open dialog
 * that makes the rest of the document inert.
 *
 * The dialog follows that conjunction's edges, not its level: a respondent who closes it is not
 * prompted again until it turns false and then true (they leave the page and come back, or `when`
 * flips). ResizeObserver on the dialog's ancestors (below `<body>`) reports a container appearing or
 * disappearing, the signal charting and grid libraries use to redraw inside a tab that just became
 * visible; `onOpen` runs after each automatic open.
 */
export function bindAutoModal(dialog: HTMLDialogElement, onOpen?: () => void): AutoModal {
    let holds = false;
    let shown = false;
    let disposed = false;
    const observed = new WeakSet<Element>();
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(reconcile) : null;

    // A render attaches the dialog's ancestors after binding it, so the chain is extended later, but never
    // from the ResizeObserver callback: an ancestor observed there sits shallower than the boxes being
    // reported, and the browser flags "ResizeObserver loop completed with undelivered notifications".
    function observeAncestors(): void {
        if (!resize || disposed) return;
        const body = dialog.ownerDocument.body;
        for (let el = dialog.parentElement; el && el !== body; el = el.parentElement) {
            if (observed.has(el)) continue;
            observed.add(el);
            resize.observe(el);
        }
    }

    function reconcile(): void {
        const next = holds && isRendered(dialog);
        if (next === shown) return;
        shown = next;
        if (next && !dialog.open) {
            dialog.showModal();
            onOpen?.();
        } else if (!next && dialog.open) {
            dialog.close();
        }
    }

    observeAncestors();
    queueMicrotask(observeAncestors);
    return {
        setCondition(next: boolean): void {
            holds = next;
            observeAncestors();
            reconcile();
        },
        dispose(): void {
            disposed = true;
            resize?.disconnect();
        },
    };
}

/**
 * Whether the dialog's place in the document is rendered. It is drawn where its parent's box is; a
 * `display: contents` parent (ConditionalGroup) has none, so the first ancestor that has one answers.
 */
function isRendered(dialog: HTMLDialogElement): boolean {
    if (!dialog.isConnected) return false;
    for (let el = dialog.parentElement; el; el = el.parentElement) {
        if (getComputedStyle(el).display === 'contents') continue;
        return typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.getClientRects().length > 0;
    }
    return false;
}
