/** @filedesc Integration: USWDS field adapters on the real <formspec-render> + engine path. */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { FormspecRender, globalRegistry } from '@formspec-org/webcomponent';
import { uswdsAdapter } from '../../src/uswds/index';
import { readUswdsAdapterCss } from '../helpers';

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

function renderForm(
    items: any[],
    options: { binds?: any[]; theme?: any; locale?: any; componentTree?: any; headingLevel?: number } = {},
): any {
    globalRegistry.setAdapter('uswds');
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (options.headingLevel) el.headingLevel = options.headingLevel;
    if (options.locale) {
        el.localeDocuments = [options.locale];
        el.locale = options.locale.locale;
    }
    if (options.theme) el.themeDocument = options.theme;
    if (options.componentTree) {
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:uswds-fields' },
            tree: options.componentTree,
        };
    }
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:uswds-fields',
        version: '1.0.0',
        title: 'USWDS fields',
        items,
        ...(options.binds ? { binds: options.binds } : {}),
    };
    el.render();
    return el;
}

describe('USWDS validation summary', () => {
    const radioTheme = {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:uswds-fields' },
        selectors: [{ match: { dataType: 'choice' }, apply: { widget: 'RadioGroup' } }],
    };

    it('lists each finding as a link to its field, a radio group included, worded with the live label, under a heading at the form\'s depth', () => {
        const el = renderForm(
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'able', type: 'field', dataType: 'choice', label: 'Able?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
            ],
            {
                binds: [{ path: 'name', required: 'true' }, { path: 'able', required: 'true' }],
                theme: radioTheme,
                headingLevel: 2,
                componentTree: {
                    component: 'Stack',
                    children: [
                        { component: 'ValidationSummary', source: 'submit', showFieldErrors: true, jumpLinks: true },
                        { component: 'TextInput', bind: 'name' },
                        { component: 'RadioGroup', bind: 'able' },
                    ],
                },
            },
        );
        el.submit({ profile: 'on-submit', emitEvent: false });

        // A page whose h1 titles the form hands it heading-level 2: the summary's heading is an h2, like a section's.
        expect(el.querySelector('.formspec-validation-summary .usa-alert__heading')?.tagName).toBe('H2');
        const links = [...el.querySelectorAll('.formspec-validation-summary a.formspec-validation-summary-link')] as HTMLAnchorElement[];
        expect(links.map((a) => a.getAttribute('href'))).toEqual(['#field-name', '#field-able']);
        expect(links.map((a) => a.className)).toEqual(Array(2).fill('usa-link formspec-validation-summary-link formspec-focus-ring'));
        expect(links[1].textContent).toMatch(/^Able\?: /);
        // The radio group's fieldset carries the field's id: the fragment names the group, the options sit beneath it.
        const group = el.querySelector('#field-able') as HTMLElement;
        expect(group.tagName).toBe('FIELDSET');
        expect(group.querySelector('#field-able-0')).not.toBeNull();

        links[1].click();
        expect(document.activeElement).toBe(group.querySelector('#field-able-0'));
    });
});

describe('USWDS error messages — aria-describedby', () => {
    const requiredBind = (path: string) => ({ path, required: 'true' });
    const radioTheme = {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:uswds-fields' },
        selectors: [{ match: { dataType: 'choice' }, apply: { widget: 'RadioGroup' } }],
    };

    it('links the error message to the input while the error is shown', () => {
        const el = renderForm(
            [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', hint: 'Legal name' }],
            { binds: [requiredBind('name')] },
        );
        const input = el.querySelector('#field-name') as HTMLInputElement;
        expect(input.getAttribute('aria-describedby')).toBe('field-name-hint');

        el.submit({ emitEvent: false });
        expect(el.querySelector('#field-name-error')?.textContent).not.toBe('');
        expect(input.getAttribute('aria-describedby')).toBe('field-name-hint field-name-error');

        el.getEngine().setValue('name', 'Ada');
        expect(input.getAttribute('aria-describedby')).toBe('field-name-hint');
    });

    it('links a radio group error to the fieldset, not the first radio', () => {
        const el = renderForm(
            [{
                key: 'able', type: 'field', dataType: 'choice', label: 'Able to work?',
                options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
            }],
            { binds: [requiredBind('able')], theme: radioTheme },
        );
        const fieldset = el.querySelector('[data-name="able"] fieldset') as HTMLElement;
        expect(fieldset).not.toBeNull();
        el.submit({ emitEvent: false });
        expect(fieldset.getAttribute('aria-describedby')).toBe('field-able-error');
        expect(el.querySelector('input[type="radio"]')?.getAttribute('aria-describedby')).toBeNull();
    });
});

describe('USWDS radio group state', () => {
    const radioItem = (extra: Record<string, unknown> = {}) => ({
        key: 'able', type: 'field', dataType: 'choice', label: 'Able to work?',
        options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
        ...extra,
    });
    const radioTree = { component: 'Stack', children: [{ component: 'RadioGroup', bind: 'able' }] };

    it('exposes required and invalid state on the radiogroup fieldset, not the first radio', () => {
        const el = renderForm([radioItem()], { binds: [{ path: 'able', required: 'true' }], componentTree: radioTree });
        const fieldset = el.querySelector('[data-name="able"] fieldset') as HTMLElement;
        expect(fieldset.getAttribute('role')).toBe('radiogroup');
        expect(fieldset.getAttribute('aria-labelledby')).toBe('field-able-label');
        expect(fieldset.getAttribute('aria-required')).toBe('true');
        el.submit({ emitEvent: false });
        expect(fieldset.getAttribute('aria-invalid')).toBe('true');
        for (const radio of el.querySelectorAll('input[type="radio"]')) {
            expect(radio.hasAttribute('aria-required')).toBe(false);
            expect(radio.hasAttribute('aria-invalid')).toBe(false);
        }
    });

    it('keeps a read-only radio group focusable but unchangeable', () => {
        const el = renderForm([radioItem({ initialValue: 'yes' })], {
            binds: [{ path: 'able', readonly: 'true' }], componentTree: radioTree,
        });
        const fieldset = el.querySelector('[data-name="able"] fieldset') as HTMLElement;
        expect(fieldset.getAttribute('aria-readonly')).toBe('true');
        const [, no] = el.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
        expect(no.disabled).toBe(false);

        // Canceled click: no selection, no change event. (Browsers also restore the previously checked
        // radio; happy-dom does not, so the first radio's checked state is not asserted.)
        no.click();
        expect(no.checked).toBe(false);
        expect(el.getEngine().signals['able'].value).toBe('yes');
    });
});

describe('USWDS checkbox group state', () => {
    const petsItem = (extra: Record<string, unknown> = {}) => ({
        key: 'pets', type: 'field', dataType: 'multiChoice', label: 'Pets',
        options: [{ value: 'cat', label: 'Cat' }, { value: 'dog', label: 'Dog' }],
        ...extra,
    });
    const petsTree = { component: 'Stack', children: [{ component: 'CheckboxGroup', bind: 'pets' }] };

    it('marks the fieldset invalid and no checkbox required or invalid', () => {
        const el = renderForm([petsItem()], { binds: [{ path: 'pets', required: 'true' }], componentTree: petsTree });
        const fieldset = el.querySelector('[data-name="pets"] fieldset') as HTMLElement;
        el.submit({ emitEvent: false });
        expect(fieldset.getAttribute('aria-invalid')).toBe('true');
        for (const checkbox of el.querySelectorAll('input[type="checkbox"]')) {
            expect(checkbox.hasAttribute('aria-required')).toBe(false);
            expect(checkbox.hasAttribute('aria-invalid')).toBe(false);
        }
    });

    it('says "required" in the legend with usa-sr-only text (role=group has no aria-required)', () => {
        const el = renderForm([petsItem()], { binds: [{ path: 'pets', required: 'true' }], componentTree: petsTree });
        const legend = el.querySelector('[data-name="pets"] legend') as HTMLElement;
        expect(legend.querySelector('.usa-sr-only')?.textContent?.trim()).toBe('required');
        expect(legend.querySelector('abbr')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('keeps a read-only checkbox group focusable but unchangeable', () => {
        const el = renderForm([petsItem({ initialValue: ['cat'] })], {
            binds: [{ path: 'pets', readonly: 'true' }], componentTree: petsTree,
        });
        const [cat, dog] = el.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
        expect(dog.disabled).toBe(false);
        expect(dog.getAttribute('aria-readonly')).toBe('true');

        dog.click();
        cat.click();
        expect([cat.checked, dog.checked]).toEqual([true, false]);
        expect(el.getEngine().signals['pets'].value).toEqual(['cat']);
    });
});

describe('USWDS submit with errors — focus', () => {
    it('moves focus to the first invalid field in page order', () => {
        const el = renderForm(
            [
                { key: 'filled', type: 'field', dataType: 'string', label: 'Filled' },
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                {
                    key: 'able', type: 'field', dataType: 'choice', label: 'Able to work?',
                    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
                },
            ],
            {
                binds: [{ path: 'name', required: 'true' }, { path: 'able', required: 'true' }],
                // Page order (component tree) differs from definition order.
                componentTree: {
                    component: 'Stack',
                    children: [
                        { component: 'TextInput', bind: 'filled' },
                        { component: 'RadioGroup', bind: 'able' },
                        { component: 'TextInput', bind: 'name' },
                    ],
                },
            },
        );
        el.submit({ emitEvent: false });
        expect(document.activeElement?.getAttribute('name')).toBe('able');
        expect((document.activeElement as HTMLInputElement).type).toBe('radio');
    });
});

describe('USWDS input prefix and suffix', () => {
    it('renders the item prefix/suffix as a usa-input-group on number fields', () => {
        const el = renderForm([
            { key: 'earnings', type: 'field', dataType: 'decimal', label: 'Gross earnings', prefix: '$', suffix: 'USD' },
        ]);
        const input = el.querySelector('#field-earnings') as HTMLInputElement;
        const group = input.parentElement as HTMLElement;
        expect(group.classList.contains('usa-input-group')).toBe(true);
        const prefix = group.querySelector('.usa-input-prefix') as HTMLElement;
        const suffix = group.querySelector('.usa-input-suffix') as HTMLElement;
        expect(prefix.textContent).toBe('$');
        expect(suffix.textContent).toBe('USD');
        expect(input.getAttribute('aria-describedby')).toBe(`${prefix.id} ${suffix.id}`);
    });

    it('renders the item prefix on text fields and marks the group invalid with the field', () => {
        const el = renderForm(
            [{ key: 'site', type: 'field', dataType: 'string', label: 'Website', prefix: 'https://' }],
            { binds: [{ path: 'site', required: 'true' }] },
        );
        const group = el.querySelector('#field-site')!.parentElement as HTMLElement;
        expect(group.querySelector('.usa-input-prefix')?.textContent).toBe('https://');
        el.submit({ emitEvent: false });
        expect(group.classList.contains('usa-input-group--error')).toBe(true);
    });
});

describe('USWDS character count (theme widgetConfig.maxLength)', () => {
    const textTheme = {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:uswds-fields' },
        selectors: [{ match: { dataType: 'text' }, apply: { widget: 'TextInput', widgetConfig: { maxLength: 200 } } }],
    };

    it('shows characters allowed, then characters left, without a native maxlength', () => {
        const el = renderForm(
            [{ key: 'why', type: 'field', dataType: 'text', label: 'Why not?', hint: 'Explain briefly' }],
            { theme: textTheme },
        );
        const textarea = el.querySelector('textarea#field-why') as HTMLTextAreaElement;
        // Native maxlength silently truncates pasted text; USWDS moves the limit to data-maxlength.
        expect(textarea.hasAttribute('maxlength')).toBe(false);
        expect(textarea.classList.contains('usa-character-count__field')).toBe(true);

        const root = textarea.closest('.usa-character-count') as HTMLElement;
        expect(root).not.toBeNull();
        expect(root.getAttribute('data-maxlength')).toBe('200');
        const status = root.querySelector('.usa-character-count__status') as HTMLElement;
        const message = root.querySelector('.usa-character-count__message') as HTMLElement;
        expect(status.textContent).toBe('200 characters allowed');
        expect(status.getAttribute('aria-hidden')).toBe('true');
        expect(message.textContent).toBe('You can enter up to 200 characters');
        expect(textarea.getAttribute('aria-describedby')).toBe(`${message.id} field-why-hint`);
        expect(root.querySelector('.usa-character-count__sr-status')?.getAttribute('aria-live')).toBe('polite');

        const srStatus = root.querySelector('.usa-character-count__sr-status') as HTMLElement;
        vi.useFakeTimers();
        try {
            textarea.value = 'Sick';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            expect(status.textContent).toBe('196 characters left');
            // Screen reader status waits for a typing pause (USWDS debounce).
            expect(srStatus.textContent).toBe('200 characters allowed');
            vi.advanceTimersByTime(1000);
            expect(srStatus.textContent).toBe('196 characters left');
        } finally {
            vi.useRealTimers();
        }

        textarea.value = 'x'.repeat(199);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        expect(status.textContent).toBe('1 character left');
    });

    it('marks over-limit text invalid, visually and through ARIA, until it fits again', () => {
        const el = renderForm(
            [{ key: 'why', type: 'field', dataType: 'text', label: 'Why not?' }],
            { theme: textTheme },
        );
        const textarea = el.querySelector('textarea#field-why') as HTMLTextAreaElement;
        const root = textarea.closest('.usa-character-count') as HTMLElement;
        const status = root.querySelector('.usa-character-count__status') as HTMLElement;
        const label = root.querySelector('label[for="field-why"]') as HTMLElement;
        const type = (value: string) => {
            textarea.value = value;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        };

        type('x'.repeat(202));
        expect(status.textContent).toBe('2 characters over limit');
        expect(status.classList.contains('usa-character-count__status--invalid')).toBe(true);
        expect(textarea.classList.contains('usa-input--error')).toBe(true);
        expect(root.classList.contains('usa-form-group--error')).toBe(true);
        expect(label.classList.contains('usa-label--error')).toBe(true);
        expect(textarea.getAttribute('aria-invalid')).toBe('true');
        expect(textarea.validationMessage).toBe('The content is too long.');

        // Formspec validation re-runs on touch and finds no error; the over-limit state survives it.
        textarea.dispatchEvent(new Event('focusout', { bubbles: true }));
        expect(textarea.getAttribute('aria-invalid')).toBe('true');
        expect(textarea.classList.contains('usa-input--error')).toBe(true);

        type('x'.repeat(200));
        expect(status.textContent).toBe('0 characters left');
        expect(status.classList.contains('usa-character-count__status--invalid')).toBe(false);
        expect(textarea.classList.contains('usa-input--error')).toBe(false);
        expect(root.classList.contains('usa-form-group--error')).toBe(false);
        expect(textarea.getAttribute('aria-invalid')).toBe('false');
        expect(textarea.validationMessage).toBe('');
    });

    it('renders no character count without maxLength', () => {
        const el = renderForm([{ key: 'why', type: 'field', dataType: 'text', label: 'Why not?' }]);
        expect(el.querySelector('.usa-character-count')).toBeNull();
        expect((el.querySelector('#field-why') as HTMLTextAreaElement).hasAttribute('maxlength')).toBe(false);
    });
});

describe('USWDS read-only values', () => {
    it('keeps a readonly Bind value as a labelled, focusable readonly usa-input', () => {
        const el = renderForm(
            [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer', initialValue: 'ACME CORP' }],
            { binds: [{ path: 'employer', readonly: 'true' }] },
        );
        const input = el.querySelector('#field-employer') as HTMLInputElement;
        expect(input.classList.contains('usa-input')).toBe(true);
        expect(input.readOnly).toBe(true);
        expect(input.tabIndex).toBe(0);
        expect(input.value).toBe('ACME CORP');
        expect(el.querySelector('label[for="field-employer"]')?.textContent).toBe('Employer');
    });

    it('keeps the red error border on an invalid read-only calculated field', () => {
        const style = document.createElement('style');
        style.textContent = readUswdsAdapterCss();
        document.head.appendChild(style);
        try {
            const el = renderForm(
                [
                    { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours' },
                    { key: 'pay', type: 'field', dataType: 'integer', label: 'Pay' },
                    { key: 'fee', type: 'field', dataType: 'integer', label: 'Fee', prefix: '$' },
                ],
                {
                    binds: [
                        { path: 'pay', calculate: '$hours * 2', readonly: 'true', constraint: '$ <= 10' },
                        { path: 'fee', calculate: '$hours * 3', readonly: 'true', constraint: '$ <= 10' },
                    ],
                },
            );
            el.getEngine().setValue('hours', 20);
            const pay = el.querySelector('#field-pay') as HTMLInputElement;
            expect(pay.readOnly).toBe(true);
            // Before the error shows, the read-only value has no editable-box border.
            expect(getComputedStyle(pay).borderColor).toBe('rgba(0, 0, 0, 0)');

            el.submit({ emitEvent: false });
            expect(pay.classList.contains('usa-input--error')).toBe(true);
            expect(getComputedStyle(pay).borderColor).toBe('#b50909');

            const feeGroup = el.querySelector('#field-fee')!.parentElement as HTMLElement;
            expect(feeGroup.classList.contains('usa-input-group--error')).toBe(true);
            expect(getComputedStyle(feeGroup).borderColor).toBe('#b50909');
        } finally {
            style.remove();
        }
    });
});

describe('USWDS field text — hints and descriptions', () => {
    it('renders the Locale hint and description instead of the raw item strings', () => {
        const el = renderForm(
            [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', hint: 'raw hint', description: 'raw description' }],
            {
                locale: {
                    $formspecLocale: '2.0',
                    locale: 'fr',
                    version: '1.0.0',
                    target: { kind: 'definition', url: 'urn:test:uswds-fields' },
                    strings: { 'name.hint': 'Indice traduit', 'name.description': 'Description traduite' },
                },
            },
        );
        expect(el.querySelector('#field-name-hint')?.textContent).toBe('Indice traduit');
        expect(el.querySelector('#field-name-desc')?.textContent).toBe('Description traduite');
    });

    it('interpolates {{}} in hints and keeps them current as values change', () => {
        const el = renderForm([
            { key: 'limit', type: 'field', dataType: 'integer', label: 'Limit' },
            { key: 'story', type: 'field', dataType: 'string', label: 'Story', hint: 'Use at most {{$limit}} words.' },
        ]);
        el.getEngine().setValue('limit', 5);
        expect(el.querySelector('#field-story-hint')?.textContent).toBe('Use at most 5 words.');
        el.getEngine().setValue('limit', 12);
        expect(el.querySelector('#field-story-hint')?.textContent).toBe('Use at most 12 words.');
    });

    it('keeps the date format hint visible and described when the item has no hint', async () => {
        const el = renderForm([{ key: 'start', type: 'field', dataType: 'date', label: 'Start date' }]);
        const format = el.querySelector('#field-start-format') as HTMLElement;
        expect(format.textContent).toBe('MM/DD/YYYY');
        expect(format.hidden).toBe(false);

        // USWDS's date-picker JS mounts asynchronously (dynamic import); bind() — and so
        // aria-describedby — only lands once that resolves (src/uswds/date-picker.ts).
        await vi.waitFor(() => {
            const input = el.querySelector('#field-start') as HTMLInputElement;
            expect(input?.getAttribute('aria-describedby')).toBe('field-start-format');
        });
    });

    it('shows a hint and description that start empty once they get text, and hides them again', () => {
        const el = renderForm([
            { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
            { key: 'story', type: 'field', dataType: 'string', label: 'Story', hint: '{{$note}}', description: '{{$note}}' },
        ]);
        const input = el.querySelector('#field-story') as HTMLInputElement;
        const hint = el.querySelector('#field-story-hint') as HTMLElement;
        const desc = el.querySelector('#field-story-desc') as HTMLElement;
        expect(hint).not.toBeNull();
        expect(desc).not.toBeNull();
        expect(hint.hidden).toBe(true);
        expect(desc.hidden).toBe(true);
        expect(input.getAttribute('aria-describedby')).toBeNull();

        el.getEngine().setValue('note', 'Plain words');
        expect(hint.textContent).toBe('Plain words');
        expect(hint.hidden).toBe(false);
        expect(desc.hidden).toBe(false);
        expect(input.getAttribute('aria-describedby')).toBe('field-story-desc field-story-hint');

        el.getEngine().setValue('note', '');
        expect(hint.hidden).toBe(true);
        expect(desc.hidden).toBe(true);
        expect(input.getAttribute('aria-describedby')).toBeNull();
    });
});

describe('USWDS $component Locale strings follow a locale switch', () => {
    it('rewrites layout, display, and array-element strings in place', () => {
        const el = renderForm(
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' },
            ],
            {
                componentTree: {
                    component: 'Stack',
                    children: [
                        { component: 'Stack', id: 'block', title: 'Block', children: [] },
                        { component: 'Card', id: 'card', title: 'Card', children: [] },
                        { component: 'Alert', id: 'note', title: 'Heads up', text: 'Note' },
                        { component: 'Collapsible', id: 'more', title: 'More', children: [] },
                        { component: 'Modal', id: 'help', triggerLabel: 'Open help', children: [] },
                        { component: 'Accordion', id: 'faq', labels: ['FAQ', 'More'], children: [{ component: 'Text', text: 'a' }, { component: 'Text', text: 'b' }] },
                        {
                            component: 'Tabs', id: 'mainTabs', tabLabels: ['Personal', 'Money'],
                            children: [
                                { component: 'Stack', children: [{ component: 'TextInput', bind: 'name' }] },
                                { component: 'Stack', children: [{ component: 'NumberInput', bind: 'amount' }] },
                            ],
                        },
                        { component: 'Summary', id: 'recap', items: [{ label: 'Name', bind: 'name' }] },
                    ],
                },
            },
        );
        el.localeDocuments = [{
            $formspecLocale: '2.0', locale: 'fr', version: '1.0.0', target: { kind: 'definition', url: 'urn:test:uswds-fields' },
            strings: {
                '$component.block.title': 'Bloc',
                '$component.card.title': 'Carte',
                '$component.note.title': 'Attention',
                '$component.more.title': 'Plus',
                '$component.help.triggerLabel': "Ouvrir l'aide",
                '$component.faq.labels[1]': 'Encore',
                '$component.mainTabs.tabLabels[1]': 'Argent',
                '$component.recap.items[0].label': 'Nom',
            },
        }];
        const text = (selector: string) => Array.from(el.querySelectorAll(selector), (node: Element) => node.textContent);
        expect(text('#more .usa-accordion__button')).toEqual(['More']);

        el.locale = 'fr';
        expect(text('#block > .formspec-layout-title')).toEqual(['Bloc']);
        expect(text('#card .usa-card__heading')).toEqual(['Carte']);
        expect(text('#note .usa-alert__heading')).toEqual(['Attention']);
        expect(text('#more .usa-accordion__button')).toEqual(['Plus']);
        expect(text('#faq .usa-accordion__button')).toEqual(['FAQ', 'Encore']);
        expect(text('#mainTabs [role="tab"]')).toEqual(['Personal', 'Argent']);
        expect(text('#recap dt')).toEqual(['Nom']);
        expect(Array.from(el.querySelectorAll('button')).some((b: Element) => b.textContent === "Ouvrir l'aide")).toBe(true);
    });
});
