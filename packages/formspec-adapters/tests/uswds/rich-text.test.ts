/** @filedesc USWDS rendering of the core §4.2.1 rich-text subset — hints, labels, display text. */
import { describe, it, expect } from 'vitest';
import { renderTextInput } from '../../src/uswds/text-input';
import { renderRadioGroup } from '../../src/uswds/radio-group';
import { renderToggle } from '../../src/uswds/toggle';
import { renderUSWDSAlert, renderUSWDSText } from '../../src/uswds/display-components';
import { mockTextInput, mockRadioGroup, mockToggle, mockAdapterContext } from '../helpers';

function makeParent(): HTMLElement { return document.createElement('div'); }

/** Display host slice stub: `watchCompText` writes the fallback once, like a static Locale-free string. */
function mockDisplayBehavior(comp: Record<string, unknown>) {
    return {
        comp,
        host: {
            prefix: '',
            cleanupFns: [],
            engine: { signals: {}, variableSignals: {} },
            resolveToken: (v: unknown) => v,
            watchCompText: (_c: unknown, _p: string, fallback: string, write: (t: string) => void) => write(fallback),
            renderComponent: () => {},
        },
    } as any;
}

describe('USWDS hint — rich-text subset', () => {
    it('renders a bulleted list as ul.usa-list inside usa-hint', () => {
        const parent = makeParent();
        renderTextInput(
            mockTextInput({ hint: 'Some examples include:\n- Physical or mental health\n- Childcare' }),
            parent,
            mockAdapterContext(),
        );
        const hint = parent.querySelector('.usa-hint:not(.formspec-description)') as HTMLElement;
        const ul = hint.querySelector('ul') as HTMLElement;
        expect(ul).toBeTruthy();
        expect(ul.classList.contains('usa-list')).toBe(true);
        expect(ul.querySelectorAll('li')).toHaveLength(2);
    });

    it('uses an element that can legally hold a list', () => {
        const parent = makeParent();
        renderTextInput(mockTextInput({ hint: '- One' }), parent, mockAdapterContext());
        // A <span> or <p> cannot contain <ul>; the hint must not be one.
        const hint = parent.querySelector('.usa-hint:not(.formspec-description)') as HTMLElement;
        expect(['SPAN', 'P']).not.toContain(hint.tagName);
    });

    it('leaves a plain hint untouched', () => {
        const parent = makeParent();
        renderTextInput(mockTextInput({ hint: '200 characters allowed' }), parent, mockAdapterContext());
        const hint = parent.querySelector('.usa-hint:not(.formspec-description)') as HTMLElement;
        expect(hint.textContent).toBe('200 characters allowed');
        expect(hint.childElementCount).toBe(0);
    });
});

describe('USWDS label and legend — rich-text subset', () => {
    it('renders a link inside a label as a.usa-link and keeps `for`', () => {
        const parent = makeParent();
        renderTextInput(
            mockTextInput({ label: 'See [the rules](https://nj.gov/rules) first' }),
            parent,
            mockAdapterContext(),
        );
        const label = parent.querySelector('label.usa-label') as HTMLLabelElement;
        const a = label.querySelector('a') as HTMLAnchorElement;
        expect(a.classList.contains('usa-link')).toBe(true);
        expect(a.getAttribute('href')).toBe('https://nj.gov/rules');
        expect(a.getAttribute('rel')).toBe('noopener');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(label.getAttribute('for')).toBe('field-name');
    });

    it('renders **strong** inside a legend', () => {
        const parent = makeParent();
        renderRadioGroup(mockRadioGroup({ label: 'Week of **03/23/2025**' }), parent, mockAdapterContext());
        const legend = parent.querySelector('legend.usa-legend') as HTMLElement;
        expect(legend.querySelector('strong')?.textContent).toBe('03/23/2025');
    });

    it('renders a link inside the certification checkbox label', () => {
        const parent = makeParent();
        renderToggle(
            mockToggle({ label: 'I certify. [False information](https://nj.gov/penalties) may cost benefits.' }),
            parent,
            mockAdapterContext(),
        );
        const label = parent.querySelector('label.usa-checkbox__label') as HTMLLabelElement;
        expect(label.querySelector('a.usa-link')).toBeTruthy();
        expect(label.getAttribute('for')).toBe(
            (parent.querySelector('input[type="checkbox"]') as HTMLInputElement).id,
        );
    });

    it('does not make a link out of a javascript: URI', () => {
        const parent = makeParent();
        renderTextInput(mockTextInput({ label: 'Go [here](javascript:alert(1))' }), parent, mockAdapterContext());
        const label = parent.querySelector('label.usa-label') as HTMLElement;
        expect(label.querySelector('a')).toBeNull();
        expect(label.textContent).toContain('[here](javascript:alert(1))');
    });
});

describe('USWDS display text — rich-text subset', () => {
    it('bolds the certification week in an alert', () => {
        const parent = makeParent();
        renderUSWDSAlert(
            mockDisplayBehavior({ text: "You're claiming benefits for the week of **03/23/2025 to 03/29/2025**" }),
            parent,
            mockAdapterContext(),
        );
        const text = parent.querySelector('.usa-alert__text') as HTMLElement;
        expect(text.querySelector('strong')?.textContent).toBe('03/23/2025 to 03/29/2025');
    });

    it('renders a link in Text', () => {
        const parent = makeParent();
        renderUSWDSText(
            mockDisplayBehavior({ text: 'Read [the guide](https://nj.gov/guide).' }),
            parent,
            mockAdapterContext(),
        );
        expect((parent.querySelector('.formspec-text a') as HTMLAnchorElement).className)
            .toBe('formspec-rich-link usa-link');
    });
});
