/** @filedesc Enforces cross-artifact invariants after every state mutation. */
import { sortBreakpoints } from '@formspec-org/types';
import type { ProjectState } from './types.js';

/**
 * Enforce cross-artifact invariants on a mutable state object.
 * Runs after every dispatch and batch cycle.
 * Undo/redo bypass this — snapshots were already normalized.
 */
export function normalizeState(state: ProjectState): void {
  const url = state.definition.url;

  // Sync targetDefinition.url on component and theme
  if (state.component.targetDefinition) {
    state.component.targetDefinition.url = url;
  }
  if (state.theme.targetDefinition) {
    state.theme.targetDefinition.url = url;
  }

  // Sync locale targetDefinition.url with definition URL
  state.locales ??= {};
  for (const locale of Object.values(state.locales)) {
    if (locale.targetDefinition) {
      locale.targetDefinition.url = url;
    }
  }

  const themeBreakpoints = sortBreakpoints(state.theme.breakpoints);
  if (themeBreakpoints) {
    state.theme.breakpoints = themeBreakpoints;
  }

  const componentBreakpoints = sortBreakpoints(state.component.breakpoints);
  if (componentBreakpoints) {
    state.component.breakpoints = componentBreakpoints;
  }
}
