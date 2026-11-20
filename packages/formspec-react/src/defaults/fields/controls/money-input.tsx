/** @filedesc MoneyInput amount + currency adornment. */
'use client';
import React, { useState } from 'react';
import { jsonValueText } from '@formspec-org/engine';
import { useChromeText } from '../../../use-chrome-text';
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

/** ISO 4217 minor-unit decimal places (e.g. 2 for USD/EUR, 0 for JPY). */
function currencyMinFractionDigits(code: string): number {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: code.toUpperCase(),
        }).resolvedOptions().minimumFractionDigits ?? 2;
    } catch {
        return 2;
    }
}

/** Round-trip raw canonical decimal text for money amount input (matches web component bind sync). */
function formatMoneyAmountForInput(amount: unknown): string {
    return jsonValueText(amount);
}

/**
 * Format an exact decimal string with thousands commas and consistent currency decimals without
 * converting through IEEE-754 floats (preserves arbitrary-precision fractional digits verbatim).
 */
export function formatMoneyDisplay(raw: string, currencyCode: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const match = trimmed.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
    if (!match) return raw;
    const [, sign, intDigits, fracDigits = ''] = match;
    const groupedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const minFrac = currencyMinFractionDigits(currencyCode);
    if (fracDigits.length === 0 && minFrac === 0) {
        return `${sign}${groupedInt}`;
    }
    const paddedFrac = fracDigits.length < minFrac
        ? fracDigits.padEnd(minFrac, '0')
        : fracDigits;
    return `${sign}${groupedInt}.${paddedFrac}`;
}

/** Strip thousands commas (and optional pasted currency symbol/whitespace) when the entry is numeric. */
function normalizeMoneyInput(raw: string, currencySymbol: string): string {
    if (raw === '') return '';
    let candidate = raw.trim();
    if (currencySymbol && candidate.startsWith(currencySymbol)) {
        candidate = candidate.slice(currencySymbol.length).trim();
    }
    const withoutCommas = candidate.replace(/,/g, '');
    if (/^[+-]?(?:\d+\.?\d*|\.\d*)$/.test(withoutCommas)) {
        return withoutCommas;
    }
    return raw;
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
