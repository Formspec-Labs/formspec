/** @filedesc Tests for normalizeBinds and shapesForPath. */
import { describe, it, expect } from 'vitest';
import { normalizeBinds, shapesForPath, bindFor } from '../src/queries/field-queries.js';
import type { ProjectState } from '../src/types.js';

function makeState(overrides: {
  definition?: Record<string, unknown>;
} = {}): ProjectState {
  return {
    definition: {
      $formspec: '1.0', url: 'urn:test', version: '1.0.0', title: 'Test',
      items: [],
      ...overrides.definition,
    } as any,
    theme: {} as any,
    component: {} as any,
    mappings: {},
    selectedMappingId: 'default',
    extensions: { registries: [] },
    versioning: { baseline: {} as any, releases: [] },
  };
}

describe('normalizeBinds', () => {
  it('returns empty object when no binds or item properties', () => {
    const state = makeState({
      definition: { items: [{ key: 'name', type: 'field', label: 'Name' }] },
    });
    expect(normalizeBinds(state, 'name')).toEqual({});
  });

  it('merges bind properties for a path', () => {
    const state = makeState({
      definition: {
        items: [{ key: 'email', type: 'field', label: 'Email' }],
        binds: [
          { path: 'email', required: 'true', constraint: 'regex($email, "^.+@.+$")' },
        ],
      },
    });
    const result = normalizeBinds(state, 'email');
    expect(result.required).toBe('true');
    expect(result.constraint).toBe('regex($email, "^.+@.+$")');
  });

  it('includes initialValue from item definition', () => {
    const state = makeState({
      definition: {
        items: [{ key: 'created', type: 'field', label: 'Created', initialValue: '=today()' }],
      },
    });
    const result = normalizeBinds(state, 'created');
    expect(result.initialValue).toBe('=today()');
  });

  it('combines binds and item-level properties', () => {
    const state = makeState({
      definition: {
        items: [{ key: 'score', type: 'field', label: 'Score', initialValue: 0 }],
        binds: [
          { path: 'score', required: 'true' },
        ],
      },
    });
    const result = normalizeBinds(state, 'score');
    expect(result.required).toBe('true');
    expect(result.initialValue).toBe(0);
  });
});

describe('shapesForPath', () => {
  it('returns empty array when no shapes', () => {
    const state = makeState({ definition: { items: [] } });
    expect(shapesForPath(state, 'name')).toEqual([]);
  });

  it('finds shapes targeting a specific path', () => {
    const state = makeState({
      definition: {
        items: [{ key: 'start', type: 'field', label: 'Start' }],
        shapes: [
          { id: 's1', target: 'start', constraint: '$start != null', severity: 'error', message: 'Required' },
          { id: 's2', target: 'end', constraint: '$end != null', severity: 'error', message: 'Required' },
        ],
      },
    });
    const result = shapesForPath(state, 'start');
    expect(result).toHaveLength(1);
    expect((result[0] as any).id).toBe('s1');
  });

  it('matches form-root target "#"', () => {
    const state = makeState({
      definition: {
        items: [],
        shapes: [
          { id: 's1', target: '#', constraint: 'true', severity: 'error', message: 'Always valid' },
        ],
      },
    });
    expect(shapesForPath(state, '#')).toHaveLength(1);
  });
});

describe('bindFor (existing)', () => {
  it('returns undefined when no bind exists', () => {
    const state = makeState({ definition: { items: [], binds: [] } });
    expect(bindFor(state, 'missing')).toBeUndefined();
  });

  it('returns bind properties excluding path', () => {
    const state = makeState({
      definition: {
        items: [],
        binds: [{ path: 'email', required: 'true' }],
      },
    });
    const result = bindFor(state, 'email');
    expect(result).toEqual({ required: 'true' });
    expect(result).not.toHaveProperty('path');
  });
});

describe('bindFor: multiple entries per path', () => {
  it('merges every entry for the path in document order, later values winning', () => {
    const state = makeState({
      definition: {
        items: [],
        binds: [
          { path: 'age', required: 'true', constraint: '$age > 0' },
          { path: 'other', readonly: 'true' },
          { path: 'age', constraint: '$age < 130', constraintMessage: 'Too old' },
        ],
      },
    });
    expect(bindFor(state, 'age')).toEqual({
      required: 'true',
      constraint: '$age < 130',
      constraintMessage: 'Too old',
    });
  });

  it('matches a [*] wildcard bind path to the item path and vice versa', () => {
    const state = makeState({
      definition: {
        items: [],
        binds: [
          { path: 'work.jobs[*].hours', required: 'true' },
          { path: 'work.jobs.hours', constraint: '$ >= 0' },
        ],
      },
    });
    const merged = { required: 'true', constraint: '$ >= 0' };
    expect(bindFor(state, 'work.jobs.hours')).toEqual(merged);
    expect(bindFor(state, 'work.jobs[*].hours')).toEqual(merged);
  });

  it('does not treat a single-repetition bind as the item-wide bind', () => {
    const state = makeState({
      definition: {
        items: [],
        binds: [{ path: 'jobs[@index = 1].hours', calculate: '40' }],
      },
    });
    expect(bindFor(state, 'jobs.hours')).toBeUndefined();
  });
});
