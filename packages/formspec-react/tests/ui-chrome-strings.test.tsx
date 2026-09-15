/** @filedesc Renderer chrome strings (Locale §3.1.10 $ui.<ChromeStringKey>): Add label and Select placeholder come from the shared UI_STRINGS inventory, and the repeat Add label follows a Locale override. */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';

import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const URL = 'urn:test:ui-chrome-strings';

describe('$ui.repeat.add — repeat Add button', () => {
    function render() {
        const engine = createFormEngine({
            $formspec: '1.0', url: URL, version: '1.0.0', title: 'Jobs',
            items: [
                {
                    key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 1,
                    children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
                },
            ],
        });
        const tree = { component: 'Stack', bind: 'jobs', title: 'Job', children: [{ component: 'TextInput', bind: 'employer' }] };
        const componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL }, tree };
        const container = actRender(<FormspecForm engine={engine} componentDocument={componentDocument} />);
        return { container, engine };
    }

    it('the unauthored default comes from the shared UI_STRINGS inventory ("Add {{$label}}")', () => {
        const { container } = render();
        const addBtn = container.querySelector('.formspec-repeat-add') as HTMLElement;
        expect(addBtn.textContent).toBe('Add Job');
    });

    it('follows an authored $ui.repeat.add Locale override, and back', () => {
        const { container, engine } = render();
        const addBtn = () => container.querySelector('.formspec-repeat-add') as HTMLElement;
        expect(addBtn().textContent).toBe('Add Job');

        act(() => {
            engine.loadLocale({
                $formspecLocale: '2.0', locale: 'es', version: '1.0.0',
                target: { kind: 'definition', url: URL },
                strings: { '$ui.repeat.add': 'Agregar {{$label}}' },
            } as any);
            engine.setLocale('es');
        });
        expect(addBtn().textContent).toBe('Agregar Job');

        act(() => engine.setLocale(''));
        expect(addBtn().textContent).toBe('Add Job');
    });
});

describe('$ui.select.placeholder — Select control', () => {
    function render() {
        const engine = createFormEngine({
            $formspec: '1.0', url: URL, version: '1.0.0', title: 'Test',
            items: [
                {
                    key: 'color', type: 'field', dataType: 'choice', label: 'Color',
                    options: [{ value: 'r', label: 'Red' }],
                },
            ],
        });
        const componentDocument = {
            $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL },
            tree: { component: 'Stack', children: [{ component: 'Select', bind: 'color' }] },
        };
        const container = actRender(<FormspecForm engine={engine} componentDocument={componentDocument} />);
        return { container };
    }

    it('the unauthored placeholder comes from the shared UI_STRINGS inventory', () => {
        const { container } = render();
        const placeholderOpt = container.querySelector('select option[value=""]') as HTMLOptionElement;
        expect(placeholderOpt.textContent).toBe('Select…');
    });
});
