/** @filedesc Command handler for the one authored Ontology Document: whole-document replace, null removes. */
import type { CommandHandler } from '../types.js';
import type { OntologyDocument } from '@formspec-org/types';

export const ontologyHandlers = {

  /**
   * Replace the authored Ontology Document (`null` removes it). Fine-grained edits —
   * bindings, vocabularies, metadata, the derived context — are computed by the
   * authoring layer and committed as one whole document, which keeps the core small
   * and every edit one undo step.
   */
  'ontology.setDocument': (state, payload) => {
    const { document } = payload as { document: OntologyDocument | null };
    state.ontology = document ?? null;
    return { rebuildComponentTree: false };
  },

} satisfies Record<string, CommandHandler>;
