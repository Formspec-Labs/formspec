/**
 * Theme command handlers.
 *
 * The Formspec theme document controls visual presentation through a three-level
 * cascade that determines how each form item is rendered:
 *
 *   - **Cascade Level 1 (Defaults)** -- Form-wide presentation baseline.
 *   - **Cascade Level 2 (Selectors)** -- Pattern-based overrides.
 *   - **Cascade Level 3 (Per-Item Overrides)** -- Highest-specificity level.
 *
 * Also manages design tokens, breakpoints, and stylesheets.
 * Page layout lives in the component tree; theme handlers no longer own page authoring.
 *
 * All handlers return `{ rebuildComponentTree: false }` because theme mutations
 * do not alter the definition item tree structure.
 *
 * @module handlers/theme
 */
import type { CommandHandler } from '../types.js';
import type { ThemeState } from '../types.js';
import { setRecordProperty } from '../record-mutate.js';

function ensureItems(theme: ThemeState): Record<string, any> {
  if (!theme.items) theme.items = {};
  return theme.items as Record<string, any>;
}

function ensureItemBlock(theme: ThemeState, itemKey: string): Record<string, any> {
  const items = ensureItems(theme);
  if (!items[itemKey]) items[itemKey] = {};
  return items[itemKey];
}

export const themeHandlers = {

  // ── Tokens & Defaults ───────────────────────────────────────────

  'theme.setToken': (state, payload) => {
    const { key, value } = payload as { key: string; value: unknown };
    if (!state.theme.tokens) state.theme.tokens = {};
    if (value === null) {
      delete state.theme.tokens[key];
    } else {
      state.theme.tokens[key] = value;
    }
    return { rebuildComponentTree: false };
  },

  'theme.setTokens': (state, payload) => {
    const { tokens } = payload as { tokens: Record<string, unknown> };
    if (!state.theme.tokens) state.theme.tokens = {};
    Object.assign(state.theme.tokens, tokens);
    return { rebuildComponentTree: false };
  },

  'theme.setDefaults': (state, payload) => {
    const { property, value } = payload as { property: string; value: unknown };
    if (!state.theme.defaults) state.theme.defaults = {};
    if (value === null) {
      delete state.theme.defaults[property];
    } else {
      state.theme.defaults[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  // ── Selectors (Cascade Level 2) ─────────────────────────────────

  'theme.addSelector': (state, payload) => {
    const { match, apply, insertIndex } = payload as { match: unknown; apply: unknown; insertIndex?: number };
    if (!state.theme.selectors) state.theme.selectors = [];
    const selector = { match, apply };
    if (insertIndex !== undefined) {
      state.theme.selectors.splice(insertIndex, 0, selector);
    } else {
      state.theme.selectors.push(selector);
    }
    return { rebuildComponentTree: false };
  },

  'theme.setSelector': (state, payload) => {
    const { index, match, apply } = payload as { index: number; match?: unknown; apply?: unknown };
    if (!state.theme.selectors?.[index]) throw new Error(`Selector not found at index: ${index}`);
    const sel = state.theme.selectors[index] as { match?: unknown; apply?: unknown };
    if (match !== undefined) sel.match = match;
    if (apply !== undefined) sel.apply = apply;
    return { rebuildComponentTree: false };
  },

  'theme.deleteSelector': (state, payload) => {
    const { index } = payload as { index: number };
    if (!state.theme.selectors) return { rebuildComponentTree: false };
    state.theme.selectors.splice(index, 1);
    return { rebuildComponentTree: false };
  },

  'theme.reorderSelector': (state, payload) => {
    const { index, direction } = payload as { index: number; direction: 'up' | 'down' };
    if (!state.theme.selectors) return { rebuildComponentTree: false };
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= state.theme.selectors.length) return { rebuildComponentTree: false };
    [state.theme.selectors[index], state.theme.selectors[target]] =
      [state.theme.selectors[target], state.theme.selectors[index]];
    return { rebuildComponentTree: false };
  },

  // ── Per-Item Overrides (Cascade Level 3) ────────────────────────

  'theme.setItemOverride': (state, payload) => {
    const { itemKey, property, value } = payload as { itemKey: string; property: string; value: unknown };
    const items = ensureItems(state.theme);
    if (value === null) {
      if (items[itemKey]) {
        delete items[itemKey][property];
        if (Object.keys(items[itemKey]).length === 0) delete items[itemKey];
      }
    } else {
      const block = ensureItemBlock(state.theme, itemKey);
      block[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  'theme.deleteItemOverride': (state, payload) => {
    const { itemKey } = payload as { itemKey: string };
    const items = state.theme.items as Record<string, any>;
    if (items) delete items[itemKey];
    return { rebuildComponentTree: false };
  },

  'theme.setItemStyle': (state, payload) => {
    const { itemKey, property, value } = payload as { itemKey: string; property: string; value: unknown };
    const block = ensureItemBlock(state.theme, itemKey);
    if (!block.style) block.style = {};
    if (value === null) {
      delete block.style[property];
    } else {
      block.style[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  'theme.setItemWidgetConfig': (state, payload) => {
    const { itemKey, property, value } = payload as { itemKey: string; property: string; value: unknown };
    const block = ensureItemBlock(state.theme, itemKey);
    if (!block.widgetConfig) block.widgetConfig = {};
    if (value === null) {
      delete block.widgetConfig[property];
    } else {
      block.widgetConfig[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  'theme.setItemAccessibility': (state, payload) => {
    const { itemKey, property, value } = payload as { itemKey: string; property: string; value: unknown };
    const block = ensureItemBlock(state.theme, itemKey);
    if (!block.accessibility) block.accessibility = {};
    if (value === null) {
      delete block.accessibility[property];
    } else {
      block.accessibility[property] = value;
    }
    return { rebuildComponentTree: false };
  },

  // ── Document-Level ──────────────────────────────────────────────

  'theme.setBreakpoint': (state, payload) => {
    const { name, minWidth } = payload as { name: string; minWidth: number | null };
    if (!state.theme.breakpoints) state.theme.breakpoints = {};
    if (minWidth === null) {
      delete state.theme.breakpoints[name];
    } else {
      state.theme.breakpoints[name] = minWidth;
    }
    return { rebuildComponentTree: false };
  },

  'theme.setStylesheets': (state, payload) => {
    const { urls } = payload as { urls: string[] };
    state.theme.stylesheets = urls;
    return { rebuildComponentTree: false };
  },

  'theme.setDocumentProperty': (state, payload) => {
    const { property, value } = payload as { property: string; value: unknown };
    setRecordProperty(state.theme, property, value);
    return { rebuildComponentTree: false };
  },

  'theme.setExtension': (state, payload) => {
    const { key, value } = payload as { key: string; value: unknown };
    if (!state.theme.extensions) state.theme.extensions = {};
    setRecordProperty(state.theme.extensions, key, value);
    return { rebuildComponentTree: false };
  },

  'theme.setTargetCompatibility': (state, payload) => {
    const { compatibleVersions } = payload as { compatibleVersions: string };
    if (!state.theme.targetDefinition) {
      state.theme.targetDefinition = { url: '' };
    }
    state.theme.targetDefinition.compatibleVersions = compatibleVersions;
    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
