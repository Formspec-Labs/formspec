/**
 * @filedesc The module-widget runtime seam: `{moduleId, widgetName}` → a component.
 *
 * ## What the platform already had, and what it did not
 *
 * The Registry declares a widget's name, version, status, `childrenPolicy` and
 * `tokenSlots`; the ModuleResolver admits it; lint E603 checks the module is
 * declared; the UI Graph Policy validator reasons about its theming. All of that
 * is admission. **Nothing delivered.** A module could declare a widget it had no
 * way to ship (gap ledger `module-widget-runtime`).
 *
 * This module is the delivery channel: a host registers {@link WidgetModule}s,
 * and a `module-widget` binding resolves through the same identity the Registry
 * already uses. It is generic over the component type so the renderer-independent
 * core owns the lookup and each renderer binding owns only its component shape —
 * the same split `formspec-react` and `formspec-webcomponent` already have.
 *
 * ## Three fields called `widgetName`, and only one of them is this one
 *
 * ADR 0160 §2.4 (with the residual named in §8.1). Conflating these is the
 * defect the ADR spent a section not closing, so it is worth the four lines:
 *
 * | Field | Vocabulary | Pattern |
 * |---|---|---|
 * | `RegistryEntry.name` | globally unique contribution id | `^x-[a-z][a-z0-9]*(-…)*$` |
 * | `RegistryEntry.widgetShape.widgetName` | the module's own widget name | **none** — often PascalCase |
 * | Theme `widget` (`common.schema.json` `CustomWidgetName`) | a third | `^x-[A-Za-z0-9][A-Za-z0-9_.-]*$` |
 *
 * A Surface `module-widget` binding's `widgetName` is the **second** — the
 * schema documents it as "matches `widgetShape.widgetName`" and carries no
 * pattern. So {@link createWidgetRegistry} keys its lookup on
 * `widgetShape.widgetName` within the module's `contributes[]`, exactly like
 * `widgetContributionNameFor` in `@formspec-org/app-graph`'s module resolver,
 * and reports the contribution id separately. A registry keyed on
 * `RegistryEntry.name` would resolve nothing the day a module uses a
 * PascalCase widget name — which the schema explicitly permits.
 *
 * The app-graph twin is module-private and shaped for the resolver's input
 * types, so this is a second implementation of the same walk rather than a
 * reuse. That is a reach gap, not a semantic difference; the two are pinned to
 * each other by this comment and by
 * `tests/widget-registry.test.ts`'s PascalCase case.
 */
import type { RegistryDocument, RegistryEntry } from '@formspec-org/types';
import { surfaceDiagnostic, type SurfaceDiagnostic, type SurfaceDiagnosticSite } from './diagnostics.js';

export interface WidgetKey {
  moduleId: string;
  /** Matches `widgetShape.widgetName`. NOT the contribution id. */
  widgetName: string;
}

/**
 * A module's runtime contribution: the components behind the widgets its
 * Registry entry declares.
 *
 * Keys are `widgetShape.widgetName` values. A module whose Registry entry
 * declares a widget it does not key here resolves as `unimplemented` — which is
 * the honest report of "declared but not shipped", and the state the whole
 * stack was in before this seam existed.
 */
export interface WidgetModule<TComponent> {
  moduleId: string;
  widgets: Readonly<Record<string, TComponent>>;
}

/**
 * Two independent axes, never collapsed into one: **declared** is whether a
 * Registry in the bundle says the widget exists, **implemented** is whether the
 * host supplied a component for it. `undeclared` is an authoring defect and
 * `unimplemented` is a deployment defect; collapsing them loses the only
 * information that says who fixes it.
 *
 * The cross case — a host component for a widget the bundle never declared —
 * renders (`status: 'resolved'`) and carries `declared: false`, which is what
 * `WIDGET-UNDECLARED` reports on. A host that registers a component the bundle
 * never declared is rendering something outside the signed graph; suppressing
 * the diagnostic because the pixels happened to work makes host-supplied
 * content indistinguishable from bundle-declared content, which is the one
 * distinction a signed bundle exists to make (surface-shell-spec §3.3). A shell
 * MAY render it; it MUST say it did.
 */
export type WidgetResolution<TComponent> =
  | {
      status: 'resolved';
      /** False when the component came from the host and no Registry declares it. */
      declared: boolean;
      component: TComponent;
      /** `RegistryEntry.name` — present when the bundle declares the widget. */
      contributionName?: string;
      entry?: RegistryEntry;
    }
  | {
      /** The bundle declares it; no registered module supplies a component. */
      status: 'unimplemented';
      contributionName?: string;
      entry?: RegistryEntry;
    }
  | {
      /** No Registry in the bundle declares it, and nothing implements it. */
      status: 'undeclared';
    };

export interface WidgetRegistry<TComponent> {
  resolve(key: WidgetKey): WidgetResolution<TComponent>;
  /** Diagnostic for an unresolved binding, so a caller does not phrase its own. */
  diagnose(key: WidgetKey, resolution: WidgetResolution<TComponent>, site: SurfaceDiagnosticSite): SurfaceDiagnostic | undefined;
  readonly moduleIds: readonly string[];
}

export interface WidgetRegistryInput<TComponent> {
  modules?: readonly WidgetModule<TComponent>[];
  /** Flattened Registry entries — see {@link flattenRegistryEntries}. */
  registryEntries?: readonly RegistryEntry[];
}

function widgetShapeName(entry: RegistryEntry): string | undefined {
  const shape = (entry as { widgetShape?: { widgetName?: unknown } }).widgetShape;
  return typeof shape?.widgetName === 'string' ? shape.widgetName : undefined;
}

function contributionNames(entry: RegistryEntry): readonly string[] {
  const contributes = (entry as { contributes?: unknown }).contributes;
  return Array.isArray(contributes) ? contributes.filter((name): name is string => typeof name === 'string') : [];
}

/**
 * The Registry entry whose `widgetShape.widgetName` matches, reached through the
 * declaring module's `contributes[]` rather than by scanning every widget entry.
 * Going through the module is what makes two modules able to publish the same
 * `widgetName` without colliding.
 */
export function widgetContributionFor(
  key: WidgetKey,
  entries: readonly RegistryEntry[],
): RegistryEntry | undefined {
  const moduleEntry = entries.find(
    (entry) => entry.name === key.moduleId && entry.category === 'module',
  );
  if (!moduleEntry) return undefined;
  for (const contributionName of contributionNames(moduleEntry)) {
    const contribution = entries.find((entry) => entry.name === contributionName);
    if (!contribution || contribution.category !== 'widget') continue;
    if (widgetShapeName(contribution) === key.widgetName) return contribution;
  }
  return undefined;
}

export function createWidgetRegistry<TComponent>(
  input: WidgetRegistryInput<TComponent> = {},
): WidgetRegistry<TComponent> {
  const modules = new Map((input.modules ?? []).map((module) => [module.moduleId, module]));
  const entries = input.registryEntries ?? [];

  return {
    moduleIds: [...modules.keys()],

    resolve(key: WidgetKey): WidgetResolution<TComponent> {
      const entry = widgetContributionFor(key, entries);
      const component = modules.get(key.moduleId)?.widgets[key.widgetName];

      if (component !== undefined) {
        return entry === undefined
          ? { status: 'resolved', declared: false, component }
          : { status: 'resolved', declared: true, component, contributionName: entry.name, entry };
      }
      if (entry !== undefined) {
        return { status: 'unimplemented', contributionName: entry.name, entry };
      }
      return { status: 'undeclared' };
    },

    diagnose(key, resolution, site) {
      if (resolution.status === 'resolved') {
        if (resolution.declared) return undefined;
        // It renders, and the shell says it did. Declaration, not delivery.
        return surfaceDiagnostic(
          'WIDGET-UNDECLARED',
          `Nothing in this bundle declares a widget "${key.widgetName}" on module "${key.moduleId}". A component the host registered is rendering in its place, so what is on the page is not what the release describes.`,
          site,
          { moduleId: key.moduleId, widgetName: key.widgetName, hostComponentRendered: true },
        );
      }
      if (resolution.status === 'unimplemented') {
        return surfaceDiagnostic(
          'WIDGET-UNIMPLEMENTED',
          `Module "${key.moduleId}" declares widget "${key.widgetName}" and no registered module supplies a component for it.`,
          site,
          { moduleId: key.moduleId, widgetName: key.widgetName, contributionName: resolution.contributionName },
        );
      }
      return surfaceDiagnostic(
        'WIDGET-UNDECLARED',
        `Nothing in this bundle declares a widget "${key.widgetName}" on module "${key.moduleId}", and nothing the host registered supplies one.`,
        site,
        { moduleId: key.moduleId, widgetName: key.widgetName, hostComponentRendered: false },
      );
    },
  };
}

export interface FlattenedRegistryEntries {
  entries: readonly RegistryEntry[];
  diagnostics: readonly SurfaceDiagnostic[];
}

/**
 * Registry documents → the flat entry list renderers take as a prop.
 *
 * The manifest admits an ARRAY of registries and the renderer prop is one flat
 * list, so two registries declaring the same `name` collapse. The spike's
 * `flatMap` kept both and let the renderer take whichever it found first — a
 * silent winner (gap ledger `registry-entries-wiring`).
 *
 * The rule stated here: **first declaration in manifest-then-author order wins,
 * and every later declaration of the same name raises
 * `REGISTRY-ENTRY-NAME-COLLISION`.** Manifest order is the only ordering the
 * bundle states, so precedence follows it; the diagnostic is what makes the
 * choice reviewable rather than accidental. Nothing in the spec, schema or
 * validator states a precedence rule — when one lands, this is the single site
 * that changes.
 */
export function flattenRegistryEntries(
  registries: readonly RegistryDocument[],
): FlattenedRegistryEntries {
  const entries: RegistryEntry[] = [];
  const byName = new Map<string, number>();
  const diagnostics: SurfaceDiagnostic[] = [];

  registries.forEach((registry, registryIndex) => {
    for (const entry of registry.entries ?? []) {
      const firstAt = byName.get(entry.name);
      if (firstAt !== undefined) {
        diagnostics.push(
          surfaceDiagnostic(
            'REGISTRY-ENTRY-NAME-COLLISION',
            `Registry entry "${entry.name}" is declared by more than one Registry document. The first declaration wins; this one is ignored.`,
            { source: `registries[${registryIndex}]` },
            { name: entry.name, winningRegistryIndex: firstAt, ignoredRegistryIndex: registryIndex },
          ),
        );
        continue;
      }
      byName.set(entry.name, registryIndex);
      entries.push(entry);
    }
  });

  return { entries, diagnostics };
}
