/** @filedesc Active UI Graph Policy route-landmark attribute helper. */
import type { AriaRole } from 'react';
import type { LayoutNode } from '@formspec-org/layout';

type RouteLandmarkRole = Extract<AriaRole, 'main' | 'navigation' | 'complementary'>;

export type RouteLandmarkAttrs = {
    role?: RouteLandmarkRole;
};

export function routeLandmarkAttrs(
    node: Pick<LayoutNode, 'uiGraphRoutePolicy'>,
): RouteLandmarkAttrs {
    const landmark = node.uiGraphRoutePolicy?.a11y?.landmark;
    switch (landmark) {
        case 'main':
        case 'navigation':
        case 'complementary':
            return { role: landmark };
        default:
            return {};
    }
}
