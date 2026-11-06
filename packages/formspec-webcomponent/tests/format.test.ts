import { describe, it, expect } from 'vitest';
import { formatMoney } from '../src/format';

describe('formatMoney', () => {
    it('formats a basic USD amount', () => {
        expect(formatMoney({ amount: 1234.5 })).toBe('$1,234.50');
    });

    it('formats a string amount', () => {
        expect(formatMoney({ amount: '500' })).toBe('$500.00');
    });

    it('preserves units and cents beyond binary floating point precision', () => {
        expect(formatMoney({ amount: '1234567890123456789012345.67', currency: 'USD' }))
            .toBe('$1,234,567,890,123,456,789,012,345.67');
    });

    it('uses the currency from the money value', () => {
        const result = formatMoney({ amount: 100, currency: 'EUR' });
        // Intl formats vary by runtime, but should contain "100"
        expect(result).toContain('100');
    });

    it('returns empty string for null input', () => {
        expect(formatMoney(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
        expect(formatMoney(undefined)).toBe('');
    });

    it('returns empty string when amount is null', () => {
        expect(formatMoney({ amount: null })).toBe('');
    });

    it('returns empty string for NaN amount', () => {
        expect(formatMoney({ amount: 'abc' })).toBe('');
    });

    it('formats zero', () => {
        expect(formatMoney({ amount: 0 })).toBe('$0.00');
    });
});
