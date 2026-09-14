/** @filedesc Character count copy shared by every TextInput renderer (USWDS usa-character-count wording). */
import { describe, it, expect } from 'vitest';
import { characterCountLimitMessage, characterCountStatus } from '../src/index.js';

describe('character count copy', () => {
    it('states the limit while empty', () => {
        expect(characterCountStatus(0, 10)).toBe('10 characters allowed');
        expect(characterCountLimitMessage(10)).toBe('You can enter up to 10 characters');
    });

    it('counts characters left, singular at one', () => {
        expect(characterCountStatus(3, 10)).toBe('7 characters left');
        expect(characterCountStatus(9, 10)).toBe('1 character left');
        expect(characterCountStatus(10, 10)).toBe('0 characters left');
    });

    it('counts characters over the limit', () => {
        expect(characterCountStatus(11, 10)).toBe('1 character over limit');
        expect(characterCountStatus(14, 10)).toBe('4 characters over limit');
    });
});
