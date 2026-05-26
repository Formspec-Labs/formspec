/** @filedesc Active UI Graph Policy route-landmark attribute helper. */
import { resolveRouteLandmark, type ResolvedRouteLandmarkRole } from '@formspec-org/layout';
import type { AriaRole } from 'react';
import type { LayoutNode } from '@formspec-org/layout';

export type RouteLandmarkAttrs = {
    role?: Extract<AriaRole, ResolvedRouteLandmarkRole>;
    'aria-label'?: string;
};

export function routeLandmarkAttrs(
    node: Pick<LayoutNode, 'uiGraphRoutePolicy'>,
): RouteLandmarkAttrs {
    const resolved = resolveRouteLandmark(node.uiGraphRoutePolicy);
    if (!resolved.role) {
        return {};
    }
    return {
        role: resolved.role,
        ...(resolved.ariaLabel ? { 'aria-label': resolved.ariaLabel } : {}),
    };
}
