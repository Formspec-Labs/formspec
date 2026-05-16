'use client';

/** @filedesc useScreener — React hook for the Formspec screener gate. */
import { useState, useCallback } from 'react';
import { evalFEL, wasmEvaluateScreenerDocument } from '@formspec-org/engine';
import type { UseScreenerOptions, UseScreenerResult, ScreenerRoute, ScreenerRouteType } from './types';

/**
 * Read the item's data type, supporting both the canonical schema field
 * (`dataType`) and the simplified alias (`type`) from the user-facing API.
 */
function itemDataType(item: any): string {
    return item.dataType ?? item.type ?? 'text';
}

/**
 * Read the item's option list, supporting both the canonical schema field
 * (`options`) and the simplified alias (`choices`).
 */
function itemOptions(item: any): any[] {
    return item.options ?? item.choices ?? [];
}

/**
 * Determine whether a screener item is required.
 * Checks the item's own `required` flag first, then falls back to
 * `screener.binds` (the canonical location in the definition schema).
 * FEL expressions in the `required` bind are evaluated against the
 * current answers using the engine's FEL evaluator.
 */
export function isItemRequired(
    item: any,
    screener: any,
    answers: Record<string, any>,
): boolean {
    if (item.required === true) return true;
    const binds: any[] = screener?.binds ?? [];
    const bind = binds.find((b: any) => b.path === item.key);
    if (!bind || bind.required == null) return false;

    // Literal boolean or string "true"
    if (bind.required === true || bind.required === 'true') return true;
    if (bind.required === false || bind.required === 'false') return false;

    // FEL expression — evaluate with current answers as field context
    if (typeof bind.required === 'string') {
        try {
            const result = evalFEL(bind.required, answers);
            return result === true;
        } catch {
            // If evaluation fails, treat as not required (graceful degradation)
            return false;
        }
    }

    return false;
}

function buildSeedAnswers(items: any[], seed: Record<string, any> | undefined): Record<string, any> {
    const out: Record<string, any> = {};
    if (!seed) return out;
    for (const item of items) {
        if (seed[item.key] !== undefined) {
            out[item.key] = seed[item.key];
        }
    }
    return out;
}

function asRouteExtensionsRecord(value: unknown): Record<string, any> | undefined {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, any>;
}

function firstMatchedRouteFromDetermination(
    determination: any,
): { target: string; label?: string; extensions?: Record<string, any> } | null {
    const matched =
        determination.overrides?.matched?.[0] ?? determination.phases?.flatMap((p: any) => p.matched)?.[0];
    if (!matched) {
        return null;
    }
    return {
        target: matched.target,
        label: matched.label,
        extensions:
            asRouteExtensionsRecord(matched.extensions) ?? asRouteExtensionsRecord(matched.metadata),
    };
}

export function useScreener(
    options: UseScreenerOptions = {},
): UseScreenerResult {
    const screenerDoc = options.screenerDocument ?? null;
    const items: any[] = screenerDoc?.items ?? [];
    const routes: any[] = screenerDoc?.evaluation?.flatMap((p: any) => p.routes ?? []) ?? [];

    const [answers, setAnswers] = useState<Record<string, any>>(() =>
        buildSeedAnswers(items, options.seedAnswers),
    );

    const [state, setState] = useState<'idle' | 'answering' | 'routed'>('idle');
    const [routeResult, setRouteResult] = useState<{
        route: ScreenerRoute;
        routeType: ScreenerRouteType;
    } | null>(null);
    const [skipped, setSkipped] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const setAnswer = useCallback((key: string, value: any) => {
        setAnswers(prev => ({ ...prev, [key]: value }));
        // Clear error for this field when the user changes it
        setErrors(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setState(s => (s === 'idle' ? 'answering' : s));
    }, []);

    const submit = useCallback(() => {
        // Validate required fields
        const newErrors: Record<string, string> = {};
        const hasExplicitRequired = items.some(i => isItemRequired(i, screenerDoc, answers));

        if (hasExplicitRequired) {
            for (const item of items) {
                if (isItemRequired(item, screenerDoc, answers)) {
                    const val = answers[item.key];
                    if (val === undefined || val === null || val === '') {
                        newErrors[item.key] = `${item.label || item.key} is required`;
                    }
                }
            }
        } else {
            // No explicit required binds — require at least one non-empty answer
            const hasAny = items.some(i => {
                const v = answers[i.key];
                return v !== undefined && v !== null && v !== '';
            });
            if (!hasAny) {
                // Mark the first item as needing a value
                if (items.length > 0) {
                    newErrors[items[0].key] = 'Please answer at least one question';
                }
            }
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});

        // Evaluate via WASM and extract first matched route from determination
        let result: { target: string; label?: string; extensions?: Record<string, any> } | null = null;
        if (screenerDoc) {
            try {
                const determination = wasmEvaluateScreenerDocument(screenerDoc, answers);
                result = firstMatchedRouteFromDetermination(determination);
            } catch {
                result = null;
            }
        }
        if (!result) {
            setRouteResult({ route: { target: '' }, routeType: 'none' });
            setState('routed');
            options.onRoute?.({ target: '' }, 'none', answers);
            return;
        }

        // Determine route type: prefer explicit `routeType` on the matched
        // route definition, then fall back to URL-based heuristics.
        const matchedRoute = routes.find((r: any) => {
            if (r.target === result.target) return true;
            if (result.label != null && result.label !== '' && r.label === result.label) return true;
            return false;
        });

        let routeType: ScreenerRouteType = 'internal';
        if (matchedRoute?.routeType === 'internal' || matchedRoute?.routeType === 'external' || matchedRoute?.routeType === 'none') {
            // Explicit routeType takes precedence over heuristics
            routeType = matchedRoute.routeType;
        } else {
            // Heuristic fallback: infer route type from URL comparison.
            // Prefer using an explicit `routeType` on route definitions instead
            // of relying on this path — the URL comparison can misclassify routes
            // when the definition URL changes or when external routes happen to
            // share the same base URL.
            const defUrl = screenerDoc?.targetDefinition?.url;
            if (defUrl && result.target === defUrl) {
                routeType = 'internal';
            } else if (matchedRoute?.type === 'external' || matchedRoute?.externalUrl) {
                routeType = 'external';
            } else if (defUrl && result.target !== defUrl) {
                routeType = 'external';
            }
        }

        const route: ScreenerRoute = {
            target: result.target,
            label: result.label,
            extensions: result.extensions,
        };

        setRouteResult({ route, routeType });
        setState('routed');
        options.onRoute?.(route, routeType, answers);
    }, [answers, items, routes, screenerDoc, options]);

    const restart = useCallback(() => {
        setAnswers(buildSeedAnswers(items, options.seedAnswers));
        setRouteResult(null);
        setErrors({});
        setState('idle');
        setSkipped(false);
    }, [items, options.seedAnswers]);

    const skip = useCallback(() => {
        setSkipped(true);
    }, []);

    return { state, answers, setAnswer, submit, restart, skip, routeResult, skipped, errors };
}

// Re-export helpers for use outside the hook (e.g. FormspecScreener field rendering)
export { itemDataType, itemOptions };
