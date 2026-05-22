/** @filedesc Layout planner barrel — re-exports split planner modules. */

export {
    planComponentTree,
    findNodeByBindPath,
} from './planner-component-tree.js';

export {
    planDefinitionFallback,
    planDefinitionItem,
    findItemAtPath,
    findItemPathByKey,
} from './planner-definition-fallback.js';

export {
    buildThemePageNodes,
    collectAssignedTopLevelKeys,
    withoutThemePages,
    wrapRegionNode,
} from './planner-theme-pages.js';

export {
    applyDefinitionPageMode,
    applyGeneratedPageMode,
    buildDefinitionPages,
    emitPageModePages,
    isStudioGeneratedComponentDoc,
    stripTitleFromGroupNode,
} from './planner-page-mode.js';

export {
    classifyComponent,
    createNodeIdGenerator,
    ensureActionButton,
    extractProps,
    normalizeCssClass,
    planContains,
    preparePlanContext,
    resolveCssClasses,
    resolveStyleTokens,
    resolveTokenInContext,
} from './node-utils.js';

export type { NodeIdGenerator } from './types.js';
