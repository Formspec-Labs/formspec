/** @filedesc Count fields referencing a named option set. */
import type { FormItem } from '@formspec-org/types';
import type { ProjectState } from '../types.js';

/**
 * Count the number of fields in the definition that reference a given option set name.
 */
export function optionSetUsageCount(state: ProjectState, name: string): number {
  let count = 0;

  function walk(items: FormItem[]): void {
    for (const item of items) {
      if (item.optionSet === name) {
        count++;
      }
      if (item.children) walk(item.children);
    }
  }

  walk(state.definition.items);
  return count;
}
