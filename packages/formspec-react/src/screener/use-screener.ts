'use client';

/** @filedesc useScreener — React hook for the Formspec screener gate. */
import { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { evalFEL, wasmEvaluateScreenerDocument } from '@formspec-org/engine';
import { useScreenerText } from './use-screener-text';
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

function routeExtensionsFromMatch(
  matched: RouteResult & { extensions?: unknown },
): Record<string, unknown> | undefined {
  return asRouteExtensionsRecord(matched.metadata) ?? asRouteExtensionsRecord(matched.extensions);
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
    extensions: routeExtensionsFromMatch(matched),
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

  const [state, setState] = useState<'idle' | 'answering' | 'completing' | 'routed'>('idle');
  const [routeResult, setRouteResult] = useState<{
    route: ScreenerRoute;
    routeType: ScreenerRouteType;
  } | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [issues, setErrors] = useState<Record<string, string>>({});
  const presentation = useScreenerText(options, answers, Object.keys(issues).filter(key => issues[key] === 'required'));
  const chrome = presentation.chrome;
  const errors = Object.fromEntries(Object.entries(issues).map(([key, issue]) => {
    const item = items.find(item => item.key === key);
    const label = presentation.text(`${key}.label`, item?.label ?? key, answers, key);
    if (issue === 'required') return [key, presentation.text(`${key}.requiredMessage`, chrome('screener.requiredMessage', { label }), answers, key, true)];
    if (issue === 'answerRequired') return [key, chrome('screener.answerRequired', { label })];
    if (issue === 'answerOne') return [key, chrome('screener.answerOne')];
    return [key, issue];
  }));

  // The pending lock is synchronous: two submits in one turn share one act.
  const accepted = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const act = useRef<{ completionId: string; record: DeterminationRecord; answers: ScreenerAnswers; evaluationTime: string } | null>(null);
  const live = useRef({ document: screenerDoc, key: options.completionKey });
  live.current = { document: screenerDoc, key: options.completionKey };
  const retire = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    act.current = null;
    accepted.current = false;
  }, []);
  useLayoutEffect(() => {
    setState(s => s === 'completing' ? 'answering' : s);
    return retire;
  }, [screenerDoc, options.completionKey, retire]);

  useLayoutEffect(() => {
    setState(s => s === 'completing' ? 'answering' : s);
    return () => { pending.current?.abort(); pending.current = null; };
  }, [options.onDetermination]);

  const setAnswer = useCallback((key: string, value: ScreenerFieldValue | undefined) => {
    retire();
    setState('answering');
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setState((s) => (s === 'idle' ? 'answering' : s));
  }, [retire]);

  const submit = useCallback(() => {
    if (pending.current || accepted.current) return;
    if (presentation.localeFinding) { setErrors({ $completion: presentation.localeFinding }); return; }
    const newErrors: Record<string, string> = {};
    const hasExplicitRequired = items.some((i) => isItemRequired(i, screenerDoc, answers));

    if (hasExplicitRequired) {
      for (const item of items) {
        if (isItemRequired(item, screenerDoc, answers)) {
          const val = answers[item.key];
          if (val === undefined || val === null || val === '') {
            newErrors[item.key] = 'required';
          }
        }
      }
    } else {
      const hasAny = items.some((i) => {
        const v = answers[i.key];
        return v !== undefined && v !== null && v !== '';
      });
      if (!hasAny && items.length > 0) {
        newErrors[items[0].key] = 'answerOne';
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    if (options.onDetermination) {
      // Every presented field must have an explicit answer in this bounded mode.
      for (const item of items) {
        if (answers[item.key] === undefined || answers[item.key] === null) newErrors[item.key] = 'answerRequired';
      }
      if (Object.keys(newErrors).length) { setErrors(newErrors); return; }
      if (!screenerDoc) { setErrors({ $completion: 'screener-unavailable' }); return; }
      const controller = new AbortController();
      pending.current = controller;
      const current = () => pending.current === controller && !controller.signal.aborted
        && live.current.document === screenerDoc && live.current.key === options.completionKey;
      const settle = (disposition: import('./types').ScreenerCompletionDisposition) => {
        if (!current()) return;
        pending.current = null;
        if (disposition.status === 'accepted') { accepted.current = true; act.current = null; setState('routed'); }
        else {
          if (disposition.retry === 'new-act') act.current = null;
          setState('answering');
          setErrors({ $completion: disposition.reason });
        }
      };
      const fail = () => settle({ status: 'refused', reason: 'screener-evaluation-or-completion-failed' });
      setState('completing');
      try {
        if (!act.current) {
          const evaluationTime = new Date().toISOString();
          const snapshot = structuredClone(answers);
          act.current = { completionId: crypto.randomUUID(), evaluationTime, answers: snapshot,
            record: wasmEvaluateScreenerDocument(screenerDoc, snapshot, { nowIso: evaluationTime }) };
        }
        const attempt = structuredClone(act.current);
        const disposition = options.onDetermination(attempt.record, attempt.answers, attempt.evaluationTime,
          { signal: controller.signal, completionId: attempt.completionId });
        if ('then' in disposition) void Promise.resolve(disposition).then(settle, fail);
        else settle(disposition);
      } catch { fail(); }
      return;
    }

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
  }, [answers, items, routes, screenerDoc, options, presentation.localeFinding]);

  const restart = useCallback(() => {
    retire();
    setAnswers(buildSeedAnswers(items, options.seedAnswers));
    setRouteResult(null);
    setErrors({});
    setState('idle');
    setSkipped(false);
  }, [items, options.seedAnswers, retire]);

  const skip = useCallback(() => {
    if (!options.onDetermination) setSkipped(true);
  }, [options.onDetermination]);

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
    presentation,
  };
}

export { itemDataType, itemOptions };
