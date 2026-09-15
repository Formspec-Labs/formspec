/** @filedesc USWDS bound groups and repeat rows are fieldsets with legends, and their affordances are usa-buttons. */
import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect } from '@preact/signals-core';
import type { GroupLayoutBehavior, RepeatGroupLayoutBehavior } from '@formspec-org/webcomponent';
import { renderUSWDSGroup, renderUSWDSRepeatGroup } from '../../src/uswds/layout/group';
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

function mountGroup(title: string | null, headingLevel = 'h3') {
    const behavior: GroupLayoutBehavior = {
        comp: { cssClasses: [], props: {}, style: undefined, accessibility: undefined },
        host: hostSlice() as never,
        titleText: title === null ? null : signal(title),
        headingLevel,
        renderChildren: vi.fn((parent: HTMLElement) => {
            const field = document.createElement('input');
            parent.appendChild(field);
        }),
        bind: vi.fn(() => () => {}),
    };
    const parent = document.createElement('div');
    renderUSWDSGroup(behavior, parent, mockAdapterContext());
    return { parent, behavior };
}

/** Employers bounded 1..3, with Add and Remove both available. */
function mountRepeat(options: { canRemove?: boolean } = {}) {
    const count = signal(2);
    const addInstance = vi.fn(() => { count.value += 1; });
    const removeInstance = vi.fn(() => { count.value -= 1; });
    const behavior: RepeatGroupLayoutBehavior = {
        comp: { cssClasses: [], props: {}, style: undefined, accessibility: undefined },
        host: hostSlice() as never,
        bindKey: 'employers',
        addLabel: signal('Add Employer on record'),
        renderRows: (build) => {
            effect(() => build({
                count: count.value,
                canRemove: options.canRemove ?? true,
                rowText: (index) => ({
                    label: signal(`Employer on record ${index + 1}`),
                    ariaLabel: signal(`Employer on record ${index + 1} of ${count.value}`),
                    removeLabel: signal('Remove Employer on record'),
                    removeAriaLabel: signal(`Remove Employer on record ${index + 1}`),
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
    renderUSWDSRepeatGroup(behavior, parent, mockAdapterContext());
    return { parent, behavior, addInstance, removeInstance };
}

describe('USWDS bound group', () => {
    it('renders a titled group as a fieldset named by its legend', () => {
        const { parent } = mountGroup('Mailing address');
        const fieldset = parent.querySelector('fieldset.usa-fieldset');
        expect(fieldset).not.toBeNull();
        expect(fieldset!.querySelector('legend.usa-legend')?.textContent).toBe('Mailing address');
        expect(fieldset!.querySelector('input')).not.toBeNull();
    });

    it('gives a section-level group the large legend, so it reads as a heading not a question', () => {
        const { parent } = mountGroup('Eligibility Questions');
        const legend = parent.querySelector('legend');
        expect(legend!.className).toBe('usa-legend usa-legend--large');
    });

    it('keeps a nested group on the plain legend — USWDS has no middle size', () => {
        const { parent } = mountGroup('Mailing address', 'h4');
        const legend = parent.querySelector('legend');
        expect(legend!.className).toBe('usa-legend');
    });

    it('emits no Formspec default group chrome', () => {
        const { parent } = mountGroup('Mailing address');
        expect(parent.querySelector('.formspec-group')).toBeNull();
        expect(parent.querySelector('.formspec-group-title')).toBeNull();
    });

    it('renders an untitled group as a plain scope wrapper, never an unnamed fieldset', () => {
        const { parent } = mountGroup(null);
        expect(parent.querySelector('fieldset')).toBeNull();
        expect(parent.querySelector('legend')).toBeNull();
        expect(parent.querySelector('input')).not.toBeNull();
    });

    it('binds so the renderer can hide it when the group is not relevant', () => {
        const { behavior } = mountGroup('Mailing address');
        expect(behavior.bind).toHaveBeenCalledOnce();
    });
});

describe('USWDS repeatable group', () => {
    it('renders each row as a fieldset with its own legend', () => {
        const { parent } = mountRepeat();
        const rows = parent.querySelectorAll('fieldset.usa-fieldset');
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelector('legend.usa-legend')?.textContent).toBe('Employer on record 1');
        expect(rows[1].querySelector('legend.usa-legend')?.textContent).toBe('Employer on record 2');
        // Rows are peers inside one section: the fieldset boundary carries the grouping, not a heading size.
        expect(rows[0].querySelector('legend')!.className).toBe('usa-legend');
    });

    it('renders Add as an outline usa-button', () => {
        const { parent, addInstance } = mountRepeat();
        const add = parent.querySelector<HTMLButtonElement>('button.usa-button.usa-button--outline');
        expect(add).not.toBeNull();
        expect(add!.textContent).toBe('Add Employer on record');
        add!.click();
        expect(addInstance).toHaveBeenCalledOnce();
    });

    it('renders Remove as an unstyled usa-button, one per row', () => {
        const { parent, removeInstance } = mountRepeat();
        const removes = parent.querySelectorAll<HTMLButtonElement>('button.usa-button.usa-button--unstyled');
        expect(removes).toHaveLength(2);
        expect(removes[0].getAttribute('aria-label')).toBe('Remove Employer on record 1');
        removes[1].click();
        expect(removeInstance).toHaveBeenCalledWith(1);
    });

    it('omits Remove when the group is at minRepeat or Remove is locked', () => {
        const { parent } = mountRepeat({ canRemove: false });
        expect(parent.querySelectorAll('button.usa-button--unstyled')).toHaveLength(0);
        expect(parent.querySelectorAll('fieldset.usa-fieldset')).toHaveLength(2);
    });

    it('emits no Formspec default repeat chrome', () => {
        const { parent } = mountRepeat();
        expect(parent.querySelector('.formspec-repeat-instance')).toBeNull();
        expect(parent.querySelector('.formspec-repeat-add')).toBeNull();
        expect(parent.querySelector('.formspec-repeat-remove')).toBeNull();
    });

    it('announces add and remove through a polite live region', () => {
        const { parent, behavior } = mountRepeat();
        expect(parent.querySelector('[aria-live="polite"]')).not.toBeNull();
        expect(behavior.bind).toHaveBeenCalledOnce();
    });
});

describe('adapter registration', () => {
    it('routes Group and RepeatGroup', () => {
        expect(uswdsAdapter.components.Group).toBe(renderUSWDSGroup);
        expect(uswdsAdapter.components.RepeatGroup).toBe(renderUSWDSRepeatGroup);
    });
});
