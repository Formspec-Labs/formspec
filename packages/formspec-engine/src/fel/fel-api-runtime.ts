/** @filedesc Path helpers and runtime-WASM FEL surface (`wasm-bridge-runtime` only; ADR 0050). */

import type { FELAnalysis } from '../interfaces.js';

export type { FELAnalysis } from '../interfaces.js';
import {
    wasmAnalyzeFEL,
    wasmAnalyzeFELWithFieldTypes,
    wasmComputeDependencyGroups,
    wasmEvalFELWithTrace,
    wasmEvalFELWithContextTrace,
    wasmEvaluateDefinition,
    wasmGetFELDependencies,
    wasmIsValidFelIdentifier,
    wasmItemAtPath,
    wasmNormalizeIndexedPath,
    wasmSanitizeFelIdentifier,
} from '../wasm-bridge-runtime.js';

export type { FelTraceStep, FelTraceResult } from '../wasm-bridge-runtime.js';

import {
    lineColumnAtCharOffset,
    normalizeFelAnalysisError,
    type WasmFelAnalysisErrorWire,
} from './normalize-fel-analysis-error.js';

export { lineColumnAtCharOffset, normalizeFelAnalysisError, type WasmFelAnalysisErrorWire };

export const normalizeIndexedPath = wasmNormalizeIndexedPath;
export const itemAtPath = wasmItemAtPath;

export function analyzeFEL(expression: string): FELAnalysis {
    const raw = wasmAnalyzeFEL(expression);
    return {
        ...raw,
        errors: raw.errors.map(e => normalizeFelAnalysisError(expression, e)),
    };
}

/** Analyze a FEL expression with field data type context for type-mismatch warnings. */
export function analyzeFELWithFieldTypes(
    expression: string,
    fieldTypes: Record<string, string>,
): FELAnalysis {
    const raw = wasmAnalyzeFELWithFieldTypes(expression, fieldTypes);
    return {
        ...raw,
        errors: raw.errors.map(e => normalizeFelAnalysisError(expression, e)),
    };
}

/** Basic tree item shape used by path traversal helpers. */
export interface TreeItemLike<T extends TreeItemLike<T> = any> {
    key: string;
    children?: T[];
}

/** Resolved mutable location of an item in a tree. */
export interface ItemLocation<T extends TreeItemLike<T>> {
    parent: T[];
    index: number;
    item: T;
}

/** Remove repeat indices/wildcards from a path segment. */
export function normalizePathSegment(segment: string): string {
    return segment.replace(/\[(?:\d+|\*)\]/g, '');
}

/** Split a dotted path into normalized (index-free) segments. */
export function splitNormalizedPath(path: string): string[] {
    if (!path) return [];
    return wasmNormalizeIndexedPath(path).split('.').filter(Boolean);
}

/** Find the mutable parent/index/item triple for a dotted tree path. */
export function itemLocationAtPath<T extends TreeItemLike<T>>(items: T[], path: string): ItemLocation<T> | undefined {
    const parts = splitNormalizedPath(path);
    if (parts.length === 0) return undefined;
    let currentItems = items;
    for (let i = 0; i < parts.length - 1; i++) {
        const found = currentItems.find(item => item.key === parts[i]);
        if (!found?.children) return undefined;
        currentItems = found.children;
    }
    const index = currentItems.findIndex(item => item.key === parts[parts.length - 1]);
    if (index < 0) return undefined;
    return { parent: currentItems, index, item: currentItems[index] };
}

export function getFELDependencies(expression: string): string[] {
    return wasmGetFELDependencies(expression);
}

/**
 * Evaluate a FEL expression and return a structured trace of evaluation steps.
 * See `FelTraceStep` for the step variants; wire format matches Rust `fel_core::TraceStep`.
 */
export const evalFELWithTrace = wasmEvalFELWithTrace;
export const evalFELWithContextTrace = wasmEvalFELWithContextTrace;

export const evaluateDefinition = wasmEvaluateDefinition;

/** Check if a string is a valid FEL identifier (canonical Rust lexer rule). */
export const isValidFELIdentifier = wasmIsValidFelIdentifier;

/** Sanitize a string into a valid FEL identifier (strips invalid chars, escapes keywords). */
export const sanitizeFELIdentifier = wasmSanitizeFelIdentifier;

/** Compute dependency groups from recorded changeset entries (delegates to Rust/WASM). */
export const computeDependencyGroups = wasmComputeDependencyGroups;
