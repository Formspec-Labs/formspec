/** @filedesc Command handlers for standalone Screener Documents: metadata, items, binds, phases, and routes. */
import type { CommandHandler, ProjectState } from '../types.js';
import type { Bind, FormItem, ScreenerDocument, Phase, Route } from '@formspec-org/types';
import { asMutableRecord, setRecordProperty } from '../record-mutate.js';

function getScreener(state: ProjectState): ScreenerDocument {
  if (!state.screener) throw new Error('No screener document loaded');
  return state.screener;
}

function getPhase(screener: ScreenerDocument, phaseId: string): Phase {
  const phase = screener.evaluation.find(p => p.id === phaseId);
  if (!phase) throw new Error(`Phase not found: ${phaseId}`);
  return phase;
}

const ITEM_ALLOWED_PROPS = new Set([
  'label', 'description', 'hint', 'helpText', 'dataType', 'options', 'optionSet',
  'presentation', 'repeatable', 'minRepeat', 'maxRepeat',
]);

const ROUTE_ALLOWED_PROPS = new Set([
  'condition', 'score', 'threshold', 'target', 'label', 'message',
  'metadata', 'override', 'terminal',
]);

const PHASE_ALLOWED_PROPS = new Set([
  'strategy', 'label', 'description', 'activeWhen', 'config',
]);

export const screenerHandlers = {

  // ── Document lifecycle ─────────────────────────────────────────

  'screener.setDocument': (state, payload) => {
    state.screener = payload as ScreenerDocument;
    return { rebuildComponentTree: false };
  },

  'screener.remove': (state) => {
    state.screener = null;
    return { rebuildComponentTree: false };
  },

  'screener.setMetadata': (state, payload) => {
    const screener = getScreener(state);
    const p = payload as Record<string, unknown>;
    const doc = asMutableRecord(screener);
    for (const [key, value] of Object.entries(p)) {
      setRecordProperty(doc, key, value);
    }
    return { rebuildComponentTree: false };
  },

  // ── Items ──────────────────────────────────────────────────────

  'screener.addItem': (state, payload) => {
    const screener = getScreener(state);
    const p = payload as Record<string, unknown>;

    const item: FormItem = {
      type: (p.type as FormItem['type']) ?? 'field',
      key: p.key as string,
      label: (p.label as string) ?? '',
    };
    if (p.dataType) item.dataType = p.dataType as FormItem['dataType'];
    if (p.options) item.options = p.options as FormItem['options'];
    if (p.extensions) item.extensions = p.extensions as FormItem['extensions'];

    if (p.insertIndex !== undefined) {
      screener.items.splice(p.insertIndex as number, 0, item);
    } else {
      screener.items.push(item);
    }
    return { rebuildComponentTree: false };
  },

  'screener.deleteItem': (state, payload) => {
    const { key } = payload as { key: string };
    const screener = getScreener(state);

    screener.items = screener.items.filter(it => it.key !== key);

    // Clean up binds referencing deleted item
    if (screener.binds) {
      screener.binds = screener.binds.filter(b => b.path !== key);
      if (screener.binds.length === 0) delete screener.binds;
    }

    return { rebuildComponentTree: false };
  },

  'screener.setItemProperty': (state, payload) => {
    const { key, property, value } = payload as { key: string; property: string; value: unknown };
    if (!ITEM_ALLOWED_PROPS.has(property)) throw new Error(`Cannot set screener item property: ${property}`);
    const screener = getScreener(state);
    const item = screener.items.find(it => it.key === key);
    if (!item) throw new Error(`Screener item not found: ${key}`);
    setRecordProperty(asMutableRecord(item), property, value);
    return { rebuildComponentTree: false };
  },

  'screener.reorderItem': (state, payload) => {
    const { index, direction } = payload as { index: number; direction: 'up' | 'down' };
    const screener = getScreener(state);
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= screener.items.length) return { rebuildComponentTree: false };
    [screener.items[index], screener.items[targetIdx]] = [screener.items[targetIdx], screener.items[index]];
    return { rebuildComponentTree: false };
  },

  // ── Binds ──────────────────────────────────────────────────────

  'screener.setBind': (state, payload) => {
    const { path, properties } = payload as { path: string; properties: Record<string, unknown> };
    const screener = getScreener(state);

    if (!screener.binds) screener.binds = [];

    const binds = screener.binds;
    let bind: Bind | undefined = binds.find(b => b.path === path);
    if (!bind) {
      bind = { path };
      binds.push(bind);
    }

    for (const [key, value] of Object.entries(properties)) {
      setRecordProperty(asMutableRecord(bind), key, value);
    }

    return { rebuildComponentTree: false };
  },

  // ── Phases ─────────────────────────────────────────────────────

  'screener.addPhase': (state, payload) => {
    const p = payload as { id: string; strategy: string; label?: string; insertIndex?: number };
    const screener = getScreener(state);

    if (screener.evaluation.some(ph => ph.id === p.id)) {
      throw new Error(`Phase already exists: ${p.id}`);
    }

    const phase: Phase = {
      id: p.id,
      strategy: p.strategy,
      routes: [],
    };
    if (p.label) phase.label = p.label;

    if (p.insertIndex !== undefined) {
      screener.evaluation.splice(p.insertIndex, 0, phase);
    } else {
      screener.evaluation.push(phase);
    }
    return { rebuildComponentTree: false };
  },

  'screener.removePhase': (state, payload) => {
    const { phaseId } = payload as { phaseId: string };
    const screener = getScreener(state);
    const idx = screener.evaluation.findIndex(p => p.id === phaseId);
    if (idx === -1) throw new Error(`Phase not found: ${phaseId}`);
    screener.evaluation.splice(idx, 1);
    return { rebuildComponentTree: false };
  },

  'screener.reorderPhase': (state, payload) => {
    const { phaseId, direction } = payload as { phaseId: string; direction: 'up' | 'down' };
    const screener = getScreener(state);
    const idx = screener.evaluation.findIndex(p => p.id === phaseId);
    if (idx === -1) throw new Error(`Phase not found: ${phaseId}`);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= screener.evaluation.length) return { rebuildComponentTree: false };
    [screener.evaluation[idx], screener.evaluation[targetIdx]] =
      [screener.evaluation[targetIdx], screener.evaluation[idx]];
    return { rebuildComponentTree: false };
  },

  'screener.setPhaseProperty': (state, payload) => {
    const { phaseId, property, value } = payload as { phaseId: string; property: string; value: unknown };
    if (!PHASE_ALLOWED_PROPS.has(property)) throw new Error(`Cannot set phase property: ${property}`);
    const screener = getScreener(state);
    const phase = getPhase(screener, phaseId);
    setRecordProperty(asMutableRecord(phase), property, value);
    return { rebuildComponentTree: false };
  },

  // ── Routes (phase-scoped) ──────────────────────────────────────

  'screener.addRoute': (state, payload) => {
    const p = payload as { phaseId: string; route: Partial<Route>; insertIndex?: number };
    const screener = getScreener(state);
    const phase = getPhase(screener, p.phaseId);

    const route: Route = { target: p.route.target ?? '', ...p.route };

    if (p.insertIndex !== undefined) {
      phase.routes.splice(p.insertIndex, 0, route);
    } else {
      phase.routes.push(route);
    }
    return { rebuildComponentTree: false };
  },

  'screener.setRouteProperty': (state, payload) => {
    const { phaseId, index, property, value } = payload as {
      phaseId: string; index: number; property: string; value: unknown;
    };
    if (!ROUTE_ALLOWED_PROPS.has(property)) throw new Error(`Cannot set route property: ${property}`);
    const screener = getScreener(state);
    const phase = getPhase(screener, phaseId);
    const route = phase.routes[index];
    if (!route) throw new Error(`Route not found at index ${index} in phase ${phaseId}`);

    setRecordProperty(asMutableRecord(route), property, value);
    return { rebuildComponentTree: false };
  },

  'screener.deleteRoute': (state, payload) => {
    const { phaseId, index } = payload as { phaseId: string; index: number };
    const screener = getScreener(state);
    const phase = getPhase(screener, phaseId);
    if (index < 0 || index >= phase.routes.length) throw new Error(`Route index out of bounds: ${index}`);
    phase.routes.splice(index, 1);
    return { rebuildComponentTree: false };
  },

  'screener.reorderRoute': (state, payload) => {
    const { phaseId, index, direction } = payload as { phaseId: string; index: number; direction: 'up' | 'down' };
    const screener = getScreener(state);
    const phase = getPhase(screener, phaseId);
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= phase.routes.length) return { rebuildComponentTree: false };
    [phase.routes[index], phase.routes[targetIdx]] = [phase.routes[targetIdx], phase.routes[index]];
    return { rebuildComponentTree: false };
  },

  // ── Lifecycle ──────────────────────────────────────────────────

  'screener.setAvailability': (state, payload) => {
    const screener = getScreener(state);
    const { from, until } = payload as { from?: string | null; until?: string | null };
    if (from === null && until === null) {
      delete screener.availability;
    } else {
      if (!screener.availability) screener.availability = {};
      if (from === null) delete screener.availability.from;
      else if (from !== undefined) screener.availability.from = from;
      if (until === null) delete screener.availability.until;
      else if (until !== undefined) screener.availability.until = until;
    }
    return { rebuildComponentTree: false };
  },

  'screener.setResultValidity': (state, payload) => {
    const screener = getScreener(state);
    const { duration } = payload as { duration: string | null };
    if (duration === null) {
      delete screener.resultValidity;
    } else {
      screener.resultValidity = duration;
    }
    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
