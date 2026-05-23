/** @filedesc Command handlers for standalone Response Actions Documents: lifecycle + document-level metadata. */
import type { CommandHandler, ProjectState } from '../types.js';
import type { ResponseActionsDocument } from '@formspec-org/types';
import { asMutableRecord, setRecordProperty } from '../record-mutate.js';

function getResponseActions(state: ProjectState): ResponseActionsDocument {
  if (!state.responseActions) throw new Error('No response-actions document loaded');
  return state.responseActions;
}

export const responseActionsHandlers = {

  'responseActions.setDocument': (state, payload) => {
    state.responseActions = payload as ResponseActionsDocument;
    return { rebuildComponentTree: false };
  },

  'responseActions.remove': (state) => {
    state.responseActions = null;
    return { rebuildComponentTree: false };
  },

  'responseActions.setMetadata': (state, payload) => {
    const responseActions = getResponseActions(state);
    const p = payload as Record<string, unknown>;
    const doc = asMutableRecord(responseActions);
    for (const [key, value] of Object.entries(p)) {
      setRecordProperty(doc, key, value);
    }
    return { rebuildComponentTree: false };
  },

} satisfies Record<string, CommandHandler>;
