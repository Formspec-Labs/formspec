/** @filedesc Tests for createUSWDSFieldDOM shared helper. */
import { describe, it, expect } from 'vitest';
import { buildUSWDSOptions, createUSWDSFieldDOM } from '../../src/uswds/shared';
import type { USWDSFieldDOM } from '../../src/uswds/shared';
import { mockTextInput, mockRating } from '../helpers';

function makeParent(): HTMLElement { return document.createElement('div'); }

describe('createUSWDSFieldDOM', () => {
    it('creates root with usa-form-group and data-name', () => {
        const b = mockTextInput({ fieldPath: 'full_name' });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.root.classList.contains('usa-form-group')).toBe(true);
        expect(dom.root.dataset.name).toBe('full_name');
    });

    it('creates label with usa-label class and text', () => {
        const b = mockTextInput({ label: 'Email' });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.label.classList.contains('usa-label')).toBe(true);
        expect(dom.label.textContent).toBe('Email');
    });

    it('sets for attribute on label by default', () => {
        const b = mockTextInput({ id: 'field-email' });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.label.getAttribute('for')).toBe('field-email');
    });

    it('omits for attribute when labelFor is false', () => {
        const b = mockRating({ id: 'field-rating' });
        const dom = createUSWDSFieldDOM(b, { labelFor: false });
        expect(dom.label.hasAttribute('for')).toBe(false);
    });

    it('adds usa-sr-only when labelPosition is hidden', () => {
        const b = mockTextInput({
            presentation: { labelPosition: 'hidden' } as any,
        });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.label.classList.contains('usa-sr-only')).toBe(true);
    });

    it('creates hint when behavior.hint is set', () => {
        const b = mockTextInput({ hint: 'Enter your full name' });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.hint).toBeTruthy();
        expect(dom.hint!.textContent).toBe('Enter your full name');
        expect(dom.hint!.classList.contains('usa-hint')).toBe(true);
        expect(dom.hint!.id).toBe(`${b.id}-hint`);
    });

    it('hint is undefined when behavior.hint is null', () => {
        const b = mockTextInput({ hint: null });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.hint).toBeUndefined();
    });

    it('hint is appended to root', () => {
        const b = mockTextInput({ hint: 'Some hint' });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.root.contains(dom.hint!)).toBe(true);
    });

    it('creates error element with correct id and class', () => {
        const b = mockTextInput({ id: 'field-x' });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.error.id).toBe('field-x-error');
        expect(dom.error.classList.contains('usa-error-message')).toBe(true);
    });

    it('applies cascade classes to root', () => {
        const b = mockTextInput({
            presentation: { cssClass: 'custom-cls' } as any,
        });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.root.classList.contains('custom-cls')).toBe(true);
    });

    it('applies cascade accessibility to root', () => {
        const b = mockTextInput({
            presentation: {
                accessibility: { role: 'region', description: 'Important' },
            } as any,
        });
        const dom = createUSWDSFieldDOM(b);
        expect(dom.root.getAttribute('role')).toBe('region');
        expect(dom.root.getAttribute('aria-description')).toBe('Important');
    });

    it('label comes before hint in DOM order', () => {
        const b = mockTextInput({ hint: 'Hint text' });
        const dom = createUSWDSFieldDOM(b);
        const children = Array.from(dom.root.children);
        const labelIdx = children.indexOf(dom.label);
        const hintIdx = children.indexOf(dom.hint!);
        expect(labelIdx).toBeLessThan(hintIdx);
    });

    it('error is a child of root after label and optional hint (before adapter appends control)', () => {
        const withHint = mockTextInput({ hint: 'Some hint' });
        const domHint = createUSWDSFieldDOM(withHint);
        expect(domHint.root.contains(domHint.error)).toBe(true);
        const ch = Array.from(domHint.root.children);
        expect(ch.indexOf(domHint.label)).toBeLessThan(ch.indexOf(domHint.hint!));
        expect(ch.indexOf(domHint.hint!)).toBeLessThan(ch.indexOf(domHint.error));

        const noHint = mockTextInput();
        const domNo = createUSWDSFieldDOM(noHint);
        const ch2 = Array.from(domNo.root.children);
        expect(ch2.indexOf(domNo.label)).toBeLessThan(ch2.indexOf(domNo.error));
    });
});

describe('buildUSWDSOptions', () => {
    it('renders usa-checkbox wrappers with stable ids', () => {
        const container = document.createElement('div');
        const controls = buildUSWDSOptions(
            { id: 'grp-1', fieldPath: 'choices' },
            container,
            [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
            'checkbox',
            'choices',
        );
        expect(controls.size).toBe(2);
        expect(container.querySelectorAll('.usa-checkbox').length).toBe(2);
        expect(container.querySelector('#grp-1-1')?.getAttribute('type')).toBe('checkbox');
    });
});
