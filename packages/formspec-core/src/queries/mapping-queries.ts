/** @filedesc Mapping-specific state queries: bidirectional transform evaluation. */
import { createMappingEngine } from '@formspec-org/engine';
import type { MappingDocument } from '@formspec-org/types';
import type { ProjectState, MappingPreviewParams, MappingPreviewResult } from '../types.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * Executes a mapping transformation simulation (preview) using the current project state.
 * This is a pure query and does not modify the state.
 *
 * @param state The current project state
 * @param params Preview configuration (sample data, direction, optional rule filtering)
 * @returns The transformation results and diagnostics
 */
export function previewMapping(
  state: ProjectState,
  params: MappingPreviewParams,
): MappingPreviewResult {
  const {
    mappingId,
    sampleData,
    direction = 'forward',
    ruleIndices,
  } = params;

  // Resolve target mapping
  const id = mappingId || state.selectedMappingId || 'default';
  const target = state.mappings[id] || { rules: [] };

  // Clone mapping to avoid accidental mutations during simulation
  const mappingDoc = structuredClone(target) as MappingDocument;

  // Optional: filter rules if requested
  if (Array.isArray(ruleIndices) && Array.isArray(mappingDoc.rules)) {
    mappingDoc.rules = ruleIndices
      .map((index: number) => mappingDoc.rules[index])
      .filter((rule: unknown) => rule !== undefined) as MappingDocument['rules'];
  }

  const runtime = createMappingEngine(mappingDoc);
  const result = direction === 'reverse'
    ? runtime.reverse(sampleData as JsonValue | string)
    : runtime.forward(sampleData as JsonValue | string);

  return {
    output: result.output,
    diagnostics: result.diagnostics,
    appliedRules: result.appliedRules,
    direction: result.direction,
  };
}
