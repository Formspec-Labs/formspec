'use client';

/** @filedesc useScreener — React hook for the Formspec screener gate. */
import { useState, useCallback, useMemo } from 'react';
import { evalFEL, wasmEvaluateScreenerDocument } from '@formspec-org/engine';
import type { Bind, DeterminationRecord, FormItem, RouteResult } from '@formspec-org/types';
import type {
  UseScreenerOptions,
  UseScreenerResult,
  ScreenerRoute,
  ScreenerRouteType,
  ScreenerAnswers,
  ScreenerFieldValue,
  ScreenerDocumentInput,
  ScreenerRouteDef,
} from './types';

/**
 * Read the item's data type, supporting both the canonical schema field
 * (`dataType`) and the simplified alias (`type`) from the user-facing API.
 */
function itemDataType(item: FormItem & { type?: string }): string {
  return item.dataType ?? (item as FormItem & { type?: string }).type ?? 'text';
}

/**
 * Read the item's option list, supporting both the canonical schema field
 * (`options`) and the simplified alias (`choices`).
 */
function itemOptions(item: FormItem & { choices?: FormItem['options'] }): NonNullable<FormItem['options']> {
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
  item: FormItem,
  screener: ScreenerDocumentInput | null | undefined,
  answers: ScreenerAnswers,
): boolean {
  if ((item as FormItem & { required?: boolean }).required === true) return true;
  const binds: Bind[] = screener?.binds ?? [];
  const bind = binds.find((b) => b.path === item.key);
  if (!bind || bind.required == null) return false;

  if (typeof bind.required === 'boolean') return bind.required;
  if (bind.required === 'true') return true;
  if (bind.required === 'false') return false;

  if (typeof bind.required === 'string') {
    try {
      const result = evalFEL(bind.required, answers);
      return result === true;
    } catch {
      return false;
    }
  }

  return false;
}

function buildSeedAnswers(items: FormItem[], seed: ScreenerAnswers | undefined): ScreenerAnswers {
  const out: ScreenerAnswers = {};
  if (!seed) return out;
  for (const item of items) {
    if (seed[item.key] !== undefined) {
      out[item.key] = seed[item.key];
    }
  }
  return out;
}

function asRouteExtensionsRecord(value: unknown): Record<string, unknown> | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function firstMatchedRouteFromDetermination(
  determination: DeterminationRecord,
): ScreenerRoute | null {
  const matched: RouteResult | undefined =
    determination.overrides?.matched?.[0]
    ?? determination.phases?.flatMap((p) => p.matched)?.[0];
  if (!matched) {
    return null;
  }
  return {
    target: matched.target,
    label: matched.label,
    extensions: asRouteExtensionsRecord(matched.metadata),
  };
}

export function useScreener(
  options: UseScreenerOptions = {},
): UseScreenerResult {
  const screenerDoc = options.screenerDocument ?? null;
  const items = useMemo(() => screenerDoc?.items ?? [], [screenerDoc]);
  const routes = useMemo<ScreenerRouteDef[]>(
    () => (screenerDoc?.evaluation?.flatMap((p) => p.routes ?? []) ?? []) as ScreenerRouteDef[],
    [screenerDoc],
  );
  const binds = useMemo(() => screenerDoc?.binds ?? [], [screenerDoc]);

  const [answers, setAnswers] = useState<ScreenerAnswers>(() =>
    buildSeedAnswers(items, options.seedAnswers),
  );

  const [state, setState] = useState<'idle' | 'answering' | 'routed'>('idle');
  const [routeResult, setRouteResult] = useState<{
    route: ScreenerRoute;
    routeType: ScreenerRouteType;
  } | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setAnswer = useCallback((key: string, value: ScreenerFieldValue | undefined) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setState((s) => (s === 'idle' ? 'answering' : s));
  }, []);

  const submit = useCallback(() => {
    const newErrors: Record<string, string> = {};
    const hasExplicitRequired = items.some((i) => isItemRequired(i, screenerDoc, answers));

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
      const hasAny = items.some((i) => {
        const v = answers[i.key];
        return v !== undefined && v !== null && v !== '';
      });
      if (!hasAny && items.length > 0) {
        newErrors[items[0].key] = 'Please answer at least one question';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    let result: ScreenerRoute | null = null;
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

    const matchedRoute = routes.find((r) => {
      if (r.target === result!.target) return true;
      if (result!.label != null && result!.label !== '' && r.label === result!.label) return true;
      return false;
    });

    let routeType: ScreenerRouteType = 'internal';
    if (
      matchedRoute?.routeType === 'internal'
      || matchedRoute?.routeType === 'external'
      || matchedRoute?.routeType === 'none'
    ) {
      routeType = matchedRoute.routeType;
    } else {
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

  return {
    state,
    answers,
    items,
    binds,
    routes,
    setAnswer,
    submit,
    restart,
    skip,
    routeResult,
    skipped,
    errors,
  };
}

export { itemDataType, itemOptions };
