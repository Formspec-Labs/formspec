/** @filedesc Display components keep their base class beside theme classes (parity with the webcomponent default adapter). */
import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
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
});
