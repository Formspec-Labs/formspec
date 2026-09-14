/** @filedesc USWDS repeat-bound Accordion honors group relevance, minRepeat/maxRepeat, and announces add/remove. */
import { describe, it, expect, vi } from 'vitest';
import { signal, computed } from '@preact/signals-core';
import type { AccordionLayoutBehavior } from '@formspec-org/webcomponent';
import { renderUSWDSAccordion } from '../../src/uswds/layout/accordion';
import { mockAdapterContext } from '../helpers';

/** Jobs repeat bounded 1..2; `relevant` starts false like a group behind an unanswered question. */
function repeatBehavior() {
    const count = signal(1);
    const relevant = signal(false);
    const addInstance = vi.fn(() => { count.value += 1; });
    const removeInstance = vi.fn(() => { count.value -= 1; });
    const behavior: AccordionLayoutBehavior = {
        comp: { bind: 'jobs', children: [] },
        host: {
            renderComponent: vi.fn(),
            prefix: '',
            resolveToken: (v: string) => v,
            engine: {} as any,
            cleanupFns: [],
            findItemByKey: () => null,
        },
        repeatCount: count,
        groupLabel: 'Job',
        relevant,
        canAdd: computed(() => count.value < 2),
        canRemove: computed(() => count.value > 1),
        addInstance,
        removeInstance,
    };
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    renderUSWDSAccordion(behavior, parent, mockAdapterContext());
    const button = (text: string) =>
        Array.from(parent.querySelectorAll('button')).filter(b => b.textContent === text);
    return { parent, count, relevant, addInstance, removeInstance, button };
}

const isHidden = (node: Element | null | undefined) => !!node?.classList.contains('formspec-hidden');

describe('renderUSWDSAccordion — repeat bound', () => {
    it('wraps accordion and Add in one repeat container hidden while the group is not relevant', () => {
        const { parent, relevant, button } = repeatBehavior();
        const wrapper = parent.querySelector('.formspec-repeat[data-bind="jobs"]');
        expect(wrapper).toBeTruthy();
        expect(wrapper!.contains(parent.querySelector('.usa-accordion'))).toBe(true);
        expect(wrapper!.contains(button('Add Job')[0])).toBe(true);
        expect(isHidden(wrapper)).toBe(true);

        relevant.value = true;
        expect(isHidden(wrapper)).toBe(false);
    });

    it('hides Add at maxRepeat and ignores clicks there', () => {
        const { count, addInstance, button } = repeatBehavior();
        const add = button('Add Job')[0];
        expect(isHidden(add)).toBe(false);

        add.click();
        expect(count.value).toBe(2);
        expect(isHidden(add)).toBe(true);

        add.click();
        expect(addInstance).toHaveBeenCalledTimes(1);
    });

    it('offers Remove only above minRepeat', () => {
        const { count, button } = repeatBehavior();
        expect(button('Remove Job')).toHaveLength(0);
        count.value = 2;
        expect(button('Remove Job')).toHaveLength(2);
    });

    it('announces add and remove in a polite live region', () => {
        const { parent, button } = repeatBehavior();
        const live = parent.querySelector('.formspec-repeat > .formspec-sr-only[aria-live="polite"]');
        expect(live).toBeTruthy();

        button('Add Job')[0].click();
        expect(live!.textContent).toBe('Job 2 added. 2 total.');

        button('Remove Job')[1].click();
        expect(live!.textContent).toBe('Job 2 removed. 1 remaining.');
    });
});
