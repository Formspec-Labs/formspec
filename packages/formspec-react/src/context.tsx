'use client';

/** @filedesc FormspecProvider — React context wrapping a FormEngine + optional layout plan. */
import React, { createContext, useContext, useMemo, useEffect, useRef, useCallback, useState } from 'react';
import { signal } from '@preact/signals-core';
import type { ReadonlyEngineSignal } from '@formspec-org/engine';
import type { IFormEngine } from '@formspec-org/engine';
import type { FormResponse, ValidationReport } from '@formspec-org/types';
import { createFormEngine } from '@formspec-org/engine';
import type { LayoutNode } from '@formspec-org/layout';
import {
    planDefinitionFallback,
    planComponentTree,
    preparePlanContext,
    ensureSubmitButton,
    mergeFormPresentationForPlanning,
} from '@formspec-org/layout';
import type { ComponentMap } from './component-map';

export interface SubmitResult {
    response: FormResponse;
    validationReport: ValidationReport;
}

export interface FormspecContextValue {
    engine: IFormEngine;
    layoutPlan: LayoutNode | null;
    components: ComponentMap;
    /** Theme document from the provider (used for container token emission). */
    themeDocument?: any;
    /** Component document from the provider (used for container token emission). */
    componentDocument?: any;
    /** Callback invoked on form submission. Absent means no built-in submit button. */
    onSubmit?: (result: SubmitResult) => void;
    /** Mark a field as touched (e.g., on blur). */
    touchField: (path: string) => void;
    /** Touch every field in the definition (e.g., before submit to reveal all errors). */
    touchAllFields: () => void;
    /** Signal that increments when touched set changes — subscribe for reactivity. */
    touchedVersion: ReadonlyEngineSignal<number>;
    /** Check if a field has been touched. Read touchedVersion.value first for reactivity. */
    isTouched: (path: string) => boolean;
    /** Registry entries for extension resolution. */
    registryEntries: Map<string, any>;
    /** Effective formPresentation (definition merged with component document). */
    formPresentation?: Record<string, unknown>;
}

const FormspecContext = createContext<FormspecContextValue | null>(null);

export interface FormspecProviderProps {
    /** Pre-built FormEngine instance. Mutually exclusive with `definition`. */
    engine?: IFormEngine;
    /** Raw definition JSON. Will create a FormEngine internally. */
    definition?: any;
    /** Component document for layout planning. */
    componentDocument?: any;
    /** Theme document for presentation cascade. */
    themeDocument?: any;
    /** Initial response data to pre-populate fields (for edit flows). */
    initialData?: Record<string, any>;
    /** Registry entries for extension field validation. */
    registryEntries?: any[];
    /** Runtime context for FEL today(), locale formatting, etc. */
    runtimeContext?: any;
    /** Component map overrides. */
    components?: ComponentMap;
    /** Callback for form submission. If provided, a submit button is rendered. */
    onSubmit?: (result: SubmitResult) => void;
    children: React.ReactNode;
}

/**
 * Provides FormEngine and layout plan to descendant hooks and renderers.
 *
 * Accepts either a pre-built `engine` or a raw `definition` (creates engine internally).
 */
export function FormspecProvider({
    engine: externalEngine,
    definition,
    componentDocument,
    themeDocument,
    initialData,
    registryEntries,
    runtimeContext,
    components = {},
    onSubmit,
    children,
}: FormspecProviderProps) {
    const engine = useMemo(() => {
        if (externalEngine) return externalEngine;
        if (!definition) throw new Error('FormspecProvider requires either engine or definition');
        const eng = createFormEngine(definition, { runtimeContext, registryEntries });
        if (initialData) {
            applyInitialData(eng, initialData);
        }
        return eng;
    }, [externalEngine, definition, registryEntries, runtimeContext, initialData]);

    // Build registry entry map for extension resolution
    const registryMap = useMemo(() => {
        const map = new Map<string, any>();
        if (registryEntries) {
            for (const doc of (Array.isArray(registryEntries) ? registryEntries : [registryEntries])) {
                if (!doc?.entries) continue;
                for (const entry of doc.entries) {
                    if (entry.name) map.set(entry.name, entry);
                }
            }
        }
        return map;
    }, [registryEntries]);

    // Responsive breakpoint detection — match component document breakpoints via matchMedia
    const [activeBreakpoint, setActiveBreakpoint] = useState<string | null>(() => {
        if (typeof window === 'undefined' || !componentDocument?.breakpoints) return null;
        return detectBreakpoint(componentDocument.breakpoints);
    });

    useEffect(() => {
        if (typeof window === 'undefined' || !componentDocument?.breakpoints) return;
        const breakpoints = componentDocument.breakpoints as Record<string, number | { minWidth?: number }>;
        const entries = Object.entries(breakpoints)
            .map(([name, bp]): [string, number] | null => {
                const v = typeof bp === 'number' ? bp : (bp.minWidth ?? null);
                return v != null ? [name, v] : null;
            })
            .filter((e): e is [string, number] => e !== null)
            .sort(([, a], [, b]) => a - b);
        if (entries.length === 0) return;

        const queries = entries.map(([name, minWidth]) => ({
            name,
            mql: window.matchMedia(`(min-width: ${minWidth}px)`),
        }));

        const update = () => setActiveBreakpoint(detectBreakpoint(breakpoints));
        for (const { mql } of queries) mql.addEventListener('change', update);
        return () => { for (const { mql } of queries) mql.removeEventListener('change', update); };
    }, [componentDocument]);

    const mergedFormPresentation = useMemo(
        () =>
            engine
                ? mergeFormPresentationForPlanning(
                      engine.getDefinition().formPresentation,
                      componentDocument?.formPresentation,
                  )
                : undefined,
        [engine, componentDocument],
    );

    const layoutPlan = useMemo(() => {
        if (!engine) return null;
        const def = engine.getDefinition();
        const items = def.items || [];

        const planCtx = preparePlanContext({
            items,
            formPresentation: mergedFormPresentation,
            componentDocument,
            theme: themeDocument,
            activeBreakpoint,
            findItem: (key: string) => findItemByKey(items, key),
        });

        let root: LayoutNode;
        if (componentDocument?.tree) {
            root = planComponentTree(componentDocument.tree, planCtx);
        } else {
            // planDefinitionFallback returns an array — wrap in a root Stack node
            const nodes = planDefinitionFallback(items, planCtx);
            root = {
                id: 'root',
                component: 'Stack',
                category: 'layout' as const,
                props: {},
                cssClasses: [],
                children: nodes,
            };
        }

        if (onSubmit) ensureSubmitButton(root, planCtx.nextId);
        return root;
    }, [engine, componentDocument, themeDocument, activeBreakpoint, onSubmit, mergedFormPresentation]);

    // Touched tracking — stable across re-renders
    const touchedFieldsRef = useRef(new Set<string>());
    const touchedVersionSignal = useMemo(() => signal(0), []);

    const touchField = useCallback((path: string) => {
        if (!touchedFieldsRef.current.has(path)) {
            touchedFieldsRef.current.add(path);
            touchedVersionSignal.value += 1;
        }
    }, [touchedVersionSignal]);

    const touchAllFields = useCallback(() => {
        const def = engine.getDefinition();
        const walk = (items: any[], prefix: string) => {
            for (const item of items) {
                const path = prefix ? `${prefix}.${item.key}` : item.key;
                if (item.type === 'field') touchField(path);
                if (item.children) walk(item.children, path);
            }
        };
        walk(def.items || [], '');
    }, [engine, touchField]);

    const isTouched = useCallback((path: string) => {
        return touchedFieldsRef.current.has(path);
    }, []);

    // Auto-emit theme tokens as CSS custom properties when themeDocument has tokens
    useEffect(() => {
        if (typeof document === 'undefined' || !themeDocument?.tokens) return;
        emitThemeTokens(themeDocument.tokens);
    }, [themeDocument]);

    useEffect(() => {
        // Only dispose if we created the engine internally
        if (!externalEngine && engine) {
            return () => engine.dispose();
        }
    }, [engine, externalEngine]);

    const value = useMemo<FormspecContextValue>(
        () => ({
            engine,
            layoutPlan,
            components,
            themeDocument,
            componentDocument,
            onSubmit,
            touchField,
            touchAllFields,
            touchedVersion: touchedVersionSignal,
            isTouched,
            registryEntries: registryMap,
            formPresentation: mergedFormPresentation,
        }),
        [engine, layoutPlan, components, themeDocument, componentDocument, onSubmit, touchField, touchAllFields, touchedVersionSignal, isTouched, registryMap, mergedFormPresentation],
    );

    return (
        <FormspecContext.Provider value={value}>
            {children}
        </FormspecContext.Provider>
    );
}

/** Access the FormspecContext. Throws if used outside FormspecProvider. */
export function useFormspecContext(): FormspecContextValue {
    const ctx = useContext(FormspecContext);
    if (!ctx) throw new Error('useFormspecContext must be used within a FormspecProvider');
    return ctx;
}

/** Detect the largest matching breakpoint from a breakpoints map (mobile-first).
 *  Breakpoint values may be plain integers `{ sm: 576 }` or objects `{ sm: { minWidth: 576 } }`.
 */
function detectBreakpoint(breakpoints: Record<string, number | { minWidth?: number }>): string | null {
    if (typeof window === 'undefined') return null;
    let match: string | null = null;
    const entries = Object.entries(breakpoints)
        .map(([name, bp]): [string, number] | null => {
            const v = typeof bp === 'number' ? bp : (bp.minWidth ?? null);
            return v != null ? [name, v] : null;
        })
        .filter((e): e is [string, number] => e !== null)
        .sort(([, a], [, b]) => a - b);
    for (const [name, minWidth] of entries) {
        if (window.matchMedia(`(min-width: ${minWidth}px)`).matches) {
            match = name;
        }
    }
    return match;
}

/**
 * Emit theme tokens as --formspec-* CSS custom properties.
 * Converts dotted token keys (e.g., `color.primary`) to `--formspec-color-primary`.
 * Defaults to `document.documentElement` when no target is provided.
 */
export function emitThemeTokens(
    tokens: Record<string, string | number>,
    target?: HTMLElement,
): void {
    const el = target ?? document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
        el.style.setProperty(`--formspec-${key.replace(/\./g, '-')}`, String(value));
    }
}

/** Walk nested initial data and set leaf values on the engine with dotted paths. */
function applyInitialData(engine: IFormEngine, data: Record<string, any>, prefix = ''): void {
    for (const [key, value] of Object.entries(data)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (Array.isArray(value)) {
            // Repeat group: ensure instances exist, then recurse into each
            const currentCount = engine.repeats[path]?.value ?? 0;
            for (let i = currentCount; i < value.length; i++) {
                engine.addRepeatInstance(path);
            }
            for (let i = 0; i < value.length; i++) {
                if (value[i] != null && typeof value[i] === 'object') {
                    applyInitialData(engine, value[i], `${path}[${i}]`);
                }
            }
        } else if (value !== null && typeof value === 'object') {
            applyInitialData(engine, value, path);
        } else {
            engine.setValue(path, value);
        }
    }
}

import { Path } from '@formspec-org/types';

/** Recursive item lookup by dotted key path. */
export function findItemByKey(items: any[], key: string): any | null {
    const segments = Path.parse(key).splitNormalized();
    let current = items;
    for (let i = 0; i < segments.length; i++) {
        const found = current.find((item: any) => item.key === segments[i]);
        if (!found) return null;
        if (i === segments.length - 1) return found;
        current = found.children || [];
    }
    return null;
}
