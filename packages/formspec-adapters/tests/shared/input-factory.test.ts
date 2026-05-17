/** @filedesc Unit tests for shared input skeleton factory. */
import { describe, it, expect } from 'vitest';
import { createInputSkeleton } from '../../src/shared/input-factory';
import { mockFieldBehavior, mockTextInput } from '../helpers';

describe('createInputSkeleton', () => {
    it('creates a single input with id, name, and placeholder', () => {
        const behavior = mockTextInput({
            id: 'field-email',
            fieldPath: 'email',
            placeholder: 'you@example.com',
        });
        const { control, actualInput } = createInputSkeleton(behavior, {
            inputClass: 'usa-input',
        });

        expect(control).toBe(actualInput);
        expect(actualInput.tagName).toBe('INPUT');
        expect(actualInput.id).toBe('field-email');
        expect((actualInput as HTMLInputElement).name).toBe('email');
        expect((actualInput as HTMLInputElement).placeholder).toBe('you@example.com');
        expect(actualInput.className).toBe('usa-input');
    });

    it('creates textarea when maxLines > 1', () => {
        const behavior = mockTextInput({ maxLines: 4 });
        const { actualInput } = createInputSkeleton(behavior);

        expect(actualInput.tagName).toBe('TEXTAREA');
        expect(Number((actualInput as HTMLTextAreaElement).rows)).toBe(4);
    });

    it('wraps prefix and suffix in a group control', () => {
        const behavior = mockTextInput({
            prefix: '$',
            suffix: '.00',
        });
        const { control, actualInput, prefixEl, suffixEl } = createInputSkeleton(behavior, {
            groupClass: 'usa-input-group',
            prefixClass: 'usa-input-prefix',
            suffixClass: 'usa-input-suffix',
        });

        expect(control.tagName).toBe('DIV');
        expect(control.className).toBe('usa-input-group');
        expect(prefixEl?.textContent).toBe('$');
        expect(suffixEl?.textContent).toBe('.00');
        expect(control.contains(actualInput)).toBe(true);
    });

    it('sets aria-describedby when provided', () => {
        const behavior = mockFieldBehavior({ id: 'field-x', fieldPath: 'x' });
        const { actualInput } = createInputSkeleton(behavior, {
            ariaDescribedBy: 'hint-x',
        });

        expect(actualInput.getAttribute('aria-describedby')).toBe('hint-x');
    });
});
