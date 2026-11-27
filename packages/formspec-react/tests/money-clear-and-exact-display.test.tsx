/** @filedesc RED->GREEN tests for MoneyInput clearing to absence and exact numeric/percentage display. */
import { beforeAll, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import userEvent from '@testing-library/user-event';
import {
    createFormEngine,
    initFormspecEngine,
    parseJsonNumber,
} from '@formspec-org/engine';
import type { FormDefinition } from '@formspec-org/types';
import { FormspecProvider } from '../src/context';
import { FormspecForm } from '../src/renderer';
import { FormspecNode } from '../src/node-renderer';

beforeAll(async () => {
    await initFormspecEngine();
});

function mountForm(ui: React.ReactElement) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        flushSync(() => {
            root.render(ui);
        });
    });
    return {
        container,
        unmount() {
            act(() => root.unmount());
            container.remove();
        },
    };
}

describe('MoneyInputControl clearing to stored absence and round-trip re-entry', () => {
    it('stores true absence (undefined) when cleared instead of wrapping an empty amount object, and supports clean re-entry', async () => {
        const user = userEvent.setup();
        const def: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:money-clear-absence',
            version: '1.0.0',
            title: 'Monetary Schedule',
            items: [
                { key: 'optionalAmount', type: 'field', dataType: 'money', label: 'Optional Amount' },
                { key: 'requiredAmount', type: 'field', dataType: 'money', label: 'Required Amount' },
            ],
            binds: [
                { path: 'requiredAmount', required: 'true' },
            ],
        };

        const engine = createFormEngine(def);
        act(() => {
            engine.setValue('optionalAmount', { amount: '1250.5', currency: 'USD' });
            engine.setValue('requiredAmount', { amount: '500', currency: 'USD' });
        });

        const view = mountForm(<FormspecForm engine={engine} />);
        try {
            const optionalInput = view.container.querySelector<HTMLInputElement>(
                '[data-name="optionalAmount"] input.formspec-money-amount',
            )!;
            const requiredInput = view.container.querySelector<HTMLInputElement>(
                '[data-name="requiredAmount"] input.formspec-money-amount',
            )!;

            expect(optionalInput.value).toBe('1,250.50');
            expect(requiredInput.value).toBe('500.00');

            // Clear optional money input and blur.
            await act(async () => {
                await user.clear(optionalInput);
                await user.tab();
            });

            // Clearing MUST store true absence (key omitted from Response data, signal null, no TYPE_MISMATCH).
            expect('optionalAmount' in engine.getResponse().data).toBe(false);
            expect(engine.signals.optionalAmount.value).toBeNull();
            expect(optionalInput.value).toBe('');
            const afterOptionalClear = engine.getValidationReport({ profile: 'on-submit' });
            expect(afterOptionalClear.valid).toBe(true);
            expect(afterOptionalClear.results).toEqual([]);

            // Clear required money input -> emits REQUIRED (not TYPE_MISMATCH on a malformed money wrapper).
            await act(async () => {
                await user.clear(requiredInput);
                await user.tab();
            });
            expect('requiredAmount' in engine.getResponse().data).toBe(false);
            const afterRequiredClear = engine.getValidationReport({ profile: 'on-submit' });
            expect(afterRequiredClear.valid).toBe(false);
            expect(afterRequiredClear.results.map((r) => [r.path, r.code])).toEqual([
                ['requiredAmount', 'REQUIRED'],
            ]);

            // Round-trip re-entry after clearing restores canonical money value and formatted display.
            await act(async () => {
                await user.type(optionalInput, '3456.789');
                await user.tab();
            });
            expect(engine.getResponse().data.optionalAmount).toEqual({
                amount: '3456.789',
                currency: 'USD',
            });
            expect(optionalInput.value).toBe('3,456.789');

            // Clearing via bare currency symbol / whitespace also stores true absence.
            await act(async () => {
                await user.clear(optionalInput);
                await user.type(optionalInput, ' $ ');
                await user.tab();
            });
            expect('optionalAmount' in engine.getResponse().data).toBe(false);
            expect(optionalInput.value).toBe('');
        } finally {
            view.unmount();
            engine.dispose();
        }
    });
});

describe('Exact numeric, percentage, and money display across editable and read-only React renderers', () => {
    it('preserves exact decimal digits and percentage suffixes in NumberInput, Summary, and read-only DataTable cells', () => {
        const highPrec = '1.000000000000000000009';
        const exactPct = '33.33333333333333333333333333';
        const exactFee = '12.3456';
        const negFee = '-1234.56789';

        const def: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:exact-react-display',
            version: '1.0.0',
            title: 'Precision Display',
            items: [
                { key: 'exactRate', type: 'field', dataType: 'decimal', suffix: '%', label: 'Exact Rate' } as any,
                { key: 'exactRatio', type: 'field', dataType: 'decimal', label: 'Exact Ratio' },
                { key: 'exactMoney', type: 'field', dataType: 'money', label: 'Exact Fee' },
                { key: 'negMoney', type: 'field', dataType: 'money', label: 'Adjustment' },
                {
                    key: 'rows',
                    type: 'group',
                    repeatable: true,
                    minRepeat: 1,
                    label: 'Entries',
                    children: [
                        { key: 'pct', type: 'field', dataType: 'decimal', suffix: '%', label: 'Share' } as any,
                        { key: 'fee', type: 'field', dataType: 'money', label: 'Fee' },
                    ],
                },
            ],
            binds: [
                { path: 'exactRate', readonly: 'true' },
            ],
        };

        const engine = createFormEngine(def);
        act(() => {
            engine.setValue('exactRate', parseJsonNumber(exactPct));
            engine.setValue('exactRatio', parseJsonNumber(highPrec));
            engine.setValue('exactMoney', { amount: exactFee, currency: 'USD' });
            engine.setValue('negMoney', { amount: negFee, currency: 'USD' });
            engine.setValue('rows[0].pct', parseJsonNumber(exactPct));
            engine.setValue('rows[0].fee', { amount: exactFee, currency: 'USD' });
        });

        const view = mountForm(
            <FormspecProvider engine={engine}>
                <FormspecNode
                    node={{
                        id: 'root',
                        component: 'Stack',
                        category: 'layout',
                        props: {},
                        cssClasses: [],
                        children: [
                            { id: 'rate', component: 'NumberInput', category: 'field', bindPath: 'exactRate', props: {}, cssClasses: [], children: [] },
                            { id: 'ratio', component: 'NumberInput', category: 'field', bindPath: 'exactRatio', props: {}, cssClasses: [], children: [] },
                            {
                                id: 'summary',
                                component: 'Summary',
                                category: 'display',
                                props: {
                                    items: [
                                        { label: 'Rate Summary', bind: 'exactRate' },
                                        { label: 'Ratio Summary', bind: 'exactRatio' },
                                        { label: 'Fee Summary', bind: 'exactMoney' },
                                        { label: 'Adjustment Summary', bind: 'negMoney' },
                                    ],
                                },
                                cssClasses: [],
                                children: [],
                            },
                            {
                                id: 'table',
                                component: 'DataTable',
                                category: 'display',
                                bindPath: 'rows',
                                props: {
                                    allowAdd: false,
                                    allowRemove: false,
                                    columns: [
                                        { header: 'Share', bind: 'pct', editable: false },
                                        { header: 'Fee', bind: 'fee', type: 'money', editable: false },
                                    ],
                                },
                                cssClasses: [],
                                children: [],
                            },
                        ],
                    }}
                />
            </FormspecProvider>,
        );

        try {
            // Read-only NumberInput preserves exact percentage digits and suffix adornment.
            const rateField = view.container.querySelector('[data-name="exactRate"]')!;
            expect(rateField.querySelector<HTMLInputElement>('input')!.value).toBe(exactPct);
            expect(rateField.querySelector('.formspec-input-suffix')?.textContent).toBe('%');

            // Editable NumberInput preserves exact high-precision decimal digits.
            const ratioInput = view.container.querySelector<HTMLInputElement>('[data-name="exactRatio"] input')!;
            expect(ratioInput.value).toBe(highPrec);

            // Summary preserves exact percentage suffix, exact decimal, and lossless money (>2 decimals and negative).
            const summaryValues = [...view.container.querySelectorAll('.formspec-summary dd')].map((el) => el.textContent);
            expect(summaryValues).toEqual([
                `${exactPct}%`,
                highPrec,
                `$${exactFee}`,
                '-$1,234.56789',
            ]);

            // Non-editable DataTable cells preserve exact percentage suffix and lossless money (>2 decimals).
            expect(view.container.querySelector('td[data-name="rows[0].pct"]')?.textContent).toBe(`${exactPct}%`);
            expect(view.container.querySelector('td[data-name="rows[0].fee"]')?.textContent).toBe(`$${exactFee}`);
        } finally {
            view.unmount();
            engine.dispose();
        }
    });
});
