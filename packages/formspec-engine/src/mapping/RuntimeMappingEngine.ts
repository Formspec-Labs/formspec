/** @filedesc Runtime mapping document execution with WASM core and TS adapter formatting. */

import type { FieldRule, MappingDocument } from '@formspec-org/types';
import type {
    IRuntimeMappingEngine,
    JsonValue,
    MappingDiagnostic,
    MappingDirection,
    RuntimeMappingResult,
} from '../interfaces.js';
import {
    isJsonRecord,
    isRawJson,
    jsonNumberText,
    jsonValueText,
    type ExactJsonNumber,
} from '../json-values.js';
import { isWasmReady, wasmExecuteMappingDocRuntime } from '../wasm-bridge-runtime.js';
import { isWasmToolsReady, wasmExecuteMappingDoc } from '../wasm-bridge-tools.js';

interface MappingCSVConfig { delimiter?: string; quote?: string; header?: boolean; lineEnding?: 'crlf' | 'lf'; }

function isScalarMappingValue(v: unknown): boolean {
    return v === null || v === undefined || typeof v !== 'object' || isRawJson(v);
}

function mappingSerializeCSV(output: Record<string, unknown>, config: MappingCSVConfig): string {
    const delim = config.delimiter ?? ',';
    const quote = config.quote ?? '"';
    const includeHeader = config.header !== false;
    const le = config.lineEnding === 'lf' ? '\n' : '\r\n';
    const keys = Object.keys(output).filter(k => isScalarMappingValue(output[k]));
    if (keys.length === 0) return '';
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const q = (val: unknown): string => {
        const str = jsonValueText(val);
        if (str.includes(delim) || str.includes(quote) || str.includes('\n') || str.includes('\r')) {
            return quote + str.replace(new RegExp(esc(quote), 'g'), quote + quote) + quote;
        }
        return str;
    };
    const rows: string[] = [];
    if (includeHeader) rows.push(keys.map(k => q(k)).join(delim));
    rows.push(keys.map(k => q(output[k])).join(delim));
    return rows.join(le);
}

interface MappingXMLConfig { rootElement?: string; declaration?: boolean; indent?: number; cdata?: string[]; }
type MappingXMLTree = { attributes: Record<string, string>; children: Array<{ name: string; node: MappingXMLTree }>; text?: string };

function mappingBuildXMLTree(obj: Record<string, unknown>): MappingXMLTree {
    const node: MappingXMLTree = { attributes: {}, children: [] };
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('@')) {
            node.attributes[key.slice(1)] = jsonValueText(value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                if (isJsonRecord(item)) {
                    node.children.push({ name: key, node: mappingBuildXMLTree(item) });
                } else {
                    node.children.push({
                        name: key,
                        node: { attributes: {}, children: [], text: jsonValueText(item) },
                    });
                }
            }
        } else if (isJsonRecord(value)) {
            node.children.push({ name: key, node: mappingBuildXMLTree(value) });
        } else {
            node.children.push({
                name: key,
                node: { attributes: {}, children: [], text: jsonValueText(value) },
            });
        }
    }
    return node;
}

function mappingEscapeXML(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function mappingRenderElement(
    name: string, node: MappingXMLTree, depth: number, indentSize: number,
    cdataPaths: Set<string>, elementPath: string, lines: string[],
): void {
    const indent = indentSize > 0 ? ' '.repeat(depth * indentSize) : '';
    const childIndent = indentSize > 0 ? ' '.repeat((depth + 1) * indentSize) : '';
    let attrStr = '';
    for (const [an, av] of Object.entries(node.attributes)) attrStr += ` ${an}="${mappingEscapeXML(av)}"`;
    const hasChildren = node.children.length > 0;
    const hasText = node.text !== undefined;
    if (!hasChildren && !hasText) { lines.push(`${indent}<${name}${attrStr}/>`); return; }
    if (hasText && !hasChildren) {
        const tc = cdataPaths.has(elementPath) ? `<![CDATA[${node.text}]]>` : mappingEscapeXML(node.text!);
        lines.push(`${indent}<${name}${attrStr}>${tc}</${name}>`); return;
    }
    lines.push(`${indent}<${name}${attrStr}>`);
    if (hasText) {
        const tc = cdataPaths.has(elementPath) ? `<![CDATA[${node.text}]]>` : mappingEscapeXML(node.text!);
        lines.push(`${childIndent}${tc}`);
    }
    for (const { name: cn, node: cnode } of node.children) {
        mappingRenderElement(cn, cnode, depth + 1, indentSize, cdataPaths, elementPath ? `${elementPath}.${cn}` : cn, lines);
    }
    lines.push(`${indent}</${name}>`);
}

function mappingSerializeXML(output: Record<string, unknown>, config: MappingXMLConfig): string {
    const root = config.rootElement ?? 'root';
    const decl = config.declaration !== false;
    const indentSize = config.indent ?? 2;
    const cdataPaths = new Set(config.cdata ?? []);
    const tree = mappingBuildXMLTree(output);
    const lines: string[] = [];
    if (decl) lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    mappingRenderElement(root, tree, 0, indentSize, cdataPaths, '', lines);
    return lines.join(indentSize > 0 ? '\n' : '');
}

function mappingOmitNulls(obj: any): void {
    if (obj == null || typeof obj !== 'object' || isRawJson(obj)) return;
    if (Array.isArray(obj)) { for (const item of obj) mappingOmitNulls(item); return; }
    for (const key of Object.keys(obj)) {
        if (obj[key] === null || obj[key] === undefined) delete obj[key];
        else if (typeof obj[key] === 'object' && !isRawJson(obj[key])) mappingOmitNulls(obj[key]);
    }
}

function mappingSortKeysDeep(obj: any): void {
    if (obj == null || typeof obj !== 'object' || isRawJson(obj)) return;
    if (Array.isArray(obj)) { for (const item of obj) mappingSortKeysDeep(item); return; }
    const keys = Object.keys(obj).sort();
    const entries = keys.map(k => [k, obj[k]] as const);
    for (const key of Object.keys(obj)) delete obj[key];
    for (const [key, value] of entries) {
        obj[key] = value;
        if (typeof value === 'object' && !isRawJson(value)) mappingSortKeysDeep(value);
    }
}

function hasExactNumericLeaf(value: unknown): boolean {
    if (value == null || typeof value !== 'object') return false;
    if (isRawJson(value)) return jsonNumberText(value) !== undefined;
    if (Array.isArray(value)) return value.some(hasExactNumericLeaf);
    return Object.values(value).some(hasExactNumericLeaf);
}

function chooseSentinelPrefix(doc: unknown, source: unknown): string {
    const corpus = `${JSON.stringify(doc)}\n${JSON.stringify(source)}`;
    let attempt = 0;
    while (true) {
        const candidate = attempt === 0 ? '__fs_exact_num_sentinel_' : `__fs_exact_num_sentinel_${attempt}_`;
        if (!corpus.includes(candidate)) return candidate;
        attempt += 1;
    }
}

function replaceExactNumericLeaves(
    value: unknown,
    exactLeaves: ExactJsonNumber[],
    prefix: string,
): unknown {
    if (value == null || typeof value !== 'object') return value;
    if (isRawJson(value) && jsonNumberText(value) !== undefined) {
        const index = exactLeaves.length;
        exactLeaves.push(value);
        return `${prefix}${index}__`;
    }
    if (Array.isArray(value)) {
        return value.map(item => replaceExactNumericLeaves(item, exactLeaves, prefix));
    }
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
        copy[k] = replaceExactNumericLeaves(v, exactLeaves, prefix);
    }
    return copy;
}

function numericLeafMatchesExact(actual: unknown, exactLeaf: ExactJsonNumber): boolean {
    const actualText = jsonNumberText(actual);
    if (actualText === undefined) return false;
    return actualText === exactLeaf.rawJSON || Number(actualText) === Number(exactLeaf.rawJSON);
}

function mergeExactNumericLeaves(
    actual: any,
    probe: any,
    exactLeaves: readonly ExactJsonNumber[],
    prefix: string,
): any {
    if (typeof probe === 'string' && probe.startsWith(prefix) && probe.endsWith('__')) {
        const idx = Number(probe.slice(prefix.length, -2));
        const exactLeaf = Number.isInteger(idx) ? exactLeaves[idx] : undefined;
        if (exactLeaf && numericLeafMatchesExact(actual, exactLeaf)) {
            return exactLeaf;
        }
        return actual;
    }
    if (Array.isArray(actual) && Array.isArray(probe) && actual.length === probe.length) {
        for (let i = 0; i < actual.length; i += 1) {
            actual[i] = mergeExactNumericLeaves(actual[i], probe[i], exactLeaves, prefix);
        }
        return actual;
    }
    if (isJsonRecord(actual) && isJsonRecord(probe)) {
        for (const key of Object.keys(actual)) {
            if (Object.prototype.hasOwnProperty.call(probe, key)) {
                actual[key] = mergeExactNumericLeaves(actual[key], probe[key], exactLeaves, prefix);
            }
        }
    }
    return actual;
}

function lookupSourcePath(source: unknown, path: string): unknown {
    const tokens = path.match(/[^.[\]]+|\[\d+\]/g);
    if (!tokens) return undefined;
    let current: any = source;
    for (const token of tokens) {
        if (current == null || typeof current !== 'object' || isRawJson(current)) return undefined;
        if (token.startsWith('[') && token.endsWith(']')) {
            const idx = Number(token.slice(1, -1));
            if (!Array.isArray(current) || idx < 0 || idx >= current.length) return undefined;
            current = current[idx];
        } else {
            if (Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, token)) return undefined;
            current = current[token];
        }
    }
    return current;
}

function mergeMatchingExactValues(actual: any, exactSource: unknown): any {
    if (isRawJson(exactSource) && jsonNumberText(exactSource) !== undefined) {
        return numericLeafMatchesExact(actual, exactSource) ? exactSource : actual;
    }
    if (Array.isArray(actual) && Array.isArray(exactSource) && actual.length === exactSource.length) {
        for (let i = 0; i < actual.length; i += 1) {
            actual[i] = mergeMatchingExactValues(actual[i], exactSource[i]);
        }
        return actual;
    }
    if (isJsonRecord(actual) && isJsonRecord(exactSource)) {
        for (const key of Object.keys(actual)) {
            if (Object.prototype.hasOwnProperty.call(exactSource, key)) {
                actual[key] = mergeMatchingExactValues(actual[key], exactSource[key]);
            }
        }
    }
    return actual;
}

function applyConditionalProbe(actual: any, probe: any, sentinel: string, exactSource: unknown): any {
    if (probe === sentinel) {
        return mergeMatchingExactValues(actual, exactSource);
    }
    if (Array.isArray(actual) && Array.isArray(probe) && actual.length === probe.length) {
        for (let i = 0; i < actual.length; i += 1) {
            actual[i] = applyConditionalProbe(actual[i], probe[i], sentinel, exactSource);
        }
        return actual;
    }
    if (isJsonRecord(actual) && isJsonRecord(probe)) {
        for (const key of Object.keys(actual)) {
            if (Object.prototype.hasOwnProperty.call(probe, key)) {
                actual[key] = applyConditionalProbe(actual[key], probe[key], sentinel, exactSource);
            }
        }
    }
    return actual;
}

/**
 * Restore exact lexical numeric leaves (`JSON.rawJSON`) for preserved outputs when the
 * WASM `serde_json::Value` layer (or tools `JSON.parse`) rounded high-precision decimals,
 * lexical trailing zeros, or arbitrary-precision integers.
 */
function restoreExactPreservedNumbers(
    doc: MappingDocument,
    source: JsonValue | string,
    direction: MappingDirection,
    output: any,
): any {
    if (!isWasmReady()) return output;
    if (!hasExactNumericLeaf(source) && !hasExactNumericLeaf(doc)) return output;

    const prefix = chooseSentinelPrefix(doc, source);
    const exactLeaves: ExactJsonNumber[] = [];
    const { sourceSchema: _ignoredSchema, ...docWithoutSchema } = doc as MappingDocument & { sourceSchema?: unknown };
    const sentinelDoc = replaceExactNumericLeaves(docWithoutSchema, exactLeaves, prefix);
    const sentinelSource = replaceExactNumericLeaves(source, exactLeaves, prefix);

    if (exactLeaves.length === 0) return output;

    try {
        const probe = wasmExecuteMappingDocRuntime(sentinelDoc, sentinelSource, direction);
        output = mergeExactNumericLeaves(output, probe.output, exactLeaves, prefix);
    } catch {
        // Keep authoritative Pass 1 output if provenance probing hits an unsupported shape.
    }

    // Also handle conditional `preserve` rules whose FEL condition directly inspected a sentinelized
    // exact-number field (e.g. `@source.d > 0`): probe against the unmodified numeric source.
    const rules = Array.isArray(doc.rules) ? doc.rules : [];
    for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i] as any;
        if (!rule || !rule.condition || rule.array) continue;
        if (direction === 'reverse' && rule.bidirectional === false) continue;
        const activeTransform = direction === 'reverse' && rule.reverse?.transform
            ? rule.reverse.transform
            : rule.transform;
        if (activeTransform !== 'preserve') continue;
        const srcPath = direction === 'forward' ? rule.sourcePath : rule.targetPath;
        if (typeof srcPath !== 'string' || !srcPath || srcPath.includes('*')) continue;
        const exactSource = lookupSourcePath(source, srcPath);
        if (!hasExactNumericLeaf(exactSource)) continue;

        const condSentinel = `${prefix}cond_${i}__`;
        const condRules = rules.map((entry, idx) => {
            if (idx !== i) return entry;
            const constantPatch = { transform: 'constant', expression: JSON.stringify(condSentinel) };
            return direction === 'reverse' && (entry as any).reverse
                ? { ...entry, reverse: { ...(entry as any).reverse, ...constantPatch } }
                : { ...entry, ...constantPatch };
        });
        try {
            const condProbe = wasmExecuteMappingDocRuntime(
                { ...docWithoutSchema, rules: condRules },
                source,
                direction,
            );
            output = applyConditionalProbe(output, condProbe.output, condSentinel, exactSource);
        } catch {
            // Leave authoritative Pass 1 output intact if probing fails.
        }
    }

    return output;
}

export class RuntimeMappingEngine implements IRuntimeMappingEngine {
    private readonly doc: MappingDocument;

    constructor(mappingDocument: MappingDocument) {
        this.doc = mappingDocument;
    }

    public forward(source: JsonValue | string): RuntimeMappingResult {
        return this.execute('forward', this.doc.sourceSchema ? source : source ?? {});
    }

    public reverse(source: JsonValue | string): RuntimeMappingResult {
        return this.execute('reverse', this.doc.sourceSchema ? source : source ?? {});
    }

    private execute(direction: MappingDirection, source: JsonValue | string): RuntimeMappingResult {
        const needsToolsValidation = Boolean(this.doc.sourceSchema);
        if (needsToolsValidation) {
            if (!isWasmToolsReady()) {
                return {
                    direction,
                    output: {},
                    appliedRules: 0,
                    diagnostics: [{
                        ruleIndex: -1,
                        errorCode: 'WASM_NOT_READY',
                        message:
                            'MappingDocument with sourceSchema requires tools WASM for JSON Schema validation. Call await initFormspecEngineTools() after await initFormspecEngine().',
                    }],
                };
            }
        } else if (!isWasmReady()) {
            return {
                direction,
                output: {},
                appliedRules: 0,
                diagnostics: [{
                    ruleIndex: -1,
                    errorCode: 'WASM_NOT_READY',
                    message:
                        'RuntimeMappingEngine requires runtime WASM. Call await initFormspecEngine().',
                }],
            };
        }
        // Delegate to WASM for core rule evaluation (runtime WASM for standard Mappings; tools WASM when sourceSchema needs lint validation).
        let wasmResult: { direction: string; output: any; rulesApplied: number; diagnostics: any[] };
        try {
            wasmResult = needsToolsValidation
                ? wasmExecuteMappingDoc(this.doc, source, direction)
                : wasmExecuteMappingDocRuntime(this.doc, source, direction);
        } catch (e) {
            // WASM parser errors (e.g. unknown transform) become diagnostics
            return {
                direction,
                output: {},
                appliedRules: 0,
                diagnostics: [{
                    ruleIndex: -1,
                    errorCode: 'COERCE_FAILURE',
                    message: String(e).replace(/^Error:\s*/, ''),
                }],
            };
        }
        let output = wasmResult.output;
        const diagnostics: MappingDiagnostic[] = wasmResult.diagnostics.map((d: any) => ({
            ruleIndex: d.ruleIndex,
            sourcePath: d.sourcePath ?? undefined,
            targetPath: d.targetPath ?? undefined,
            errorCode: d.errorCode ?? 'COERCE_FAILURE',
            message: d.message,
        }));
        const appliedRules = wasmResult.rulesApplied;

        // If direction was blocked, return early (WASM already set INVALID_DOCUMENT diagnostic)
        if (diagnostics.some(d => d.errorCode === 'INVALID_DOCUMENT')) {
            return { direction, output, appliedRules, diagnostics };
        }

        output = restoreExactPreservedNumbers(this.doc, source, direction, output);

        // External reverse output is the schema-validated JSON source.
        if (direction === 'reverse' && this.doc.sourceSchema) {
            return { direction, output, appliedRules, diagnostics };
        }

        // ── Adapter post-processing (TS-only — formatting, not evaluation) ──

        const jsonAdapter = this.doc.adapters?.json;
        if (jsonAdapter) {
            if (jsonAdapter.nullHandling === 'omit') mappingOmitNulls(output);
            if (jsonAdapter.sortKeys) mappingSortKeysDeep(output);
        }

        const csvAdapter = (this.doc.adapters as any)?.csv;
        const isCsv = csvAdapter || (this.doc.targetSchema as any)?.format === 'csv';
        if (isCsv) {
            const rules: FieldRule[] = [...this.doc.rules];
            let hasAdapterError = false;
            for (const rule of rules) {
                const tp = direction === 'forward' ? rule.targetPath : (rule.sourcePath ?? rule.targetPath);
                if (tp && /[.\[\]]/.test(tp)) {
                    diagnostics.push({
                        ruleIndex: rules.indexOf(rule),
                        sourcePath: rule.sourcePath ?? undefined,
                        targetPath: rule.targetPath ?? undefined,
                        errorCode: 'ADAPTER_FAILURE',
                        message: `targetPath "${tp}" is not a simple identifier (CSV requires flat keys)`,
                    });
                    hasAdapterError = true;
                }
            }
            if (hasAdapterError) {
                return { direction, output: '' as any, appliedRules, diagnostics };
            }
            return { direction, output: mappingSerializeCSV(output, csvAdapter ?? {}) as any, appliedRules, diagnostics };
        }

        const xmlAdapter = (this.doc.adapters as any)?.xml;
        const isXml = xmlAdapter || (this.doc.targetSchema as any)?.format === 'xml';
        if (isXml) {
            return { direction, output: mappingSerializeXML(output, xmlAdapter ?? {}) as any, appliedRules, diagnostics };
        }

        return { direction, output, appliedRules, diagnostics };
    }
}

export function createMappingEngine(mappingDoc: MappingDocument): IRuntimeMappingEngine {
    return new RuntimeMappingEngine(mappingDoc);
}
