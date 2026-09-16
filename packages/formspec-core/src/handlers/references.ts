/** @filedesc Command handler for the one authored References Document: whole-document replace, null removes. */
import type { CommandHandler } from '../types.js';
import type { ReferencesDocument } from '@formspec-org/types';

export const referencesHandlers = {

  /**
   * Replace the authored References Document (`null` removes it). Fine-grained edits —
   * add/remove a bound reference, metadata — are computed by the authoring layer and
   * committed as one whole document, which keeps the core small and every edit one undo step.
   */
  'references.setDocument': (state, payload) => {
    const { document } = payload as { document: ReferencesDocument | null };
    state.references = document ?? null;
    return { rebuildComponentTree: false };
  },

} satisfies Record<string, CommandHandler>;
