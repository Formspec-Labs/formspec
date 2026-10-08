/** @filedesc Runtime JSON admission and detached metadata for host instance sources. */
import type { InstanceSourceResult, JsonValue } from '../interfaces.js';

export function sourceErrorMessage(error: unknown): string {
    try { return String(error); } catch { return 'Instance source loading failed'; }
}

export function freezeSourceMetadata<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value)) freezeSourceMetadata(child);
        Object.freeze(value);
    }
    return value;
}

/** Copy an acyclic JSON tree without invoking accessors or accepting non-JSON objects. */
export function cloneSourceJson(value: unknown, ancestors = new Set<object>()): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || ancestors.has(value)) throw new Error('Instance source must be finite acyclic JSON');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        throw new Error('Instance source must use plain JSON objects');
    }
    ancestors.add(value);
    try {
        const read = (key: string): JsonValue => {
            const property = Object.getOwnPropertyDescriptor(value, key);
            if (!property || !('value' in property)) throw new Error('Instance source contains a sparse array or accessor');
            return cloneSourceJson(property.value, ancestors);
        };
        if (Array.isArray(value)) return Array.from({ length: value.length }, (_, i) => read(String(i)));
        return Object.fromEntries(Object.keys(value).map(key => [key, read(key)]));
    } finally {
        ancestors.delete(value);
    }
}

export function readSourceResult(value: unknown): InstanceSourceResult {
    const result = cloneSourceJson(value);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid instance source result');
    if (result.status === 'loaded' && Object.prototype.hasOwnProperty.call(result, 'value')) return { status: 'loaded', value: result.value };
    if (result.status === 'unavailable' && (result.reason === undefined || typeof result.reason === 'string')) {
        return { status: 'unavailable', ...(result.reason === undefined ? {} : { reason: result.reason }) };
    }
    throw new Error('Invalid instance source result');
}
