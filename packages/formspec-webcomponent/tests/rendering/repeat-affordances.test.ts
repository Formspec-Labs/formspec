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

describe('repeat affordances — DataTable bound to the repeat', () => {
    const tree = {
        component: 'Stack',
        children: [
            { component: 'TextInput', bind: 'worked' },
            {
                component: 'DataTable',
                bind: 'jobs',
                allowAdd: true,
                allowRemove: true,
                columns: [{ header: 'Employer', bind: 'employer' }],
            },
        ],
    };

    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('hides the table while the group is not relevant', () => {
        const { element, engine } = render(tree);
        const wrapper = element.querySelector('.formspec-data-table-wrapper');
        expect(isHidden(wrapper)).toBe(true);

        engine.setValue('worked', 'yes');
        expect(isHidden(wrapper)).toBe(false);
    });

    it('hides Add Row at maxRepeat and ignores clicks there', () => {
        const { element, engine } = render(tree);
        engine.setValue('worked', 'yes');
        const add = element.querySelector('.formspec-datatable-add') as HTMLButtonElement;

        add.click();
        expect(engine.repeats.jobs.value).toBe(2);
        expect(isHidden(add)).toBe(true);

        add.click();
        expect(engine.repeats.jobs.value).toBe(2);
    });

    it('offers Remove only while the count is above minRepeat', () => {
        const { element, engine } = render(tree);
        engine.setValue('worked', 'yes');
        expect(element.querySelectorAll('.formspec-datatable-remove')).toHaveLength(0);

        engine.addRepeatInstance('jobs');
        const removes = element.querySelectorAll<HTMLButtonElement>('.formspec-datatable-remove');
        expect(removes).toHaveLength(2);

        removes[0].click();
        expect(engine.repeats.jobs.value).toBe(1);
        expect(element.querySelectorAll('.formspec-datatable-remove')).toHaveLength(0);
    });
});

/**
 * Presentation-only Add/Remove locks (component §4.4): a theme `widgetConfig` on a repeatable group without a
 * Component Document (theme §4.2), or a repeat-bound Accordion's `allowAdd` / `allowRemove` (component §6.3).
 */
describe('repeat affordances — allowAdd / allowRemove locks', () => {
    const URL = 'urn:test:employers';
    const definition = {
        $formspec: '1.0',
        url: URL,
        version: '1.0.0',
        title: 'Employers',
        items: [{
            key: 'employersOnRecord',
            type: 'group',
            label: 'Employer',
            repeatable: true,
            children: [
                { key: 'payerName', type: 'field', dataType: 'string', label: 'Payer' },
                { key: 'stillWorking', type: 'field', dataType: 'string', label: 'Still working there?' },
            ],
        }],
    };
    const seeded = { employersOnRecord: [{ payerName: 'ACME' }, { payerName: 'Globex' }] };

    function renderLocked(options: { theme?: unknown; tree?: unknown }) {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        if (options.theme) el.themeDocument = options.theme;
        if (options.tree) {
            el.componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL }, tree: options.tree };
        }
        el.initialData = seeded;
        el.definition = definition;
        el.render();
        return { element: el as HTMLElement, engine: el.getEngine() };
    }

    const visible = (element: HTMLElement, selector: string) =>
        Array.from(element.querySelectorAll(selector)).filter((node) => !isHidden(node));

    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    const lockedSuites = [
        {
            name: 'theme widgetConfig on the repeat template',
            options: {
                theme: {
                    $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url: URL },
                    items: { employersOnRecord: { widgetConfig: { allowAdd: false, allowRemove: false } } },
                },
            },
        },
        {
            name: 'repeat-bound Accordion props',
            options: {
                tree: {
                    component: 'Stack',
                    children: [{
                        component: 'Accordion', bind: 'employersOnRecord', allowAdd: false, allowRemove: false,
                        children: [{ component: 'TextInput', bind: 'payerName' }, { component: 'TextInput', bind: 'stillWorking' }],
                    }],
                },
            },
        },
    ];

    for (const { name, options } of lockedSuites) {
        it(`${name}: shows every seeded row with no Add or Remove, and each row stays answerable`, () => {
            const { element, engine } = renderLocked(options);
            expect(engine.repeats.employersOnRecord.value).toBe(2);
            expect(visible(element, '.formspec-repeat-add')).toHaveLength(0);
            expect(visible(element, '.formspec-repeat-remove')).toHaveLength(0);

            const answers = element.querySelectorAll<HTMLInputElement>('input[name$="stillWorking"]');
            expect(answers).toHaveLength(2);
            answers[1].value = 'yes';
            answers[1].dispatchEvent(new Event('input', { bubbles: true }));
            expect(engine.signals['employersOnRecord[1].stillWorking'].value).toBe('yes');
            expect(engine.signals['employersOnRecord[0].payerName'].value).toBe('ACME');
        });
    }

    it('keeps Add and Remove when only the other affordance is locked', () => {
        const { element } = renderLocked({
            theme: {
                $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url: URL },
                items: { employersOnRecord: { widgetConfig: { allowRemove: false } } },
            },
        });
        expect(visible(element, '.formspec-repeat-add')).toHaveLength(1);
        expect(visible(element, '.formspec-repeat-remove')).toHaveLength(0);
    });
});

/** DataTable `allowAdd` / `allowRemove` default to true (component §6.14) and only hide chrome (§4.4). */
describe('repeat affordances — DataTable defaults and locks', () => {
    const table = (props: Record<string, unknown> = {}) => ({
        component: 'Stack',
        children: [
            { component: 'TextInput', bind: 'worked' },
            { component: 'DataTable', bind: 'jobs', columns: [{ header: 'Employer', bind: 'employer' }], ...props },
        ],
    });

    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('shows Add Row and Remove when allowAdd/allowRemove are omitted', () => {
        const { element, engine } = render(table());
        engine.setValue('worked', 'yes');
        engine.addRepeatInstance('jobs');
        const add = element.querySelector('.formspec-datatable-add');
        expect(add).not.toBeNull();
        expect(isHidden(add)).toBe(true); // at maxRepeat 2
        expect(element.querySelectorAll('.formspec-datatable-remove')).toHaveLength(2);
    });

    it('keeps locked rows editable per their Binds: the locks hide chrome only', () => {
        const { element, engine } = render(table({ allowAdd: false, allowRemove: false }));
        engine.setValue('worked', 'yes');
        expect(element.querySelector('.formspec-datatable-add')).toBeNull();
        expect(element.querySelectorAll('.formspec-datatable-remove')).toHaveLength(0);
        const cell = element.querySelector<HTMLInputElement>('tbody input[name="jobs[0].employer"]');
        expect(cell).not.toBeNull();
        expect(cell!.disabled).toBe(false);
        cell!.value = 'ACME';
        cell!.dispatchEvent(new Event('input', { bubbles: true }));
        expect(engine.signals['jobs[0].employer'].value).toBe('ACME');
    });
});
