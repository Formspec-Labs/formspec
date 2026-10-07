/** @filedesc Private bounded answer freshness; never Response or signature authority. */
import canonicalize from 'canonicalize';
import { sha256 } from '@noble/hashes/sha2.js';
import { Signal } from '@preact/signals-core';
import type { IFormEngine, EngineSignal } from '@formspec-org/engine';

const encoder = new TextEncoder();
const MAX_DEPTH = 128;
const MAX_NODES = 100_000;
const MAX_TEXT_BYTES = 1_048_576;
const unicode = /^(?:[\u0000-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/;

/** Admission only: maintained canonicalize and SHA-256 perform the encoding/hash. */
function admitCohort(value: unknown): void {
    let nodes = 0;
    let textBytes = 0;
    const ancestors = new Set<object>();
    function text(value: string) {
        if (value.length > MAX_TEXT_BYTES - textBytes) throw new Error('content text bound');
        if (!unicode.test(value)) throw new Error('unsupported Unicode');
        textBytes += encoder.encode(value).length;
        if (textBytes > MAX_TEXT_BYTES) throw new Error('content text bound');
    }
    function visit(value: unknown, depth: number): void {
        if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error('content traversal bound');
        if (value === null || typeof value === 'boolean') return;
        if (typeof value === 'string') { text(value); return; }
        if (typeof value === 'number' && Number.isFinite(value)) return;
        if (typeof value !== 'object') throw new Error('unsupported JSON value');
        const array = Array.isArray(value);
        const prototype = Object.getPrototypeOf(value);
        if (array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) {
            throw new Error('unsupported JSON prototype');
        }
        for (let owner: object | null = value; owner; owner = Object.getPrototypeOf(owner)) {
            const hook = Object.getOwnPropertyDescriptor(owner, 'toJSON');
            if (hook && (!('value' in hook) || typeof hook.value === 'function')) throw new Error('JSON hook');
        }
        if (ancestors.has(value)) throw new Error('cyclic JSON');
        ancestors.add(value);
        const keys = Reflect.ownKeys(value);
        if (keys.length > MAX_NODES - nodes + 1) throw new Error('content member bound');
        if (array && keys.length !== (value as unknown[]).length + 1) throw new Error('sparse or extended array');
        for (const key of keys) {
            if (typeof key !== 'string') throw new Error('symbol JSON member');
            if (array && key === 'length') continue;
            if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (value as unknown[]).length)) {
                throw new Error('extended array');
            }
            text(key);
            const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
            if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('unsupported JSON descriptor');
            visit(descriptor.value, depth + 1);
        }
        ancestors.delete(value);
    }
    visit(value, 0);
}

function stockValue<T>(signal: EngineSignal<T> | undefined): T {
    if (!(signal instanceof Signal)) throw new Error('unsupported signal runtime');
    return signal.value;
}

/** Re-evaluated synchronously; no answers or canonical bytes survive this call. */
export function actionContentFingerprint(engine: IFormEngine): string | undefined {
    try {
        stockValue(engine.structureVersion);
        for (const path of Object.keys(engine.relevantSignals).sort()) stockValue(engine.relevantSignals[path]);
        const fields = engine.getFieldPaths().sort().map(path => {
            const value = stockValue(engine.signals[path]);
            return value === undefined
                ? [path, engine.isPathRelevant(path), false]
                : [path, engine.isPathRelevant(path), true, value];
        });
        const repeats = Object.keys(engine.repeats).sort().map(path => {
            const count = stockValue(engine.repeats[path]);
            if (!Number.isSafeInteger(count) || count < 0) throw new Error('unsupported repeat count');
            return [path, count, engine.isPathRelevant(path)];
        });
        const cohort = { fields, repeats };
        admitCohort(cohort);
        const encoded = canonicalize(cohort);
        if (encoded === undefined) return undefined;
        // Fixed digest only; this is freshness evidence, not canonical Response bytes.
        return Array.from(sha256(encoder.encode(encoded)), byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
        return undefined;
    }
}
