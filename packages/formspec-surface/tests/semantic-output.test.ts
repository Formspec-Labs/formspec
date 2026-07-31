import { describe, expect, it } from 'vitest';
import {
  createSurfaceSemanticOutputRegistry,
  type SurfaceSemanticOutputMountScopeIdentity,
  type SurfaceSemanticOutputScopeIdentity,
  type SurfaceSemanticOutputTarget,
} from '../src/semantic-output.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;

function scope(
  overrides: Partial<SurfaceSemanticOutputMountScopeIdentity> = {},
): SurfaceSemanticOutputMountScopeIdentity {
  return {
    surfaceArtifact: {
      artifactRef: 'https://example.test/surface',
      artifactDigest: DIGEST_A,
    },
    renderInstanceId: 'render-1',
    subjectPrefix: 'home/summary',
    ...overrides,
  };
}

function target(
  subjectRef: string,
  owner: SurfaceSemanticOutputScopeIdentity = scope(),
): SurfaceSemanticOutputTarget {
  return {
    renderInstanceId: owner.renderInstanceId,
    node: {
      ...owner.surfaceArtifact,
      subjectKind: 'surface-node',
      subjectRef,
    },
  };
}

describe('surface semantic output registry', () => {
  it('replaces a publisher commit and removes it on dispose', () => {
    const registry = createSurfaceSemanticOutputRegistry();
    const mount = registry.mount(scope({ subjectPrefix: 'home/panel' }));
    mount.replace([
      { subjectRef: 'home/panel/summary', semanticValue: 'Before' },
      { subjectRef: 'home/panel/action', operable: true },
    ]);

    expect(registry.lookup(target('home/panel/summary'))).toMatchObject({
      status: 'resolved',
      output: {
        rendered: true,
        semanticValue: 'Before',
      },
    });

    mount.replace([
      { subjectRef: 'home/panel/summary', semanticValue: 'After' },
    ]);
    expect(registry.lookup(target('home/panel/summary'))).toMatchObject({
      status: 'resolved',
      output: { semanticValue: 'After' },
    });
    expect(registry.lookup(target('home/panel/action'))).toMatchObject({
      status: 'missing',
    });

    mount.dispose();
    mount.dispose();
    expect(registry.lookup(target('home/panel/summary'))).toMatchObject({
      status: 'missing',
    });
  });

  it('reports duplicate live publishers as ambiguous', () => {
    const registry = createSurfaceSemanticOutputRegistry();
    const first = registry.mount(scope());
    const second = registry.mount(scope());
    first.replace([{ subjectRef: 'home/summary', semanticValue: 'first' }]);
    second.replace([{ subjectRef: 'home/summary', semanticValue: 'second' }]);

    expect(registry.lookup(target('home/summary'))).toEqual({
      status: 'ambiguous',
      target: target('home/summary'),
      publisherCount: 2,
    });
    expect(registry.snapshot(scope())).toEqual([
      {
        status: 'ambiguous',
        target: target('home/summary'),
        publisherCount: 2,
      },
    ]);

    second.dispose();
    expect(registry.lookup(target('home/summary'))).toMatchObject({
      status: 'resolved',
      output: { semanticValue: 'first' },
    });
  });

  it('rejects invalid publisher prefixes before mounting', () => {
    const registry = createSurfaceSemanticOutputRegistry();

    expect(() => registry.mount(scope({ subjectPrefix: 'home' }))).toThrow(
      /route\/slot path/,
    );
    expect(() => registry.mount(scope({
      subjectPrefix: 'home//summary',
    }))).toThrow(/route\/slot path/);
  });

  it('rejects cross-slot spoofing and clears the publisher prior commit', () => {
    const registry = createSurfaceSemanticOutputRegistry();
    const mount = registry.mount(scope());
    mount.replace([{ subjectRef: 'home/summary/value' }]);

    expect(() => mount.replace([
      { subjectRef: 'home/other-slot/spoofed' },
    ])).toThrow(/outside the publisher subjectPrefix/);
    expect(registry.lookup(target('home/summary/value'))).toMatchObject({
      status: 'missing',
    });
    expect(registry.lookup(target('home/other-slot/spoofed'))).toMatchObject({
      status: 'missing',
    });
  });

  it('uses exact artifact, digest, render instance, and subject identity', () => {
    const registry = createSurfaceSemanticOutputRegistry();
    registry.mount(scope()).replace([{ subjectRef: 'home/summary' }]);

    expect(registry.lookup(target('home/summary'))).toMatchObject({
      status: 'resolved',
    });
    expect(registry.lookup(target('home/other'))).toMatchObject({
      status: 'missing',
    });
    expect(registry.lookup(target('home/summary', scope({
      renderInstanceId: 'render-2',
    })))).toMatchObject({ status: 'missing' });
    expect(registry.lookup(target('home/summary', scope({
      surfaceArtifact: {
        artifactRef: 'https://example.test/surface',
        artifactDigest: `sha256:${'b'.repeat(64)}`,
      },
    })))).toMatchObject({ status: 'missing' });
  });

  it('detaches and freezes finite semantic values', () => {
    const registry = createSurfaceSemanticOutputRegistry();
    const mount = registry.mount(scope({ subjectPrefix: 'home/value' }));
    const source = { nested: ['one'] };
    mount.replace([{ subjectRef: 'home/value', semanticValue: source }]);
    source.nested.push('two');

    const result = registry.lookup(target('home/value'));
    expect(result).toMatchObject({
      status: 'resolved',
      output: { semanticValue: { nested: ['one'] } },
    });
    if (result.status === 'resolved') {
      expect(Object.isFrozen(result.output.semanticValue)).toBe(true);
      expect(Object.isFrozen(
        (result.output.semanticValue as { nested: string[] }).nested,
      )).toBe(true);
    }

    expect(() => mount.replace([
      { subjectRef: 'home/value', semanticValue: Number.NaN },
    ])).toThrow(/finite/);
    expect(registry.lookup(target('home/value'))).toMatchObject({
      status: 'missing',
    });
  });

  it('orders snapshots by unsigned UTF-8 bytes', () => {
    const registry = createSurfaceSemanticOutputRegistry();
    registry.mount(scope({ subjectPrefix: 'home/list' })).replace([
      { subjectRef: 'home/list/😀' },
      { subjectRef: 'home/list/\uE000' },
    ]);

    // UTF-16 places the astral character first. Unsigned UTF-8 places U+E000
    // first because 0xEE sorts before the astral character's 0xF0.
    expect(registry.snapshot(scope()).map((entry) =>
      entry.status === 'resolved'
        ? entry.output.node.subjectRef
        : entry.target.node.subjectRef)).toEqual([
      'home/list/\uE000',
      'home/list/😀',
    ]);
  });
});
