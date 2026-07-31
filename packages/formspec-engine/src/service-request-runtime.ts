/** @filedesc Pure planning and output extraction for host-admitted Response Action service requests. */

import type {
    JsonValue,
    RuntimeRequest,
    RuntimeRequestCatalog,
    RuntimeValueSelector,
} from '@formspec-org/types';

const FORBIDDEN_PROPERTY_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const FORBIDDEN_HEADERS = new Set([
    'accept',
    'authorization',
    'connection',
    'content-length',
    'content-type',
    'cookie',
    'host',
    'idempotency-key',
    'origin',
    'proxy-authorization',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'user-agent',
]);
const BINDING_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const PATH_BINDING_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const QUERY_BINDING_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const OWN_PATH = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/;

export class ServiceRequestRuntimeError extends Error {
    readonly code = 'RESPONSE_ACTION_SERVICE_REQUEST_INVALID';

    constructor(message: string) {
        super(message);
        this.name = 'ServiceRequestRuntimeError';
    }
}

export interface ServiceRequestSources {
    input: unknown;
    route?: unknown;
    session?: unknown;
    /** Allowlisted internal outputs from prior effects in this invocation. */
    result?: unknown;
}

export interface PlannedServiceRequest {
    requestId: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Same-origin absolute path, including an assembled query when declared. */
    path: string;
    /** Authored, non-authority headers only. Host headers remain separate. */
    headers: Readonly<Record<string, string>>;
    body?: JsonValue;
    /** Exact successful statuses, or undefined to admit any 2xx status. */
    successStatuses?: readonly number[];
}

export interface ExtractedServiceRequestOutputs {
    /** Invocation-private outputs available to later `from: result` selectors. */
    internal: Readonly<Record<string, JsonValue>>;
    /** Public route-transition bindings. */
    transitionBindings: Readonly<Record<string, string>>;
    /** Host-private values to persist in the session store. */
    sessionBindings: Readonly<Record<string, string>>;
}

type JsonScalar = string | number | boolean;

function fail(message: string): never {
    throw new ServiceRequestRuntimeError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function ownDataValue(value: unknown, segment: string, label: string): unknown {
    if (FORBIDDEN_PROPERTY_NAMES.has(segment)) {
        return fail(`${label} contains a forbidden property segment`);
    }
    if (value === null || typeof value !== 'object') {
        return fail(`${label} does not resolve through structured data`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, segment);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return fail(`${label} does not resolve to an own data property`);
    }
    return descriptor.value;
}

function cloneJson(value: unknown, label: string, seen = new Set<object>()): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return fail(`${label} contains a non-finite number`);
        return value;
    }
    if (typeof value !== 'object') return fail(`${label} is not JSON data`);
    if (seen.has(value)) return fail(`${label} contains a cycle`);
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            const result: JsonValue[] = [];
            for (let index = 0; index < value.length; index += 1) {
                if (!Object.prototype.hasOwnProperty.call(value, index)) {
                    return fail(`${label} contains a sparse array`);
                }
                result.push(cloneJson(
                    ownDataValue(value, String(index), label),
                    `${label}[${index}]`,
                    seen,
                ));
            }
            return result;
        }
        if (!isPlainObject(value)) return fail(`${label} must use a plain JSON object`);
        const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
        for (const key of Object.keys(value)) {
            if (FORBIDDEN_PROPERTY_NAMES.has(key)) {
                return fail(`${label} contains a forbidden property name`);
            }
            result[key] = cloneJson(ownDataValue(value, key, label), `${label}.${key}`, seen);
        }
        return result;
    } finally {
        seen.delete(value);
    }
}

function resolveOwnPath(source: unknown, path: string, label: string): unknown {
    if (!OWN_PATH.test(path)) return fail(`${label} is not a safe own-property path`);
    let current = source;
    for (const segment of path.split('.')) {
        current = ownDataValue(current, segment, label);
    }
    return current;
}

/** Resolve one closed runtime selector without evaluating code or inherited properties. */
export function resolveRuntimeValueSelector(
    selector: RuntimeValueSelector,
    sources: ServiceRequestSources,
): JsonValue {
    if (!selector || typeof selector !== 'object') return fail('runtime selector must be an object');
    if (selector.from === 'literal') {
        if (!Object.prototype.hasOwnProperty.call(selector, 'value') || selector.path !== undefined) {
            return fail('literal selector requires value and must omit path');
        }
        return cloneJson(selector.value, 'literal selector value');
    }
    if (!['input', 'route', 'session', 'result'].includes(selector.from)) {
        return fail('runtime selector source is not supported');
    }
    if (selector.value !== undefined || typeof selector.path !== 'string') {
        return fail('non-literal selector requires path and must omit value');
    }
    return cloneJson(
        resolveOwnPath(sources[selector.from], selector.path, `${selector.from} selector path`),
        `${selector.from} selector value`,
    );
}

function scalar(value: JsonValue, label: string): JsonScalar {
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return fail(`${label} must resolve to a scalar string, number, or boolean`);
}

function safeRequestPath(path: string): boolean {
    if (
        !path.startsWith('/')
        || path.startsWith('//')
        || path.includes('//')
        || /[?#\\\u0000-\u001f\u007f]/u.test(path)
    ) return false;
    const lower = path.toLowerCase();
    if (lower.includes('%2e') || lower.includes('%2f') || lower.includes('%5c')) return false;
    return !path.split('/').some((segment) => segment === '.' || segment === '..');
}

function placeholders(path: string): Set<string> {
    const result = new Set<string>();
    let index = 0;
    while (index < path.length) {
        const character = path[index];
        if (character === '}') return fail('pathTemplate contains an unmatched closing brace');
        if (character !== '{') {
            index += 1;
            continue;
        }
        const end = path.indexOf('}', index + 1);
        if (end < 0) return fail('pathTemplate contains an unclosed placeholder');
        const name = path.slice(index + 1, end);
        if (!PATH_BINDING_NAME.test(name) || name.includes('{')) {
            return fail('pathTemplate contains an unsafe placeholder name');
        }
        result.add(name);
        index = end + 1;
    }
    return result;
}

function encodePathSegment(value: JsonScalar): string {
    return encodeURIComponent(String(value)).replace(/[!'().*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
}

function safeAuthoredHeader(name: string): boolean {
    if (!HEADER_NAME.test(name)) return false;
    const normalized = name.toLowerCase();
    return !FORBIDDEN_HEADERS.has(normalized)
        && !normalized.startsWith('proxy-')
        && !normalized.startsWith('sec-')
        && !normalized.startsWith('x-formspec-');
}

function decodePointer(pointer: string, label: string): string[] {
    if (!pointer.startsWith('/') || pointer.length === 1) {
        return fail(`${label} must be a non-root JSON Pointer`);
    }
    return pointer.slice(1).split('/').map((raw) => {
        let decoded = '';
        for (let index = 0; index < raw.length; index += 1) {
            if (raw[index] !== '~') {
                decoded += raw[index];
                continue;
            }
            const escape = raw[index + 1];
            if (escape === '0') decoded += '~';
            else if (escape === '1') decoded += '/';
            else return fail(`${label} contains an invalid JSON Pointer escape`);
            index += 1;
        }
        if (FORBIDDEN_PROPERTY_NAMES.has(decoded)) {
            return fail(`${label} contains a forbidden property segment`);
        }
        return decoded;
    });
}

function arrayIndex(segment: string, label: string): number {
    if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) {
        return fail(`${label} uses a non-numeric array index`);
    }
    const index = Number(segment);
    if (!Number.isSafeInteger(index)) return fail(`${label} uses an unsafe array index`);
    return index;
}

function setPointer(root: JsonValue, pointer: string, value: JsonValue): void {
    const segments = decodePointer(pointer, 'body binding target');
    let current: JsonValue = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const nextSegment = segments[index + 1];
        if (Array.isArray(current)) {
            const targetIndex = arrayIndex(segment, 'body binding target');
            if (targetIndex > current.length) {
                return fail('body binding target would create a sparse array');
            }
            let next = current[targetIndex];
            if (next === undefined) {
                next = /^(?:0|[1-9][0-9]*)$/.test(nextSegment) ? [] : Object.create(null);
                current[targetIndex] = next;
            }
            if (next === null || typeof next !== 'object') {
                return fail('body binding target crosses a scalar value');
            }
            current = next;
        } else if (isPlainObject(current)) {
            let next = current[segment] as JsonValue | undefined;
            if (next === undefined) {
                const created: JsonValue = /^(?:0|[1-9][0-9]*)$/.test(nextSegment)
                    ? []
                    : Object.create(null) as Record<string, JsonValue>;
                current[segment] = created;
                next = created;
            }
            if (next === null || typeof next !== 'object') {
                return fail('body binding target crosses a scalar value');
            }
            current = next;
        } else {
            return fail('body binding target crosses a scalar value');
        }
    }
    const finalSegment = segments[segments.length - 1];
    if (Array.isArray(current)) {
        const targetIndex = arrayIndex(finalSegment, 'body binding target');
        if (targetIndex > current.length) {
            return fail('body binding target would create a sparse array');
        }
        current[targetIndex] = value;
    } else if (isPlainObject(current)) {
        current[finalSegment] = value;
    } else {
        fail('body binding target parent is not structured data');
    }
}

function getPointer(root: unknown, pointer: string, label: string): unknown {
    let current = root;
    for (const segment of decodePointer(pointer, label)) {
        current = ownDataValue(current, segment, label);
    }
    return current;
}

/** Resolve one request id exactly once; duplicate ids fail closed. */
export function resolveServiceRequest(
    catalog: RuntimeRequestCatalog | null | undefined,
    requestRef: string,
): RuntimeRequest {
    if (!catalog || !Array.isArray(catalog.requests)) {
        return fail('runtime request catalog is unavailable');
    }
    const matches = catalog.requests.filter((request) => request.id === requestRef);
    if (matches.length !== 1) {
        return fail(
            matches.length === 0
                ? `service request ${JSON.stringify(requestRef)} is unresolved`
                : `service request ${JSON.stringify(requestRef)} is ambiguous`,
        );
    }
    return matches[0];
}

/** Assemble a transport-neutral request. This function performs no network I/O. */
export function planServiceRequest(
    request: RuntimeRequest,
    sources: ServiceRequestSources,
): PlannedServiceRequest {
    if (!BINDING_NAME.test(request.id)) return fail('runtime request id is unsafe');
    if (request.adapter !== 'http-json') return fail('runtime request adapter must be http-json');
    const binding = request.request;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(binding.method)) {
        return fail('runtime request method must be POST, PUT, PATCH, or DELETE');
    }
    if (!safeRequestPath(binding.pathTemplate)) return fail('runtime request pathTemplate is unsafe');

    const declaredPlaceholders = placeholders(binding.pathTemplate);
    const pathBindings = binding.pathBindings ?? {};
    const bindingNames = Object.keys(pathBindings);
    if (
        bindingNames.some((name) => !declaredPlaceholders.has(name))
        || [...declaredPlaceholders].some((name) => !Object.prototype.hasOwnProperty.call(pathBindings, name))
    ) return fail('pathBindings must match pathTemplate placeholders exactly');

    let path = binding.pathTemplate;
    for (const name of declaredPlaceholders) {
        const resolved = scalar(resolveRuntimeValueSelector(pathBindings[name], sources), `path binding ${name}`);
        path = path.split(`{${name}}`).join(encodePathSegment(resolved));
    }

    const query: string[] = [];
    for (const [name, selector] of Object.entries(binding.queryBindings ?? {})) {
        if (!QUERY_BINDING_NAME.test(name)) return fail(`query binding ${JSON.stringify(name)} has an unsafe name`);
        const resolved = scalar(resolveRuntimeValueSelector(selector, sources), `query binding ${name}`);
        query.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(resolved))}`);
    }
    if (query.length > 0) path += `?${query.join('&')}`;

    const headers: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, selector] of Object.entries(binding.headerBindings ?? {})) {
        if (!safeAuthoredHeader(name)) return fail(`authored header ${JSON.stringify(name)} is unsafe or host-owned`);
        const normalized = name.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(headers, normalized)) {
            return fail(`authored header ${JSON.stringify(name)} duplicates another header name`);
        }
        const resolved = scalar(resolveRuntimeValueSelector(selector, sources), `header binding ${name}`);
        const value = String(resolved);
        if (/\r|\n/.test(value)) return fail(`header binding ${name} contains a line break`);
        headers[normalized] = value;
    }

    let body: JsonValue | undefined;
    if (binding.bodyDefaults !== undefined || binding.bodyBindings !== undefined) {
        body = cloneJson(binding.bodyDefaults ?? {}, 'bodyDefaults');
        if (!isPlainObject(body)) return fail('bodyDefaults must be a JSON object');
        for (const [pointer, selector] of Object.entries(binding.bodyBindings ?? {})) {
            setPointer(body, pointer, resolveRuntimeValueSelector(selector, sources));
        }
    }

    if (request.successStatuses) {
        const statuses = new Set(request.successStatuses);
        if (
            statuses.size !== request.successStatuses.length
            || request.successStatuses.some((status) => !Number.isInteger(status) || status < 200 || status > 299)
        ) return fail('successStatuses must contain unique 2xx integer status codes');
    }

    return Object.freeze({
        requestId: request.id,
        method: binding.method,
        path,
        headers: Object.freeze(headers),
        ...(body !== undefined ? { body } : {}),
        ...(request.successStatuses
            ? { successStatuses: Object.freeze([...request.successStatuses]) }
            : {}),
    });
}

/** Extract only declared outputs; raw response data is never returned. */
export function extractServiceRequestOutputs(
    request: RuntimeRequest,
    responseBody: unknown,
): ExtractedServiceRequestOutputs {
    const internal: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    const transitionBindings: Record<string, string> = Object.create(null) as Record<string, string>;
    const sessionBindings: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, output] of Object.entries(request.outputs ?? {})) {
        if (!BINDING_NAME.test(name)) return fail(`runtime output name ${JSON.stringify(name)} is unsafe`);
        const extracted = cloneJson(
            getPointer(responseBody, output.path, `runtime output ${name}`),
            `runtime output ${name}`,
        );
        const exposure = output.exposure ?? 'internal';
        if (exposure === 'internal') {
            internal[name] = extracted;
            continue;
        }
        if (typeof extracted !== 'string' || extracted.length === 0) {
            return fail(`runtime ${exposure} output ${name} must resolve to a non-empty string`);
        }
        if (exposure === 'transition') transitionBindings[name] = extracted;
        else if (exposure === 'session') sessionBindings[name] = extracted;
        else fail(`runtime output ${name} has an unsupported exposure`);
    }
    return Object.freeze({
        internal: Object.freeze(internal),
        transitionBindings: Object.freeze(transitionBindings),
        sessionBindings: Object.freeze(sessionBindings),
    });
}
