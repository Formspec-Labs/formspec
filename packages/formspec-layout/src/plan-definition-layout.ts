/** @filedesc Shared Definition layout root planning used by renderers and Surface slot-supply planning. */

import { Path, type ComponentDocument, type FormDefinition } from '@formspec-org/types';
import { mergeFormPresentationForPlanning } from './form-presentation.js';
import {
    ensureActionButton,
    ensureValidationSummary,
    planContains,
    preparePlanContext,
} from './node-utils.js';
import { planPageMode, type WorkspacePage } from './plan-page-mode.js';
import { buildPlatformTheme, mergePlatformAndTenantTheme } from './platform-defaults.js';
import { planComponentTree } from './planner-component-tree.js';
import { planDefinitionFallback } from './planner-definition-fallback.js';
import type { ThemeDocument } from './theme-resolver.js';
import type {
    ComponentGraphProjectionContext,
    ComponentTreeNode,
    FormItem,
    LayoutHostEvidence,
    LayoutNode,
} from './types.js';

const defaultPlatformTheme = buildPlatformTheme();

function findDefinitionItemByKey(items: readonly FormItem[], key: string): FormItem | null {
    const segments = Path.parse(key).splitNormalized();
    let current: readonly FormItem[] = items;
    for (let i = 0; i < segments.length; i++) {
        const found = current.find((item) => item.key === segments[i]);
        if (!found) return null;
        if (i === segments.length - 1) return found;
        current = Array.isArray(found.children) ? found.children : [];
    }
    return null;
}

export interface PlanDefinitionLayoutOptions {
    definition: FormDefinition;
    componentDocument?: (ComponentDocument & { formPresentation?: Record<string, unknown> }) | null | undefined;
    themeDocument?: ThemeDocument | null | undefined;
    activeBreakpoint?: string | null | undefined;
    componentGraph?: ComponentGraphProjectionContext | null | undefined;
    hostEvidence?: LayoutHostEvidence | null | undefined;
    autoPlacedActionRefs?: readonly string[] | undefined;
    autoPlaceControls?: 'always' | 'when-unauthored' | 'never' | undefined;
    showValidationSummary?: boolean | undefined;
}

export interface PlannedDefinitionLayout {
    root: LayoutNode;
    workspace?: WorkspacePage[] | undefined;
    effectiveTheme: ThemeDocument;
    formPresentation?: Record<string, unknown> | undefined;
}

/**
 * Compute the effective LayoutNode tree for a FormDefinition using the exact
 * cascade shared by React rendering and Surface transition-supply planning:
 * platform + granted Theme merge, merged formPresentation, responsive breakpoint,
 * pageMode / Component tree / Definition fallback, and auto-placed ActionButtons.
 */
export function planDefinitionLayout(options: PlanDefinitionLayoutOptions): PlannedDefinitionLayout {
    const {
        definition,
        componentDocument,
        themeDocument,
        activeBreakpoint = null,
        componentGraph,
        hostEvidence,
        autoPlacedActionRefs = [],
        autoPlaceControls = 'never',
        showValidationSummary = false,
    } = options;

    const effectiveTheme = themeDocument
        ? mergePlatformAndTenantTheme(defaultPlatformTheme, themeDocument)
        : mergePlatformAndTenantTheme(defaultPlatformTheme);

    const items = (definition.items ?? []) as FormItem[];
    const formPresentation = mergeFormPresentationForPlanning(
        definition.formPresentation as Record<string, unknown> | undefined,
        componentDocument?.formPresentation,
    );
    const pageMode = formPresentation?.pageMode;

    const planCtx = preparePlanContext({
        items,
        ...(formPresentation !== undefined ? { formPresentation } : {}),
        ...(componentDocument ? { componentDocument: componentDocument as never } : {}),
        ...(componentGraph ? { componentGraph } : {}),
        ...(hostEvidence ? { hostEvidence } : {}),
        theme: effectiveTheme,
        activeBreakpoint,
        findItem: (key: string) => findDefinitionItemByKey(items, key),
    });

    const paged = pageMode === 'wizard' || pageMode === 'tabs' || pageMode === 'workspace'
        ? planPageMode(definition, planCtx, pageMode)
        : undefined;

    let root: LayoutNode;
    if (paged) {
        root = paged.root;
    } else if (componentDocument?.tree) {
        root = planComponentTree(componentDocument.tree as ComponentTreeNode, planCtx);
    } else {
        root = {
            id: 'root',
            component: 'Stack',
            category: 'layout',
            props: {},
            cssClasses: [],
            children: planDefinitionFallback(items, planCtx),
        };
    }

    const shouldInjectControls =
        autoPlaceControls === 'always'
        || (autoPlaceControls === 'when-unauthored' && !planContains(root, 'ActionButton'));

    if (shouldInjectControls) {
        for (const actionRef of autoPlacedActionRefs) {
            ensureActionButton(root, planCtx.nextId, {
                ...(root.pageMode !== undefined ? { pageMode: root.pageMode } : {}),
                actionRef,
            });
        }
    }

    if (showValidationSummary) {
        ensureValidationSummary(root, planCtx.nextId);
    }

    return {
        root,
        workspace: paged?.workspace,
        effectiveTheme,
        formPresentation,
    };
}
