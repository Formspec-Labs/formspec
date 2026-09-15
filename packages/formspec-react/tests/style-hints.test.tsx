/** @filedesc Core §4.2.5.3 styleHints reach the item roots the React renderer draws, as the web component's do. */
import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

describe('group heading depth', () => {
    it('titles a section h3 and a group inside it h4, as the web component does', () => {
        const engine = createFormEngine({
            $formspec: '1.0', url: 'urn:test:depth', version: '1.0.0', title: 'Depth',
            items: [{
                key: 'eligibility', type: 'group', label: 'Eligibility',
                children: [{
                    key: 'retirement', type: 'group', label: 'Retirement and pension',
                    children: [{ key: 'pension', type: 'field', dataType: 'string', label: 'Pension' }],
                }],
            }],
        });
        const container = actRender(<FormspecForm engine={engine} />);
        const titles = [...container.querySelectorAll('.formspec-group-title')].map((el) => [el.tagName, el.textContent]);
        expect(titles).toEqual([['H3', 'Eligibility'], ['H4', 'Retirement and pension']]);
    });
});

describe('styleHints', () => {
    it('puts each item’s tone and size classes on the root the default skin styles', () => {
        const engine = createFormEngine({
            $formspec: '1.0', url: 'urn:test:style-hints', version: '1.0.0', title: 'Style hints',
            items: [
                { key: 'featured', type: 'field', dataType: 'string', label: 'Featured', presentation: { styleHints: { emphasis: 'primary', size: 'large' } } },
                { key: 'aside', type: 'display', label: 'Only if it changed.', presentation: { styleHints: { emphasis: 'muted' } } },
                {
                    key: 'extra', type: 'group', label: 'Extra', presentation: { styleHints: { size: 'compact' } },
                    children: [{ key: 'note', type: 'field', dataType: 'string', label: 'Note' }],
                },
            ],
        });
        const container = actRender(<FormspecForm engine={engine} />);

        const featured = container.querySelector('.formspec-emphasis-primary')!;
        expect(featured.classList.contains('formspec-size-large')).toBe(true);
        expect(featured.textContent).toContain('Featured');
        expect(container.querySelector('.formspec-emphasis-muted')?.textContent).toContain('Only if it changed.');
        expect(container.querySelector('.formspec-size-compact')?.textContent).toContain('Note');
    });
});
