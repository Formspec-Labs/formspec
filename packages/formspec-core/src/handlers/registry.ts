/** @filedesc Command handlers for authored Registry Documents keyed by id; the resolution index follows every write. */
import type { CommandHandler } from '../types.js';
import type { RegistryDocument } from '@formspec-org/types';
import { syncAuthoredRegistries } from '../registry-index.js';
import { assertDocumentId } from '../document-id.js';

export const registryHandlers = {

  /** Replace (or create) the authored Registry Document at `id`; stored verbatim. */
  'registry.setDocument': (state, payload) => {
    const { id, document } = payload as { id: string; document: RegistryDocument };
    assertDocumentId(id, 'registry');
    state.registries[id] = document;
    syncAuthoredRegistries(state);
    return { rebuildComponentTree: false };
  },

  /** Drop the authored Registry Document at `id` and its index row. */
  'registry.remove': (state, payload) => {
    const { id } = payload as { id: string };
    delete state.registries[id];
    syncAuthoredRegistries(state);
    return { rebuildComponentTree: false };
  },

} satisfies Record<string, CommandHandler>;
