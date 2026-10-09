/** @filedesc Native Screener presentation admission and result-only route selection. */
import type { ScreenerDocument, DeterminationRecord, FormItem } from '@formspec-org/types';
import { valid } from 'semver';

export interface ScreenerDocumentHandle {
  ref: { url: string; version?: string };
  document: ScreenerDocument;
}
export type ScreenerAdmission = { status: 'ready' } | { status: 'unavailable'; reason: string };
const unavailable = (reason: string): ScreenerAdmission => ({ status: 'unavailable', reason });

/** This bounded presenter does not approximate unsupported native item/bind semantics. */
export function admitScreenerPresentation(document: ScreenerDocument): ScreenerAdmission {
  if (document.$formspecScreener !== '1.0' || !document.url || !valid(document.version)) return unavailable('screener-pin-invalid');
  if (!Array.isArray(document.items) || document.items.length === 0) return unavailable('items-empty');
  const keys = new Set<string>();
  for (const item of document.items) {
    const raw = item as unknown as Record<string, unknown>;
    if (item.type !== 'field' || !item.key || keys.has(item.key) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(item.key)) return unavailable('item-unsupported');
    keys.add(item.key);
    if (typeof item.dataType !== 'string' || !['string', 'integer', 'decimal', 'boolean', 'choice'].includes(item.dataType) ||
        Object.keys(raw).some(k => !['type', 'key', 'dataType', 'label', 'options', 'extensions', 'x-generation'].includes(k))) return unavailable('item-unsupported');
    if (item.dataType === 'choice') {
      if (!Array.isArray(item.options) || !item.options.length || item.options.some(o => typeof o.value !== 'string' || o.value === '') || new Set(item.options.map(o => o.value)).size !== item.options.length) return unavailable('options-unsupported');
    } else if (item.options !== undefined) return unavailable('options-unsupported');
  }
  const paths = new Set<string>();
  for (const bind of document.binds ?? []) {
    if (!keys.has(bind.path) || paths.has(bind.path) || Object.keys(bind).some(k => !['path', 'required'].includes(k)) ||
        (bind.required !== undefined && bind.required !== 'true' && bind.required !== 'false')) return unavailable('bind-unsupported');
    paths.add(bind.path);
  }
  return { status: 'ready' };
}

export function screenerAnswerMatches(item: FormItem, value: unknown): boolean {
  switch (item.dataType) {
    case 'boolean': return typeof value === 'boolean';
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isSafeInteger(value);
    case 'decimal': return typeof value === 'number' && Number.isFinite(value);
    case 'choice': return typeof value === 'string' && !!item.options?.some(o => o.value === value);
    default: return false;
  }
}

export interface ScreenerDeterminationInput {
  document: ScreenerDocument;
  allowedTargets: readonly string[];
  determination: DeterminationRecord;
  answers: Readonly<Record<string, unknown>>;
  /** Timestamp passed to this exact synchronous evaluation invocation. */
  evaluationTime: string;
  /** Fresh acceptance time, never derived from the result itself. */
  nowIso: string;
}
export type ScreenerDeterminationResult = { status: 'ready'; target: string } | { status: 'refused'; reason: string };
function instant(value: unknown): number {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
}
export function resolveScreenerDetermination(input: ScreenerDeterminationInput): ScreenerDeterminationResult {
  const { document, determination: record, answers } = input;
  const refuse = (reason: string): ScreenerDeterminationResult => ({ status: 'refused', reason });
  const admission = admitScreenerPresentation(document);
  if (admission.status !== 'ready') return refuse(admission.reason);
  if (record.$formspecDetermination !== '1.0' || record.screener?.url !== document.url || record.screener.version !== document.version || record.evaluationVersion !== document.version) return refuse('determination-pin-mismatch');
  if (record.status !== 'completed') return refuse('determination-not-completed');
  const evaluated = instant(record.timestamp), invocation = instant(input.evaluationTime), now = instant(input.nowIso);
  if (![evaluated, invocation, now].every(Number.isFinite) || evaluated !== invocation || now < evaluated) return refuse('determination-time-invalid');
  const expires = record.validity?.validUntil;
  if (document.resultValidity !== undefined && expires === undefined) return refuse('determination-validity-missing');
  if (expires !== undefined && (!Number.isFinite(instant(expires)) || instant(expires) < evaluated || instant(expires) <= now)) return refuse('determination-expired');
  const keys = document.items.map(i => i.key);
  if (!record.inputs || Object.keys(record.inputs).length !== keys.length || Object.keys(answers).length !== keys.length) return refuse('determination-input-coverage');
  for (const item of document.items) {
    const entry = record.inputs[item.key];
    if (entry && entry.state !== 'answered') return refuse('determination-input-unanswered');
    if (!entry || !screenerAnswerMatches(item, entry.value) || entry.value !== answers[item.key]) return refuse('determination-input-mismatch');
    if (document.binds?.some(b => b.path === item.key && b.required === 'true') && (entry.value as unknown) === '') return refuse('determination-required-answer');
  }
  if (!Array.isArray(record.phases) || !Array.isArray(record.overrides?.matched) || record.phases.some(p => !['evaluated', 'skipped'].includes(p.status) || !['first-match', 'fan-out', 'score-threshold'].includes(p.strategy) || (p.warnings?.length ?? 0) > 0 || !Array.isArray(p.matched))) return refuse('determination-diagnostics');
  if (!Array.isArray(document.evaluation) || !document.evaluation.length || document.evaluation.some(p => !['first-match', 'fan-out', 'score-threshold'].includes(p.strategy) || !Array.isArray(p.routes) || p.routes.some(r => typeof r.target !== 'string'))) return refuse('determination-diagnostics');
  const authored = new Set(document.evaluation.flatMap(p => p.routes.map(r => r.target)));
  const allowed = new Set(input.allowedTargets);
  if (allowed.size === 0 || allowed.size !== input.allowedTargets.length || [...allowed].some(t => !t.startsWith('surface:') || !authored.has(t))) return refuse('allowed-target-invalid');
  const matches = [...record.overrides.matched, ...record.phases.flatMap(p => p.matched)];
  if (matches.some(m => !allowed.has(m.target))) return refuse('determination-target-disallowed');
  const targets = new Set(matches.map(m => m.target));
  return targets.size === 1 ? { status: 'ready', target: [...targets][0]! } : refuse('determination-target-not-unique');
}
