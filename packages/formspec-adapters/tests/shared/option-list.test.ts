/** @filedesc Tests for shared option-list builder. */
import { describe, it, expect } from 'vitest';
import { buildOptionList, clearOptionNodes } from '../../src/shared/option-list';
import { el } from '../../src/helpers';

describe('buildOptionList', () => {
    it('clears prior option wrappers and maps values to inputs', () => {
        const container = el('div', { class: 'opts' });
        const first = buildOptionList({
            behaviorId: 'field-a',
            options: [{ value: 'x', label: 'X' }],
            kind: 'checkbox',
            inputName: 'field.a',
            container,
            renderOption: ({ opt, optId, kind, inputName }) => {
                const wrapper = el('div', { class: `test-${kind}` });
                const input = document.createElement('input') as HTMLInputElement;
                input.id = optId;
                input.type = kind;
                input.name = inputName;
                input.value = opt.value;
                wrapper.appendChild(input);
                return { wrapper, input };
            },
        });
        expect(first.size).toBe(1);
        expect(first.get('x')?.value).toBe('x');
        expect(container.querySelectorAll('[data-option-wrapper]').length).toBe(1);

        const second = buildOptionList({
            behaviorId: 'field-a',
            options: [
                { value: 'y', label: 'Y' },
                { value: 'z', label: 'Z' },
            ],
            kind: 'radio',
            inputName: 'field.a',
            container,
            renderOption: ({ opt, optId, kind, inputName }) => {
                const wrapper = el('div', { class: `test-${kind}` });
                const input = document.createElement('input') as HTMLInputElement;
                input.id = optId;
                input.type = kind;
                input.name = inputName;
                input.value = opt.value;
                wrapper.appendChild(input);
                return { wrapper, input };
            },
        });
        expect(second.size).toBe(2);
        expect(container.querySelectorAll('[data-option-wrapper]').length).toBe(2);
        expect(container.querySelector('#field-a-0')?.getAttribute('type')).toBe('radio');
    });
});

describe('clearOptionNodes', () => {
    it('removes only direct children marked data-option-wrapper', () => {
        const container = el('div');
        const wrapped = el('div', {});
        wrapped.setAttribute('data-option-wrapper', '');
        container.appendChild(wrapped);
        container.appendChild(el('p'));
        clearOptionNodes(container);
        expect(container.children.length).toBe(1);
        expect(container.firstElementChild?.tagName).toBe('P');
    });
});
