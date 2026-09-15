/** @filedesc USWDS renderer chrome (Locale §3.1.10 $ui.<ChromeStringKey>): default design-system fallback and Locale override. */
import { describe, it, expect } from 'vitest';
import { signal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import { renderSelect } from '../../src/uswds/select';
import { renderDatePicker } from '../../src/uswds/date-picker';
import { mockSelect, mockDatePicker, mockAdapterContext } from '../helpers';

/** A minimal engine stub: a real localeSignal (so watchText's effect subscribes) plus a fixed lookup table. */
function mockEngine(strings: Record<string, string> = {}): IFormEngine {
    return {
        localeSignal: signal(0),
        lookupLocaleString: (key: string) => strings[key] ?? null,
    } as unknown as IFormEngine;
}

function makeParent(): HTMLElement { return document.createElement('div'); }

describe('USWDS Select — $ui.select.placeholder', () => {
    it('keeps USWDS own "- Select -" default when the Locale sets nothing', () => {
        const parent = makeParent();
        renderSelect(
            mockSelect({ placeholder: undefined }),
            parent,
            { ...mockAdapterContext(), engine: mockEngine() },
        );
        const placeholderOpt = parent.querySelector('option[value=""]') as HTMLOptionElement;
        expect(placeholderOpt.textContent).toBe('- Select -');
    });

    it('an authored Locale $ui.select.placeholder overrides the USWDS default', () => {
        const parent = makeParent();
        renderSelect(
            mockSelect({ placeholder: undefined }),
            parent,
            { ...mockAdapterContext(), engine: mockEngine({ '$ui.select.placeholder': 'Seleccione…' }) },
        );
        const placeholderOpt = parent.querySelector('option[value=""]') as HTMLOptionElement;
        expect(placeholderOpt.textContent).toBe('Seleccione…');
    });

    it('an authored component placeholder still wins over both', () => {
        const parent = makeParent();
        renderSelect(
            mockSelect({ placeholder: 'Choose a country' }),
            parent,
            { ...mockAdapterContext(), engine: mockEngine({ '$ui.select.placeholder': 'Seleccione…' }) },
        );
        const placeholderOpt = parent.querySelector('option[value=""]') as HTMLOptionElement;
        expect(placeholderOpt.textContent).toBe('Choose a country');
    });
});

describe('USWDS DatePicker — $ui.date.format', () => {
    it('keeps the MM/DD/YYYY default hint when the Locale sets nothing', () => {
        const parent = makeParent();
        renderDatePicker(mockDatePicker(), parent, { ...mockAdapterContext(), engine: mockEngine() });
        const hint = parent.querySelector('#field-dob-format') as HTMLElement;
        expect(hint.textContent).toBe('MM/DD/YYYY');
    });

    it('an authored Locale $ui.date.format overrides the format hint', () => {
        const parent = makeParent();
        renderDatePicker(
            mockDatePicker(),
            parent,
            { ...mockAdapterContext(), engine: mockEngine({ '$ui.date.format': 'JJ/MM/AAAA' }) },
        );
        const hint = parent.querySelector('#field-dob-format') as HTMLElement;
        expect(hint.textContent).toBe('JJ/MM/AAAA');
    });
});
