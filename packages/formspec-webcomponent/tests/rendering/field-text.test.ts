/** @filedesc Integration: field hint/description text resolves through the view model on the default adapter. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function renderDefinition(items: any[]) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:field-text',
        version: '1.0.0',
        title: 'Field text',
        items,
    };
    el.render();
    return el;
}

describe('field hint text', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
    });

    it('keeps an interpolated hint current without re-rendering the repeat row', () => {
        const el = renderDefinition([
            {
                key: 'jobs',
                type: 'group',
                label: 'Job',
                repeatable: true,
                minRepeat: 1,
                children: [
                    { key: 'employer', type: 'field', dataType: 'string', label: 'Employer' },
                    { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours', hint: 'Hours worked for {{$employer}}' },
                ],
            },
        ]);
        const engine = el.getEngine();
        const hoursInput = el.querySelector('#field-jobs-0--hours') as HTMLInputElement;
        expect(hoursInput).not.toBeNull();

        engine.setValue('jobs[0].employer', 'ACME');

        expect(el.querySelector('#field-jobs-0--hours-hint')?.textContent).toBe('Hours worked for ACME');
        expect(hoursInput.isConnected).toBe(true);
    });
});
