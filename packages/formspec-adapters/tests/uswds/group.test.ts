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

function mountGroup(
    title: string | null,
    headingLevel = 'h3',
    options: { titleHidden?: boolean; hint?: string } = {},
) {
    const behavior: GroupLayoutBehavior = {
        comp: { cssClasses: [], props: {}, style: undefined, accessibility: undefined },
        host: hostSlice() as never,
        titleText: title === null ? null : signal(title),
        titleHidden: options.titleHidden ?? false,
        hintText: options.hint === undefined ? null : signal(options.hint),
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
function mountRepeat(options: {
    canRemove?: boolean;
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
        bindKey: 'employers',
        titleText: options.title == null ? null : signal(options.title),
        titleHidden: options.titleHidden ?? false,
        headingLevel: options.headingLevel ?? 'h3',
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
    it('renders a titled group as a fieldset named by its legend, inside a form group', () => {
        const { parent } = mountGroup('Mailing address');
        const fieldset = parent.querySelector('fieldset.usa-fieldset');
        expect(fieldset).not.toBeNull();
        // Same shape as a question, so a section separates from the preceding field by USWDS's own margins.
        expect(fieldset!.parentElement!.className).toBe('usa-form-group');
        expect(fieldset!.querySelector('legend.usa-legend')?.textContent).toBe('Mailing address');
        expect(fieldset!.querySelector('input')).not.toBeNull();
    });

    it('gives a section-level group the large legend, so it reads as a heading not a question', () => {
        const { parent } = mountGroup('Eligibility Questions');
        const legend = parent.querySelector('legend');
        expect(legend!.className).toBe('usa-legend formspec-group-title usa-legend--large');
    });

    it('keeps a nested group on the plain legend — USWDS has no middle size', () => {
        const { parent } = mountGroup('Mailing address', 'h4');
        const legend = parent.querySelector('legend');
        expect(legend!.className).toBe('usa-legend formspec-group-title');
    });

    it('records the heading depth the legend stands for, so a variant can size a third level', () => {
        expect(mountGroup('Eligibility', 'h3').parent.querySelector('legend')!.dataset.headingLevel).toBe('h3');
        expect(mountGroup('Retirement and pension', 'h4').parent.querySelector('legend')!.dataset.headingLevel).toBe('h4');
        expect(mountRepeat({ title: 'Your employers on record', headingLevel: 'h5' }).parent.querySelector('legend.formspec-group-title')!.dataset.headingLevel).toBe('h5');
    });

    it('emits no Formspec default group wrapper, but names the legend structurally like the default adapter does', () => {
        const { parent } = mountGroup('Mailing address');
        expect(parent.querySelector('.formspec-group')).toBeNull();
        // ADR 0064: `formspec-group-title` is structure, not skin — it lets a variant target a group's
        // title without also catching a question's legend, which shares every other USWDS class.
        expect(parent.querySelector('legend.formspec-group-title')).not.toBeNull();
    });

    it('renders an untitled group as a plain scope wrapper, never an unnamed fieldset', () => {
        const { parent } = mountGroup(null);
        expect(parent.querySelector('fieldset')).toBeNull();
        expect(parent.querySelector('legend')).toBeNull();
        expect(parent.querySelector('input')).not.toBeNull();
    });

    it('keeps a hidden title in the accessible markup as an sr-only legend (theme §5.2)', () => {
        const { parent } = mountGroup('Work this week', 'h3', { titleHidden: true });
        const legend = parent.querySelector('legend')!;

        // Present and named for assistive technology; off the page for everyone else.
        expect(legend.textContent).toBe('Work this week');
        expect(legend.className).toBe('usa-legend formspec-group-title usa-sr-only');
        expect(parent.querySelector('fieldset.usa-fieldset')).not.toBeNull();
        // No title on the page, so no gap of its own: the group's first question supplies the one gap.
        expect(parent.querySelector('.usa-form-group')).toBeNull();
    });

    it("renders the group's hint as a usa-hint under the legend", () => {
        const { parent } = mountGroup('Hours worked', 'h4', { hint: "If you worked more than 99 hours, enter '99'." });
        const fieldset = parent.querySelector('fieldset.usa-fieldset')!;
        const hint = fieldset.querySelector('span.usa-hint')!;

        expect(hint.textContent).toBe("If you worked more than 99 hours, enter '99'.");
        expect(hint.previousElementSibling?.tagName).toBe('LEGEND');
    });

    it('renders no hint node when the group has none', () => {
        const { parent } = mountGroup('Hours worked');
        expect(parent.querySelector('span.usa-hint')).toBeNull();
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

    it("wraps the rows and Add in one fieldset when the group has a title, the shape a titled group takes", () => {
        const { parent } = mountRepeat({ title: 'Employers on record' });
        const container = parent.querySelector('[data-bind="employers"]') as HTMLElement;
        // The bound root is the form group, exactly as a titled group's root is.
        expect(container.classList.contains('usa-form-group')).toBe(true);
        const fieldset = container.firstElementChild as HTMLElement;
        expect(fieldset.matches('fieldset.usa-fieldset')).toBe(true);
        const legend = fieldset.querySelector('legend') as HTMLElement;
        expect(legend.className).toBe('usa-legend formspec-group-title usa-legend--large');
        expect(legend.textContent).toBe('Employers on record');
        expect(fieldset.firstElementChild).toBe(legend);
        // The rows (their own fieldsets) and Add sit inside the group's fieldset now.
        expect(fieldset.querySelectorAll('fieldset.usa-fieldset')).toHaveLength(2);
        expect(fieldset.querySelector('button.usa-button--outline')).not.toBeNull();
        // The announcer stays outside the fieldset — a direct child of the outer container.
        expect(container.lastElementChild?.getAttribute('aria-live')).toBe('polite');
    });

    it('keeps a hidden repeat title in the accessible markup as an sr-only legend (theme §5.2)', () => {
        const { parent } = mountRepeat({ title: 'Employers on record', titleHidden: true });
        const legend = parent.querySelector('legend.formspec-group-title') as HTMLElement;
        expect(legend.className).toBe('usa-legend formspec-group-title usa-sr-only');
        expect(parent.querySelector('.usa-form-group')).toBeNull();
    });

    it('keeps a nested repeat on the plain legend — same size rule as a titled group', () => {
        const { parent } = mountRepeat({ title: 'Employers on record', headingLevel: 'h4' });
        const legend = parent.querySelector('legend.formspec-group-title') as HTMLElement;
        expect(legend.className).toBe('usa-legend formspec-group-title');
    });

    it('wraps nothing extra when the group has no title — same markup as before this fix', () => {
        const { parent } = mountRepeat();
        expect(parent.querySelector('.usa-form-group')).toBeNull();
        expect(parent.querySelector('legend.formspec-group-title')).toBeNull();
        expect(parent.querySelectorAll('fieldset.usa-fieldset')).toHaveLength(2); // rows only
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
        expect(parent.querySelector('.formspec-repeat-remove')).toBeNull();
        expect(parent.querySelector('.formspec-focus-ring')).toBeNull();
    });

    it('marks Add with the structural repeat-add class, so the layout sheet sizes it to its label', () => {
        const { parent } = mountRepeat();
        const add = parent.querySelector('button.usa-button--outline') as HTMLButtonElement;
        // The layout primitive keys `align-self: flex-start` on this class: a flex-column child otherwise
        // stretches to the form column. The USWDS accordion repeat already carries it; group and cards
        // must too, or the same button renders full-width in one layout and label-width in another.
        expect(add.classList.contains('formspec-repeat-add')).toBe(true);
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
