/** @filedesc A `trigger: "auto"` Modal is open only while its `when` holds and its tab panel is shown. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import type { LayoutNode } from '@formspec-org/layout';
import { FormspecNode } from '../src/node-renderer';
import { FormspecProvider } from '../src/context';

beforeAll(async () => {
    await initFormspecEngine();
});

// happy-dom lays nothing out, so this stands in for the browser. An element is rendered unless it or an
// ancestor carries `hidden`, and a rendered box has a non-zero size. `layout()` is a frame: like
// ResizeObserver it reports only targets whose box appeared or vanished since their last report (a new
// target counts as 0×0). `resizeAll()` is a frame in which every rendered box changed size.
type Observer = { cb: ResizeObserverCallback; seen: Map<Element, boolean> };
const observers = new Set<Observer>();
const rendered = (el: Element) => (el as HTMLElement).checkVisibility();
function deliver(changed: (o: Observer) => Element[]): void {
    for (const o of [...observers]) {
        const targets = changed(o);
        if (targets.length) o.cb(targets.map((target) => ({ target })) as unknown as ResizeObserverEntry[], {} as ResizeObserver);
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
    vi.stubGlobal('ResizeObserver', class {
        private o: Observer;
        constructor(cb: ResizeObserverCallback) { this.o = { cb, seen: new Map() }; observers.add(this.o); }
        observe(el: Element) { if (!this.o.seen.has(el)) this.o.seen.set(el, false); }
        unobserve(el: Element) { this.o.seen.delete(el); }
        disconnect() { observers.delete(this.o); }
    });
    (HTMLElement.prototype as any).checkVisibility = function (this: HTMLElement) {
        return this.isConnected && !this.closest('[hidden]');
    };
});
afterEach(() => {
    document.body.innerHTML = '';
    delete (HTMLElement.prototype as any).checkVisibility;
    observers.clear();
    vi.unstubAllGlobals();
});

const def = {
    $formspec: '1.0', url: 'https://test.example/auto-modal', version: '1.0.0', status: 'active',
    title: 'Auto modal', name: 'auto-modal', items: [],
};

function layoutNode(id: string, component: string, props: Record<string, unknown>, children: LayoutNode[] = []): LayoutNode {
    return { id, component, category: 'layout', props, cssClasses: [], children };
}

function renderTabs() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const tree = layoutNode('tabs', 'Tabs', { tabLabels: ['Budget', 'Subcontractors'] }, [
        layoutNode('budget', 'Stack', {}),
        layoutNode('subs', 'Stack', {}, [
            layoutNode('cert', 'Modal', { title: 'Certification', trigger: 'auto' }),
        ]),
    ]);
    flushSync(() => {
        createRoot(container).render(
            <FormspecProvider engine={createFormEngine(def)}>
                <FormspecNode node={tree} />
            </FormspecProvider>,
        );
    });
    const dialog = container.querySelector('dialog.formspec-modal') as HTMLDialogElement;
    const showTab = (index: number) => act(() => {
        (container.querySelectorAll('[role="tab"]')[index] as HTMLButtonElement).click();
    });
    return { dialog, showTab };
}

describe('Modal trigger "auto" (React)', () => {
    it('stays closed while its tab panel is hidden, and opens when the panel is shown', () => {
        const { dialog, showTab } = renderTabs();
        layout();
        expect(dialog.open).toBe(false);

        showTab(1);
        layout();
        expect(dialog.open).toBe(true);
    });

    it('stays dismissed while its panel stays shown, and opens again when the panel is re-entered', () => {
        const { dialog, showTab } = renderTabs();
        showTab(1);
        layout();
        dialog.close();
        resizeAll(); // the panel relaid out: not a reason to re-prompt
        expect(dialog.open).toBe(false);

        showTab(0);
        layout();
        showTab(1);
        layout();
        expect(dialog.open).toBe(true);
    });
});
