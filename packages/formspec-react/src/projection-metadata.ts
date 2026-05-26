/** @filedesc Inert projection metadata helpers shared by default React renderers. */
import type { LayoutNode } from '@formspec-org/layout';

export type ProjectionMetadataAttrs = Record<`data-formspec-${string}`, string>;

export function componentGraphIdentityAttrs(
    node: Pick<LayoutNode, 'componentGraphIdentity'>,
): ProjectionMetadataAttrs {
    const identity = node.componentGraphIdentity;
    if (!identity) return {};

    return {
        'data-formspec-component-handle': identity.component.handle,
        ...(identity.component.url ? { 'data-formspec-component-url': identity.component.url } : {}),
        ...(identity.component.version ? { 'data-formspec-component-version': identity.component.version } : {}),
        'data-formspec-surface-url': identity.surface.url,
        ...(identity.surface.version ? { 'data-formspec-surface-version': identity.surface.version } : {}),
        'data-formspec-route': identity.route,
        'data-formspec-node-path': identity.nodePath,
        ...(identity.id ? { 'data-formspec-component-node-id': identity.id } : {}),
        ...(identity.nodeId ? { 'data-formspec-component-node-structural-id': identity.nodeId } : {}),
    };
}
