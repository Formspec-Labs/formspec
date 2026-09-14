import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

/** Jobs repeat (1..2) shown only when `worked` is 'yes' — core §4.2.2 cardinality + Bind `relevant`. */
function jobsDef(componentTree?: any) {
    return {
        definition: {
            $formspec: '1.0',
            url: 'urn:test:jobs',
            version: '1.0.0',
            title: 'Jobs',
            items: [
                { key: 'worked', type: 'field', dataType: 'string', label: 'Worked' },
                {
                    key: 'jobs',
                    type: 'group',
                    label: 'Job',
                    repeatable: true,
                    minRepeat: 1,
                    maxRepeat: 2,
                    children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
                },
            ],
            binds: [{ path: 'jobs', relevant: "$worked = 'yes'" }],
        },
        componentDocument: componentTree
            ? {
                $formspecComponent: '1.0',
                version: '1.0.0',
                targetDefinition: { url: 'urn:test:jobs' },
                tree: componentTree,
            }
            : undefined,
    };
}

function render(componentTree?: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    const { definition, componentDocument } = jobsDef(componentTree);
    if (componentDocument) el.componentDocument = componentDocument;
    el.definition = definition;
    el.render();
    return { element: el as HTMLElement, engine: el.getEngine() };
}

const isHidden = (node: Element | null | undefined) => !!node?.classList.contains('formspec-hidden');

const suites = [
    { name: 'repeat template (definition fallback)', tree: undefined },
    {
        name: 'Accordion bound to the repeat',
        tree: {
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'worked' },
                { component: 'Accordion', bind: 'jobs', children: [{ component: 'TextInput', bind: 'employer' }] },
            ],
        },
    },
];

for (const suite of suites) {
    describe(`repeat affordances — ${suite.name}`, () => {
        afterEach(() => {
            document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
        });

        it('hides the whole repeat container while the group is not relevant', () => {
            const { element, engine } = render(suite.tree);
            const container = element.querySelector('.formspec-repeat[data-bind="jobs"]');
            expect(container).toBeTruthy();
            expect(isHidden(container)).toBe(true);

            engine.setValue('worked', 'yes');
            expect(isHidden(container)).toBe(false);

            engine.setValue('worked', 'no');
            expect(isHidden(container)).toBe(true);
        });

        it('hides Add once the count reaches maxRepeat and shows it again below', () => {
            const { element, engine } = render(suite.tree);
            engine.setValue('worked', 'yes');
            const add = element.querySelector('.formspec-repeat-add') as HTMLButtonElement;
            expect(isHidden(add)).toBe(false);

            add.click();
            expect(engine.repeats.jobs.value).toBe(2);
            expect(isHidden(add)).toBe(true);

            add.click();
            expect(engine.repeats.jobs.value).toBe(2);

            engine.removeRepeatInstance('jobs', 1);
            expect(isHidden(add)).toBe(false);
        });

        it('offers Remove only while the count is above minRepeat', () => {
            const { element, engine } = render(suite.tree);
            engine.setValue('worked', 'yes');
            expect(engine.repeats.jobs.value).toBe(1);
            expect(element.querySelectorAll('.formspec-repeat-remove')).toHaveLength(0);

            engine.addRepeatInstance('jobs');
            expect(element.querySelectorAll('.formspec-repeat-remove')).toHaveLength(2);
        });

        it('announces removal and keeps focus inside the repeat', async () => {
            const { element, engine } = render(suite.tree);
            await Promise.resolve(); // let the render scheduled by the definition setter land first
            engine.setValue('worked', 'yes');
            engine.addRepeatInstance('jobs');

            const removes = element.querySelectorAll<HTMLButtonElement>('.formspec-repeat-remove');
            removes[removes.length - 1].click();
            await Promise.resolve();

            const live = element.querySelector('.formspec-repeat > .formspec-sr-only[aria-live="polite"]');
            expect(live?.textContent).toBe('Job 2 removed. 1 remaining.');
            expect(element.querySelector('.formspec-repeat')?.contains(document.activeElement)).toBe(true);
        });
    });
}

describe('repeat instance header', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('keeps the instance label and Remove as siblings in one header row', () => {
        const { element, engine } = render();
        engine.setValue('worked', 'yes');
        engine.addRepeatInstance('jobs');
        const header = element.querySelector('.formspec-repeat-instance-header') as HTMLElement;
        expect(Array.from(header.children).map(c => c.className.split(' ')[0])).toEqual([
            'formspec-repeat-instance-label',
            'formspec-repeat-remove',
        ]);
    });
});
