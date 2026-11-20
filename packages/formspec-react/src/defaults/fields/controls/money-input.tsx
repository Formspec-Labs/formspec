/** @filedesc MoneyInput amount + currency adornment. */
'use client';
import React, { useState } from 'react';
import { jsonValueText } from '@formspec-org/engine';
import { useChromeText } from '../../../use-chrome-text';
import type { CommonInputProps } from '../field-control-types';
import { formatMoneyDisplay, normalizeMoneyInput } from './currency-format';

export { formatMoneyDisplay, normalizeMoneyInput };

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

/** Round-trip raw canonical decimal text for money amount input (matches web component bind sync). */
function formatMoneyAmountForInput(amount: unknown): string {
    return jsonValueText(amount);
}

export function MoneyInputControl({
    field,
    node,
    common,
    isReadonly,
    placeholder: resolvedPlaceholder,
}: CommonInputProps & { placeholder?: string }) {
    const chrome = useChromeText();
    const [isEditing, setIsEditing] = useState(false);
    const currencyCode = ((node.props?.currency as string) || 'USD').toUpperCase();
    const currency = toCurrencySymbol(currencyCode);
    const min = node.props?.min != null ? jsonValueText(node.props.min) : undefined;
    const max = node.props?.max != null ? jsonValueText(node.props.max) : undefined;
    const step = node.props?.step != null ? jsonValueText(node.props.step) : undefined;
    const placeholder = resolvedPlaceholder || chrome('money.amount');

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

    const displayValue = (!isReadonly && isEditing)
        ? amountStr
        : formatMoneyDisplay(amountStr, currencyCode);

    const handleFocus = () => {
        if (!isReadonly) setIsEditing(true);
    };

    const handleBlur = () => {
        setIsEditing(false);
        common.onBlur();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsEditing(true);
        const normalized = normalizeMoneyInput(e.target.value, currency);
        const amount = normalized === '' ? null : normalized;
        field.setValue({
            amount,
            currency: currencyCode,
        });
    };

    const moneyDescribedBy = [common['aria-describedby'], currencyId]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
        <div className="formspec-money">
            {/* The code is its own name; the amount input points at it through aria-describedby. */}
            <span id={currencyId} className="formspec-money-currency">
                {currency}
            </span>
            <input
                {...common}
                type="text"
                inputMode="decimal"
                pattern={'-?[0-9,]*\\.?[0-9]*'}
                className="formspec-input formspec-money-amount"
                name={`${field.path}__amount`}
                placeholder={placeholder}
                aria-describedby={moneyDescribedBy}
                value={displayValue}
                readOnly={isReadonly}
                min={min}
                max={max}
                step={step}
                onFocus={isReadonly ? undefined : handleFocus}
                onBlur={handleBlur}
                onChange={isReadonly ? undefined : handleChange}
            />
        </div>
    );
}
