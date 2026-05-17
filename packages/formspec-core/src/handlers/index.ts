/** @filedesc Aggregates all built-in command handlers into a single registry. */
import type { CommandHandler } from '../types.js';
import type { ProjectCommandMap } from '../project-commands.js';

import { definitionMetadataHandlers } from './definition-metadata.js';
import { definitionItemsHandlers } from './definition-items.js';
import { definitionBindsHandlers } from './definition-binds.js';
import { definitionShapesHandlers } from './definition-shapes.js';
import { definitionVariablesHandlers } from './definition-variables.js';
import { definitionPagesHandlers } from './definition-pages.js';
import { definitionOptionsetsHandlers } from './definition-optionsets.js';
import { definitionInstancesHandlers } from './definition-instances.js';
import { screenerHandlers } from './screener.js';
import { definitionMigrationsHandlers } from './definition-migrations.js';
import { componentTreeHandlers } from './component-tree.js';
import { componentPropertiesHandlers } from './component-properties.js';
import { themeHandlers } from './theme.js';
import { mappingHandlers } from './mapping.js';
import { localeHandlers } from './locale.js';
import { projectHandlers } from './project.js';

export type { CommandHandler };

export const builtinHandlers = Object.freeze({
  ...definitionMetadataHandlers,
  ...definitionItemsHandlers,
  ...definitionBindsHandlers,
  ...definitionShapesHandlers,
  ...definitionVariablesHandlers,
  ...definitionPagesHandlers,
  ...definitionOptionsetsHandlers,
  ...definitionInstancesHandlers,
  ...screenerHandlers,
  ...definitionMigrationsHandlers,
  ...componentTreeHandlers,
  ...componentPropertiesHandlers,
  ...themeHandlers,
  ...mappingHandlers,
  ...localeHandlers,
  ...projectHandlers,
});

// Compile-time sync: handler keys must match ProjectCommandMap exactly.
type _AssertHandlerCommandSync =
  keyof typeof builtinHandlers extends keyof ProjectCommandMap
    ? keyof ProjectCommandMap extends keyof typeof builtinHandlers
      ? true
      : 'ERROR: ProjectCommandMap has commands missing from builtinHandlers'
    : 'ERROR: builtinHandlers has commands missing from ProjectCommandMap';
declare const _handlerCommandSync: _AssertHandlerCommandSync;
