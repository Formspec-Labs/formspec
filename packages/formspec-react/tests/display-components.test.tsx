/** @filedesc Display components keep their base class beside theme classes (parity with the webcomponent default adapter). */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

function render(items: any[], tree: unknown) {
    const engine = createFormEngine({ $formspec: '1.0', url: 'urn:test:display', version: '1.0.0', title: 'Display', items });
    const componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test:display' }, tree };
    return actRender(<FormspecForm engine={engine} componentDocument={componentDocument} />);
}

describe('display component classes', () => {
    it('keeps formspec-heading on a Heading that carries a theme class', () => {
        const container = render([], {
            component: 'Stack',
            children: [{ component: 'Heading', level: 2, text: 'Budget', cssClass: 'usa-prose-title' }],
        });
        const heading = container.querySelector('h2')!;
        expect(heading.classList.contains('formspec-heading')).toBe(true);
        expect(heading.classList.contains('usa-prose-title')).toBe(true);
    });

    it('keeps formspec-divider on a Divider that carries a theme class', () => {
        const container = render([], { component: 'Stack', children: [{ component: 'Divider', cssClass: 'thin' }] });
        expect(container.querySelector('hr')?.className).toBe('formspec-divider thin');
    });
});

describe('Divider label (component §5.15)', () => {
    it('centers a component Divider label between two rules, in the default skin markup', () => {
        const container = render([], { component: 'Stack', children: [{ component: 'Divider', label: 'Section Break' }] });
        const divider = container.querySelector('.formspec-divider--labeled')!;
        expect(divider.querySelectorAll('hr.formspec-divider-line')).toHaveLength(2);
        expect(divider.querySelector('.formspec-divider-label')?.textContent).toBe('Section Break');
    });

    it('labels a Divider display Item with its live label', () => {
        const engine = createFormEngine({
            $formspec: '1.0', url: 'urn:test:display', version: '1.0.0', title: 'Display',
            items: [
                { key: 'topic', type: 'field', dataType: 'string', label: 'Topic' },
                { key: 'rule', type: 'display', label: 'About {{$topic}}', presentation: { widgetHint: 'Divider' } },
            ],
        });
        const container = actRender(<FormspecForm engine={engine} />);
        act(() => engine.setValue('topic', 'pets'));
        expect(container.querySelector('.formspec-divider-label')?.textContent).toBe('About pets');
    });
});
