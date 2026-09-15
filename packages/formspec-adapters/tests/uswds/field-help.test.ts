/** @filedesc Integration: the per-item help link and rich hints through the real USWDS render path. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { FormspecRender, globalRegistry } from '@formspec-org/webcomponent';
import { uswdsAdapter } from '../../src/uswds/index';

beforeAll(async () => {
    await initFormspecEngine();
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
    globalRegistry.registerAdapter(uswdsAdapter);
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((e) => e.remove());
    globalRegistry.setAdapter('default');
});

const DEFINITION_URL = 'urn:test:uswds-help';

function renderForm(items: any[], references?: unknown[], theme?: unknown): any {
    globalRegistry.setAdapter('uswds');
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (theme) el.themeDocument = theme;
    el.definition = {
        $formspec: '1.0',
        url: DEFINITION_URL,
        version: '1.0.0',
        title: 'Eligibility questions',
        items,
    };
    if (references) {
        el.referencesDocuments = {
            $formspecReferences: '1.0',
            version: '1.0.0',
            targetDefinition: { url: DEFINITION_URL },
            references,
        };
    }
    el.render();
    return el;
}

const workTypeItem = {
    key: 'workType',
    type: 'field',
    label: 'What type of work was this job?',
    dataType: 'choice',
    options: [
        { value: 'regular', label: 'Regular employment' },
        { value: 'self', label: 'Self-employment' },
    ],
    presentation: { widget: 'RadioGroup' },
};

describe('USWDS field help link', () => {
    it('renders a usa-link inside the field for a human reference', () => {
        const el = renderForm([workTypeItem], [
            { target: 'workType', audience: 'human', type: 'documentation', title: 'Types of work', uri: 'https://nj.gov/help/work-types' },
        ]);
        const group = el.querySelector('.usa-form-group[data-name="workType"]') as HTMLElement;
        const link = group.querySelector('a.formspec-field-help-link') as HTMLAnchorElement;
        expect(link).not.toBeNull();
        expect(link.classList.contains('usa-link')).toBe(true);
        expect(link.textContent).toBe('Help me answer this question');
        expect(link.getAttribute('rel')).toBe('noopener');
    });

    it('renders no link when the form has no References Document', () => {
        const el = renderForm([workTypeItem]);
        expect(el.querySelector('a.formspec-field-help-link')).toBeNull();
    });
});

describe('USWDS rich hint on the real render path', () => {
    it('renders the hint list as ul.usa-list inside usa-hint', () => {
        const el = renderForm([{
            key: 'available',
            type: 'field',
            label: 'Were you able and available for work?',
            dataType: 'boolean',
            hint: "Answer 'No' if something is preventing you. Some examples include:\n- Physical or mental health\n- Transportation\n- Childcare",
        }]);
        const hint = el.querySelector('.usa-hint:not(.formspec-description)') as HTMLElement;
        const ul = hint.querySelector('ul.usa-list') as HTMLElement;
        expect(ul).not.toBeNull();
        expect(ul.querySelectorAll('li')).toHaveLength(3);
    });

    it("drops the asterisk under the theme's requiredIndicator 'none' but keeps aria-required", () => {
        const el = renderForm(
            [{ key: 'name', type: 'field', label: 'Name', dataType: 'string', required: true }],
            undefined,
            {
                $formspecTheme: '1.0',
                version: '1.0.0',
                targetDefinition: { url: DEFINITION_URL },
                adapter: 'uswds',
                defaults: { requiredIndicator: 'none' },
            },
        );
        expect(el.querySelector('.usa-label .formspec-required')).toBeNull();
        expect((el.querySelector('input') as HTMLInputElement).getAttribute('aria-required')).toBe('true');
    });
});
