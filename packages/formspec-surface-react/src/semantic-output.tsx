/** @filedesc React commit lifecycle for portable Surface semantic outputs. */

import { useLayoutEffect, useRef } from 'react';
import type {
  SurfaceRoutePlan,
  SurfaceSemanticOutputArtifactIdentity,
  SurfaceSemanticOutputDeclaration,
  SurfaceSemanticOutputMount,
  SurfaceSemanticOutputPublisherScope,
  SurfaceSemanticOutputRegistry,
  SurfaceSemanticOutputScope,
} from '@formspec-org/surface';
import type { SurfaceWidget, SurfaceWidgetRouteContext } from './widget-api.js';

export interface SurfaceSemanticOutputScopeRequest {
  plan: SurfaceRoutePlan<SurfaceWidget>;
  route: SurfaceWidgetRouteContext;
  runtimeGeneration: string | undefined;
}

export type SurfaceSemanticOutputScopeResolver = (
  request: SurfaceSemanticOutputScopeRequest,
) => SurfaceSemanticOutputScope | undefined;

export interface SurfaceSemanticOutputPairing {
  registry: SurfaceSemanticOutputRegistry;
  /**
   * Returns caller-computed canonical identity for the exact loaded Surface.
   * The helper refuses an identity whose reference differs from `surfaceRef`.
   */
  surfaceArtifactFor(
    request: SurfaceSemanticOutputScopeRequest,
  ): SurfaceSemanticOutputArtifactIdentity | undefined;
  renderInstanceIdFor(
    request: SurfaceSemanticOutputScopeRequest,
  ): string | undefined;
}

/**
 * Builds a fail-closed route resolver. Canonicalization, digest computation,
 * and render-instance allocation remain outside the renderer.
 */
export function createSurfaceSemanticOutputScopeResolver(
  pairing: SurfaceSemanticOutputPairing,
): SurfaceSemanticOutputScopeResolver {
  return (request) => {
    const expectedRef = request.route.surfaceRef;
    const surfaceArtifact = pairing.surfaceArtifactFor(request);
    const renderInstanceId = pairing.renderInstanceIdFor(request);
    if (
      !expectedRef
      || !surfaceArtifact
      || surfaceArtifact.artifactRef !== expectedRef
      || !renderInstanceId
    ) {
      return undefined;
    }
    return {
      registry: pairing.registry,
      surfaceArtifact,
      renderInstanceId,
    };
  };
}

/**
 * Publishes exactly the declarations produced by the current React commit.
 *
 * Data updates replace the existing mount in place. Scope changes and unmounts
 * dispose the prior publisher, including under React Strict Mode remounting.
 */
export function useSurfaceSemanticOutputs(
  scope: SurfaceSemanticOutputPublisherScope | undefined,
  outputs: readonly SurfaceSemanticOutputDeclaration[],
): void {
  const mount = useRef<SurfaceSemanticOutputMount | undefined>(undefined);
  const latestOutputs = useRef(outputs);
  latestOutputs.current = outputs;

  const registry = scope?.registry;
  const artifactRef = scope?.surfaceArtifact.artifactRef;
  const artifactDigest = scope?.surfaceArtifact.artifactDigest;
  const renderInstanceId = scope?.renderInstanceId;
  const subjectPrefix = scope?.subjectPrefix;

  useLayoutEffect(() => {
    if (
      !registry
      || !artifactRef
      || !artifactDigest
      || !renderInstanceId
      || !subjectPrefix
    ) {
      mount.current = undefined;
      return;
    }
    const current = registry.mount({
      surfaceArtifact: { artifactRef, artifactDigest },
      renderInstanceId,
      subjectPrefix,
    });
    mount.current = current;
    current.replace(latestOutputs.current);
    return () => {
      if (mount.current === current) mount.current = undefined;
      current.dispose();
    };
  }, [
    artifactDigest,
    artifactRef,
    registry,
    renderInstanceId,
    subjectPrefix,
  ]);

  useLayoutEffect(() => {
    mount.current?.replace(outputs);
  }, [outputs]);
}

/** Existing stable Surface review identity: route, slot, then authored IDs. */
export function surfaceSemanticOutputSubjectRef(
  ...segments: readonly string[]
): string | undefined {
  if (
    segments.length < 2
    || segments.some(
      (segment) =>
        segment.length === 0
        || segment.trim() !== segment
        || segment.includes('/'),
    )
  ) {
    return undefined;
  }
  return segments.join('/');
}
