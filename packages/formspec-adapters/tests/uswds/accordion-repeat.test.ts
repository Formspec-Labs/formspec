/** @filedesc USWDS repeat-bound Accordion honors group relevance, minRepeat/maxRepeat, and announces add/remove. */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { signal, computed, effect } from '@preact/signals-core';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { FormspecRender, globalRegistry, type AccordionLayoutBehavior } from '@formspec-org/webcomponent';
import { renderUSWDSAccordion } from '../../src/uswds/layout/accordion';
import { uswdsAdapter } from '../../src/uswds/index';
import { mockAdapterContext } from '../helpers';

/** Jobs repeat bounded 1..2; `relevant` starts false like a group behind an unanswered question. */
function repeatBehavior() {
    const count = signal(1);
    const relevant = signal(false);
    const addInstance = vi.fn(() => { count.value += 1; });
    const removeInstance = vi.fn(() => { count.value -= 1; });
    const behavior: AccordionLayoutBehavior = {
        comp: { bind: 'jobs', children: [] },
        sectionLabel: (index) => signal(`Section ${index + 1}`),
        host: {
            renderComponent: vi.fn(),
            prefix: '',
            resolveToken: (v: string) => v,
            engine: {} as any,
            cleanupFns: [],
            findItemByKey: () => null,
        },
        repeatCount: count,
        groupLabel: signal('Job'),
        relevant,
        canAdd: computed(() => count.value < 2),
        renderRows: (build) => {
            effect(() => build({
                count: count.value,
                canRemove: count.value > 1,
                renderComponent: vi.fn(),
                watch: (fn) => { effect(fn); },
            }));
        },
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

describe('renderUSWDSAccordion — repeat bound, in formspec-render', () => {
    beforeAll(async () => {
        await initFormspecEngine();
        if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
    });

    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach((e) => e.remove());
        globalRegistry.setAdapter('default');
    });

    const jobsTree = { component: 'Accordion', bind: 'jobs', children: [{ component: 'TextInput', bind: 'employer' }] };
    const jobsItems = [{
        key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 1,
        children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
    }];

    function render(tree: any = jobsTree, items: any[] = jobsItems) {
        globalRegistry.registerAdapter(uswdsAdapter);
        globalRegistry.setAdapter('uswds');
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:jobs' },
            tree,
        };
        el.definition = { $formspec: '1.0', url: 'urn:test:jobs', version: '1.0.0', title: 'Jobs', items };
        el.render();
        return { el, engine: el.getEngine() };
    }

    it('focusField opens the hidden panel holding the field', () => {
        const { el } = render(
            {
                component: 'Accordion',
                defaultOpen: 0,
                children: [{ component: 'TextInput', bind: 'name' }, { component: 'TextInput', bind: 'email' }],
            },
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
            ],
        );
        const [namePanel, emailPanel] = Array.from(el.querySelectorAll('.usa-accordion__content')) as HTMLElement[];
        expect(emailPanel.hidden).toBe(true);

        expect(el.focusField('email')).toBe(true);

        expect(emailPanel.hidden).toBe(false);
        expect(namePanel.hidden).toBe(true);
        expect(document.activeElement).toBe(emailPanel.querySelector('input'));
    });

    it('disposes the previous rows\' effects on every re-render', () => {
        const { el, engine } = render();
        const baseline = el.cleanupFns.length;

        for (let cycle = 0; cycle < 5; cycle++) {
            engine.addRepeatInstance('jobs');
            engine.removeRepeatInstance('jobs', 1);
        }

        expect(el.cleanupFns.length).toBe(baseline);
    });

    it('allowAdd / allowRemove false hide Add and Remove on data-supplied rows (component §6.3)', () => {
        const { el, engine } = render({ ...jobsTree, allowAdd: false, allowRemove: false });
        engine.addRepeatInstance('jobs');
        expect(engine.repeats.jobs.value).toBe(2);
        const shown = (selector: string) =>
            Array.from(el.querySelectorAll(selector)).filter((node) => !(node as Element).classList.contains('formspec-hidden'));
        expect(shown('.formspec-repeat-add')).toHaveLength(0);
        expect(shown('.formspec-repeat-remove')).toHaveLength(0);
        expect(el.querySelectorAll('input[name$="employer"]')).toHaveLength(2);
    });
});
