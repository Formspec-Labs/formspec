/** @filedesc Experience-internal actor and task reference validation. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

type ReferenceTarget = 'actors' | 'tasks';

interface ExperienceReference {
  jsonPointer: string;
  displayPath: string;
  ref: string;
  target: ReferenceTarget;
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

function loadedExperienceHandles(handles: readonly ResolvedArtifactHandle[]): ResolvedArtifactHandle[] {
  return handles.filter(
    (handle) => handle.artifactKind === 'experience' && handle.status === 'loaded',
  );
}

function handleUrl(handle: ResolvedArtifactHandle): string | undefined {
  return stringProp(record(handle.ref), 'url')
    ?? stringProp(record(handle.identity), 'url')
    ?? stringProp(record(handle.document), 'url');
}

function handleId(handle: ResolvedArtifactHandle): string | undefined {
  return stringProp(record(handle.identity), 'id')
    ?? stringProp(record(handle.document), 'id');
}

function definitionItemPaths(items: unknown, prefix = ''): Set<string> {
  const paths = new Set<string>();
  if (!Array.isArray(items)) return paths;
  for (const rawItem of items) {
    const item = record(rawItem);
    const key = stringProp(item, 'key');
    if (!item || !key) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    paths.add(path);
    for (const childPath of definitionItemPaths(item.children, path)) {
      paths.add(childPath);
    }
  }
  return paths;
}

function mountedUnitIds(
  context: AppGraphContext,
  experience: ResolvedArtifactHandle,
): Set<string> {
  const experiences = loadedExperienceHandles(context.handles);
  const experienceUrl = handleUrl(experience);
  const experienceId = handleId(experience);
  const mounted = new Set<string>();
  for (const surface of context.handles.filter(
    (handle) => handle.artifactKind === 'surface' && handle.status === 'loaded',
  )) {
    const routes = record(surface.document)?.routes;
    if (!Array.isArray(routes)) continue;
    for (const rawRoute of routes) {
      const slots = record(rawRoute)?.slots;
      if (!Array.isArray(slots)) continue;
      for (const rawSlot of slots) {
        const slot = record(rawSlot);
        if (stringProp(slot, 'slotType') !== 'experience-unit') continue;
        const binding = record(slot?.binding);
        const unitRef = stringProp(binding, 'unitRef');
        const experienceRef = stringProp(binding, 'experienceRef');
        if (!unitRef) continue;
        const matches =
          experienceRef !== undefined
            ? experienceRef === experienceUrl || experienceRef === experienceId
            : experiences.length === 1;
        if (matches) mounted.add(unitRef);
      }
    }
  }
  return mounted;
}

function idsFromArray(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value.flatMap((entry) => {
      const id = stringProp(record(entry), 'id');
      return id === undefined ? [] : [id];
    }),
  );
}

function stringReferences(
  value: unknown,
  pointerPrefix: string,
  displayPrefix: string,
  target: ReferenceTarget,
): ExperienceReference[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index): ExperienceReference[] =>
    typeof candidate === 'string'
      ? [{
        jsonPointer: `${pointerPrefix}/${index}`,
        displayPath: `${displayPrefix}[${index}]`,
        ref: candidate,
        target,
      }]
      : []
  );
}

/**
 * Enumerates the same Experience-internal reference sites as the canonical
 * TypeScript Experience processor.
 */
function experienceReferences(document: unknown): ExperienceReference[] {
  const experience = record(document);
  if (!experience) return [];

  const references: ExperienceReference[] = [
    ...stringReferences(
      record(experience.applicability)?.actorRefs,
      '/applicability/actorRefs',
      'applicability.actorRefs',
      'actors',
    ),
  ];

  if (Array.isArray(experience.tasks)) {
    experience.tasks.forEach((task, taskIndex) => {
      references.push(...stringReferences(
        record(task)?.actorRefs,
        `/tasks/${taskIndex}/actorRefs`,
        `tasks[${taskIndex}].actorRefs`,
        'actors',
      ));
    });
  }

  if (Array.isArray(experience.units)) {
    experience.units.forEach((unit, unitIndex) => {
      const unitRecord = record(unit);
      const actorRef = stringProp(unitRecord, 'actorRef');
      if (actorRef !== undefined) {
        references.push({
          jsonPointer: `/units/${unitIndex}/actorRef`,
          displayPath: `units[${unitIndex}].actorRef`,
          ref: actorRef,
          target: 'actors',
        });
      }
      references.push(...stringReferences(
        unitRecord?.taskRefs,
        `/units/${unitIndex}/taskRefs`,
        `units[${unitIndex}].taskRefs`,
        'tasks',
      ));
      references.push(...stringReferences(
        record(unitRecord?.applicability)?.actorRefs,
        `/units/${unitIndex}/applicability/actorRefs`,
        `units[${unitIndex}].applicability.actorRefs`,
        'actors',
      ));
    });
  }

  return references;
}

function targetSource(
  experience: ResolvedArtifactHandle,
  target: ReferenceTarget,
): AppGraphSourcePointer {
  return diagnosticSourceForHandle(experience, `/${target}`);
}

function unresolvedDiagnostic(
  experience: ResolvedArtifactHandle,
  reference: ExperienceReference,
  knownIds: ReadonlySet<string>,
): AppGraphDiagnostic {
  return {
    code: 'EXP-REFERENTIAL-INTEGRITY',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `Reference '${reference.ref}' at ${reference.displayPath} does not resolve in ${reference.target}.`,
    primarySource: diagnosticSourceForHandle(experience, reference.jsonPointer),
    relatedSources: [targetSource(experience, reference.target)],
    details: {
      reason: 'reference-unresolved',
      ref: reference.ref,
      target: reference.target,
      knownIds: [...knownIds].sort(),
    },
  };
}

/**
 * Enforces Experience referential integrity after schema validation.
 *
 * AppGraph treats these findings as blocking errors so authoring and export
 * cannot claim a clean graph while Experience references are unresolved.
 */
export function validateExperienceReferentialIntegrity(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const experience of loadedExperienceHandles(context.handles)) {
    const document = record(experience.document);
    if (!document) continue;
    const ids: Record<ReferenceTarget, Set<string>> = {
      actors: idsFromArray(document.actors),
      tasks: idsFromArray(document.tasks),
    };

    for (const reference of experienceReferences(document)) {
      if (ids[reference.target].has(reference.ref)) continue;
      diagnostics.push(unresolvedDiagnostic(
        experience,
        reference,
        ids[reference.target],
      ));
    }

    const units = Array.isArray(document.units) ? document.units : [];
    const surfaceCount = context.handles.filter(
      (handle) => handle.artifactKind === 'surface' && handle.status === 'loaded',
    ).length;
    const mounted = mountedUnitIds(context, experience);
    if (surfaceCount > 0) {
      units.forEach((rawUnit, unitIndex) => {
        const unit = record(rawUnit);
        const unitId = stringProp(unit, 'id');
        if (!unitId || mounted.has(unitId)) return;
        diagnostics.push({
          code: 'EXP-UNIT-UNMOUNTED',
          severity: 'error',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message: `Experience unit '${unitId}' is not mounted by any resolved Surface experience-unit slot.`,
          primarySource: diagnosticSourceForHandle(experience, `/units/${unitIndex}/id`),
          details: {
            reason: 'experience-unit-unmounted',
            unitId,
          },
        });
      });
    }

    const targetDefinitionUrl = stringProp(record(document.targetDefinition), 'url');
    if (!targetDefinitionUrl) continue;
    const definitions = context.handles.filter(
      (handle) =>
        handle.artifactKind === 'definition'
        && handle.status === 'loaded'
        && handleUrl(handle) === targetDefinitionUrl,
    );
    const knownPaths = definitions.length === 1
      ? definitionItemPaths(record(definitions[0]?.document)?.items)
      : new Set<string>();

    units.forEach((rawUnit, unitIndex) => {
      const unit = record(rawUnit);
      const itemRefs = unit?.itemRefs;
      if (!Array.isArray(itemRefs)) return;
      itemRefs.forEach((rawRef, refIndex) => {
        const path = stringProp(record(rawRef), 'path');
        if (!path || (definitions.length === 1 && knownPaths.has(path))) return;
        diagnostics.push({
          code: 'EXP-ITEM-REF-UNRESOLVED',
          severity: 'error',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message:
            definitions.length === 1
              ? `Experience unit itemRef '${path}' does not resolve in Definition '${targetDefinitionUrl}'.`
              : `Experience target Definition '${targetDefinitionUrl}' does not resolve uniquely, so itemRef '${path}' cannot be verified.`,
          primarySource: diagnosticSourceForHandle(
            experience,
            `/units/${unitIndex}/itemRefs/${refIndex}/path`,
          ),
          relatedSources: definitions.length === 1
            ? [diagnosticSourceForHandle(definitions[0]!, '/items')]
            : [],
          details: {
            reason:
              definitions.length === 1
                ? 'item-ref-unresolved'
                : 'target-definition-unresolved',
            targetDefinitionUrl,
            itemPath: path,
            knownItemPaths: [...knownPaths].sort(),
          },
        });
      });
    });
  }

  return diagnostics;
}
