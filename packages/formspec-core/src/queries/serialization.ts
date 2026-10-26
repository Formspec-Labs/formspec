/** @filedesc Extract the definition document as a clean JSON-serializable object. */
import type { ProjectState } from '../types.js';

/**
 * Extract the definition document as a clean JSON object (deep copy).
 * The result is fully JSON-serializable and safe to stringify/transmit.
 */
export function serializeToJSON(state: ProjectState): ProjectState['definition'] {
  return JSON.parse(JSON.stringify(state.definition));
}
