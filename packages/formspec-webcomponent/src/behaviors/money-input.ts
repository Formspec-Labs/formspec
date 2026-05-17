/** @filedesc MoneyInput behavior hook — extracts reactive state for compound money (amount + currency) fields. */
import { effect } from '@preact/signals-core';
import type { MoneyInputBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, warnIfIncompatible, readRegistryMetadata } from './shared';

function toCurrencyDisplay(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (!value) return null;

    if (value.length === 3 && /^[A-Z]{3}$/i.test(value)) {
        try {
            const parts = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: value.toUpperCase(),
                currencyDisplay: 'narrowSymbol',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).formatToParts(1);
            const symbol = parts.find((part) => part.type === 'currency')?.value;
            if (symbol) return symbol;
        } catch {
            return value.toUpperCase();
        }
        return value.toUpperCase();
    }

    return value;
}

export function useMoneyInput(ctx: BehaviorContext, comp: any): MoneyInputBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'money' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);
    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);
    const exts = item?.extensions;
    let extensionPlaceholder: string | undefined;
    if (exts && typeof exts === 'object') {
        for (const [extName, extEnabled] of Object.entries(exts)) {
            if (!extEnabled) continue;
            const entry = ctx.registryEntries.get(extName);
            if (!entry) continue;
            const meta = readRegistryMetadata(entry);
            if (meta.placeholder && !comp.placeholder) extensionPlaceholder = String(meta.placeholder);
        }
    }

    if (item?.dataType && !['money', 'decimal'].includes(item.dataType)) {
        warnIfIncompatible('MoneyInput', item.dataType);
    }

    // Resolve currency from the field definition, presentation override, or form default.
    const rawResolvedCurrency = item?.currency
        || item?.presentation?.currency
        || (presentation as Record<string, any>).currency
        || ctx.definition?.formPresentation?.defaultCurrency
        || null;
    const resolvedCurrency = toCurrencyDisplay(rawResolvedCurrency);

    return {
        fieldPath,
        id,
        label: labelText,
        hint: comp.hintOverride || item?.hint || null,
        description: item?.description || null,
        vm,
        presentation,
        widgetClassSlots,
        compOverrides: {
            cssClass: comp.cssClass,
            style: comp.style,
            accessibility: comp.accessibility,
        },
        remoteOptionsState: { loading: false, error: null },
        options: () => [],
        min: comp.min,
        max: comp.max,
        step: comp.step,
        placeholder: comp.placeholder || extensionPlaceholder,
        resolvedCurrency,

        setValue(val: any): void {
            ctx.engine.setValue(fieldPath, val);
        },

        touch(): void {
            if (!ctx.touchedFields.has(fieldPath)) {
                ctx.touchedFields.add(fieldPath);
                ctx.touchedVersion.value += 1;
            }
        },

        bind(refs: FieldRefs): () => void {
            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs);

            // Find amount and currency inputs by class name convention
            const amountInput = refs.control.querySelector('input.formspec-money-amount') as HTMLInputElement | null;
            const currencyInput = refs.root.querySelector('.formspec-money-currency-input') as HTMLInputElement | null;
            const getCurrency = (): string => {
                if (resolvedCurrency) return resolvedCurrency;
                return currencyInput?.value || '';
            };

            // Amount input: DOM → engine
            if (amountInput) {
                const updateMoney = () => {
                    let amount = amountInput.value === '' ? null : Number(amountInput.value);
                    if (amount !== null && !isNaN(amount)) {
                        if (comp.min !== undefined && amount < Number(comp.min)) amount = Number(comp.min);
                        if (comp.max !== undefined && amount > Number(comp.max)) amount = Number(comp.max);
                    }
                    ctx.engine.setValue(fieldPath, { amount, currency: getCurrency() });
                };
                amountInput.addEventListener('input', updateMoney);

                // Amount: engine → DOM
                disposers.push(effect(() => {
                    const sig = ctx.engine.signals[fieldPath];
                    if (!sig) return;
                    const v = sig.value;
                    if (document.activeElement !== amountInput) {
                        if (v !== null && v !== undefined && typeof v === 'object' && 'amount' in v) {
                            const a = (v as any).amount;
                            amountInput.value = a !== null && a !== undefined
                                ? String(Math.round(a * 100) / 100)
                                : '';
                        } else if (typeof v === 'number') {
                            amountInput.value = String(Math.round(v * 100) / 100);
                        }
                    }
                }));
            }

            // Currency input: DOM → engine (only when editable)
            if (currencyInput) {
                currencyInput.addEventListener('input', () => {
                    const amount = amountInput ? (amountInput.value === '' ? null : Number(amountInput.value)) : null;
                    ctx.engine.setValue(fieldPath, { amount, currency: currencyInput.value });
                });

                // Currency: engine → DOM
                disposers.push(effect(() => {
                    const sig = ctx.engine.signals[fieldPath];
                    if (!sig) return;
                    const v = sig.value;
                    if (document.activeElement !== currencyInput && v != null && typeof v === 'object' && 'currency' in v) {
                        currencyInput.value = (v as any).currency || '';
                    }
                }));
            }

            return () => disposers.forEach(d => d());
        }
    };
}
