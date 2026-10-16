/** @filedesc The USWDS FileUpload drop target holds no interactive role around its file input: axe finds no violations. */
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { renderFileUpload } from '../../src/uswds/file-upload';
import { mockAdapterContext, mockFileUpload } from '../helpers';

describe('USWDS FileUpload accessibility (axe, WCAG A/AA)', () => {
    it('has no violations, and the file input is the only control', async () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        renderFileUpload(mockFileUpload({ dragDrop: true, accept: '.pdf' }), parent, mockAdapterContext());
        const target = parent.querySelector('.usa-file-input__target')!;
        expect(target.getAttribute('role')).toBeNull();
        expect(target.hasAttribute('tabindex')).toBe(false);
        const input = parent.querySelector('input[type="file"]')!;
        expect(parent.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toContain('Drag file here');

        const results = await axe.run(parent, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], rules: { 'color-contrast': { enabled: false } } });
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    });
});
