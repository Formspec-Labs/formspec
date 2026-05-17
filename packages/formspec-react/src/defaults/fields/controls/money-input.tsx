/** @filedesc MoneyInput amount + currency adornment. */
'use client';
import React from 'react';
import type { CommonInputProps } from '../field-control-types';

/** Resolve ISO 4217 currency code (e.g. "USD") to its narrow symbol (e.g. "$"). */
function toCurrencySymbol(code: string): string {
    try {
        const parts = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: code.toUpperCase(),
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).formatToParts(1);
        return parts.find(p => p.type === 'currency')?.value ?? code;
    } catch {
        return code;
    }
}

/** Round-trip display for money amount input (matches web component bind sync). */
function formatMoneyAmountForInput(amount: unknown): string {
    if (amount === null || amount === undefined) return '';
    const n = typeof amount === 'number' ? amount : Number(amount);
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n * 100) / 100);
}

export function MoneyInputControl({
    field,
    node,
    common,
    isReadonly,
    placeholder: resolvedPlaceholder,
}: CommonInputProps & { placeholder?: string }) {
    const currencyCode = ((node.props?.currency as string) || 'USD').toUpperCase();
    const currency = toCurrencySymbol(currencyCode);
    const min = node.props?.min != null ? String(node.props.min) : undefined;
    const max = node.props?.max != null ? String(node.props.max) : undefined;
    const step = node.props?.step != null ? String(node.props.step) : undefined;
    const placeholder = resolvedPlaceholder || 'Amount';

    const currencyId = `${field.id}-currency`;

    const rawValue = field.value;
    let amountStr = '';
    if (rawValue != null) {
        if (typeof rawValue === 'object' && rawValue !== null && 'amount' in rawValue) {
            amountStr = formatMoneyAmountForInput((rawValue as { amount?: unknown }).amount);
        } else if (typeof rawValue === 'number') {
            amountStr = formatMoneyAmountForInput(rawValue);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const num = raw === '' ? null : Number(raw);
        field.setValue({
            amount: num !== null && Number.isFinite(num) ? num : null,
            currency: currencyCode,
        });
    };

    const moneyDescribedBy = [common['aria-describedby'], currencyId]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
        <div className="formspec-money">
            <span
                id={currencyId}
                className="formspec-money-currency"
                aria-label={`Currency: ${currency}`}
            >
                {currency}
            </span>
            <input
                {...common}
                type="text"
                inputMode="decimal"
                pattern={'[0-9]*\\.?[0-9]*'}
                className="formspec-input formspec-money-amount"
                name={`${field.path}__amount`}
                placeholder={placeholder}
                aria-describedby={moneyDescribedBy}
                value={amountStr}
                readOnly={isReadonly}
                min={min}
                max={max}
                step={step}
                onChange={isReadonly ? undefined : handleChange}
            />
        </div>
    );
}
