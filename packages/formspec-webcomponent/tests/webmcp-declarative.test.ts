/** @filedesc Assist spec §8.2: with `tool-name`, the rendered form is a declarative WebMCP tool; named controls always describe themselves. */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { minimalComponentDoc } from './helpers/engine-fixtures';

let FormspecRender: any;
let globalRegistry: any;

/**
 * A test-only adapter shaped exactly like packages/formspec-adapters/src/uswds/action-button.ts: draws its
 * own `type="button"` and hands the button to `behavior.bind()` — fs-8kpq review MAJOR 1's repro for "an
 * adapter that hardcodes a button type must still become invokable."
 */
function mockUswdsLikeActionButton(behavior: any, parent: HTMLElement, actx: any): void {
    const button = document.createElement('button');
    if (behavior.id) button.id = behavior.id;
    button.type = 'button';
    button.className = 'formspec-action formspec-submit mock-uswds-button';
    button.textContent = behavior.defaultLabel || 'Submit';
    parent.appendChild(button);
    actx.onDispose(behavior.bind({ root: button }));
}

const DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:webmcp',
    version: '1.0.0',
    title: 'Grant application',
    description: 'Apply for a community grant.',
    items: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Legal name', hint: 'As it appears on your **IRS** letter.' },
        { key: 'region', type: 'field', dataType: 'choice', label: 'Region', options: [{ value: 'n', label: 'North' }, { value: 's', label: 'South' }] },
        {
            key: 'kind', type: 'field', dataType: 'choice', label: 'Kind of grant', hint: 'Pick one.',
            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
            presentation: { widgetHint: 'RadioGroup' },
        },
        { key: 'amount', type: 'field', dataType: 'money', label: 'Amount requested' },
    ],
    binds: [{ path: 'name', required: 'true' }],
};

beforeAll(async () => {
    const mod = await import('../src/index');
    FormspecRender = mod.FormspecRender;
    globalRegistry = mod.globalRegistry;
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
    globalRegistry.registerAdapter({ name: 'test-uswds-like', components: { ActionButton: mockUswdsLikeActionButton } });
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function mount(definition: Record<string, unknown> = DEFINITION, attrs: Record<string, string> = {}): any {
    const el = document.createElement('formspec-render') as any;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    document.body.appendChild(el);
    el.definition = definition;
    el.render();
    return el;
}

/** The opted-in shape: `tool-name` present, empty, so the tool takes the default name. */
const mountTool = (definition: Record<string, unknown> = DEFINITION) => mount(definition, { 'tool-name': '' });

const root = (el: any): HTMLElement => el.querySelector('.formspec-container');
const paramDescription = (el: any, selector: string) =>
    [...el.querySelectorAll(selector)].map((control: HTMLElement) => control.getAttribute('toolparamdescription'));

/** A WebMCP-capable browser's submit event: `agentInvoked` set, `respondWith` waiting for the tool's answer. */
function agentSubmit(): SubmitEvent & { respondWith: ReturnType<typeof vi.fn> } {
    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true }) as any;
    event.agentInvoked = true;
    event.respondWith = vi.fn();
    return event;
}

describe('render root without tool-name', () => {
    it('is a plain <div> carrying the §8.1 identity and no tool attributes', () => {
        const container = root(mount());
        expect(container.tagName).toBe('DIV');
        expect(container.hasAttribute('toolname')).toBe(false);
        expect(container.hasAttribute('tooldescription')).toBe(false);
        expect(container.dataset.formspecUrl).toBe('urn:test:webmcp');
    });

    it('still describes every named control: the hint as plain text, else the label — each radio and its group, both money inputs', () => {
        const el = mount();
        expect(paramDescription(el, 'input[name="name"]')).toEqual(['As it appears on your IRS letter.']);
        expect(paramDescription(el, 'select[name="region"]')).toEqual(['Region']);
        expect(paramDescription(el, 'input[name="kind"]')).toEqual(['Pick one.', 'Pick one.']);
        // A synthesizer folds same-named radios into one property and reads the description off their fieldset.
        expect(paramDescription(el, 'fieldset:has(input[name="kind"])')).toEqual(['Pick one.']);
        expect(paramDescription(el, 'input[name="amount__amount"], input[name="amount__currency"]'))
            .toEqual(['Amount requested', 'Amount requested']);
    });

    it('follows the Locale like the visible hint does, without a re-render', () => {
        const el = mount();
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:webmcp' },
            strings: { 'name.hint': 'Tel qu’il figure sur votre lettre.', 'region.label': 'Région' },
        };
        el.locale = 'fr';
        expect(paramDescription(el, 'input[name="name"]')).toEqual(['Tel qu’il figure sur votre lettre.']);
        expect(paramDescription(el, 'select[name="region"]')).toEqual(['Région']);
    });
});

describe('declarative WebMCP tool, opted in with tool-name (assist-spec §8.2)', () => {
    it('renders the form as a native <form> that is the tool: named, described, never auto-submitted', () => {
        const form = root(mountTool());
        expect(form.tagName).toBe('FORM');
        expect((form as HTMLFormElement).noValidate).toBe(true);
        expect(form.getAttribute('toolname')).toBe('formspec.form.fill');
        expect(form.getAttribute('tooldescription')).toBe('Apply for a community grant.');
        expect(form.hasAttribute('toolautosubmit')).toBe(false);
        // §8.1 identity stays on the same element.
        expect(form.dataset.formspecUrl).toBe('urn:test:webmcp');
    });

    it('describes the tool by the title when the Definition has no description', () => {
        const { description: _omitted, ...untitled } = DEFINITION;
        expect(root(mountTool(untitled)).getAttribute('tooldescription')).toBe('Grant application');
    });

    it('takes the tool name the page gives it, so two forms on one page stay distinct', () => {
        expect(root(mount(DEFINITION, { 'tool-name': 'grants.apply' })).getAttribute('toolname')).toBe('grants.apply');
    });

    it('swaps the root when the attribute arrives or leaves after render', () => {
        const el = mount();
        el.setAttribute('tool-name', '');
        el.render();
        expect(root(el).tagName).toBe('FORM');
        expect(root(el).getAttribute('toolname')).toBe('formspec.form.fill');
        expect(el.querySelectorAll('.formspec-container')).toHaveLength(1);
        el.removeAttribute('tool-name');
        el.render();
        expect(root(el).tagName).toBe('DIV');
        expect(el.querySelectorAll('.formspec-container')).toHaveLength(1);
    });

    it('never navigates: a native submission is cancelled', () => {
        const form = root(mountTool()) as HTMLFormElement;
        const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
        expect(form.dispatchEvent(event)).toBe(false);
        expect(event.defaultPrevented).toBe(true);
    });

    it('answers an agent-invoked submission with the ValidationReport it produced', async () => {
        const form = root(mountTool()) as HTMLFormElement;
        const event = agentSubmit();
        form.dispatchEvent(event);
        expect(event.respondWith).toHaveBeenCalledTimes(1);
        const report = await event.respondWith.mock.calls[0][0];
        expect(report.valid).toBe(false);
        expect(report.results.map((r: any) => r.path)).toContain('name');
    });

    it('leaves the boot skeleton out of the tool surface: a form with nothing to fill is not a tool', () => {
        const el = document.createElement('formspec-render') as any;
        el.setAttribute('tool-name', '');
        document.body.appendChild(el);
        el.definition = DEFINITION;
        const skeleton = root(el);
        expect(skeleton.tagName).toBe('FORM');
        expect(skeleton.classList.contains('formspec-skeleton')).toBe(true);
        expect(skeleton.hasAttribute('toolname')).toBe(false);
    });
});

/** A submit-intent Response Actions document — same shape `interactive-plugins.test.ts` uses. */
function responseActionsDoc(actions: Array<{ id: string; intent?: string }>) {
    return {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:webmcp' },
        actions: actions.map(({ id, intent = 'submit' }) => ({
            id,
            intent,
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
        })),
    };
}

describe('submit-intent ActionButton is the tool form\'s native submit button, where actionable (fs-8kpq)', () => {
    it('stays a plain button outside the tool form, and controls stay unrequired, even with a submit-intent Action', () => {
        const el = mount();
        el.responseActionsDocument = responseActionsDoc([{ id: 'submit' }]);
        el.render();
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(button.type).toBe('button');
        expect((el.querySelector('input[name="name"]') as HTMLInputElement).required).toBe(false);
    });

    it('is the native submit button on a single-page opt-in form, and required binds carry native required', () => {
        const el = mountTool();
        el.responseActionsDocument = responseActionsDoc([{ id: 'submit' }]);
        el.render();
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(button.type).toBe('submit');
        expect((el.querySelector('input[name="name"]') as HTMLInputElement).required).toBe(true);
        expect((el.querySelector('select[name="region"]') as HTMLSelectElement).required).toBe(false);
    });

    it('required on a radio group sets native required on every option, so the group folds into one required property', () => {
        const el = mountTool({ ...DEFINITION, binds: [...(DEFINITION.binds as any[]), { path: 'kind', required: 'true' }] });
        el.render();
        const radios = el.querySelectorAll('input[name="kind"]');
        expect(radios.length).toBe(2);
        for (const radio of radios) expect((radio as HTMLInputElement).required).toBe(true);
    });

    it('checkbox groups never get native required — it would read as "check every box" (fs-8kpq review MAJOR 3)', () => {
        const el = document.createElement('formspec-render') as any;
        el.setAttribute('tool-name', '');
        document.body.appendChild(el);
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [{ component: 'CheckboxGroup', bind: 'pets' }],
        }, { targetDefinition: { url: 'urn:test:webmcp-checkbox' } });
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:webmcp-checkbox',
            version: '1.0.0',
            title: 'Pets',
            items: [{
                key: 'pets', type: 'field', label: 'Pets', dataType: 'multiChoice',
                options: [{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }],
            }],
            binds: [{ path: 'pets', required: 'true' }],
        };
        el.render();
        const checkboxes = el.querySelectorAll('input[name="pets"]');
        expect(checkboxes.length).toBe(2);
        for (const checkbox of checkboxes) expect((checkbox as HTMLInputElement).required).toBe(false);
    });

    it('overrides an adapter\'s hardcoded type="button" (USWDS\'s action-button.ts renders type="button") under the tool form (fs-8kpq review MAJOR 1)', () => {
        const el = mountTool();
        el.adapter = 'test-uswds-like';
        el.responseActionsDocument = responseActionsDoc([{ id: 'submit' }]);
        el.render();
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(button.type).toBe('submit');
        const invokeSpy = vi.spyOn(el, 'invokeAction');
        button.click(); // the adapter's own click handler must defer to the form's submit listener too
        expect(invokeSpy).toHaveBeenCalledTimes(1);
    });

    it('never becomes the native submit button for a non-submit-intent Action (e.g. Save Draft)', () => {
        const el = mountTool();
        el.responseActionsDocument = responseActionsDoc([{ id: 'save-draft', intent: 'save' }]);
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'name' },
                { component: 'ActionButton', actionRef: 'save-draft', label: { literal: 'Save Draft' } },
            ],
        }, { targetDefinition: { url: 'urn:test:webmcp' } });
        el.render();
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(button.type).toBe('button');
    });

    it('clicking the native submit button on a single-page form runs the submit intent exactly once', () => {
        const el = mountTool();
        el.responseActionsDocument = responseActionsDoc([{ id: 'submit' }]);
        el.render();
        const invokeSpy = vi.spyOn(el, 'invokeAction');
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(button.type).toBe('submit');
        button.click(); // a native submit button's click also fires the enclosing form's `submit` event
        expect(invokeSpy).toHaveBeenCalledTimes(1);
        // nodeId comes from event.submitter.id (MAJOR 2 review); the auto-injected button carries none.
        expect(invokeSpy).toHaveBeenCalledWith('submit', undefined);
    });

    it('runs the submit-intent Action for an agent-invoked submission before answering', async () => {
        const el = mountTool();
        el.responseActionsDocument = responseActionsDoc([{ id: 'submit' }]);
        el.render();
        const invokeSpy = vi.spyOn(el, 'invokeAction');
        const form = root(el) as HTMLFormElement;
        const event = agentSubmit();
        form.dispatchEvent(event);
        expect(invokeSpy).toHaveBeenCalledWith('submit');
        await event.respondWith.mock.calls[0][0];
    });

    it('answers an agent-invoked submission with the ValidationReport the invoked Action\'s submission produced, not a freshly computed one', async () => {
        const el = mountTool();
        el.responseActionsDocument = responseActionsDoc([{ id: 'submit' }]);
        el.render();
        const producedReport = {
            $formspecValidationReport: '1.0',
            valid: true,
            results: [],
            counts: { error: 0, warning: 0, info: 0 },
            timestamp: 'sentinel',
        };
        vi.spyOn(el, 'invokeAction').mockResolvedValue({ response: { data: {} }, validationReport: producedReport } as any);
        const form = root(el) as HTMLFormElement;
        const event = agentSubmit();
        form.dispatchEvent(event);
        const report = await event.respondWith.mock.calls[0][0];
        expect(report).toBe(producedReport);
    });
});

describe('wizard page mode: the native submit button is only actionable on the last step (fs-8kpq)', () => {
    function mountWizardTool() {
        const el = document.createElement('formspec-render') as any;
        el.setAttribute('tool-name', '');
        document.body.appendChild(el);
        el.responseActionsDocument = responseActionsDoc([{ id: 'submit' }]);
        el.componentDocument = minimalComponentDoc({
            component: 'Stack',
            children: [
                { component: 'Section', title: 'Applicant', children: [{ component: 'TextInput', bind: 'name' }] },
                { component: 'Section', title: 'Budget', children: [{ component: 'TextInput', bind: 'amount' }] },
            ],
        }, { targetDefinition: { url: 'urn:test:webmcp' } });
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:webmcp',
            version: '1.0.0',
            title: 'Grant application',
            items: [],
            formPresentation: { pageMode: 'wizard' },
        };
        el.render();
        return el;
    }

    it('is type="button" on a non-final step and type="submit" once the wizard reaches the last step', () => {
        const el = mountWizardTool();
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        const wizardRoot = el.querySelector('.formspec-wizard') as HTMLElement;
        expect(button.type).toBe('button');

        wizardRoot.dispatchEvent(new CustomEvent('formspec-wizard-set-step', { detail: { index: 1 } }));
        expect(button.type).toBe('submit');

        wizardRoot.dispatchEvent(new CustomEvent('formspec-wizard-set-step', { detail: { index: 0 } }));
        expect(button.type).toBe('button');
    });

    it('clicking the native submit button on the final page runs the submit intent once, not twice', () => {
        const el = mountWizardTool();
        const wizardRoot = el.querySelector('.formspec-wizard') as HTMLElement;
        wizardRoot.dispatchEvent(new CustomEvent('formspec-wizard-set-step', { detail: { index: 1 } }));
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(button.type).toBe('submit');

        const invokeSpy = vi.spyOn(el, 'invokeAction');
        // happy-dom (like a real browser) fires the form's native `submit` event when a type="submit"
        // button inside it is clicked, with that button as event.submitter — the same sequence Chromium's
        // implicit (Enter) submission runs when this button is the form's default button.
        button.click();
        expect(invokeSpy).toHaveBeenCalledTimes(1);
    });

    it('a submission with no submitter — the browser\'s own no-default-button implicit-submit fallback — does not run the intent', () => {
        // fs-8kpq review MAJOR 2: on a non-final step the button is type="button", so it is not the form's
        // default button — but a form with no default button and at most one text-like field still submits
        // directly on Enter (HTML implicit submission), with submitter: null. That is not a respondent
        // choosing to submit, so it must not run the submit-intent Action.
        const el = mountWizardTool();
        const button = el.querySelector('.formspec-submit') as HTMLButtonElement;
        expect(button.type).toBe('button'); // step 0: non-final

        const invokeSpy = vi.spyOn(el, 'invokeAction');
        const form = root(el) as HTMLFormElement;
        form.requestSubmit(); // no submitter argument — submitter is null, exactly like the no-button fallback
        expect(invokeSpy).not.toHaveBeenCalled();
    });
});
