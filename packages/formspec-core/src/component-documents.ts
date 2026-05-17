/** @filedesc Utilities for normalizing and selecting the single component document state. */
import type {
  ComponentState,
  ProjectState,
} from './types.js';

export function isAuthoredComponentDocument(doc: unknown): doc is ComponentState {
  return !!doc && typeof doc === 'object' && typeof (doc as Record<string, unknown>).$formspecComponent === 'string';
}

export function hasAuthoredComponentTree(doc: unknown): doc is ComponentState {
  return !!doc && typeof doc === 'object' && !!(doc as ComponentState).tree;
}

export function createComponentArtifact(url?: string): ComponentState {
  return url ? { targetDefinition: { url } } : {};
}

export function normalizeComponentState(
  component: ComponentState | undefined,
  url?: string,
): ComponentState {
  const normalized = {
    ...(component ?? {}),
    ...(url ? { targetDefinition: { ...(component?.targetDefinition ?? {}), url } } : {}),
  } as ComponentState;

  delete (normalized as Record<string, unknown>)['x-studio-generated'];
  return normalized;
}

export function getCurrentComponentDocument(
  state: Pick<ProjectState, 'component'>,
): ComponentState {
  return state.component;
}

/** @deprecated Use {@link getCurrentComponentDocument}. */
export const getEditableComponentDocument = getCurrentComponentDocument;
