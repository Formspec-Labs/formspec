import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

/** Render a form with a required field and a ValidationSummary, then return the element. */
function renderWithValidationSummary(summaryProps: Record<string, any> = {}) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:form' },
        tree: {
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'name' },
                { component: 'ValidationSummary', ...summaryProps },
            ],
        },
    };
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test Form',
        items: [
            {
                key: 'name',
                type: 'field',
                label: 'Name',
                dataType: 'string',
            },
        ],
        binds: [
            { path: 'name', required: 'true' },
        ],
    };
    el.render();
    return el;
}

describe('ValidationSummary — source: live', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('does not show the banner on initial load before submit', () => {
        const el = renderWithValidationSummary({ source: 'live', mode: 'submit', showFieldErrors: true });
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        expect(summary).not.toBeNull();
        // Should not be visible — no submit has happened yet
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);
        expect(summary.textContent?.trim()).toBe('');
    });

    it('shows the banner after submit is clicked with validation errors', () => {
        const el = renderWithValidationSummary({ source: 'live', mode: 'submit', showFieldErrors: true });
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;

        // Banner hidden before submit
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);

        // Trigger submit — name is required but empty, so errors should appear
        el.submit({ mode: 'submit', emitEvent: false });

        // Banner should now be visible
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);
        const header = summary.querySelector('.formspec-validation-summary-title');
        expect(header).not.toBeNull();
        expect(header?.textContent).toMatch(/error/i);
    });

    it('shows the banner after clicking the injected submit button', () => {
        const el = renderWithValidationSummary({ source: 'live', mode: 'submit', showFieldErrors: true });
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        const submit = el.querySelector('.formspec-submit') as HTMLButtonElement;

        expect(submit).not.toBeNull();
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);

        submit.click();

        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);
        expect(summary.textContent).toContain('Name');
    });

    it('shows field errors by default after submit', () => {
        const el = renderWithValidationSummary();
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        const submit = el.querySelector('.formspec-submit') as HTMLButtonElement;

        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);

        submit.click();

        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);
        expect(summary.textContent).toContain('Name');
    });

    it('remains hidden on initial load when the form is valid', () => {
        const el = renderWithValidationSummary({ source: 'live', mode: 'submit', showFieldErrors: true });
        // Set the required field so form is valid
        el.getEngine().setValue('name', 'Alice');
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        // Still hidden — no submit has happened
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);
    });

    it('hides after submit when form becomes valid', () => {
        const el = renderWithValidationSummary({ source: 'live', mode: 'submit', showFieldErrors: true });
        // Submit with empty required field to make banner appear
        el.submit({ mode: 'submit', emitEvent: false });
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);

        // Fill the required field, then submit again
        el.getEngine().setValue('name', 'Alice');
        el.submit({ mode: 'submit', emitEvent: false });
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);
    });

    it('keeps the latest submit-profile summary static until another submit', () => {
        const el = renderWithValidationSummary({ source: 'live', mode: 'submit', showFieldErrors: true });
        el.submit({ mode: 'submit', emitEvent: false });
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);

        el.getEngine().setValue('name', 'Alice');

        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);
        expect(summary.textContent).toContain('Name');
    });
});

describe('ValidationSummary — live in wizard', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    /** Render a wizard (via pageMode) with 2 pages: a field page and a review page with live ValidationSummary. */
    function renderWizardWithSummary(mode: 'submit' | 'continuous' = 'submit') {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:wizard' },
            tree: {
                component: 'Stack',
                children: [
                    {
                        component: 'Section',
                        title: 'Details',
                        children: [
                            { component: 'TextInput', bind: 'name' },
                        ],
                    },
                    {
                        component: 'Section',
                        title: 'Review',
                        children: [
                            { component: 'ValidationSummary', source: 'live', mode, showFieldErrors: true },
                        ],
                    },
                ],
            },
        };
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:wizard',
            version: '1.0.0',
            title: 'Test Wizard',
            items: [
                { key: 'name', type: 'field', label: 'Name', dataType: 'string' },
            ],
            binds: [
                { path: 'name', required: 'true' },
            ],
            formPresentation: { pageMode: 'wizard' },
        };
        el.render();
        return el;
    }

    it('keeps live submit-mode summary hidden after navigating to review page via Next', () => {
        const el = renderWizardWithSummary();
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;

        // Click Next to advance from Details to Review
        const nextBtn = el.querySelector('button.formspec-wizard-next') as HTMLButtonElement;
        expect(nextBtn).not.toBeNull();
        nextBtn.click();

        // In submit mode, wizard navigation alone should not open the summary gate.
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);
    });

    it('shows live continuous-mode summary after navigating to review page via Next', () => {
        const el = renderWizardWithSummary('continuous');
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;

        // Click Next to advance from Details to Review
        const nextBtn = el.querySelector('button.formspec-wizard-next') as HTMLButtonElement;
        expect(nextBtn).not.toBeNull();
        nextBtn.click();

        // In continuous mode, wizard navigation opens the gate via touchedVersion.
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);
    });
});

describe('ValidationSummary — source: submit', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
    });

    it('is hidden on initial load (no submit yet)', () => {
        const el = renderWithValidationSummary({ source: 'submit', showFieldErrors: true });
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(false);
    });

    it('shows after submit with errors', () => {
        const el = renderWithValidationSummary({ source: 'submit', showFieldErrors: true });
        el.submit({ mode: 'submit', emitEvent: false });
        const summary = el.querySelector('.formspec-validation-summary') as HTMLElement;
        expect(summary.classList.contains('formspec-validation-summary--visible')).toBe(true);
    });
});
