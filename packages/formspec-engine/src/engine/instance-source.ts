/** @filedesc Runtime JSON admission and detached metadata for host instance sources. */
import { isRawJson, jsonNumberText, isJsonRecord } from '../json-values.js';
import type {
    NewerSelectedResponse,
    ResolvedInstanceRecord,
    ResponseSelectionMapping,
} from '@formspec-org/types';
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
    if (isRawJson(value) && jsonNumberText(value) !== undefined) return value as unknown as JsonValue;
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

function readRecords(value: JsonValue): ResolvedInstanceRecord[] {
    if (!Array.isArray(value)) throw new Error('Invalid instance source records');
    return value.map((entry) => {
        if (
            !isJsonRecord(entry)
            || typeof entry.responseId !== 'string'
            || typeof entry.definitionVersion !== 'string'
            || (entry.responseHash !== undefined && typeof entry.responseHash !== 'string')
        ) {
            throw new Error('Invalid instance source record entry');
        }
        return {
            responseId: entry.responseId,
            definitionVersion: entry.definitionVersion,
            ...(entry.responseHash !== undefined ? { responseHash: entry.responseHash } : {}),
        };
    });
}

function readMapping(value: JsonValue): ResponseSelectionMapping {
    if (!isJsonRecord(value) || typeof value.url !== 'string' || typeof value.digest !== 'string') {
        throw new Error('Invalid instance source mapping');
    }
    return { url: value.url, digest: value.digest };
}

function readNewer(value: JsonValue): NewerSelectedResponse {
    if (!isJsonRecord(value) || typeof value.responseId !== 'string' || typeof value.responseHash !== 'string') {
        throw new Error('Invalid instance source newer reference');
    }
    return { responseId: value.responseId, responseHash: value.responseHash };
}

export function readSourceResult(value: unknown): InstanceSourceResult {
    const result = cloneSourceJson(value);
    if (!isJsonRecord(result)) throw new Error('Invalid instance source result');
    if (result.status === 'loaded' && Object.prototype.hasOwnProperty.call(result, 'value')) {
        if (result.valueDigest !== undefined && typeof result.valueDigest !== 'string') {
            throw new Error('Invalid instance source valueDigest');
        }
        if (result.none !== undefined && typeof result.none !== 'boolean') {
            throw new Error('Invalid instance source none flag');
        }
        if (result.pinned !== undefined && typeof result.pinned !== 'boolean') {
            throw new Error('Invalid instance source pinned flag');
        }
        return {
            status: 'loaded',
            value: result.value,
            ...(result.records !== undefined ? { records: readRecords(result.records) } : {}),
            ...(result.valueDigest !== undefined ? { valueDigest: result.valueDigest } : {}),
            ...(result.none !== undefined ? { none: result.none } : {}),
            ...(result.pinned !== undefined ? { pinned: result.pinned } : {}),
            ...(result.mapping !== undefined ? { mapping: readMapping(result.mapping) } : {}),
            ...(result.newer !== undefined ? { newer: readNewer(result.newer) } : {}),
        };
    }
    if (result.status === 'unavailable' && (result.reason === undefined || typeof result.reason === 'string')) {
        return { status: 'unavailable', ...(result.reason === undefined ? {} : { reason: result.reason }) };
    }
    throw new Error('Invalid instance source result');
}
