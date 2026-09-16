/** @filedesc USWDS Modal: a native dialog carrying usa-modal, centered by the browser unless the spec's placement anchors it. */
import { describe, it, expect, vi } from 'vitest';
import { signal } from '@preact/signals-core';
import type { ModalLayoutBehavior } from '@formspec-org/webcomponent';
import { renderUSWDSModal } from '../../src/uswds/layout/modal';
import { mockAdapterContext, readUswdsAdapterCss } from '../helpers';

function mount(comp: Record<string, unknown> = {}) {
    const behavior: ModalLayoutBehavior = {
        comp: { id: 'terms', trigger: 'button', triggerLabel: 'View terms', closable: true, children: [], ...comp },
        host: {
            renderComponent: vi.fn(),
            prefix: '',
            engine: {} as never,
            cleanupFns: [],
            findItemByKey: () => null,
            resolveToken: (v: unknown) => v,
        } as never,
        titleText: signal('Terms and Conditions'),
        triggerLabelText: signal('View terms'),
    };
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    renderUSWDSModal(behavior, parent, mockAdapterContext());
    return {
        dialog: parent.querySelector('dialog') as HTMLDialogElement,
        trigger: parent.querySelector('button.usa-button:not(.usa-modal__close)') as HTMLButtonElement,
    };
}

describe('USWDS Modal', () => {
    it('is a native dialog carrying usa-modal with the USWDS content structure', () => {
        const { dialog } = mount({ size: 'lg' });
        expect(dialog.classList.contains('usa-modal')).toBe(true);
        expect(dialog.classList.contains('usa-modal--lg')).toBe(true);
        expect(dialog.querySelector('.usa-modal__content > .usa-modal__main > h2.usa-modal__heading')?.textContent).toBe('Terms and Conditions');
        expect(dialog.getAttribute('aria-labelledby')).toBe('terms-title');
    });

    it('opens as the browser-centered modal when the spec sets no placement', () => {
        const { dialog, trigger } = mount();
        trigger.click();
        expect(dialog.open).toBe(true);
        // Nothing anchors it: no inline positioning, so the stylesheet's `dialog.usa-modal` rule and the
        // UA's top-layer centering own where it sits.
        expect(dialog.style.position).toBe('');
        expect(dialog.style.top).toBe('');
        dialog.close();
        expect(dialog.open).toBe(false);
    });

    it('disappears when closed, under USWDS\'s own modal rules', () => {
        // `.usa-modal` sets `display: inline-block` (USWDS hides its modal through a wrapper), which
        // outranks the UA's `dialog:not([open]) { display: none }`. Close would then close the dialog and
        // leave its box painted; the rules layer restates the closed state.
        const style = document.createElement('style');
        style.textContent = readUswdsAdapterCss();
        document.head.appendChild(style);
        try {
            const { dialog, trigger } = mount();
            expect(getComputedStyle(dialog).display).toBe('none');
            trigger.click();
            expect(dialog.open).toBe(true);
            expect(getComputedStyle(dialog).display).not.toBe('none');
            dialog.close();
            expect(dialog.open).toBe(false);
            expect(getComputedStyle(dialog).display).toBe('none');
        } finally {
            style.remove();
        }
    });

    it('anchors near its trigger only when the spec sets placement', async () => {
        const { dialog, trigger } = mount({ placement: 'bottom' });
        // happy-dom lays nothing out; the anchoring helper skips a zero-sized overlay, so give it a box.
        dialog.getBoundingClientRect = () => ({ x: 0, y: 0, width: 320, height: 200, top: 0, left: 0, right: 320, bottom: 200, toJSON() {} }) as DOMRect;
        trigger.click();
        expect(dialog.open).toBe(true);
        await Promise.resolve(); // the render positions after the dialog opens, in a microtask
        expect(dialog.style.position).toBe('fixed');
    });
});
