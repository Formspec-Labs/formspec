import { jsonValueText } from '@formspec-org/engine';
/**
 * Format a Formspec money value `{amount, currency}` as a localized currency string.
 * Returns `''` when the amount is missing or not a finite number.
 */
export function formatMoney(
    moneyVal: { amount: any; currency?: string } | null | undefined,
    locale = 'en-US',
): string {
    if (moneyVal == null || moneyVal.amount == null) return '';
    const n = jsonValueText(moneyVal.amount);
    if (!Number.isFinite(Number(n))) return '';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: moneyVal.currency || 'USD',
    }).format(n as unknown as number); // Intl preserves decimal strings; TypeScript still declares number.
}

/** Format a byte count into a human-readable string (KB, MB, GB). */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}
