/** @filedesc Submit focuses the first invalid repeat row by its 0-based resolved instance path. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function jobsDefinition() {
    return {
        $formspec: '1.0',
        url: 'urn:test:submit-focus',
        version: '1.0.0',
        title: 'Jobs',
        items: [
            {
                key: 'jobs',
                type: 'group',
                label: 'Jobs',
                repeatable: true,
                minRepeat: 3,
                children: [{ key: 'title', type: 'field', dataType: 'string', label: 'Title' }],
            },
        ],
        binds: [{ path: 'jobs[*].title', required: 'true' }],
    };
}

describe('submit focus on repeat rows', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
    });

    it('focuses jobs[1] when only row index 1 is invalid', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = jobsDefinition();
        el.render();
        const engine = el.getEngine();
        engine.setValue('jobs[0].title', 'Welder');
        engine.setValue('jobs[2].title', 'Pilot');

        const detail = el.submit({ emitEvent: false });

        expect(detail.validationReport.results.filter((r: any) => r.severity === 'error').map((r: any) => r.path))
            .toEqual(['jobs[1].title']);
        const focusedField = (document.activeElement as HTMLElement | null)?.closest('[data-name]') as HTMLElement | null;
        expect(focusedField?.dataset.name).toBe('jobs[1].title');
    });

    it('does not shift a missing row path onto its neighbour', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = jobsDefinition();
        el.render();

        expect(el.focusField('jobs[3].title')).toBe(false);
        const target = el.resolveValidationTarget({ path: 'jobs[3].title' });
        expect(target.jumpable).toBe(false);
        expect(target.path).toBe('jobs[3].title');
    });

    it('emits submit and focuses the first error when a Response read is unavailable', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.definition = {
            ...jobsDefinition(),
            instances: {
                filing: {
                    response: {
                        definition: { url: 'urn:test:filing' },
                        subject: [],
                        status: 'completed',
                        pin: 'none',
                        cardinality: 'latest',
                    },
                    schema: { title: 'string' },
                },
            },
        };
        el.render();
        const submissions: unknown[] = [];
        el.addEventListener('formspec-submit', (event: CustomEvent) => submissions.push(event.detail));

        const detail = el.submit({
            validationTuple: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
        });

        expect(submissions).toEqual([detail]);
        expect(detail.response.status).toBe('in-progress');
        expect(detail.response.resolvedInstances).toBeUndefined();
        expect(detail.validationReport.valid).toBe(false);
        const focusedField = document.activeElement?.closest<HTMLElement>('[data-name]');
        expect(focusedField?.dataset.name).toBe('jobs[0].title');
    });
});
