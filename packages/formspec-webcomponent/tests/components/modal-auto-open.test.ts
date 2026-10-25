/** @filedesc A `trigger: "auto"` Modal is open only while its `when` holds and its wizard page is shown. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { minimalComponentDoc, multiFieldDef } from '../helpers/engine-fixtures';

beforeAll(async () => {
    const { FormspecRender } = await import('../../src/index');
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});

// happy-dom lays nothing out, so this stands in for the browser. An element is rendered unless it or an
// ancestor carries the renderer's hiding class or `hidden`, and a rendered box has a non-zero size. `layout()`
// is a frame: like ResizeObserver it reports only targets whose box appeared or vanished since their last
// report (a new target counts as 0×0). `resizeAll()` is a frame in which every rendered box changed size.
// A browser flags a target first observed during delivery ("ResizeObserver loop completed with undelivered
// notifications"), so the stand-in records those.
type Observer = { cb: ResizeObserverCallback; seen: Map<Element, boolean> };
const observers = new Set<Observer>();
let delivering = false;
const observedWhileDelivering: Element[] = [];
const rendered = (el: Element) => (el as HTMLElement).checkVisibility();
function deliver(changed: (o: Observer) => Element[]): void {
    delivering = true;
    try {
        for (const o of [...observers]) {
            const targets = changed(o);
            if (targets.length) o.cb(targets.map((target) => ({ target })) as unknown as ResizeObserverEntry[], {} as ResizeObserver);
        }
    } finally {
        delivering = false;
    }
}
function layout(): void {
    deliver((o) => [...o.seen].filter(([el, was]) => {
        o.seen.set(el, rendered(el));
        return rendered(el) !== was;
    }).map(([el]) => el));
}
function resizeAll(): void {
    deliver((o) => [...o.seen.keys()].filter(rendered));
}
beforeEach(() => {
    observedWhileDelivering.length = 0;
    vi.stubGlobal('ResizeObserver', class {
        private o: Observer;
        constructor(cb: ResizeObserverCallback) { this.o = { cb, seen: new Map() }; observers.add(this.o); }
        observe(el: Element) {
            if (this.o.seen.has(el)) return;
            if (delivering) observedWhileDelivering.push(el);
            this.o.seen.set(el, false);
        }
        unobserve(el: Element) { this.o.seen.delete(el); }
        disconnect() { observers.delete(this.o); }
    });
    (HTMLElement.prototype as any).checkVisibility = function (this: HTMLElement) {
        return this.isConnected && !this.closest('.formspec-hidden, [hidden]');
    };
});
afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as any).checkVisibility;
    observers.clear();
    vi.unstubAllGlobals();
});

function renderWizard() {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = minimalComponentDoc({
        component: 'Stack',
        children: [
            { component: 'Section', title: 'Budget', children: [{ component: 'Toggle', bind: 'uses' }] },
            {
                component: 'Section',
                title: 'Subcontractors',
                children: [{
                    component: 'Modal',
                    title: 'Certification',
                    trigger: 'auto',
                    when: '$uses',
                    children: [{ component: 'Text', text: 'Register in SAM.gov' }],
                }],
            },
        ],
    });
    el.definition = {
        ...multiFieldDef([{ key: 'uses', dataType: 'boolean' }, { key: 'notes' }]),
        formPresentation: { pageMode: 'wizard' },
    };
    el.render();
    const dialog = el.querySelector('dialog.formspec-modal') as HTMLDialogElement;
    const next = () => (el.querySelector('.formspec-wizard-next') as HTMLButtonElement).click();
    const prev = () => (el.querySelector('.formspec-wizard-prev') as HTMLButtonElement).click();
    return { host: el as HTMLElement, engine: el.getEngine(), dialog, next, prev };
}

describe('Modal trigger "auto"', () => {
    it('stays closed while its page is hidden, and opens when the page is shown', () => {
        const { engine, dialog, next } = renderWizard();
        engine.setValue('uses', true);
        layout();
        expect(dialog.open).toBe(false);

        next();
        layout();
        expect(dialog.open).toBe(true);
    });

    it('opens as soon as `when` holds on the shown page, and closes when it stops holding', () => {
        const { engine, dialog, next } = renderWizard();
        next();
        layout();
        expect(dialog.open).toBe(false);

        engine.setValue('uses', true);
        expect(dialog.open).toBe(true);
        engine.setValue('uses', false);
        expect(dialog.open).toBe(false);
    });

    it('stays dismissed while its page stays shown, and opens again when the page is re-entered', () => {
        const { engine, dialog, next, prev } = renderWizard();
        engine.setValue('uses', true);
        next();
        layout();
        dialog.close();
        resizeAll(); // the page relaid out (a row added, a resize): not a reason to re-prompt
        expect(dialog.open).toBe(false);

        prev();
        layout();
        next();
        layout();
        expect(dialog.open).toBe(true);
    });

    it('closes when its page is hidden while it is open', () => {
        const { engine, dialog, next } = renderWizard();
        engine.setValue('uses', true);
        next();
        layout();
        expect(dialog.open).toBe(true);

        wizardOf(dialog).dispatchEvent(new CustomEvent('formspec-wizard-set-step', { detail: { index: 0 } }));
        layout();
        expect(dialog.open).toBe(false);
    });

    it('does not open before the first frame, so a host hiding the form in between leaves it closed', () => {
        const { host, engine, dialog, next } = renderWizard();
        next();
        engine.setValue('uses', true);
        host.hidden = true; // every observed box is 0×0 at the first frame, so none is ever reported
        layout();
        expect(dialog.open).toBe(false);

        host.hidden = false;
        layout();
        expect(dialog.open).toBe(true);
    });

    it('re-checks visibility only when `when` changes, not on every answer', () => {
        const { engine, dialog, next } = renderWizard();
        next();
        layout();
        engine.setValue('uses', true);
        expect(dialog.open).toBe(true);

        const checks = vi.spyOn(HTMLElement.prototype as any, 'checkVisibility');
        engine.setValue('notes', 'unrelated');
        expect(checks).not.toHaveBeenCalled();
    });

    it('observes no new ancestor while resize notifications are being delivered', async () => {
        const { engine, next, prev } = renderWizard();
        layout();
        await Promise.resolve(); // the render has attached every ancestor
        engine.setValue('uses', true);
        next();
        layout();
        prev();
        layout();
        expect(observedWhileDelivering).toEqual([]);
    });
});

/** The wizard root that owns the dialog's page. */
function wizardOf(dialog: HTMLDialogElement): HTMLElement {
    return dialog.closest('.formspec-wizard') as HTMLElement;
}
