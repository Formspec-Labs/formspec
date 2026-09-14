/** @filedesc Repeat row lifecycle: rows keep their DOM across value changes and release subscriptions on add/remove (parity with webcomponent repeat-rows). */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React, { act } from 'react';

/** Signal subscriptions React holds open: every useSignal subscription is a preact `effect`. */
const subscriptions = vi.hoisted(() => ({ live: 0, opened: 0 }));
vi.mock('@preact/signals-core', async (importOriginal) => {
    const signals = await importOriginal<typeof import('@preact/signals-core')>();
    return {
        ...signals,
        effect: (fn: () => void) => {
            const dispose = signals.effect(fn);
            subscriptions.live += 1;
            subscriptions.opened += 1;
            let disposed = false;
            return () => {
                if (!disposed) subscriptions.live -= 1;
                disposed = true;
                dispose();
            };
        },
    };
});

import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const URL = 'urn:test:repeat-rows';

const rowChildren = [
    { component: 'Divider', id: 'jobRule', label: 'Job details' },
    { component: 'TextInput', bind: 'employer' },
];

const suites = [
    { name: 'repeat template', tree: { component: 'Stack', children: [{ component: 'TextInput', bind: 'worked' }, { component: 'Stack', bind: 'jobs', children: rowChildren }] } },
    { name: 'Accordion bound to the repeat', tree: { component: 'Stack', children: [{ component: 'TextInput', bind: 'worked' }, { component: 'Accordion', bind: 'jobs', children: rowChildren }] } },
];

function render(tree: unknown) {
    const engine = createFormEngine({
        $formspec: '1.0', url: URL, version: '1.0.0', title: 'Jobs',
        items: [
            { key: 'worked', type: 'field', dataType: 'string', label: 'Worked' },
            {
                key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 2,
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
            },
        ],
    });
    engine.loadLocale({
        $formspecLocale: '2.0', locale: 'fr', version: '1.0.0', target: { kind: 'definition', url: URL },
        // Interpolating a form-scope value makes each row's Divider read a field signal.
        strings: { '$component.jobRule.label': 'Détails ({{$worked}})' },
    } as any);
    engine.setLocale('fr');
    const componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL }, tree };
    const container = actRender(<FormspecForm engine={engine} componentDocument={componentDocument} />);
    return { container, engine };
}

for (const suite of suites) {
    describe(`repeat rows — ${suite.name}`, () => {
        it('keeps row DOM when a value a row reads changes', () => {
            const { container, engine } = render(suite.tree);
            const rowInputs = () => Array.from(container.querySelectorAll('input[name^="jobs["]'));
            const before = rowInputs();
            expect(before).toHaveLength(2);

            act(() => engine.setValue('worked', 'yes'));
            act(() => engine.setValue('jobs[1].employer', 'Globex'));

            expect(Array.from(container.querySelectorAll('.formspec-divider-label'), (el) => el.textContent))
                .toEqual(['Détails (yes)', 'Détails (yes)']);
            const after = rowInputs();
            expect(after).toHaveLength(2);
            after.forEach((input, index) => expect(input).toBe(before[index]));
        });

        it('releases row subscriptions across add/remove cycles', () => {
            const { engine } = render(suite.tree);
            act(() => engine.addRepeatInstance('jobs'));
            act(() => engine.removeRepeatInstance('jobs', 2));
            const settled = subscriptions.live;

            for (let cycle = 0; cycle < 5; cycle += 1) {
                act(() => engine.addRepeatInstance('jobs'));
                act(() => engine.removeRepeatInstance('jobs', 2));
            }
            expect(subscriptions.live).toBe(settled);
        });
    });
}

describe('repeat rows — Accordion bound to the repeat', () => {
    it('re-renders row content without re-subscribing when a panel toggles', () => {
        const { container } = render(suites[1].tree);
        const opened = subscriptions.opened;
        act(() => (container.querySelectorAll('summary')[0] as HTMLElement).click());
        expect(container.querySelectorAll('details')[0].open).toBe(true);
        expect(subscriptions.opened).toBe(opened);
    });
});
