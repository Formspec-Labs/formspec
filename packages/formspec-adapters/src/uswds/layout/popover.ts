/** @filedesc USWDS Popover — trigger + floating `usa-card` panel (popover API or hidden fallback). */
import { effect } from '@preact/signals-core';
import { watchText, type AdapterContext, type PopoverLayoutBehavior } from '@formspec-org/webcomponent';
import { focusFirstIn, positionOverlayNearTrigger, type PopupPlacement } from './overlay';

export function renderUSWDSPopover(behavior: PopoverLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host, titleResolved, triggerLabelFallback } = behavior;
    const placement: PopupPlacement = comp.placement || 'bottom';

    const wrapper = document.createElement('div');
    if (comp.id) wrapper.id = comp.id;
    wrapper.className = 'formspec-popover';

    const triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'usa-button usa-button--outline formspec-focus-ring';
    triggerBtn.setAttribute('aria-haspopup', 'dialog');
    triggerBtn.setAttribute('aria-expanded', 'false');

    const triggerPath = comp.triggerBind
        ? host.prefix
            ? `${host.prefix}.${comp.triggerBind}`
            : comp.triggerBind
        : null;
    const triggerSignal = triggerPath ? host.engine.signals[triggerPath] : null;
    if (triggerSignal) {
        host.cleanupFns.push(
            effect(() => {
                const val = triggerSignal.value;
                triggerBtn.textContent =
                    val === undefined || val === null || val === '' ? triggerLabelFallback.value : String(val);
            })
        );
    } else {
        watchText(actx, triggerLabelFallback, (text) => { triggerBtn.textContent = text; });
    }

    const card = document.createElement('div');
    card.className = 'usa-card';
    card.setAttribute('role', 'dialog');
    watchText(actx, titleResolved, (text) => { card.setAttribute('aria-label', text); });
    if (comp.placement) card.dataset.placement = comp.placement;

    const cardContainer = document.createElement('div');
    cardContainer.className = 'usa-card__container';

    const cardBody = document.createElement('div');
    cardBody.className = 'usa-card__body formspec-popover-content';
    for (const child of comp.children || []) {
        host.renderComponent(child, cardBody, host.prefix);
    }
    cardContainer.appendChild(cardBody);
    card.appendChild(cardContainer);

    const focusFirstInContent = () => focusFirstIn(cardBody);

    const closePopover = () => {
        const cardAny = card as any;
        if (typeof cardAny.hidePopover === 'function') {
            try {
                cardAny.hidePopover();
            } catch {
                /* already hidden */
            }
        } else {
            card.hidden = true;
        }
        triggerBtn.setAttribute('aria-expanded', 'false');
        triggerBtn.focus();
    };

    card.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePopover();
        }
    });

    const cardAny = card as any;
    if (typeof cardAny.showPopover === 'function') {
        cardAny.popover = 'auto';
        triggerBtn.addEventListener('click', () => {
            cardAny.togglePopover();
            const isOpen = cardAny.matches(':popover-open');
            triggerBtn.setAttribute('aria-expanded', String(isOpen));
            if (isOpen) {
                queueMicrotask(() => {
                    positionOverlayNearTrigger(triggerBtn, card, placement);
                    focusFirstInContent();
                });
            }
        });
    } else {
        card.hidden = true;
        const onClickOutside = (e: MouseEvent) => {
            if (!wrapper.contains(e.target as Node)) closePopover();
        };
        triggerBtn.addEventListener('click', () => {
            card.hidden = !card.hidden;
            triggerBtn.setAttribute('aria-expanded', String(!card.hidden));
            if (!card.hidden) {
                queueMicrotask(() => {
                    positionOverlayNearTrigger(triggerBtn, card, placement);
                    focusFirstInContent();
                });
                document.addEventListener('click', onClickOutside, true);
            } else {
                document.removeEventListener('click', onClickOutside, true);
            }
        });
        actx.onDispose(() => document.removeEventListener('click', onClickOutside, true));
    }

    wrapper.appendChild(triggerBtn);
    wrapper.appendChild(card);
    actx.applyCssClass(wrapper, comp);
    actx.applyAccessibility(wrapper, comp);
    actx.applyStyle(wrapper, comp.style);
    parent.appendChild(wrapper);
}
