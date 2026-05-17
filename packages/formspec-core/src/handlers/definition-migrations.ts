/**
 * Migration command handlers for Formspec Core.
 *
 * Migrations declare how to transform responses collected under a prior definition
 * version into the current version's structure. This enables backwards compatibility
 * when form definitions evolve: fields may be renamed, removed, split, merged, or
 * have their values recomputed.
 *
 * The schema models migrations as `{ from: { [version]: MigrationDescriptor } }` --
 * a keyed map where the version string is the key. Each descriptor contains an
 * ordered `fieldMap` array of transform rules plus optional `defaults` for new fields.
 *
 * None of these commands affect the component tree, so all handlers return
 * `{ rebuildComponentTree: false }`.
 *
 * @module definition-migrations
 */
import type { CommandHandler } from '../types.js';
import type { MigrationDescriptor } from '@formspec-org/types';

/**
 * Locate a migration descriptor by its source version key.
 *
 * @param state - The current project state containing the definition.
 * @param fromVersion - The source version string (key in `migrations.from`).
 * @returns The matching migration descriptor.
 * @throws {Error} If no migration exists for the given version.
 */
function findMigration(state: { definition: { migrations?: { from?: Record<string, MigrationDescriptor> } } }, fromVersion: string): MigrationDescriptor {
  const descriptor = state.definition.migrations?.from?.[fromVersion];
  if (!descriptor) throw new Error(`Migration not found for version: ${fromVersion}`);
  return descriptor;
}

export const definitionMigrationsHandlers = {

  'definition.addMigration': (state, payload) => {
    const p = payload as { fromVersion: string; description?: string };

    if (!state.definition.migrations) {
      state.definition.migrations = {};
    }
    if (!state.definition.migrations.from) {
      state.definition.migrations.from = {};
    }

    const descriptor: MigrationDescriptor = { fieldMap: [] };
    if (p.description) descriptor.description = p.description;

    state.definition.migrations.from[p.fromVersion] = descriptor;
    return { rebuildComponentTree: false };
  },

  'definition.deleteMigration': (state, payload) => {
    const { fromVersion } = payload as { fromVersion: string };
    if (!state.definition.migrations?.from) return { rebuildComponentTree: false };

    delete state.definition.migrations.from[fromVersion];
    return { rebuildComponentTree: false };
  },

  'definition.setMigrationProperty': (state, payload) => {
    const { fromVersion, property, value } = payload as {
      fromVersion: string; property: string; value: unknown;
    };
    const descriptor = findMigration(state, fromVersion);
    (descriptor as Record<string, unknown>)[property] = value;
    return { rebuildComponentTree: false };
  },

  'definition.addFieldMapRule': (state, payload) => {
    const p = payload as {
      fromVersion: string; source: string; target: string | null;
      transform: string; expression?: string; insertIndex?: number;
    };
    const descriptor = findMigration(state, p.fromVersion);

    if (!descriptor.fieldMap) descriptor.fieldMap = [];

    const rule: any = { source: p.source, target: p.target, transform: p.transform };
    if (p.expression) rule.expression = p.expression;

    if (p.insertIndex !== undefined) {
      descriptor.fieldMap.splice(p.insertIndex, 0, rule);
    } else {
      descriptor.fieldMap.push(rule);
    }

    return { rebuildComponentTree: false };
  },

  'definition.setFieldMapRule': (state, payload) => {
    const { fromVersion, index, property, value } = payload as {
      fromVersion: string; index: number; property: string; value: unknown;
    };
    const descriptor = findMigration(state, fromVersion);
    const rule = descriptor.fieldMap?.[index];
    if (!rule) throw new Error(`Rule not found at index: ${index}`);

    (rule as Record<string, unknown>)[property] = value;
    return { rebuildComponentTree: false };
  },

  'definition.deleteFieldMapRule': (state, payload) => {
    const { fromVersion, index } = payload as { fromVersion: string; index: number };
    const descriptor = findMigration(state, fromVersion);

    descriptor.fieldMap?.splice(index, 1);
    return { rebuildComponentTree: false };
  },

  'definition.setMigrationDefaults': (state, payload) => {
    const { fromVersion, defaults } = payload as { fromVersion: string; defaults: Record<string, unknown> };
    const descriptor = findMigration(state, fromVersion);

    (descriptor as Record<string, unknown>).defaults = defaults;
    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
