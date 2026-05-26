/** @filedesc Component-document tree planner: slots, repeats, custom components, theme pages. */

import { mergeBreakpointNamespace } from '@formspec-org/types';
import type { ItemDescriptor, Tier1Hints } from './theme-resolver.js';
import { resolvePresentation, resolveWidget } from './theme-resolver.js';
import { resolveResponsiveProps } from './responsive.js';
import { interpolateParams } from './params.js';
import type { ComponentTreeNode, FormItem, LayoutHostEvidence, LayoutNode, PlanContext } from './types.js';
import {
    classifyComponent,
    extractProps,
    gridPlacementStyleFromLayout,
    normalizeCssClass,
    preparePlanContext,
    resolveCssClasses,
    resolveGridTracks,
    resolveStyleTokens,
    resolveTokenInContext,
} from './node-utils.js';
import { planDefinitionItem } from './planner-definition-fallback.js';
import {
    componentTreeOwnsPages,
    findComponentNodeByPath,
    findNodeByBindPath,
} from './planner-path-utils.js';
import { applyGeneratedPageMode } from './planner-page-mode.js';
import {
    buildThemePageNodes,
    collectAssignedTopLevelKeys,
    withoutThemePages,
} from './planner-theme-pages.js';

const UI_GRAPH_POLICY_SCHEMA_ID = 'https://formspec.org/schemas/uiGraphPolicy/0.1';

export function planComponentTree(
    tree: ComponentTreeNode,
    ctx: PlanContext,
    prefix = '',
    customComponentStack?: Set<string>,
    applyThemePages = prefix === '',
    graphPathSegments: readonly string[] | null = [],
): LayoutNode {
    const planCtx = preparePlanContext(ctx);
    if (!customComponentStack) customComponentStack = new Set();

    if (applyThemePages && !prefix && planCtx.theme?.pages?.length && !componentTreeOwnsPages(tree)) {
        const themed = planThemePagesFromComponentTree(tree, planCtx, customComponentStack);
        if (themed) {
            return finalizeRouteProjectionRoot(
                applyGeneratedPageMode(themed, themed.component, planCtx),
                planCtx,
                prefix,
                graphPathSegments,
            );
        }
    }

    const comp = resolveResponsiveProps(
        tree,
        planCtx.activeBreakpoint ?? null,
        mergeBreakpointNamespace(planCtx.theme?.breakpoints, planCtx.componentDocument?.breakpoints),
    ) as ComponentTreeNode;
    const componentType = comp.component;

    const customComponents = planCtx.componentDocument?.components;
    if (customComponents?.[componentType]) {
        if (customComponentStack.has(componentType)) {
            return {
                id: planCtx.nextId('err'),
                component: 'Text',
                category: 'display',
                props: { text: `[Recursive component: ${componentType}]` },
                cssClasses: [],
                children: [],
            };
        }

        const customDef = customComponents[componentType];
        const template = JSON.parse(JSON.stringify(customDef.tree)) as ComponentTreeNode;
        interpolateParams(template, (comp.params ?? comp) as Record<string, unknown>);

        customComponentStack.add(componentType);
        const result = planComponentTree(template, planCtx, prefix, customComponentStack, false, null);
        customComponentStack.delete(componentType);
        return finalizeRouteProjectionRoot(result, planCtx, prefix, graphPathSegments);
    }

    const bindKey = comp.bind as string | undefined;
    const fullBindPath = bindKey
        ? (prefix ? `${prefix}.${bindKey}` : bindKey)
        : undefined;

    const item = fullBindPath ? planCtx.findItem(fullBindPath) : null;
    const isRepeatGroup = item?.type === 'group' && (item as { repeatable?: boolean }).repeatable === true
        && componentType !== 'DataTable' && componentType !== 'Accordion';

    const props = extractProps(comp);

    if (componentType === 'TextInput' && item?.type === 'field' && (item as { dataType?: string }).dataType === 'text' && props.maxLines == null) {
        props.maxLines = 3;
    }

    for (const prop of ['gap', 'rowGap', 'padding', 'background', 'border', 'radius', 'elevation']) {
        if (props[prop] !== undefined) props[prop] = resolveTokenInContext(props[prop], planCtx);
    }
    if (props.columns !== undefined) {
        props.columns = resolveGridTracks(props.columns, planCtx);
    }

    const gridPlacementStyle = gridPlacementStyleFromLayout(comp.layout);
    const authoredStyle = resolveStyleTokens(comp.style as Record<string, string | number> | undefined, planCtx);

    const node: LayoutNode = {
        id: planCtx.nextId(componentType.toLowerCase()),
        component: componentType,
        category: classifyComponent(componentType),
        props,
        style: gridPlacementStyle || authoredStyle
            ? { ...(gridPlacementStyle ?? {}), ...(authoredStyle ?? {}) }
            : undefined,
        cssClasses: resolveCssClasses(comp as { cssClass?: string | string[] }, planCtx),
        children: [],
    };
    const nextGraphPathSegments = componentGraphPathSegments(comp, graphPathSegments);
    if (planCtx.componentGraph && nextGraphPathSegments) {
        const graphIdentity = componentGraphIdentityForNode(comp, planCtx, nextGraphPathSegments);
        if (graphIdentity) node.componentGraphIdentity = graphIdentity;
    }

    if (comp.accessibility && typeof comp.accessibility === 'object') {
        node.accessibility = { ...(comp.accessibility as LayoutNode['accessibility']) };
    }

    if (fullBindPath) {
        node.bindPath = fullBindPath;
    }

    if (item && item.type === 'field') {
        const fieldItem = item as FormItem & {
            dataType?: string;
            hint?: string;
            extensions?: Record<string, boolean>;
            presentation?: Record<string, unknown>;
        };
        node.fieldItem = {
            key: fieldItem.key ?? bindKey!,
            label: fieldItem.label ?? bindKey!,
            hint: fieldItem.hint,
            dataType: fieldItem.dataType,
            extensions: fieldItem.extensions,
        };

        const itemDesc: ItemDescriptor = {
            key: bindKey!,
            type: 'field',
            dataType: fieldItem.dataType as ItemDescriptor['dataType'],
        };
        const tier1: Tier1Hints = {
            formPresentation: planCtx.formPresentation,
            itemPresentation: fieldItem.presentation as Tier1Hints['itemPresentation'],
        };
        const presentation = resolvePresentation(planCtx.theme, itemDesc, tier1);
        node.presentation = presentation;
        node.labelPosition = presentation.labelPosition ?? 'top';

        const presClasses = normalizeCssClass(presentation.cssClass);
        if (presClasses.length > 0) {
            const union = new Set([...node.cssClasses, ...presClasses]);
            node.cssClasses = [...union];
        }
    }

    if (item && item.type === 'display') {
        if (props.text == null) {
            props.text = item.label ?? '';
        }
        delete props.bind;
    }

    if (comp.when) {
        node.when = comp.when as string;
        node.whenPrefix = prefix;
        if (comp.fallback) {
            node.fallback = comp.fallback as string;
        }
    }

    if (isRepeatGroup && fullBindPath) {
        node.repeatGroup = bindKey;
        node.repeatPath = fullBindPath;
        node.isRepeatTemplate = true;
    }

    const SELF_MANAGED_GROUP_COMPONENTS = new Set(['DataTable', 'Accordion']);
    if (fullBindPath && item?.type === 'group' && !SELF_MANAGED_GROUP_COMPONENTS.has(componentType)) {
        node.scopeChange = true;
    }

    const childPrefix = isRepeatGroup && fullBindPath
        ? `${fullBindPath}[0]`
        : (fullBindPath && item?.type === 'group' ? fullBindPath : prefix);

    if (Array.isArray(comp.children)) {
        for (const child of comp.children) {
            node.children.push(
                planComponentTree(child, planCtx, childPrefix, customComponentStack, false, nextGraphPathSegments),
            );
        }
    }

    if (applyThemePages) {
        return finalizeRouteProjectionRoot(
            applyGeneratedPageMode(node, componentType, planCtx),
            planCtx,
            prefix,
            graphPathSegments,
        );
    }

    return finalizeRouteProjectionRoot(node, planCtx, prefix, graphPathSegments);
}

function stringProp(value: Record<string, unknown>, key: string): string | undefined {
    const raw = value[key];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function componentNodePathSegment(node: ComponentTreeNode): string | undefined {
    return stringProp(node, 'nodeId') ?? stringProp(node, 'bind') ?? stringProp(node, 'id');
}

function componentGraphPathSegments(
    node: ComponentTreeNode,
    parentSegments: readonly string[] | null,
): readonly string[] | null {
    if (parentSegments === null) return null;
    const segment = componentNodePathSegment(node);
    return segment ? [...parentSegments, segment] : null;
}

function componentGraphIdentityForNode(
    node: ComponentTreeNode,
    ctx: PlanContext,
    pathSegments: readonly string[],
): LayoutNode['componentGraphIdentity'] | undefined {
    const scope = ctx.componentGraph;
    if (!scope || pathSegments.length === 0) return undefined;
    return {
        component: scope.component,
        surface: scope.surface,
        route: scope.route,
        nodePath: `/${pathSegments.join('/')}`,
        ...(stringProp(node, 'id') ? { id: stringProp(node, 'id') } : {}),
        ...(stringProp(node, 'nodeId') ? { nodeId: stringProp(node, 'nodeId') } : {}),
    };
}

function isRouteProjectionRoot(prefix: string, graphPathSegments: readonly string[] | null): boolean {
    return prefix === '' && graphPathSegments !== null && graphPathSegments.length === 0;
}

function finalizeRouteProjectionRoot(
    node: LayoutNode,
    ctx: PlanContext,
    prefix: string,
    graphPathSegments: readonly string[] | null,
): LayoutNode {
    return isRouteProjectionRoot(prefix, graphPathSegments)
        ? projectUiGraphRoutePolicy(node, ctx)
        : node;
}

function projectUiGraphRoutePolicy(node: LayoutNode, ctx: PlanContext): LayoutNode {
    const projection = uiGraphRoutePolicyProjection(ctx);
    if (projection) {
        node.uiGraphRoutePolicy = projection;
    }
    return node;
}

function uiGraphRoutePolicyProjection(ctx: PlanContext): LayoutNode['uiGraphRoutePolicy'] | undefined {
    const scope = ctx.componentGraph;
    const hostEvidence = ctx.hostEvidence;
    const evidence = hostEvidence?.uiGraphPolicies;
    const validatedPolicySources = validatedUiGraphPolicyEvidenceSources(hostEvidence?.appGraphReport);
    if (!scope || !Array.isArray(evidence) || evidence.length === 0 || validatedPolicySources.size === 0) {
        return undefined;
    }

    const matches: NonNullable<LayoutNode['uiGraphRoutePolicy']>[] = [];
    for (const [index, entry] of evidence.entries()) {
        if (!isUiGraphPolicyProjectionEvidenceLike(entry)) continue;
        const evidenceSlot = `hostEvidence.uiGraphPolicies[${index}]`;
        if (validatedPolicySources.get(evidenceSlot) !== entry.source) {
            continue;
        }
        if (entry.schemaId !== UI_GRAPH_POLICY_SCHEMA_ID) {
            continue;
        }
        const document = entry.document;
        if (!isUiGraphPolicyDocumentLike(document)) continue;
        if (!targetSurfaceMatches(document.targetSurface, scope.surface)) continue;

        for (const routePolicy of document.routePolicies) {
            if (!isUiGraphRoutePolicyLike(routePolicy)) continue;
            if (routePolicy.routeId !== scope.route) continue;
            matches.push({
                schemaId: entry.schemaId,
                source: entry.source,
                targetSurface: { ...document.targetSurface },
                routeId: routePolicy.routeId,
                ...(routePolicy.a11y ? { a11y: { ...routePolicy.a11y } } : {}),
                ...(routePolicy.responsive ? {
                    responsive: {
                        ...routePolicy.responsive,
                        ...(routePolicy.responsive.collapseOrder
                            ? { collapseOrder: [...routePolicy.responsive.collapseOrder] }
                            : {}),
                    },
                } : {}),
            });
        }
    }

    return matches.length === 1 ? matches[0] : undefined;
}

function validatedUiGraphPolicyEvidenceSources(
    report: LayoutHostEvidence['appGraphReport'] | undefined,
): Map<string, string> {
    if (
        !report
        || typeof report !== 'object'
        || report.ok !== true
        || !Array.isArray(report.phases)
        || !Array.isArray(report.evidenceResults)
    ) {
        return new Map();
    }
    const hasCompletedSchema = report.phases.some((phase) => isCompletedAppGraphPhase(phase, 'schema'));
    const hasCompletedCrossArtifact = report.phases.some((phase) => (
        isCompletedAppGraphPhase(phase, 'cross-artifact')
    ));
    if (!hasCompletedSchema || !hasCompletedCrossArtifact) return new Map();
    return new Map(
        report.evidenceResults
            .filter(isCompletedUiGraphPolicyEvidenceResult)
            .map((result) => [result.evidenceSlot, result.source]),
    );
}

function isCompletedAppGraphPhase(value: unknown, phaseName: string): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const phase = value as {
        phase?: unknown;
        status?: unknown;
    };
    return phase.phase === phaseName && phase.status === 'completed';
}

function isCompletedUiGraphPolicyEvidenceResult(value: unknown): value is {
    evidenceSlot: string;
    schemaId: typeof UI_GRAPH_POLICY_SCHEMA_ID;
    source: string;
    status: 'completed';
    ok: true;
} {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const result = value as {
        evidenceSlot?: unknown;
        schemaId?: unknown;
        source?: unknown;
        status?: unknown;
        ok?: unknown;
    };
    return result.schemaId === UI_GRAPH_POLICY_SCHEMA_ID
        && result.status === 'completed'
        && result.ok === true
        && typeof result.evidenceSlot === 'string'
        && typeof result.source === 'string';
}

function isUiGraphPolicyProjectionEvidenceLike(value: unknown): value is {
    schemaId: string;
    source: string;
    document: unknown;
} {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const evidence = value as {
        schemaId?: unknown;
        source?: unknown;
    };
    return typeof evidence.schemaId === 'string' && typeof evidence.source === 'string' && 'document' in value;
}

function isUiGraphPolicyDocumentLike(
    value: unknown,
): value is NonNullable<NonNullable<PlanContext['hostEvidence']>['uiGraphPolicies']>[number]['document'] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const document = value as {
        $formspecUiGraphPolicy?: unknown;
        targetSurface?: unknown;
        routePolicies?: unknown;
    };
    const targetSurface = document.targetSurface;
    return document.$formspecUiGraphPolicy === '0.1'
        && !!targetSurface
        && typeof targetSurface === 'object'
        && !Array.isArray(targetSurface)
        && typeof (targetSurface as { url?: unknown }).url === 'string'
        && Array.isArray(document.routePolicies);
}

function isUiGraphRoutePolicyLike(
    value: unknown,
): value is NonNullable<
    NonNullable<NonNullable<PlanContext['hostEvidence']>['uiGraphPolicies']>[number]['document']['routePolicies']
>[number] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const routePolicy = value as {
        routeId?: unknown;
        a11y?: unknown;
        responsive?: unknown;
    };
    if (typeof routePolicy.routeId !== 'string') return false;
    if ('a11y' in routePolicy) {
        if (!routePolicy.a11y || typeof routePolicy.a11y !== 'object' || Array.isArray(routePolicy.a11y)) {
            return false;
        }
    }
    if ('responsive' in routePolicy) {
        if (
            !routePolicy.responsive
            || typeof routePolicy.responsive !== 'object'
            || Array.isArray(routePolicy.responsive)
        ) {
            return false;
        }
        const responsive = routePolicy.responsive as { collapseOrder?: unknown };
        if ('collapseOrder' in responsive && !Array.isArray(responsive.collapseOrder)) {
            return false;
        }
    }
    return true;
}

function targetSurfaceMatches(
    policySurface: NonNullable<NonNullable<PlanContext['hostEvidence']>['uiGraphPolicies']>[number]['document']['targetSurface'],
    scopeSurface: NonNullable<PlanContext['componentGraph']>['surface'],
): boolean {
    if (policySurface.url !== scopeSurface.url) return false;
    if (policySurface.version && scopeSurface.version && policySurface.version !== scopeSurface.version) {
        return false;
    }
    return true;
}

function planThemePagesFromComponentTree(
    tree: ComponentTreeNode,
    ctx: PlanContext,
    customComponentStack: Set<string>,
): LayoutNode | null {
    const baseCtx = withoutThemePages(ctx);
    const root = planComponentTree(tree, baseCtx, '', customComponentStack, false);
    const pageNodes = buildThemePageNodes((regionPath) => {
        const componentNode = findComponentNodeByPath(ctx.items, tree, regionPath);
        if (!componentNode) {
            return null;
        }
        return planComponentTree(componentNode, baseCtx, '', customComponentStack, false, null);
    }, ctx.items, ctx);

    if (pageNodes.length === 0) {
        return null;
    }

    const assignedTopLevelKeys = collectAssignedTopLevelKeys(ctx.items, ctx.theme?.pages);
    const unassigned = ctx.items
        .filter((item) => !assignedTopLevelKeys.has(item.key))
        .map((item) => {
            const componentNode = findComponentNodeByPath(ctx.items, tree, item.key);
            return componentNode
                ? planComponentTree(componentNode, baseCtx, '', customComponentStack, false, null)
                : planDefinitionItem(item, baseCtx, '');
        });

    return {
        ...root,
        children: [...pageNodes, ...unassigned],
    };
}

export { findNodeByBindPath };
