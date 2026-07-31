/**
 * @filedesc Renderer-owned, portable semantic output observations.
 *
 * This registry contains only facts committed by a mounted renderer. It never
 * queries a DOM, infers a node from visible copy, or manufactures
 * `rendered: false` from absence.
 */

export type SurfaceSemanticValue =
  | null
  | boolean
  | number
  | string
  | readonly SurfaceSemanticValue[]
  | Readonly<{ [key: string]: SurfaceSemanticValue }>;

export interface SurfaceSemanticOutputArtifactIdentity {
  artifactRef: string;
  artifactDigest: string;
}

export interface QualifiedSurfaceSemanticOutputRef
  extends SurfaceSemanticOutputArtifactIdentity {
  subjectKind: 'surface-node';
  subjectRef: string;
}

export interface SurfaceSemanticOutputTarget {
  renderInstanceId: string;
  node: QualifiedSurfaceSemanticOutputRef;
}

/** One node the current renderer commit actually produced. */
export interface SurfaceSemanticOutputDeclaration {
  subjectRef: string;
  operable?: boolean | undefined;
  semanticValue?: SurfaceSemanticValue | undefined;
}

/** A detached, immutable observation from one live renderer publisher. */
export interface SurfaceSemanticOutputObservation
  extends SurfaceSemanticOutputTarget {
  rendered: true;
  operable?: boolean | undefined;
  semanticValue?: SurfaceSemanticValue | undefined;
}

export interface SurfaceSemanticOutputScopeIdentity {
  surfaceArtifact: SurfaceSemanticOutputArtifactIdentity;
  renderInstanceId: string;
}

/** Caller-paired identity supplied to a renderer; the renderer computes none of it. */
export interface SurfaceSemanticOutputScope
  extends SurfaceSemanticOutputScopeIdentity {
  registry: SurfaceSemanticOutputRegistry;
}

/** Exact subject subtree assigned by the Surface slot owner to one publisher. */
export interface SurfaceSemanticOutputMountScopeIdentity
  extends SurfaceSemanticOutputScopeIdentity {
  subjectPrefix: string;
}

/**
 * The only scope a renderer publisher receives. It cannot publish outside the
 * exact route/slot subtree assigned by the Surface shell.
 */
export interface SurfaceSemanticOutputPublisherScope
  extends SurfaceSemanticOutputMountScopeIdentity {
  registry: SurfaceSemanticOutputRegistry;
}

export interface ResolvedSurfaceSemanticOutput {
  status: 'resolved';
  output: SurfaceSemanticOutputObservation;
}

export interface MissingSurfaceSemanticOutput {
  status: 'missing';
  target: SurfaceSemanticOutputTarget;
}

export interface AmbiguousSurfaceSemanticOutput {
  status: 'ambiguous';
  target: SurfaceSemanticOutputTarget;
  publisherCount: number;
}

export type SurfaceSemanticOutputLookup =
  | ResolvedSurfaceSemanticOutput
  | MissingSurfaceSemanticOutput
  | AmbiguousSurfaceSemanticOutput;

export type SurfaceSemanticOutputSnapshotEntry =
  | ResolvedSurfaceSemanticOutput
  | AmbiguousSurfaceSemanticOutput;

export interface SurfaceSemanticOutputMount {
  /**
   * Atomically replaces this publisher's prior commit when every declaration
   * is valid. A malformed replacement clears the prior commit, publishes
   * nothing, and throws, so stale values cannot survive a failed update.
   */
  replace(outputs: readonly SurfaceSemanticOutputDeclaration[]): void;
  /** Idempotently removes every output owned by this publisher. */
  dispose(): void;
}

export interface SurfaceSemanticOutputRegistry {
  /** Opens one independently cleaned-up renderer publisher. */
  mount(scope: SurfaceSemanticOutputMountScopeIdentity): SurfaceSemanticOutputMount;
  /** Resolves only an exact artifact, digest, render instance, and subject. */
  lookup(target: SurfaceSemanticOutputTarget): SurfaceSemanticOutputLookup;
  /**
   * Returns every live exact target in one exact scope. Duplicate publishers
   * remain explicit `ambiguous` entries; the registry never picks a winner.
   */
  snapshot(
    scope: SurfaceSemanticOutputScopeIdentity,
  ): readonly SurfaceSemanticOutputSnapshotEntry[];
}

interface StoredOutput {
  publisherId: number;
  output: SurfaceSemanticOutputObservation;
}

const utf8Encoder = new TextEncoder();

function nonEmpty(value: string): boolean {
  return value.length > 0 && value.trim() === value;
}

function assertArtifactIdentity(
  artifact: SurfaceSemanticOutputArtifactIdentity,
): void {
  if (!nonEmpty(artifact.artifactRef) || !nonEmpty(artifact.artifactDigest)) {
    throw new TypeError('semantic output artifact identity fields must be non-empty');
  }
}

function assertSubjectPrefix(subjectPrefix: string): void {
  if (
    !nonEmpty(subjectPrefix)
    || subjectPrefix.startsWith('/')
    || subjectPrefix.endsWith('/')
    || subjectPrefix.split('/').length < 2
    || subjectPrefix.split('/').some((segment) => !nonEmpty(segment))
  ) {
    throw new TypeError(
      'semantic output subjectPrefix must contain an exact route/slot path',
    );
  }
}

function exactKey(target: SurfaceSemanticOutputTarget): string {
  return JSON.stringify([
    target.renderInstanceId,
    target.node.artifactRef,
    target.node.artifactDigest,
    target.node.subjectKind,
    target.node.subjectRef,
  ]);
}

function scopeKey(scope: SurfaceSemanticOutputScopeIdentity): string {
  return JSON.stringify([
    scope.renderInstanceId,
    scope.surfaceArtifact.artifactRef,
    scope.surfaceArtifact.artifactDigest,
  ]);
}

function compareUnsignedBytes(left: Uint8Array, right: Uint8Array): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function compareSubjectRefs(
  left: SurfaceSemanticOutputTarget,
  right: SurfaceSemanticOutputTarget,
): number {
  return compareUnsignedBytes(
    utf8Encoder.encode(left.node.subjectRef),
    utf8Encoder.encode(right.node.subjectRef),
  );
}

function targetFor(
  scope: SurfaceSemanticOutputScopeIdentity,
  subjectRef: string,
): SurfaceSemanticOutputTarget {
  return {
    renderInstanceId: scope.renderInstanceId,
    node: {
      ...scope.surfaceArtifact,
      subjectKind: 'surface-node',
      subjectRef,
    },
  };
}

function cloneSemanticValue(
  value: unknown,
  ancestors: Set<object>,
): SurfaceSemanticValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('semantic output values must contain only finite numbers');
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError('semantic output values must be finite JSON');
  }
  if (ancestors.has(value)) {
    throw new TypeError('semantic output values must not contain cycles');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const copy = value.map((item, index) => {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError('semantic output arrays must not be sparse');
        }
        return cloneSemanticValue(item, ancestors);
      });
      return Object.freeze(copy);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('semantic output objects must be plain JSON objects');
    }
    const keys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== keys.length) {
      throw new TypeError('semantic output objects must contain enumerable string keys only');
    }
    const copy: Record<string, SurfaceSemanticValue> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError('semantic output objects must not contain accessors');
      }
      copy[key] = cloneSemanticValue(descriptor.value, ancestors);
    }
    return Object.freeze(copy);
  } finally {
    ancestors.delete(value);
  }
}

function normalizeOutput(
  scope: SurfaceSemanticOutputMountScopeIdentity,
  declaration: SurfaceSemanticOutputDeclaration,
): SurfaceSemanticOutputObservation {
  if (!nonEmpty(declaration.subjectRef)) {
    throw new TypeError('semantic output subjectRef must be non-empty');
  }
  if (
    declaration.subjectRef !== scope.subjectPrefix
    && !declaration.subjectRef.startsWith(`${scope.subjectPrefix}/`)
  ) {
    throw new TypeError(
      'semantic output subjectRef is outside the publisher subjectPrefix',
    );
  }
  const semanticValue = Object.prototype.hasOwnProperty.call(
    declaration,
    'semanticValue',
  )
    ? cloneSemanticValue(declaration.semanticValue, new Set())
    : undefined;
  return Object.freeze({
    ...targetFor(scope, declaration.subjectRef),
    rendered: true as const,
    ...(declaration.operable === undefined
      ? {}
      : { operable: declaration.operable }),
    ...(semanticValue === undefined ? {} : { semanticValue }),
  });
}

function cloneTarget(
  target: SurfaceSemanticOutputTarget,
): SurfaceSemanticOutputTarget {
  return Object.freeze({
    renderInstanceId: target.renderInstanceId,
    node: Object.freeze({ ...target.node }),
  });
}

/**
 * Creates one output aggregation domain for a host or outcome runner.
 *
 * The registry deliberately has no history-based `rendered: false` state.
 * Once the last publisher disposes an output, an exact lookup is `missing`.
 */
export function createSurfaceSemanticOutputRegistry():
  SurfaceSemanticOutputRegistry {
  let publisherSequence = 0;
  const active = new Map<string, StoredOutput[]>();
  const publisherKeys = new Map<number, string[]>();

  const removePublisher = (publisherId: number): void => {
    for (const key of publisherKeys.get(publisherId) ?? []) {
      const remaining = (active.get(key) ?? []).filter(
        (entry) => entry.publisherId !== publisherId,
      );
      if (remaining.length === 0) active.delete(key);
      else active.set(key, remaining);
    }
    publisherKeys.delete(publisherId);
  };

  const lookup = (
    target: SurfaceSemanticOutputTarget,
  ): SurfaceSemanticOutputLookup => {
    const exact = active.get(exactKey(target)) ?? [];
    if (exact.length === 0) {
      return { status: 'missing', target: cloneTarget(target) };
    }
    if (exact.length > 1) {
      return {
        status: 'ambiguous',
        target: cloneTarget(target),
        publisherCount: exact.length,
      };
    }
    return { status: 'resolved', output: exact[0]!.output };
  };

  return {
    mount(scope) {
      assertArtifactIdentity(scope.surfaceArtifact);
      if (!nonEmpty(scope.renderInstanceId)) {
        throw new TypeError('semantic output renderInstanceId must be non-empty');
      }
      assertSubjectPrefix(scope.subjectPrefix);
      const frozenScope: SurfaceSemanticOutputMountScopeIdentity = Object.freeze({
        surfaceArtifact: Object.freeze({ ...scope.surfaceArtifact }),
        renderInstanceId: scope.renderInstanceId,
        subjectPrefix: scope.subjectPrefix,
      });
      publisherSequence += 1;
      const publisherId = publisherSequence;
      let mounted = true;

      return {
        replace(declarations) {
          if (!mounted) {
            throw new Error('cannot replace outputs on a disposed semantic output mount');
          }

          let normalized: SurfaceSemanticOutputObservation[];
          try {
            normalized = declarations.map((declaration) =>
              normalizeOutput(frozenScope, declaration));
            if (
              new Set(normalized.map((output) => output.node.subjectRef)).size
              !== normalized.length
            ) {
              throw new TypeError(
                'one semantic output publisher must not declare a subjectRef more than once',
              );
            }
          } catch (error) {
            removePublisher(publisherId);
            throw error;
          }

          removePublisher(publisherId);
          const keys: string[] = [];
          for (const output of normalized) {
            const key = exactKey(output);
            keys.push(key);
            active.set(key, [
              ...(active.get(key) ?? []),
              { publisherId, output },
            ]);
          }
          publisherKeys.set(publisherId, keys);
        },
        dispose() {
          if (!mounted) return;
          mounted = false;
          removePublisher(publisherId);
        },
      };
    },

    lookup,

    snapshot(scope) {
      assertArtifactIdentity(scope.surfaceArtifact);
      if (!nonEmpty(scope.renderInstanceId)) {
        throw new TypeError('semantic output renderInstanceId must be non-empty');
      }
      const prefix = scopeKey(scope);
      const targets = [...active.values()]
        .flatMap((entries) => entries[0]?.output ?? [])
        .filter((output) =>
          scopeKey({
            surfaceArtifact: output.node,
            renderInstanceId: output.renderInstanceId,
          }) === prefix)
        .map((output) => ({
          renderInstanceId: output.renderInstanceId,
          node: output.node,
        }))
        .sort(compareSubjectRefs);

      return targets.map((target) => {
        const result = lookup(target);
        if (result.status === 'missing') {
          throw new Error('semantic output registry changed during a synchronous snapshot');
        }
        return result;
      });
    },
  };
}
