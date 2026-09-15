/** @filedesc USWDS Modal — native `<dialog>` with `usa-modal` inner structure (CSS-only; no USWDS modal JS). */
import { effect } from '@preact/signals-core';
import { uiText, watchText, type AdapterContext, type ModalLayoutBehavior } from '@formspec-org/webcomponent';
import { focusFirstIn, positionOverlayNearTrigger, type PopupPlacement } from './overlay';

function hideDialog(dialog: HTMLDialogElement): void {
    dialog.hidden = true;
    dialog.setAttribute('hidden', '');
}

function showDialog(dialog: HTMLDialogElement): void {
    dialog.hidden = false;
    dialog.removeAttribute('hidden');
}

export function renderUSWDSModal(behavior: ModalLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleText, triggerLabelText } = behavior;
    // Component spec: `placement` anchors the open dialog near its trigger; omitted means the native
    // centered modal, which the stylesheet's `dialog.usa-modal` rule keeps in the top layer.
    const placement: PopupPlacement | undefined = comp.placement;

    const dialog = document.createElement('dialog');
    if (comp.id) dialog.id = comp.id;
    dialog.className = 'usa-modal formspec-modal';
    hideDialog(dialog);
    if (comp.size) dialog.dataset.size = comp.size;
    if (comp.size === 'lg') dialog.classList.add('usa-modal--lg');

    const contentWrap = document.createElement('div');
    contentWrap.className = 'usa-modal__content';

    const main = document.createElement('div');
    main.className = 'usa-modal__main';

    if (titleText) {
        const titleId = `${comp.id || 'modal'}-title`;
        const titleEl = document.createElement('h2');
        titleEl.className = 'usa-modal__heading';
        titleEl.id = titleId;
        watchText(actx, titleText, (text) => { titleEl.textContent = text; });
        main.appendChild(titleEl);
        dialog.setAttribute('aria-labelledby', titleId);
    } else if (comp.triggerLabel) {
        watchText(actx, triggerLabelText, (text) => { dialog.setAttribute('aria-label', text); });
    }

    const body = document.createElement('div');
    body.className = 'usa-prose formspec-modal-content';
    for (const child of comp.children || []) {
        host.renderComponent(child, body, host.prefix);
    }
    main.appendChild(body);
    contentWrap.appendChild(main);

    if (comp.closable !== false) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'usa-button usa-modal__close formspec-focus-ring';
        watchText(actx, uiText(actx.engine, 'modal.close'), (text) => { closeBtn.setAttribute('aria-label', text); });
        closeBtn.innerHTML = '<span aria-hidden="true">\u00d7</span>';
        closeBtn.addEventListener('click', () => dialog.close());
        contentWrap.appendChild(closeBtn);
    }

    dialog.appendChild(contentWrap);
    actx.applyCssClass(dialog, comp);
    actx.applyAccessibility(dialog, comp);
    actx.applyStyle(dialog, comp.style);
    parent.appendChild(dialog);

    const triggerMode = comp.trigger || 'button';
    if (triggerMode === 'auto') {
        if (comp.when) {
            const exprFn = host.engine.compileExpression(comp.when, host.prefix);
            host.cleanupFns.push(
                effect(() => {
                    const shouldOpen = !!exprFn();
                    if (shouldOpen && !dialog.open) {
                        showDialog(dialog);
                        dialog.showModal();
                        queueMicrotask(() => focusFirstIn(dialog));
                    } else if (!shouldOpen && dialog.open) {
                        dialog.close();
                        hideDialog(dialog);
                    }
                })
            );
        } else {
            queueMicrotask(() => {
                showDialog(dialog);
                if (!dialog.open) dialog.showModal();
                focusFirstIn(dialog);
            });
        }
        return;
    }

    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'usa-button formspec-focus-ring';
    watchText(actx, triggerLabelText, (text) => { triggerBtn.textContent = text; });

    const repositionDialog = () => {
        if (placement && dialog.open) positionOverlayNearTrigger(triggerBtn, dialog, placement);
    };

    triggerBtn.addEventListener('click', () => {
        showDialog(dialog);
        if (!dialog.open) dialog.showModal();
        queueMicrotask(() => {
            repositionDialog();
            focusFirstIn(dialog);
        });
    });
    window.addEventListener('resize', repositionDialog);
    window.addEventListener('scroll', repositionDialog, true);
    actx.onDispose(() => {
        window.removeEventListener('resize', repositionDialog);
        window.removeEventListener('scroll', repositionDialog, true);
    });
    dialog.addEventListener('close', () => {
        hideDialog(dialog);
        triggerBtn.focus();
    });
    parent.appendChild(triggerBtn);
}
