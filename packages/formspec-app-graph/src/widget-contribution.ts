/** @filedesc Shared Registry identity lookup for Surface module widgets. */

export interface WidgetContributionIdentity {
  moduleId: string;
  /** Surface vocabulary: `widgetShape.widgetName`, not a contribution id. */
  widgetName: string;
}

/**
 * The smallest Registry entry shape needed to resolve a widget contribution.
 *
 * Callers may supply generated Registry entries or ModuleResolver-normalized
 * entries. The helper deliberately knows nothing about renderer components.
 */
export interface WidgetContributionEntry {
  name: string;
  category: string;
  contributes?: readonly string[];
  widgetShape?: unknown;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function own<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Resolve one Surface widget name through the named module's `contributes[]`.
 *
 * Module scoping is part of the identity. A widget entry with the same
 * `widgetShape.widgetName` cannot satisfy a different module, and a Registry
 * contribution id cannot stand in for the Surface widget name unless the two
 * strings genuinely coincide.
 */
export function resolveWidgetContribution<
  TEntry extends WidgetContributionEntry,
>(
  identity: WidgetContributionIdentity,
  entries: readonly TEntry[],
): TEntry | undefined {
  const matches = new Set<TEntry>();
  const matchingModules = new Set<TEntry>();
  for (const moduleEntry of entries) {
    if (!own(moduleEntry, 'name') || !own(moduleEntry, 'category')) continue;
    if (moduleEntry.name !== identity.moduleId || moduleEntry.category !== 'module') continue;
    matchingModules.add(moduleEntry);
    const contributes = own(moduleEntry, 'contributes') ? moduleEntry.contributes : undefined;
    for (const contributionName of contributes ?? []) {
      for (const contribution of entries) {
        if (
          !own(contribution, 'name')
          || !own(contribution, 'category')
          || !own(contribution, 'widgetShape')
        ) continue;
        if (contribution.name !== contributionName || contribution.category !== 'widget') continue;
        const widgetName = record(contribution.widgetShape)?.widgetName;
        if (
          widgetName === identity.widgetName
          && own(record(contribution.widgetShape) ?? {}, 'widgetName')
        ) {
          matches.add(contribution);
        }
      }
    }
  }
  return matchingModules.size === 1 && matches.size === 1
    ? [...matches][0]
    : undefined;
}
