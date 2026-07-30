/** @filedesc Scoped duplicate-title warnings for content that can render together. */

import type {
  AppGraphContext,
  AppGraphDiagnostic,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import {
  handlesByKind,
  ownProp,
  record,
  recordArray,
  registryWidgetEntries,
  resolvedWidgetContributionFromEntries,
  stringProp,
  surfaceWidgetSlots,
  widgetShape,
  type JsonRecord,
  type SurfaceWidgetSlot,
} from './surface-widgets.js';

export const UX_TITLE_DUPLICATE_CODE = 'APP-GRAPH-UX-TITLE-DUPLICATE';

const STRUCTURED_PANEL_DELIVERY_CONTRACT_ID =
  '@formspec-org/surface-react/StructuredPanel@0.1';
const TITLED_COMPONENTS = new Set(['Section', 'Panel']);

interface TitleCandidate {
  handle: ResolvedArtifactHandle;
  pointer: string;
  title: string;
  normalizedTitle: string;
  kind: string;
}

interface TitleScope {
  kind: string;
  label: string;
}

/**
 * Title comparison deliberately does not fold case. AppGraph does not resolve
 * the display locale for these authored strings, so a locale-independent case
 * guess would create false positives.
 */
export function normalizeUxTitle(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function titleCandidate(
  handle: ResolvedArtifactHandle,
  pointer: string,
  title: string | undefined,
  kind: string,
): TitleCandidate | undefined {
  if (title === undefined) return undefined;
  const normalizedTitle = normalizeUxTitle(title);
  if (normalizedTitle.length === 0) return undefined;
  return { handle, pointer, title, normalizedTitle, kind };
}

function duplicateTitleDiagnostics(
  candidates: readonly TitleCandidate[],
  scope: TitleScope,
): AppGraphDiagnostic[] {
  const firstByTitle = new Map<string, TitleCandidate>();
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const candidate of candidates) {
    const first = firstByTitle.get(candidate.normalizedTitle);
    if (!first) {
      firstByTitle.set(candidate.normalizedTitle, candidate);
      continue;
    }

    diagnostics.push({
      code: UX_TITLE_DUPLICATE_CODE,
      severity: 'warning',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      message:
        `Title '${candidate.normalizedTitle}' is repeated within ${scope.label}.`,
      primarySource: diagnosticSourceForHandle(candidate.handle, candidate.pointer),
      relatedSources: [
        diagnosticSourceForHandle(first.handle, first.pointer),
      ],
      details: {
        reason: 'duplicate-visible-title',
        scopeKind: scope.kind,
        scope: scope.label,
        normalizedTitle: candidate.normalizedTitle,
        comparison: 'nfc-trim-collapse-whitespace-case-sensitive',
        firstKind: first.kind,
        duplicateKind: candidate.kind,
      },
    });
  }

  return diagnostics;
}

function navigationDiagnostics(surface: ResolvedArtifactHandle): AppGraphDiagnostic[] {
  const candidatesByScope = new Map<string, TitleCandidate[]>();
  const routes = recordArray(ownProp(record(surface.document), 'routes'));

  routes.forEach((route, routeIndex) => {
    const navigation = record(ownProp(route, 'navigation'));
    if (ownProp(navigation, 'visible') === false) return;

    const scope = stringProp(navigation, 'scope') ?? 'default';
    const navigationLabel = stringProp(navigation, 'label');
    const routeTitle = stringProp(route, 'title');
    const routeId = stringProp(route, 'id');
    const effectiveLabel = navigationLabel ?? routeTitle ?? routeId;
    const pointer = navigationLabel !== undefined
      ? `/routes/${routeIndex}/navigation/label`
      : routeTitle !== undefined
        ? `/routes/${routeIndex}/title`
        : `/routes/${routeIndex}/id`;
    const candidate = titleCandidate(
      surface,
      pointer,
      effectiveLabel,
      'navigation-entry',
    );
    if (!candidate) return;
    candidatesByScope.set(scope, [...(candidatesByScope.get(scope) ?? []), candidate]);
  });

  return [...candidatesByScope.entries()].flatMap(([scope, candidates]) =>
    duplicateTitleDiagnostics(candidates, {
      kind: 'surface-navigation',
      label: `Surface navigation scope '${scope}'`,
    })
  );
}

function routeSlotRepetitionDiagnostics(
  surface: ResolvedArtifactHandle,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const routes = recordArray(ownProp(record(surface.document), 'routes'));

  routes.forEach((route, routeIndex) => {
    const routeTitle = stringProp(route, 'title') ?? stringProp(route, 'id');
    const routeCandidate = titleCandidate(
      surface,
      stringProp(route, 'title') !== undefined
        ? `/routes/${routeIndex}/title`
        : `/routes/${routeIndex}/id`,
      routeTitle,
      'surface-route',
    );
    if (!routeCandidate) return;

    const slots = recordArray(ownProp(route, 'slots'));
    slots.forEach((slot, slotIndex) => {
      // Experience-unit slots are host-policy output and are hidden by the
      // default renderer. Their title is not statically proven visible.
      if (stringProp(slot, 'slotType') === 'experience-unit') return;
      const slotCandidate = titleCandidate(
        surface,
        `/routes/${routeIndex}/slots/${slotIndex}/title`,
        stringProp(slot, 'title'),
        'surface-slot',
      );
      if (!slotCandidate) return;
      if (routeCandidate.normalizedTitle !== slotCandidate.normalizedTitle) return;

      diagnostics.push(...duplicateTitleDiagnostics(
        [routeCandidate, slotCandidate],
        {
          kind: 'surface-route-slot',
          label: `Surface route '${stringProp(route, 'id') ?? routeIndex}' and its slot`,
        },
      ));
    });
  });

  return diagnostics;
}

function experienceTaskDiagnostics(
  experience: ResolvedArtifactHandle,
): AppGraphDiagnostic[] {
  const tasks = recordArray(ownProp(record(experience.document), 'tasks'));
  const candidates = tasks.flatMap((task, taskIndex) => {
    const candidate = titleCandidate(
      experience,
      `/tasks/${taskIndex}/title`,
      stringProp(task, 'title'),
      'experience-task',
    );
    return candidate ? [candidate] : [];
  });

  return duplicateTitleDiagnostics(candidates, {
    kind: 'experience-tasks',
    label: `Experience '${experience.slot}' task list`,
  });
}

function titledComponentCandidate(
  handle: ResolvedArtifactHandle,
  node: JsonRecord,
  pointer: string,
): TitleCandidate | undefined {
  const component = stringProp(node, 'component');
  if (!component || !TITLED_COMPONENTS.has(component)) return undefined;
  return titleCandidate(
    handle,
    `${pointer}/title`,
    stringProp(node, 'title'),
    `component-${component.toLowerCase()}`,
  );
}

function componentTreeDiagnostics(
  handle: ResolvedArtifactHandle,
  node: JsonRecord,
  pointer: string,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const parent = titledComponentCandidate(handle, node, pointer);
  const children = recordArray(ownProp(node, 'children'));
  const titledChildren = children.flatMap((child, childIndex) => {
    const candidate = titledComponentCandidate(
      handle,
      child,
      `${pointer}/children/${childIndex}`,
    );
    return candidate ? [candidate] : [];
  });

  diagnostics.push(...duplicateTitleDiagnostics(titledChildren, {
    kind: 'component-siblings',
    label: `Component sibling scope '${pointer}'`,
  }));

  if (parent) {
    for (const child of titledChildren) {
      if (parent.normalizedTitle !== child.normalizedTitle) continue;
      diagnostics.push(...duplicateTitleDiagnostics(
        [parent, child],
        {
          kind: 'component-parent-child',
          label: `Component parent-child scope '${pointer}'`,
        },
      ));
    }
  }

  children.forEach((child, childIndex) => {
    diagnostics.push(...componentTreeDiagnostics(
      handle,
      child,
      `${pointer}/children/${childIndex}`,
    ));
  });
  return diagnostics;
}

function componentDiagnostics(component: ResolvedArtifactHandle): AppGraphDiagnostic[] {
  const tree = record(ownProp(record(component.document), 'tree'));
  return tree ? componentTreeDiagnostics(component, tree, '/tree') : [];
}

function isStructuredPanel(
  widget: SurfaceWidgetSlot,
  contribution: ReturnType<typeof resolvedWidgetContributionFromEntries>,
): boolean {
  const deliveryContractId = stringProp(widgetShape(contribution), 'deliveryContractId');
  if (deliveryContractId === STRUCTURED_PANEL_DELIVERY_CONTRACT_ID) return true;
  return deliveryContractId === undefined
    && (widget.widgetName === 'StructuredPanel' || widget.widgetName === 'x-structured-panel');
}

function structuredPanelDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const entries = registryWidgetEntries(context);
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const widget of surfaceWidgetSlots(surface)) {
      const contribution = resolvedWidgetContributionFromEntries(widget, entries);
      if (!contribution || !isStructuredPanel(widget, contribution)) continue;
      const config = record(ownProp(widget.binding, 'config'));
      if (!config) continue;

      const basePointer =
        `/routes/${widget.routeIndex}/slots/${widget.slotIndex}/binding/config`;
      const blocks = recordArray(ownProp(config, 'blocks'));
      const blockTitles = blocks.flatMap((block, blockIndex) => {
        const candidate = titleCandidate(
          surface,
          `${basePointer}/blocks/${blockIndex}/title`,
          stringProp(block, 'title'),
          'structured-panel-block',
        );
        return candidate ? [candidate] : [];
      });
      const panelLabel =
        `StructuredPanel '${widget.slotId ?? widget.slotIndex}' on route `
        + `'${widget.routeId ?? widget.routeIndex}'`;

      diagnostics.push(...duplicateTitleDiagnostics(blockTitles, {
        kind: 'structured-panel-blocks',
        label: `${panelLabel} block list`,
      }));

      const panelTitle = titleCandidate(
        surface,
        `${basePointer}/title`,
        stringProp(config, 'title'),
        'structured-panel',
      );
      if (!panelTitle) continue;
      for (const blockTitle of blockTitles) {
        if (panelTitle.normalizedTitle !== blockTitle.normalizedTitle) continue;
        diagnostics.push(...duplicateTitleDiagnostics(
          [panelTitle, blockTitle],
          {
            kind: 'structured-panel-parent-child',
            label: `${panelLabel} title hierarchy`,
          },
        ));
      }
    }
  }

  return diagnostics;
}

/**
 * Warn about duplicate visible titles only where the loaded graph proves a
 * shared display scope.
 *
 * This pass intentionally omits Theme pages and Definition-generated pages.
 * Determining whether those pages are active requires the layout planner's
 * Component > Theme > Definition selection, region resolution, and renderer
 * platform choice. AppGraph has no layout dependency, and comparing their raw
 * declarations would report inactive fallback titles. Top-level Component
 * Sections remain covered by the sibling rule because Component pages have
 * highest precedence and their authored headings share one tree.
 */
export function validateUxTitleDuplicates(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  return [
    ...handlesByKind(context.handles, 'surface').flatMap((surface) => [
      ...navigationDiagnostics(surface),
      ...routeSlotRepetitionDiagnostics(surface),
    ]),
    ...handlesByKind(context.handles, 'experience')
      .flatMap(experienceTaskDiagnostics),
    ...handlesByKind(context.handles, 'component')
      .flatMap(componentDiagnostics),
    ...structuredPanelDiagnostics(context),
  ];
}
