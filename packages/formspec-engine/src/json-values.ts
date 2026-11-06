/** @filedesc Exact JSON numeric leaves, detached copies, and scalar-aware equality. */
import type { JsonRecord } from './interfaces.js';
import { parseJsonExact } from '@formspec-org/integrity-canonical';

/** Immutable JSON.rawJSON numeric leaf; JSON.stringify emits its digits without quotes. */
export type ExactJsonNumber = { readonly rawJSON: string };

const rawJson = JSON as typeof JSON & { isRawJSON?: (value: unknown) => boolean };

export function isRawJson(value: unknown): value is { readonly rawJSON: string } {
    return rawJson.isRawJSON?.(value) === true;
}

/** Return a number's exact text; strings and ordinary lookalike objects are not numbers. */
export function jsonNumberText(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (isRawJson(value) && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.rawJSON)) {
        return value.rawJSON;
    }
    return undefined;
}

/** Parse numeric input without sending significant digits through a JavaScript number. */
export function parseJsonNumber(text: string): number | ExactJsonNumber {
    // HTML number inputs also accept .5 and exponent notation; normalize spelling only.
    const normalized = text.trim().replace(/^\+/, '').replace(/^(-?)\./, '$10.').replace(/\.(?=[eE]|$)/, '').replace(/^(-?)0+(?=\d)/, '$1');
    const value = parseJsonExact(normalized);
    if (jsonNumberText(value) === undefined) throw new TypeError('Expected a finite JSON number');
    return value as number | ExactJsonNumber;
}

/** Text for DOM controls and labels, including exact numeric primitives. */
export function jsonValueText(value: unknown): string {
    return jsonNumberText(value) ?? (value == null ? '' : String(value));
}

export function isJsonRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && !isRawJson(value);
}

/** Preserve immutable raw primitives while detaching their surrounding containers. */
export function cloneValue<T>(value: T): T {
    const seen = new WeakMap<object, unknown>();
    const copy = (node: any): any => {
        if (node === null || typeof node !== 'object' || isRawJson(node)) return node;
        if (seen.has(node)) return seen.get(node);
        if (!Array.isArray(node) && ![Object.prototype, null].includes(Object.getPrototypeOf(node))) {
            return structuredClone(node);
        }
        const result: any = Array.isArray(node) ? new Array(node.length) : {};
        seen.set(node, result);
        for (const [key, child] of Object.entries(node)) {
            Object.defineProperty(result, key, { value: copy(child), enumerable: true, writable: true, configurable: true });
        }
        return result;
    };
    return copy(value);
}

export function deepEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (isRawJson(left) || isRawJson(right)) {
        return isRawJson(left) && isRawJson(right) && left.rawJSON === right.rawJSON;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
    }
    if (isJsonRecord(left) && isJsonRecord(right)) {
        const keys = Object.keys(left);
        return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
    }
    return false;
}
