/** @filedesc Repeat row lifecycle: each re-render disposes the previous rows' effects and never tracks row reads. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

const rowChildren = [
    { component: 'Divider', id: 'jobRule', label: 'Job details' },
    { component: 'TextInput', bind: 'employer' },
];

const suites = [
    { name: 'repeat template', tree: { component: 'Stack', bind: 'jobs', children: rowChildren } },
    { name: 'Accordion bound to the repeat', tree: { component: 'Accordion', bind: 'jobs', children: rowChildren } },
];

function render(tree: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.localeDocuments = {
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: 'urn:test:jobs' },
        // Interpolating a form-scope value makes rendering a row read field signals.
        strings: { '$component.jobRule.label': 'Détails ({{$worked}})' },
    };
    el.locale = 'fr';
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:jobs' },
        tree: { component: 'Stack', children: [{ component: 'TextInput', bind: 'worked' }, tree] },
    };
    el.definition = {
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
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
            },
        ],
    };
    el.render();
    return { el, engine: el.getEngine() };
}

for (const suite of suites) {
    describe(`repeat rows — ${suite.name}`, () => {
        it('disposes the previous rows\' effects on every re-render', () => {
            const { el, engine } = render(suite.tree);
            const baseline = el.cleanupFns.length;

            for (let cycle = 0; cycle < 5; cycle++) {
                engine.addRepeatInstance('jobs');
                engine.removeRepeatInstance('jobs', 1);
            }

            expect(el.cleanupFns.length).toBe(baseline);
        });

        it('keeps rows mounted when a value read while rendering a row changes', () => {
            const { el, engine } = render(suite.tree);
            const employer = el.querySelector('input[name="jobs[0].employer"], [data-name="jobs[0].employer"] input');
            expect(employer).not.toBeNull();

            engine.setValue('worked', 'yes');

            expect(employer!.isConnected).toBe(true);
        });
    });
}

describe('$component Locale strings inside repeat rows', () => {
    it('interpolate {{}} in the row\'s repeat instance scope (Locale §3.3.2)', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:jobs' },
            strings: {
                '$component.jobRule.label': 'Poste {{@index}} : {{$employer}}',
                '$component.jobHeading.text': 'Emploi {{@index}}',
                '$component.jobAction.label': 'Valider {{$employer}}',
            },
        };
        el.locale = 'fr';
        el.initialData = { jobs: [{ employer: 'ACME' }, { employer: 'Globex' }] };
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:jobs' },
            tree: {
                component: 'Stack',
                bind: 'jobs',
                children: [
                    { component: 'Divider', id: 'jobRule', label: 'Job details' },
                    { component: 'Heading', id: 'jobHeading', level: 3, text: 'Job' },
                    { component: 'ActionButton', id: 'jobAction', actionRef: 'none', label: { literal: 'Confirm' } },
                    { component: 'TextInput', bind: 'employer' },
                ],
            },
        };
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:jobs',
            version: '1.0.0',
            title: 'Jobs',
            items: [{
                key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 2,
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
            }],
        };
        el.render();

        const texts = (selector: string) => Array.from(el.querySelectorAll(selector), (n: Element) => n.textContent);
        expect(texts('.formspec-divider-label')).toEqual(['Poste 1 : ACME', 'Poste 2 : Globex']);
        expect(texts('.formspec-heading')).toEqual(['Emploi 1', 'Emploi 2']);
        expect(texts('.formspec-action')).toEqual(['Valider ACME', 'Valider Globex']);
    });
});
