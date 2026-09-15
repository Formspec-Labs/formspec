/** @filedesc USWDS RepeatCards — one usa-card per instance, outline Remove in the footer, filled Add below. */
import { describe, it, expect, vi } from 'vitest';
import { signal, effect } from '@preact/signals-core';
import type { RepeatGroupLayoutBehavior } from '@formspec-org/webcomponent';
import { renderUSWDSRepeatCards } from '../../src/uswds/layout/repeat-cards';
import { uswdsAdapter } from '../../src/uswds/index';
import { mockAdapterContext } from '../helpers';

function hostSlice() {
    return {
        renderComponent: vi.fn(),
        prefix: '',
        resolveToken: (v: unknown) => v,
        engine: {} as never,
        cleanupFns: [],
        findItemByKey: () => null,
    };
}

/** Jobs 1..n, two rows, with the row heading and Remove availability under the test's control. */
function mountCards(options: {
    canRemove?: boolean;
    rowLabel?: string;
    title?: string | null;
    titleHidden?: boolean;
    headingLevel?: string;
} = {}) {
    const count = signal(2);
    const addInstance = vi.fn(() => { count.value += 1; });
    const removeInstance = vi.fn(() => { count.value -= 1; });
    const behavior: RepeatGroupLayoutBehavior = {
        comp: { cssClasses: [], props: {}, style: undefined, accessibility: undefined },
        host: hostSlice() as never,
        bindKey: 'jobs',
        titleText: options.title == null ? null : signal(options.title),
        titleHidden: options.titleHidden ?? false,
        headingLevel: options.headingLevel ?? 'h3',
        addLabel: signal('Add another job'),
        renderRows: (build) => {
            effect(() => build({
                count: count.value,
                canRemove: options.canRemove ?? true,
                rowText: (index) => ({
                    label: signal(options.rowLabel ?? `Job ${index + 1}`),
                    ariaLabel: signal(`Job ${index + 1} of ${count.value}`),
                    removeLabel: signal('Remove job'),
                    removeAriaLabel: signal(`Remove job ${index + 1}`),
                }),
                renderRow: (_index, parent) => { parent.appendChild(document.createElement('input')); },
                watch: (fn) => { effect(fn); },
            }));
        },
        addInstance,
        removeInstance,
        bind: vi.fn(() => () => {}),
    };
    const parent = document.createElement('div');
    renderUSWDSRepeatCards(behavior, parent, mockAdapterContext());
    return { parent, behavior, addInstance, removeInstance };
}

describe('USWDS RepeatCards', () => {
    it('renders each instance as a usa-card headed by the row label', () => {
        const { parent } = mountCards();
        const cards = parent.querySelectorAll('div.usa-card');

        expect(cards).toHaveLength(2);
        const container = cards[0].querySelector('.usa-card__container');
        expect(container).not.toBeNull();
        expect(container!.querySelector('.usa-card__header > h3.usa-card__heading')?.textContent).toBe('Job 1');
        expect(cards[1].querySelector('h3.usa-card__heading')?.textContent).toBe('Job 2');
    });

    it('puts the row fields in the card body', () => {
        const { parent } = mountCards();
        expect(parent.querySelectorAll('.usa-card__body > input')).toHaveLength(2);
    });

    it('names each card so the row boundary survives a suppressed heading', () => {
        const { parent } = mountCards({ rowLabel: '' });
        const card = parent.querySelector('div.usa-card')!;

        expect(card.getAttribute('role')).toBe('group');
        expect(card.getAttribute('aria-label')).toBe('Job 1 of 2');
        expect((card.querySelector('.usa-card__header') as HTMLElement).hidden).toBe(true);
    });

    it('renders Add below the list as the filled usa-button', () => {
        const { parent, addInstance } = mountCards();
        const add = parent.querySelector<HTMLButtonElement>('button.usa-button:not(.usa-button--outline)');

        expect(add).not.toBeNull();
        expect(add!.textContent).toBe('Add another job');
        // Add follows the rows: it is the move after the last card, not a header control.
        expect(add!.previousElementSibling?.querySelector('.usa-card')).not.toBeNull();
        // Structural class: the layout sheet sizes it to its label (left-aligned) instead of the column.
        expect(add!.classList.contains('formspec-repeat-add')).toBe(true);
        add!.click();
        expect(addInstance).toHaveBeenCalledOnce();
    });

    it('renders Remove as an outline usa-button in the card footer, one per row', () => {
        const { parent, removeInstance } = mountCards();
        const removes = parent.querySelectorAll<HTMLButtonElement>('.usa-card__footer > button.usa-button.usa-button--outline');

        expect(removes).toHaveLength(2);
        expect(removes[0].getAttribute('aria-label')).toBe('Remove job 1');
        removes[1].click();
        expect(removeInstance).toHaveBeenCalledWith(1);
    });

    it('omits Remove and its footer at minRepeat or when Remove is locked', () => {
        const { parent } = mountCards({ canRemove: false });

        expect(parent.querySelectorAll('.usa-card__footer')).toHaveLength(0);
        expect(parent.querySelectorAll('div.usa-card')).toHaveLength(2);
    });

    it('announces add and remove through a polite live region', () => {
        const { parent, behavior } = mountCards();

        expect(parent.querySelector('[aria-live="polite"]')).not.toBeNull();
        expect(behavior.bind).toHaveBeenCalledOnce();
    });

    it('emits no fieldset chrome — the card is the row boundary', () => {
        const { parent } = mountCards();

        expect(parent.querySelector('fieldset')).toBeNull();
        expect(parent.querySelector('.formspec-repeat-instance')).toBeNull();
    });

    it("wraps the cards and Add in one fieldset when the group has a title, the shape a titled group takes", () => {
        const { parent } = mountCards({ title: 'Jobs on record' });
        const container = parent.querySelector('[data-bind="jobs"]') as HTMLElement;
        const formGroup = container.querySelector('.usa-form-group') as HTMLElement;
        expect(formGroup).not.toBeNull();
        expect(container.firstElementChild).toBe(formGroup);
        const fieldset = formGroup.querySelector('fieldset.usa-fieldset') as HTMLElement;
        expect(fieldset).not.toBeNull();
        expect(formGroup.firstElementChild).toBe(fieldset);
        const legend = fieldset.querySelector('legend') as HTMLElement;
        expect(legend.className).toBe('usa-legend formspec-group-title usa-legend--large');
        expect(legend.textContent).toBe('Jobs on record');
        expect(fieldset.firstElementChild).toBe(legend);
        expect(fieldset.querySelectorAll('div.usa-card')).toHaveLength(2);
        // Add is the fieldset's last child — it follows the cards, same order as an untitled repeat.
        expect(fieldset.lastElementChild?.classList.contains('formspec-repeat-add')).toBe(true);
        // The announcer stays outside the fieldset — a direct child of the outer container.
        expect(container.lastElementChild?.getAttribute('aria-live')).toBe('polite');
    });

    it('keeps a hidden repeat title in the accessible markup as an sr-only legend (theme §5.2)', () => {
        const { parent } = mountCards({ title: 'Jobs on record', titleHidden: true });
        const legend = parent.querySelector('legend.formspec-group-title') as HTMLElement;
        expect(legend.className).toBe('usa-legend formspec-group-title usa-sr-only');
    });

    it('wraps nothing extra when the group has no title — same markup as before this fix', () => {
        const { parent } = mountCards();
        expect(parent.querySelector('.usa-form-group')).toBeNull();
        expect(parent.querySelector('legend.formspec-group-title')).toBeNull();
    });
});

describe('adapter registration', () => {
    it('routes RepeatCards', () => {
        expect(uswdsAdapter.components.RepeatCards).toBe(renderUSWDSRepeatCards);
    });
});
