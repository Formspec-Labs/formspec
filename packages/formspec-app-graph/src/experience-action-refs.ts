/** @filedesc Experience.units[].actionRefs cross-artifact validation against loaded Response Actions action ids. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

interface ExperienceActionRef {
  unitIndex: number;
  unitId?: string;
  refIndex: number;
  id: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringProp(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function handlesByKind(handles: readonly ResolvedArtifactHandle[], artifactKind: string): ResolvedArtifactHandle[] {
  return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}

function experienceActionRefs(experience: ResolvedArtifactHandle): ExperienceActionRef[] {
  const units = record(experience.document)?.units;
  if (!Array.isArray(units)) return [];
  return units.flatMap((unit, unitIndex): ExperienceActionRef[] => {
    const unitRecord = record(unit);
    const actionRefs = unitRecord?.actionRefs;
    if (!Array.isArray(actionRefs)) return [];
    return actionRefs.flatMap((actionRef, refIndex): ExperienceActionRef[] => {
      const id = stringProp(record(actionRef), 'id');
      if (id === undefined) return [];
      return [{
        unitIndex,
        unitId: stringProp(unitRecord, 'id'),
        refIndex,
        id,
      }];
    });
  });
}

function responseActionIds(handles: readonly ResolvedArtifactHandle[]): Set<string> {
  const ids = new Set<string>();
  for (const handle of handlesByKind(handles, 'responseActions')) {
    const actions = record(handle.document)?.actions;
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      const id = stringProp(record(action), 'id');
      if (id) ids.add(id);
    }
  }
  return ids;
}

function responseActionsSources(handles: readonly ResolvedArtifactHandle[]): AppGraphSourcePointer[] {
  return handlesByKind(handles, 'responseActions').map((handle) =>
    diagnosticSourceForHandle(handle, '/actions')
  );
}

function actionRefSource(
  experience: ResolvedArtifactHandle,
  ref: ExperienceActionRef,
): AppGraphSourcePointer {
  return diagnosticSourceForHandle(
    experience,
    `/units/${ref.unitIndex}/actionRefs/${ref.refIndex}/id`,
  );
}

function unresolvedDiagnostic(
  experience: ResolvedArtifactHandle,
  ref: ExperienceActionRef,
  knownIds: Set<string>,
  handles: readonly ResolvedArtifactHandle[],
): AppGraphDiagnostic {
  const known = [...knownIds].sort();
  return {
    code: 'APP-GRAPH-EXPERIENCE-ACTION-REF',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `Experience unit '${ref.unitId ?? '<unknown>'}' actionRefs[${ref.refIndex}].id '${ref.id}' does not resolve to any loaded Response Actions actions[*].id.`,
    primarySource: actionRefSource(experience, ref),
    relatedSources: responseActionsSources(handles),
    details: {
      reason: 'action-id-unresolved',
      unitId: ref.unitId,
      unitIndex: ref.unitIndex,
      refIndex: ref.refIndex,
      actionRefId: ref.id,
      knownActionIds: known,
    },
  };
}

function missingResponseActionsDiagnostic(
  experience: ResolvedArtifactHandle,
  ref: ExperienceActionRef,
): AppGraphDiagnostic {
  return {
    code: 'APP-GRAPH-EXPERIENCE-ACTION-REF',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `Experience unit '${ref.unitId ?? '<unknown>'}' actionRefs[${ref.refIndex}].id '${ref.id}' cannot resolve because no Response Actions document is loaded; processors MUST load Response Actions when Experience carries actionRefs (experience-spec §"Action references").`,
    primarySource: actionRefSource(experience, ref),
    details: {
      reason: 'response-actions-not-loaded',
      unitId: ref.unitId,
      unitIndex: ref.unitIndex,
      refIndex: ref.refIndex,
      actionRefId: ref.id,
    },
  };
}

export function validateExperienceActionRefs(context: AppGraphContext): AppGraphDiagnostic[] {
  const experienceHandles = handlesByKind(context.handles, 'experience');
  if (experienceHandles.length === 0) return [];

  const responseActionsLoaded = handlesByKind(context.handles, 'responseActions').length > 0;
  const knownIds = responseActionsLoaded ? responseActionIds(context.handles) : new Set<string>();
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const experience of experienceHandles) {
    for (const ref of experienceActionRefs(experience)) {
      if (!responseActionsLoaded) {
        diagnostics.push(missingResponseActionsDiagnostic(experience, ref));
        continue;
      }
      if (knownIds.has(ref.id)) continue;
      diagnostics.push(unresolvedDiagnostic(experience, ref, knownIds, context.handles));
    }
  }

  return diagnostics;
}
