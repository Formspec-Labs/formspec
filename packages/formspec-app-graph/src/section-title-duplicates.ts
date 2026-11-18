/** @filedesc Duplicate visible titles in a resolved workspace or Wizard plan. */
import { createDefinitionLocaleLookup } from '@formspec-org/engine/static-presentation';
import { fillUiParams, findAuthoredPageSection, resolveSectionTitlePlan, UI_STRINGS, type ChromeStringKey, type ThemeDocument } from '@formspec-org/layout';
import { Path, targetDefinitionMatches, type ComponentDocument, type FormDefinition, type LocaleDocument } from '@formspec-org/types';
import { collectComponentRouteClaims } from './component-routes.js';
import { diagnosticSourceForHandle } from './report.js';
import { handlesByKind, record, recordArray, stringProp } from './surface-widgets.js';
import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';
import { ROUTE_CLASS_THEME_AUTHORITY } from './ui-graph-policy.js';

export const SECTION_TITLE_DUPLICATE_CODE = 'APP-GRAPH-SECTION-TITLE-DUPLICATE';

export function normalizeUxTitle(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

interface Presentation {
  component?: ResolvedArtifactHandle;
  theme?: ResolvedArtifactHandle;
  source?: { handle: ResolvedArtifactHandle; pointer: string };
}

function presentations(
  context: AppGraphContext,
  definition: FormDefinition,
  surfaces: ResolvedArtifactHandle[],
  claims: ReturnType<typeof collectComponentRouteClaims>['claims'],
): Presentation[] {
  const components = handlesByKind(context.handles, 'component').filter(handle => {
    const document = handle.document as ComponentDocument | undefined;
    return document?.tree && targetDefinitionMatches(document.targetDefinition, definition);
  });
  const themes = handlesByKind(context.handles, 'theme');
  const declaredTheme = record(record(context.manifest.document)?.theme);
  const bundleTheme = declaredTheme && themes.find(handle =>
    handle.ref?.url === declaredTheme.url && handle.ref?.version === declaredTheme.version);
  const mounted = surfaces.flatMap(surface => {
    const routes = recordArray(record(surface.document)?.routes);
    const surfaceUrl = surface.ref?.url ?? stringProp(record(surface.document), 'url');
    const surfaceVersion = surface.ref?.version ?? stringProp(record(surface.document), 'version');
    const seen = new Set<string>();
    function flattenRoute(routeIndex: number, theme: ResolvedArtifactHandle | undefined): Presentation[] {
      const key = `${routeIndex}:${!!theme}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const route = routes[routeIndex];
      return recordArray(route.slots).flatMap((slot, slotIndex): Presentation[] => {
        const binding = record(slot.binding);
        if (slot.slotType === 'embed-route') {
          const targets = routes.flatMap((candidate, index) => candidate.id === binding?.routeRef ? [index] : []);
          return targets.length === 1 ? flattenRoute(targets[0], theme) : [];
        }
        if (slot.slotType !== 'definition-form' || binding?.definitionRef !== definition.url) return [];
        const claim = claims.find(({ target }) => target.surface?.url === surfaceUrl
          && (target.surface?.version === undefined || target.surface.version === surfaceVersion)
          && target.route === route.id && target.slot === slot.id && target.role === 'slot');
        return [{
          component: claim && components.includes(claim.component) ? claim.component : undefined,
          theme,
          source: { handle: surface, pointer: `/routes/${routeIndex}/slots/${slotIndex}` },
        }];
      });
    }
    return routes.flatMap((route, index) => {
      const routeClass = stringProp(route, 'routeClass') as keyof typeof ROUTE_CLASS_THEME_AUTHORITY | undefined;
      return flattenRoute(index, routeClass && ROUTE_CLASS_THEME_AUTHORITY[routeClass] === 'admits' ? bundleTheme : undefined);
    });
  });
  if (mounted.length) return mounted;
  const standaloneThemes = themes.filter(handle => {
    const target = (handle.document as ThemeDocument | undefined)?.targetDefinition;
    return target && targetDefinitionMatches(target, definition);
  });
  const theme = standaloneThemes.length === 1 ? standaloneThemes[0] : undefined;
  const standalone = components.filter(handle => !recordArray(record(handle.document)?.targetSurfaceRoutes).length);
  return standalone.length ? standalone.map(component => ({ component, theme })) : [{ theme }];
}

type TitleEntry = ReturnType<typeof resolveSectionTitlePlan>[number];

function staticTemplateText(template: string): string | undefined {
  // Locale §3.3.1 consumes four opening braces as literal text.
  const parts = template.split('{{{{');
  return parts.some(part => part.includes('{{')) ? undefined : parts.join('{{');
}

function staticTitle(section: TitleEntry, lookup: (key: string) => string | null): string | undefined {
  const { titleLocaleKey, titleBind, title, titleIndex } = section;
  const localized = titleLocaleKey && lookup(titleLocaleKey);
  if (titleLocaleKey?.startsWith('$ui.')) return localized ?? UI_STRINGS[titleLocaleKey.slice(4) as ChromeStringKey];
  if (localized) return staticTemplateText(localized);
  if (titleLocaleKey && title) return title;
  const itemKey = titleBind && Path.parse(titleBind).splitNormalized().at(-1);
  const label = (itemKey && lookup(`${itemKey}.label`)) || title;
  if (label) return titleBind ? staticTemplateText(label) : label;
  return fillUiParams(lookup('$ui.wizard.stepTitle') ?? UI_STRINGS['wizard.stepTitle'], { index: titleIndex });
}

export function validateSectionTitleDuplicates(context: AppGraphContext) {
  const diagnostics: AppGraphDiagnostic[] = [];
  const plannedComponents = new Map<ResolvedArtifactHandle, Set<string | undefined>>();
  const locales = handlesByKind(context.handles, 'locale').flatMap(handle => {
    const document = handle.document as LocaleDocument | undefined;
    return document?.target && document.strings && typeof document.locale === 'string' ? [document] : [];
  });
  const surfaces = handlesByKind(context.handles, 'surface');
  const claims = surfaces.length ? collectComponentRouteClaims(context).claims : [];
  for (const handle of handlesByKind(context.handles, 'definition')) {
    const definition = handle.document as FormDefinition | undefined;
    if (!definition?.url || !Array.isArray(definition.items)) continue;
    const localization = createDefinitionLocaleLookup(definition, locales);
    for (const presentation of presentations(context, definition, surfaces, claims)) {
      const component = presentation.component?.document as ComponentDocument | undefined;
      const theme = presentation.theme?.document as ThemeDocument | undefined;
      const breakpoints = Object.keys(component?.breakpoints ?? {});
      const reported = new Set<string>();
      for (const activeBreakpoint of [null, ...breakpoints]) {
        const plan = resolveSectionTitlePlan(definition, { component, theme, context: { activeBreakpoint } });
        if (presentation.component) {
          const ids = plannedComponents.get(presentation.component) ?? new Set();
          for (const section of plan) {
            const authored = 'nodes' in section ? findAuthoredPageSection(section) : section.authoredSection;
            if (authored) ids.add(section.id);
          }
          plannedComponents.set(presentation.component, ids);
        }
        for (const locale of [null, ...localization.locales]) {
          const firstByTitle = new Map<string, { id: string; index: number }>();
          plan.forEach((section, index) => {
            const title = staticTitle(section, key => locale === null ? null : localization.lookup(locale, key));
            if (title === undefined) return;
            const normalizedTitle = normalizeUxTitle(title);
            if (!normalizedTitle) return;
            const id = section.id ?? `[step ${index + 1}]`;
            const first = firstByTitle.get(normalizedTitle);
            if (!first) {
              firstByTitle.set(normalizedTitle, { id, index });
              return;
            }
            const key = JSON.stringify([locale, normalizedTitle, first.index, index]);
            if (reported.has(key)) return;
            reported.add(key);
            const source = presentation.source ?? (presentation.component
              ? { handle: presentation.component, pointer: '/tree' }
              : presentation.theme ? { handle: presentation.theme, pointer: '/pages' } : { handle, pointer: '/items' });
            const localeName = locale === null ? 'the original wording' : `Locale '${locale}'`;
            diagnostics.push({
              code: SECTION_TITLE_DUPLICATE_CODE,
              severity: 'error',
              phase: 'cross-artifact',
              origin: 'app-graph-validator',
              message: `Sections '${first.id}' and '${id}' share the title '${normalizedTitle}' in ${localeName}.`,
              primarySource: diagnosticSourceForHandle(source.handle, source.pointer),
              details: { firstSectionId: first.id, duplicateSectionId: id, locale, normalizedTitle, activeBreakpoint },
            });
          });
        }
      }
    }
  }
  return { diagnostics, plannedComponents };
}
