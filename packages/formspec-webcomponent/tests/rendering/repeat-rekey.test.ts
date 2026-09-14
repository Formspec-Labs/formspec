import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { repeatGroupDef } from '../helpers/engine-fixtures';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

/** Renders the repeat with `rows` added instances; minRepeat is absent, so it starts empty (Core §4.2.2). */
function renderFormspec(rows = 1) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.definition = repeatGroupDef();
    el.render();
    const engine = el.getEngine();
    for (let row = 0; row < rows; row += 1) {
        engine.addRepeatInstance('items');
    }
    return { element: el, engine };
}

describe('repeat instance accessibility and styling parity', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('each repeat instance has role="group" and aria-label with index', () => {
        const { element } = renderFormspec(3);

        const instances = element.querySelectorAll('.formspec-repeat-instance');
        expect(instances).toHaveLength(3);

        // Each instance should have role="group" for accessibility
        expect(instances[0].getAttribute('role')).toBe('group');
        expect(instances[1].getAttribute('role')).toBe('group');
        expect(instances[2].getAttribute('role')).toBe('group');

        // Each instance should have an aria-label like "Items 1 of 3"
        expect(instances[0].getAttribute('aria-label')).toBe('Items 1 of 3');
        expect(instances[1].getAttribute('aria-label')).toBe('Items 2 of 3');
        expect(instances[2].getAttribute('aria-label')).toBe('Items 3 of 3');

        const repeatContainer = element.querySelector('.formspec-repeat') as HTMLElement;
        expect(repeatContainer).toBeTruthy();
        expect(repeatContainer.querySelector('.formspec-repeat-list')).toBeTruthy();
        expect(repeatContainer.querySelector('.formspec-repeat-add')).toBeTruthy();
        expect(repeatContainer.querySelector('.formspec-sr-only[aria-live="polite"]')).toBeTruthy();
    });

    it('repeat instance is not display:contents (has box model)', () => {
        const { element } = renderFormspec();
        const instance = element.querySelector('.formspec-repeat-instance') as HTMLElement;
        expect(instance).toBeTruthy();
        // display:contents removes the box — should NOT be used
        expect(getComputedStyle(instance).display).not.toBe('contents');
    });
});

describe('repeat DOM re-keying after non-tail deletion', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('rebuilds surviving instances so shifted values stay aligned', () => {
        const { element, engine } = renderFormspec(3);

        engine.setValue('items[0].name', 'Alice');
        engine.setValue('items[1].name', 'Bob');
        engine.setValue('items[2].name', 'Charlie');

        const inputsBefore = element.querySelectorAll('input[name]') as NodeListOf<HTMLInputElement>;
        expect(inputsBefore).toHaveLength(3);
        expect(inputsBefore[1].value).toBe('Bob');
        expect(inputsBefore[2].value).toBe('Charlie');

        engine.removeRepeatInstance('items', 1);

        const inputsAfter = element.querySelectorAll('input[name]') as NodeListOf<HTMLInputElement>;
        expect(inputsAfter).toHaveLength(2);
        expect(inputsAfter[0].getAttribute('name')).toContain('items[0].name');
        expect(inputsAfter[1].getAttribute('name')).toContain('items[1].name');
        expect(inputsAfter[0].value).toBe('Alice');
        expect(inputsAfter[1].value).toBe('Charlie');
    });

    it('adds accessible labels to remove buttons', () => {
        const { element } = renderFormspec();
        const removeButton = element.querySelector('.formspec-repeat-remove') as HTMLButtonElement;
        expect(removeButton).toBeTruthy();
        expect(removeButton.getAttribute('aria-label')).toBe('Remove Items 1');
    });

    it('renders a visible instance header inside each repeat row', () => {
        const { element } = renderFormspec();
        const instanceHeader = element.querySelector('.formspec-repeat-instance-header');
        const instanceLabel = element.querySelector('.formspec-repeat-instance-label');
        const removeButton = element.querySelector('.formspec-repeat-instance-header .formspec-repeat-remove');

        expect(instanceHeader).toBeTruthy();
        expect(instanceLabel?.textContent).toBe('Items 1');
        expect(removeButton).toBeTruthy();
    });
});
