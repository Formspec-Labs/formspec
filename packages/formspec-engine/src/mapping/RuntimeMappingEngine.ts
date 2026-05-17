/** @filedesc Runtime mapping document execution with WASM core and TS adapter formatting. */

import type { FieldRule, MappingDocument } from '@formspec-org/types';
import type {
    IRuntimeMappingEngine,
    JsonValue,
    MappingDiagnostic,
    MappingDirection,
    RuntimeMappingResult,
} from '../interfaces.js';
import { isWasmToolsReady, wasmExecuteMappingDoc } from '../wasm-bridge-tools.js';

interface MappingCSVConfig { delimiter?: string; quote?: string; header?: boolean; lineEnding?: 'crlf' | 'lf'; }

function mappingSerializeCSV(output: Record<string, unknown>, config: MappingCSVConfig): string {
    const delim = config.delimiter ?? ',';
    const quote = config.quote ?? '"';
    const includeHeader = config.header !== false;
    const le = config.lineEnding === 'lf' ? '\n' : '\r\n';
    const keys = Object.keys(output).filter(k => {
        const v = output[k];
        return v === null || v === undefined || typeof v !== 'object';
    });
    if (keys.length === 0) return '';
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const q = (val: unknown): string => {
        const str = val == null ? '' : String(val);
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
type MappingXMLTree = { attributes: Record<string, string>; children: Map<string, MappingXMLTree>; text?: string };

function mappingBuildXMLTree(obj: Record<string, unknown>): MappingXMLTree {
    const node: MappingXMLTree = { attributes: {}, children: new Map() };
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('@')) {
            node.attributes[key.slice(1)] = value == null ? '' : String(value);
        } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            node.children.set(key, mappingBuildXMLTree(value as Record<string, unknown>));
        } else {
            const child: MappingXMLTree = { attributes: {}, children: new Map() };
            child.text = value == null ? '' : String(value);
            node.children.set(key, child);
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
    const hasChildren = node.children.size > 0;
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
    for (const [cn, cnode] of node.children) {
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
    if (obj == null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { for (const item of obj) mappingOmitNulls(item); return; }
    for (const key of Object.keys(obj)) {
        if (obj[key] === null || obj[key] === undefined) delete obj[key];
        else if (typeof obj[key] === 'object') mappingOmitNulls(obj[key]);
    }
}

function mappingSortKeysDeep(obj: any): void {
    if (obj == null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { for (const item of obj) mappingSortKeysDeep(item); return; }
    const keys = Object.keys(obj).sort();
    const entries = keys.map(k => [k, obj[k]] as const);
    for (const key of Object.keys(obj)) delete obj[key];
    for (const [key, value] of entries) { obj[key] = value; if (typeof value === 'object') mappingSortKeysDeep(value); }
}

export class RuntimeMappingEngine implements IRuntimeMappingEngine {
    private readonly doc: MappingDocument;

    constructor(mappingDocument: MappingDocument) {
        this.doc = mappingDocument;
    }

    public forward(source: JsonValue | string): RuntimeMappingResult {
        return this.execute('forward', source ?? {});
    }

    public reverse(source: JsonValue | string): RuntimeMappingResult {
        return this.execute('reverse', source ?? {});
    }

    private execute(direction: MappingDirection, source: JsonValue | string): RuntimeMappingResult {
        if (!isWasmToolsReady()) {
            return {
                direction,
                output: {},
                appliedRules: 0,
                diagnostics: [{
                    ruleIndex: -1,
                    errorCode: 'WASM_NOT_READY',
                    message:
                        'RuntimeMappingEngine requires tools WASM. Call await initFormspecEngineTools() after await initFormspecEngine().',
                }],
            };
        }
        // Delegate to WASM for core rule evaluation
        let wasmResult: { direction: string; output: any; rulesApplied: number; diagnostics: any[] };
        try {
            wasmResult = wasmExecuteMappingDoc(this.doc, source, direction);
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
