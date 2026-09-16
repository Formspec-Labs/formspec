/** @filedesc Assist spec §8.2: with `tool-name`, the rendered form is a declarative WebMCP tool; named controls always describe themselves. */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

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
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
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
