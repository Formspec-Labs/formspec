/** @filedesc Command handlers for standalone Experience Documents: lifecycle + document-level metadata. */
import type { CommandHandler, ProjectState } from '../types.js';
import type { ExperienceDocument } from '@formspec-org/types';
import { asMutableRecord, setRecordProperty } from '../record-mutate.js';

function getExperience(state: ProjectState): ExperienceDocument {
  if (!state.experience) throw new Error('No experience document loaded');
  return state.experience;
}

export const experienceHandlers = {

  'experience.setDocument': (state, payload) => {
    state.experience = payload as ExperienceDocument;
    return { rebuildComponentTree: false };
  },

  'experience.remove': (state) => {
    state.experience = null;
    return { rebuildComponentTree: false };
  },

  'experience.setMetadata': (state, payload) => {
    const experience = getExperience(state);
    const p = payload as Record<string, unknown>;
    const doc = asMutableRecord(experience);
    for (const [key, value] of Object.entries(p)) {
      setRecordProperty(doc, key, value);
    }
    return { rebuildComponentTree: false };
  },

} satisfies Record<string, CommandHandler>;
