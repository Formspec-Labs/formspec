/** @filedesc CheckboxGroup field state on the group (not the first checkbox) and read-only groups that cannot change. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
    const mod = await import('../src/index');
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', mod.FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function renderCheckboxGroup(bind: Record<string, string>, initialValue?: string[], selectAll = false) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:checkbox-state' },
        tree: { component: 'Stack', children: [{ component: 'CheckboxGroup', bind: 'pets', selectAll }] },
    };
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:checkbox-state',
        version: '1.0.0',
        title: 'Checkbox state',
        items: [{
            key: 'pets', type: 'field', label: 'Pets', dataType: 'multiChoice',
            ...(initialValue ? { initialValue } : {}),
            options: [{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }],
        }],
        binds: [{ path: 'pets', ...bind }],
    };
    el.render();
    return el;
}

describe('CheckboxGroup state', () => {
    it('marks the group invalid and no checkbox required or invalid', () => {
        const el = renderCheckboxGroup({ required: 'true' });
        const group = el.querySelector('.formspec-checkbox-group') as HTMLElement;
        el.submit({ emitEvent: false });
        expect(group.getAttribute('aria-invalid')).toBe('true');
        // WAI-ARIA `group` supports neither aria-required nor aria-readonly, and aria-required on one checkbox
        // would announce "check this box": the legend's required indicator carries it.
        expect(group.hasAttribute('aria-required')).toBe(false);
        for (const checkbox of el.querySelectorAll('input[type="checkbox"]')) {
            expect(checkbox.hasAttribute('aria-required')).toBe(false);
            expect(checkbox.hasAttribute('aria-invalid')).toBe(false);
        }
    });

    it('keeps a read-only group focusable but unchangeable, each checkbox announced read-only', () => {
        const el = renderCheckboxGroup({ readonly: 'true' }, ['cat'], true);
        const checkboxes = Array.from(el.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
        expect(checkboxes).toHaveLength(3);
        for (const checkbox of checkboxes) {
            expect(checkbox.disabled).toBe(false);
            expect(checkbox.getAttribute('aria-readonly')).toBe('true');
        }
        const [selectAll, cat, dog] = checkboxes;
        let changes = 0;
        el.addEventListener('change', () => { changes += 1; });

        dog.click();
        cat.click();
        (dog.closest('label') as HTMLLabelElement).click();
        selectAll.click();

        expect(el.getEngine().signals['pets'].value).toEqual(['cat']);
        expect([cat.checked, dog.checked, selectAll.checked]).toEqual([true, false, false]);
        expect(changes).toBe(0);
    });

    it('lets the group change again once it is no longer read-only', () => {
        const el = renderCheckboxGroup({ readonly: '$lock' }, ['cat']);
        const dog = el.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement;
        dog.click();
        expect(el.getEngine().signals['pets'].value).toEqual(['cat', 'dog']);
        expect(dog.getAttribute('aria-readonly')).toBe('false');
    });
});
