/** @filedesc Internal helpers shared by FormEngine (paths, coercion, validation shaping, FEL context). */

import type { EngineSignal } from '../reactivity/types.js';
import type {
    FormBind,
    FormDefinition,
    FormItem,
    OptionEntry,
    ValidationResult,
} from '@formspec-org/types';
import { Path } from '@formspec-org/types';
import type { EvalValidation } from '../diff.js';
import type {
    FormEngineRuntimeContext,
    MappingDiagnostic,
    MappingDirection,
    RuntimeMappingResult,
} from '../interfaces.js';
import {
    wasmAnalyzeFEL,
    wasmCoerceFieldValue,
    wasmEvalFELWithContext,
    wasmGetFELDependencies,
    wasmNormalizeIndexedPath,
    type WasmFelContext,
} from '../wasm-bridge-runtime.js';

export type EngineBindConfig = FormBind & {
    remoteOptions?: string;
    precision?: number;
    disabledDisplay?: 'hidden' | 'protected';
};

type RuntimeNowInput = Date | string | number;
export function normalizeRemoteOptions(payload: any): OptionEntry[] {
    const options = Array.isArray(payload) ? payload : Array.isArray(payload?.options) ? payload.options : null;
    if (!options) {
        throw new Error('Remote options response must be an array or { options: [...] }');
    }
    return options
        .filter((option: any) => option && typeof option === 'object' && option.value !== undefined && option.label !== undefined)
        .map((option: any) => {
            const base: OptionEntry = {
                value: String(option.value),
                label: String(option.label),
            };
            if (Array.isArray(option.keywords) && option.keywords.length > 0) {
                const keywords = option.keywords.map((k: unknown) => String(k)).filter((s: string) => s.length > 0);
                if (keywords.length > 0) return { ...base, keywords };
            }
            return base;
        });
}

export function makeValidationResult(
    result: Pick<ValidationResult, 'path' | 'severity' | 'constraintKind' | 'code' | 'message' | 'source'>
    & Partial<Pick<ValidationResult, 'shapeId' | 'context'>>,
): ValidationResult {
    return {
        $formspecValidationResult: '1.0',
        ...result,
        path: toFelIndexedPath(result.path),
    } as ValidationResult;
}

export function toValidationResult(result: EvalValidation): ValidationResult {
    return {
        ...(result as unknown as ValidationResult),
        $formspecValidationResult: '1.0',
        path: toFelIndexedPath(result.path),
    };
}

export function toValidationResults(results: EvalValidation[]): ValidationResult[] {
    return results.map(toValidationResult);
}

export function toRuntimeMappingResult(result: {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
}): RuntimeMappingResult {
    return {
        direction: result.direction as MappingDirection,
        output: result.output,
        appliedRules: result.rulesApplied,
        diagnostics: (result.diagnostics ?? []) as MappingDiagnostic[],
    };
}

export function emptyValueForItem(item: FormItem): any {
    if (item.type !== 'field') {
        return null;
    }
    switch (item.dataType) {
        case 'integer':
        case 'decimal':
        case 'money':
        case 'date':
        case 'dateTime':
        case 'time':
        case 'attachment':
        case 'uri':
        case 'choice':
            return null;
        case 'boolean':
            return false;
        case 'multiChoice':
            return [];
        default:
            return '';
    }
}

export function coerceInitialValue(item: FormItem, value: any): any {
    if (item.dataType === 'boolean' && value === '') {
        return false;
    }
    if (['integer', 'decimal'].includes(item.dataType ?? '') && value === '') {
        return null;
    }
    if (item.dataType === 'money' && typeof value === 'number') {
        return { amount: value, currency: item.currency ?? '' };
    }
    if (item.dataType === 'money' && value && typeof value === 'object' && typeof value.amount === 'string') {
        const parsed = value.amount === '' ? null : Number(value.amount);
        return {
            ...value,
            amount: parsed === null || !Number.isNaN(parsed) ? parsed : value.amount,
        };
    }
    return cloneValue(value);
}

export function coerceFieldValue(
    item: FormItem,
    bind: EngineBindConfig | undefined,
    definition: FormDefinition,
    value: any,
): any {
    if (value === undefined) {
        return undefined;
    }
    const bindJson = bind === undefined ? '' : JSON.stringify(bind);
    const out = wasmCoerceFieldValue(
        JSON.stringify(item),
        bindJson,
        JSON.stringify(definition),
        JSON.stringify(value),
    );
    return JSON.parse(out);
}

export function validateDataType(value: any, dataType: string): boolean {
    switch (dataType) {
        case 'string':
            return typeof value === 'string';
        case 'boolean':
            return typeof value === 'boolean';
        case 'integer':
            return typeof value === 'number' && Number.isInteger(value);
        case 'decimal':
            return typeof value === 'number' && !Number.isNaN(value);
        case 'money':
            return value && typeof value === 'object' && typeof value.amount === 'number';
        case 'array':
            return Array.isArray(value);
        case 'object':
            return value !== null && typeof value === 'object' && !Array.isArray(value);
        default:
            return true;
    }
}

export function cloneValue<T>(value: T): T {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    const copier = (globalThis as any).structuredClone;
    if (typeof copier === 'function') {
        return copier(value);
    }
    return JSON.parse(JSON.stringify(value));
}

export function normalizeWasmValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeWasmValue(entry)) as T;
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, any>;
        if (record.$type === 'money' && 'amount' in record && 'currency' in record) {
            return {
                $type: 'money',
                amount: normalizeWasmValue(record.amount),
                currency: normalizeWasmValue(record.currency),
            } as T;
        }
        return Object.fromEntries(
            Object.entries(record).map(([key, entry]) => [key, normalizeWasmValue(entry)]),
        ) as T;
    }
    return cloneValue(value);
}

export function tagMoneyByPath(
    path: string,
    value: any,
    bindConfigs: Record<string, EngineBindConfig>,
    fieldDataTypes: Record<string, string | undefined> = {},
): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = value as Record<string, any>;
    if (record.$type === 'money') return value;
    const bind = bindConfigs[toBasePath(path)];
    const dataType = fieldDataTypes[toBasePath(path)] ?? (bind as any)?.dataType;
    if (dataType === 'money' && 'amount' in record && 'currency' in record) {
        return { $type: 'money', amount: record.amount, currency: record.currency };
    }
    return value;
}

export function toWasmContextValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((entry) => toWasmContextValue(entry)) as T;
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, any>;
        return Object.fromEntries(
            Object.entries(record).map(([key, entry]) => [key, toWasmContextValue(entry)]),
        ) as T;
    }
    return cloneValue(value);
}

export function deepEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
        return true;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((entry, index) => deepEqual(entry, right[index]));
    }
    if (left && right && typeof left === 'object' && typeof right === 'object') {
        const leftKeys = Object.keys(left as Record<string, unknown>).sort();
        const rightKeys = Object.keys(right as Record<string, unknown>).sort();
        if (!deepEqual(leftKeys, rightKeys)) {
            return false;
        }
        return leftKeys.every((key) =>
            deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
    }
    return false;
}

export function resolveNowProvider(now: FormEngineRuntimeContext['now']): () => Date {
    if (typeof now === 'function') {
        return () => coerceDate(now());
    }
    if (now !== undefined) {
        const fixed = coerceDate(now);
        return () => new Date(fixed.getTime());
    }
    return () => new Date();
}

export function coerceDate(value: RuntimeNowInput): Date {
    if (value instanceof Date) {
        return new Date(value.getTime());
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function toBasePath(path: string): string {
    return wasmNormalizeIndexedPath(path).replace(/\[\*\]/g, '');
}

export function parseInstanceTarget(path: string): { instanceName: string; instancePath?: string } | null {
    const explicit = path.match(/^instances\.([a-zA-Z][a-zA-Z0-9_]*)\.?(.*)$/);
    if (explicit) {
        return {
            instanceName: explicit[1],
            instancePath: explicit[2] || undefined,
        };
    }
    const felSyntax = path.match(/^@instance\((['"])([^'"]+)\1\)\.?(.*)$/);
    if (felSyntax) {
        return {
            instanceName: felSyntax[2],
            instancePath: felSyntax[3] || undefined,
        };
    }
    return null;
}

export function splitIndexedPath(path: string): string[] {
    return path.match(/[^.[\]]+|\[\d+\]/g)?.map((segment) => segment.startsWith('[') ? segment : segment) ?? [];
}

export function appendPath(base: string, segment: string): string {
    return segment.startsWith('[') ? `${base}${segment}` : `${base}.${segment}`;
}

export function parentPathOf(path: string): string {
    if (!path) {
        return '';
    }
    const segments = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
    if (segments.length <= 1) {
        return '';
    }
    const parts = segments.slice(0, -1);
    let current = parts[0] ?? '';
    for (let index = 1; index < parts.length; index += 1) {
        current = appendPath(current, parts[index]);
    }
    return current;
}

export function getAncestorBasePaths(path: string): string[] {
    const segments = splitIndexedPath(toBasePath(path));
    const result: string[] = [];
    for (let index = segments.length; index >= 1; index -= 1) {
        result.push(segments.slice(0, index).join('.'));
    }
    return result;
}

export function getScopeAncestors(scopePath: string): string[] {
    const stripped = toBasePath(scopePath);
    if (!stripped) {
        return [];
    }
    const parts = Path.parse(stripped).splitNormalized();
    const scopes: string[] = [];
    for (let index = 1; index <= parts.length; index += 1) {
        scopes.push(parts.slice(0, index).join('.'));
    }
    return scopes;
}

export function getNestedValue(target: any, path: string): any {
    const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
    let current = target;
    for (const token of tokens) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (token.startsWith('[')) {
            const index = Number(token.slice(1, -1));
            current = current[index];
        } else {
            current = current[token];
        }
    }
    return current;
}

export function setNestedPathValue(target: Record<string, any>, path: string, value: any): void {
    const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
    let current: any = target;
    for (let index = 0; index < tokens.length - 1; index += 1) {
        const token = tokens[index];
        const next = tokens[index + 1];
        if (token.startsWith('[')) {
            const arrayIndex = Number(token.slice(1, -1));
            current[arrayIndex] ??= next?.startsWith('[') ? [] : {};
            current = current[arrayIndex];
            continue;
        }
        current[token] ??= next?.startsWith('[') ? [] : {};
        current = current[token];
    }
    const last = tokens[tokens.length - 1];
    if (!last) {
        return;
    }
    if (last.startsWith('[')) {
        current[Number(last.slice(1, -1))] = value;
    } else {
        current[last] = value;
    }
}

export function setExpressionContextValue(target: Record<string, any>, path: string, value: any): void {
    const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
    if (tokens.length === 0) {
        return;
    }

    let current: any = target;
    for (let index = 0; index < tokens.length - 1; index += 1) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return;
        }

        const token = tokens[index];
        const next = tokens[index + 1];
        if (token.startsWith('[')) {
            const arrayIndex = Number(token.slice(1, -1));
            const existing = current[arrayIndex];
            if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
                return;
            }
            current[arrayIndex] ??= next?.startsWith('[') ? [] : {};
            current = current[arrayIndex];
            continue;
        }

        const existing = current[token];
        if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
            return;
        }
        current[token] ??= next?.startsWith('[') ? [] : {};
        current = current[token];
    }

    if (current === null || current === undefined || typeof current !== 'object') {
        return;
    }

    const last = tokens[tokens.length - 1];
    if (last.startsWith('[')) {
        current[Number(last.slice(1, -1))] = value;
    } else {
        current[last] = value;
    }
}

export function setResponsePathValue(target: Record<string, any>, path: string, value: any): void {
    const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
    if (tokens.length === 0) {
        return;
    }

    let current: any = target;
    for (let index = 0; index < tokens.length - 1; index += 1) {
        const token = tokens[index];
        const next = tokens[index + 1];

        if (token.startsWith('[')) {
            const arrayIndex = Number(token.slice(1, -1));
            const existing = current[arrayIndex];
            if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
                const fallbackPath = tokens.slice(index + 1).join('.');
                setResponsePathValue(target, fallbackPath, value);
                return;
            }
            current[arrayIndex] ??= next?.startsWith('[') ? [] : {};
            current = current[arrayIndex];
            continue;
        }

        const existing = current[token];
        if (existing !== undefined && (existing === null || typeof existing !== 'object')) {
            const fallbackPath = tokens
                .slice(0, index)
                .concat(tokens.slice(index + 1))
                .join('.');
            setResponsePathValue(target, fallbackPath, value);
            return;
        }
        current[token] ??= next?.startsWith('[') ? [] : {};
        current = current[token];
    }

    const last = tokens[tokens.length - 1];
    if (last.startsWith('[')) {
        current[Number(last.slice(1, -1))] = value;
    } else {
        current[last] = value;
    }
}

export function replaceBareCurrentFieldRefs(expression: string, currentFieldName: string): string {
    if (!currentFieldName || !expression.includes('$')) {
        return expression;
    }

    let output = '';
    let quote: '"' | "'" | null = null;

    for (let index = 0; index < expression.length; index += 1) {
        const char = expression[index];
        const previous = index > 0 ? expression[index - 1] : '';
        const next = index + 1 < expression.length ? expression[index + 1] : '';

        if (quote) {
            output += char;
            if (char === '\\' && next) {
                output += next;
                index += 1;
                continue;
            }
            if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === "'" || char === '"') {
            quote = char;
            output += char;
            continue;
        }

        if (
            char === '$'
            && !/[A-Za-z0-9_]/.test(previous)
            && !/[A-Za-z0-9_]/.test(next)
        ) {
            output += '$' + currentFieldName;
            continue;
        }

        output += char;
    }

    return output;
}

export function flattenObject(value: any, prefix = '', output: Record<string, any> = {}): Record<string, any> {
    if (Array.isArray(value)) {
        value.forEach((entry, index) => {
            const path = `${prefix}[${index}]`;
            flattenObject(entry, path, output);
        });
        if (prefix) {
            output[prefix] = cloneValue(value);
        }
        return output;
    }
    if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            const path = prefix ? `${prefix}.${key}` : key;
            flattenObject(entry, path, output);
        }
        if (prefix) {
            output[prefix] = cloneValue(value);
        }
        return output;
    }
    if (prefix) {
        output[prefix] = cloneValue(value);
    }
    return output;
}

export function buildGroupSnapshotForPath(prefix: string, signals: Record<string, EngineSignal<any>>): Record<string, any> {
    const snapshot: Record<string, any> = {};
    for (const [path, signalRef] of Object.entries(signals)) {
        if (!path.startsWith(`${prefix}.`)) {
            continue;
        }
        const relative = path.slice(prefix.length + 1);
        if (!relative || relative.includes('[')) {
            continue;
        }
        setNestedPathValue(snapshot, relative, cloneValue(signalRef.value));
    }
    return snapshot;
}

export function buildRepeatCollection(groupPath: string, count: number, signals: Record<string, EngineSignal<any>>): any[] {
    const rows: any[] = [];
    for (let index = 0; index < count; index += 1) {
        const prefix = `${groupPath}[${index}]`;
        const row: Record<string, any> = {};
        for (const [path, signalRef] of Object.entries(signals)) {
            if (!path.startsWith(`${prefix}.`)) {
                continue;
            }
            const relative = path.slice(prefix.length + 1);
            setResponsePathValue(row, relative, cloneValue(signalRef.value));
        }
        rows.push(row);
    }
    return rows;
}

export function getRepeatAncestors(
    currentItemPath: string,
    repeats: Record<string, EngineSignal<number>>,
): Array<{ groupPath: string; index: number; count: number }> {
    const matches = currentItemPath.match(/[^.[\]]+\[\d+\]|[^.[\]]+/g) ?? [];
    const ancestors: Array<{ groupPath: string; index: number; count: number }> = [];
    let current = '';
    for (const segment of matches) {
        const repeatMatch = segment.match(/^(.+)\[(\d+)\]$/);
        if (repeatMatch) {
            current = current ? `${current}.${repeatMatch[1]}` : repeatMatch[1];
            if (repeats[current]) {
                ancestors.push({
                    groupPath: current,
                    index: Number(repeatMatch[2]),
                    count: repeats[current].value,
                });
            }
            current = `${current}[${repeatMatch[2]}]`;
        } else {
            current = current ? `${current}.${segment}` : segment;
        }
    }
    return ancestors;
}

export function isEmptyValue(value: unknown): boolean {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

export function safeEvaluateExpression(expression: string, context: WasmFelContext): any {
    try {
        return wasmEvalFELWithContext(expression, context);
    } catch {
        return null;
    }
}

export function extractInlineBind(item: FormItem, path: string): EngineBindConfig | null {
    const bind: EngineBindConfig = { path };
    let used = false;
    for (const key of [
        'calculate',
        'constraint',
        'constraintMessage',
        'relevant',
        'required',
        'readonly',
        'default',
        'precision',
        'disabledDisplay',
        'whitespace',
        'nonRelevantBehavior',
        'remoteOptions',
        'excludedValue',
    ] as const) {
        if ((item as any)[key] !== undefined) {
            (bind as any)[key] = (item as any)[key];
            used = true;
        }
    }
    if ((item as any).visible !== undefined && bind.relevant === undefined) {
        bind.relevant = (item as any).visible;
        used = true;
    }
    return used ? bind : null;
}

export function detectNamedCycle(graph: Map<string, Set<string>>, message: string): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (node: string): void => {
        if (visited.has(node)) {
            return;
        }
        if (visiting.has(node)) {
            throw new Error(message);
        }
        visiting.add(node);
        for (const dep of graph.get(node) ?? []) {
            if (graph.has(dep)) {
                visit(dep);
            }
        }
        visiting.delete(node);
        visited.add(node);
    };

    for (const node of graph.keys()) {
        visit(node);
    }
}

export function topoSortKeys<T extends { key: string }>(
    nodes: T[],
    graph: Map<string, Set<string>>,
): T[] {
    const pending = new Map(nodes.map((node) => [node.key, node]));
    const incoming = new Map<string, number>();
    for (const node of nodes) {
        incoming.set(node.key, 0);
    }
    for (const deps of graph.values()) {
        for (const dep of deps) {
            incoming.set(dep, incoming.get(dep) ?? 0);
        }
    }
    for (const [key, deps] of graph.entries()) {
        incoming.set(key, incoming.get(key) ?? 0);
        for (const dep of deps) {
            incoming.set(key, (incoming.get(key) ?? 0) + 1);
        }
    }

    const ordered: T[] = [];
    const queue: string[] = [...nodes.filter((node) => (incoming.get(node.key) ?? 0) === 0).map((node) => node.key)];
    while (queue.length > 0) {
        const key = queue.shift()!;
        const node = pending.get(key);
        if (!node) {
            continue;
        }
        pending.delete(key);
        ordered.push(node);
        for (const [otherKey, deps] of graph.entries()) {
            if (!deps.has(key)) {
                continue;
            }
            const nextIncoming = (incoming.get(otherKey) ?? 0) - 1;
            incoming.set(otherKey, nextIncoming);
            if (nextIncoming === 0) {
                queue.push(otherKey);
            }
        }
    }

    if (pending.size > 0) {
        ordered.push(...pending.values());
    }
    return ordered;
}

export function snapshotSignals(signals: Record<string, EngineSignal<any>>): Record<string, any> {
    const snapshot: Record<string, any> = {};
    for (const [path, signalRef] of Object.entries(signals)) {
        snapshot[path] = cloneValue(signalRef.value);
    }
    return snapshot;
}

export function toFelIndexedPath(path: string): string {
    return path.replace(/\[(\d+)\]/g, (_match, index) => `[${Number(index) + 1}]`);
}

export function buildRepeatValueAliases(valuesByPath: Record<string, any>): Array<[string, any[]]> {
    const grouped = new Map<string, Array<{ index: number; value: any }>>();
    for (const [path, value] of Object.entries(valuesByPath)) {
        const match = path.match(/^(.*)\[(\d+)\]\.([^.[\]]+)$/);
        if (!match) {
            continue;
        }
        const alias = `${match[1]}.${match[3]}`;
        const entries = grouped.get(alias) ?? [];
        entries.push({ index: Number(match[2]), value: cloneValue(value) });
        grouped.set(alias, entries);
    }
    return [...grouped.entries()].map(([path, entries]) => [
        path,
        entries.sort((left, right) => left.index - right.index).map((entry) => entry.value),
    ]);
}

export function toRepeatWildcardPath(alias: string): string {
    const lastDot = alias.lastIndexOf('.');
    if (lastDot === -1) {
        return `${alias}[*]`;
    }
    return `${alias.slice(0, lastDot)}[*].${alias.slice(lastDot + 1)}`;
}

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Resolve $group.field qualified refs to sibling refs within repeat context.
 *
 * When evaluating an expression for a field inside a repeat group (e.g., line_items[0].total),
 * a reference like $line_items.qty should resolve to the sibling field "qty" in the same
 * instance, not to a wildcard collecting all instances.
 *
 * For nested repeats (e.g., orders[0].items[0].line_total), $items.qty resolves to the
 * innermost sibling, and $orders.discount_pct resolves to the enclosing group's concrete path.
 */
export function resolveQualifiedGroupRefs(
    expression: string,
    currentItemPath: string,
    repeatAncestors: Array<{ groupPath: string; index: number; count: number }>,
): string {
    let result = expression;

    // Build a map of group name -> concrete prefix for each repeat ancestor.
    // Process longest names first to avoid partial matches.
    const groupReplacements: Array<{ groupName: string; concretePrefix: string; isInnermost: boolean }> = [];
    for (let index = 0; index < repeatAncestors.length; index += 1) {
        const ancestor = repeatAncestors[index];
        const groupPath = ancestor.groupPath;
        // Extract the group name (last Exact segment of the groupPath, without any indices)
        const segments = Path.parse(groupPath).splitNormalized();
        const groupName = segments[segments.length - 1] ?? groupPath;
        const concretePrefix = `${groupPath}[${ancestor.index}]`;
        groupReplacements.push({
            groupName,
            concretePrefix,
            isInnermost: index === repeatAncestors.length - 1,
        });
    }

    // Sort longest group names first to prevent partial matches
    groupReplacements.sort((a, b) => b.groupName.length - a.groupName.length);

    for (const { groupName, concretePrefix, isInnermost } of groupReplacements) {
        const escapedGroupName = escapeRegExp(groupName);
        // Match $groupName.fieldName — the qualified ref pattern
        const pattern = new RegExp(
            `\\$${escapedGroupName}\\.([A-Za-z_][A-Za-z0-9_]*)`,
            'g',
        );
        result = result.replace(pattern, (_match, fieldName) => {
            if (isInnermost) {
                // For the innermost repeat scope, resolve to bare sibling ref
                // (buildExpressionContext already adds siblings as short names)
                return fieldName;
            }
            // For outer repeat scopes, resolve to the FEL-indexed path.
            // FEL uses 1-based indexing; the concretePrefix uses 0-based.
            return toFelIndexedPath(concretePrefix) + '.' + fieldName;
        });
    }

    return result;
}

export function resolveRelativeDependency(dep: string, parentPath: string, selfPath: string): string | null {
    if (!dep) {
        return selfPath;
    }
    if (dep.includes('.')) {
        return dep;
    }
    return parentPath ? `${parentPath}.${dep}` : dep;
}
