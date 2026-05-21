/** @filedesc Resolves presentation properties via the full 5-level cascade (formPresentation → item.presentation → theme defaults → selectors → item overrides). */
import type { ThemeDocument } from './types.js';

export interface ResolvedProperty {
  value: unknown;
  source: 'form-default' | 'item-hint' | 'default' | 'selector' | 'item-override';
  sourceDetail?: string;
}

/** The three cascade-relevant slices of a ThemeDocument. */
export type ThemeCascadeInput = Pick<ThemeDocument, 'defaults' | 'selectors' | 'items'>;

/** Optional definition-level inputs for the 2 lowest cascade levels. */
export interface DefinitionCascadeInput {
  formPresentation?: Record<string, unknown>;
  itemPresentation?: Record<string, unknown>;
}

interface SelectorEntry {
  match?: { type?: string; dataType?: string };
  apply?: Record<string, unknown>;
}

function selectorMatches(match: SelectorEntry['match'], itemType: string, itemDataType?: string): boolean {
  if (!match) return true;
  if (match.type && match.type !== itemType) return false;
  if (match.dataType && match.dataType !== itemDataType) return false;
  return true;
}

function selectorLabel(match: SelectorEntry['match'], index: number): string {
  const parts: string[] = [];
  if (match?.type) parts.push(match.type);
  if (match?.dataType) parts.push(match.dataType);
  return 'selector #' + (index + 1) + (parts.length ? ': ' + parts.join(' + ') : '');
}

function cssClassValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => cssClassValues(item));
  }
  return [];
}

function setPresentationProperty(
  result: Record<string, ResolvedProperty>,
  prop: string,
  value: unknown,
  source: ResolvedProperty['source'],
  sourceDetail?: string,
): void {
  if (prop !== 'cssClass') {
    result[prop] = { value, source, ...(sourceDetail ? { sourceDetail } : {}) };
    return;
  }

  const merged = cssClassValues(result.cssClass?.value);
  const seen = new Set(merged);
  for (const className of cssClassValues(value)) {
    if (!seen.has(className)) {
      seen.add(className);
      merged.push(className);
    }
  }

  if (merged.length > 0) {
    result.cssClass = { value: merged, source, ...(sourceDetail ? { sourceDetail } : {}) };
  }
}

export function resolveThemeCascade(
  theme: ThemeCascadeInput,
  itemKey: string,
  itemType: string,
  itemDataType?: string,
  definition?: DefinitionCascadeInput,
): Record<string, ResolvedProperty> {
  const result: Record<string, ResolvedProperty> = {};

  // Level -1: formPresentation (definition-wide defaults)
  if (definition?.formPresentation) {
    for (const [prop, value] of Object.entries(definition.formPresentation)) {
      if (value !== undefined) {
        setPresentationProperty(result, prop, value, 'form-default');
      }
    }
  }

  // Level 0: item.presentation (per-item hints)
  if (definition?.itemPresentation) {
    for (const [prop, value] of Object.entries(definition.itemPresentation)) {
      if (value !== undefined) {
        setPresentationProperty(result, prop, value, 'item-hint');
      }
    }
  }

  // Level 1: theme defaults
  const defaults = (theme.defaults ?? {}) as Record<string, unknown>;
  for (const [prop, value] of Object.entries(defaults)) {
    setPresentationProperty(result, prop, value, 'default');
  }

  // Level 2: selectors (in array order, later overrides earlier)
  const selectors = (theme.selectors ?? []) as SelectorEntry[];
  for (let i = 0; i < selectors.length; i++) {
    const sel = selectors[i];
    if (!selectorMatches(sel.match, itemType, itemDataType)) continue;
    const apply = sel.apply ?? {};
    for (const [prop, value] of Object.entries(apply)) {
      setPresentationProperty(result, prop, value, 'selector', selectorLabel(sel.match, i));
    }
  }

  // Level 3: item overrides
  const items = (theme.items ?? {}) as Record<string, Record<string, unknown>>;
  const itemOverrides = items[itemKey];
  if (itemOverrides && typeof itemOverrides === 'object') {
    for (const [prop, value] of Object.entries(itemOverrides)) {
      setPresentationProperty(result, prop, value, 'item-override');
    }
  }

  return result;
}
