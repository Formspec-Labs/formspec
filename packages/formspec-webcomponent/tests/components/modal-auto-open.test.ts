/** @filedesc A `trigger: "auto"` Modal is open only while its `when` holds and its wizard page is shown. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { minimalComponentDoc, multiFieldDef } from '../helpers/engine-fixtures';

beforeAll(async () => {
    const { FormspecRender } = await import('../../src/index');
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});

// happy-dom lays nothing out: stand in for the browser's rendering facts. An element is rendered unless it
// or an ancestor carries the renderer's hiding class or `hidden`; ResizeObserver callbacks run on `layout()`.
// A browser reports an element first observed during delivery as "ResizeObserver loop completed with
// undelivered notifications", so the stand-in records those.
const observers = new Set<{ cb: ResizeObserverCallback; targets: Set<Element> }>();
let delivering = false;
const observedWhileDelivering: Element[] = [];
function layout(): void {
    delivering = true;
    try {
        for (const o of observers) if (o.targets.size) o.cb([], {} as ResizeObserver);
    } finally {
        delivering = false;
    }
}
beforeEach(() => {
    observedWhileDelivering.length = 0;
    vi.stubGlobal('ResizeObserver', class {
        private o: { cb: ResizeObserverCallback; targets: Set<Element> };
        constructor(cb: ResizeObserverCallback) { this.o = { cb, targets: new Set() }; observers.add(this.o); }
        observe(el: Element) {
            if (delivering && !this.o.targets.has(el)) observedWhileDelivering.push(el);
            this.o.targets.add(el);
        }
        unobserve(el: Element) { this.o.targets.delete(el); }
        disconnect() { observers.delete(this.o); }
    });
    (HTMLElement.prototype as any).checkVisibility = function (this: HTMLElement) {
        return this.isConnected && !this.closest('.formspec-hidden, [hidden]');
    };
});
afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
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
    el.definition = { ...multiFieldDef([{ key: 'uses', dataType: 'boolean' }]), formPresentation: { pageMode: 'wizard' } };
    el.render();
    const dialog = el.querySelector('dialog.formspec-modal') as HTMLDialogElement;
    const next = () => (el.querySelector('.formspec-wizard-next') as HTMLButtonElement).click();
    const prev = () => (el.querySelector('.formspec-wizard-prev') as HTMLButtonElement).click();
    return { engine: el.getEngine(), dialog, next, prev };
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
        layout(); // the page relaid out (a row added, a resize): not a reason to re-prompt
        expect(dialog.open).toBe(false);

        prev();
        layout();
        next();
        layout();
        expect(dialog.open).toBe(true);
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
});

/** The wizard root that owns the dialog's page. */
function wizardOf(dialog: HTMLDialogElement): HTMLElement {
    return dialog.closest('.formspec-wizard') as HTMLElement;
}
