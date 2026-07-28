/**
 * @filedesc The shell's own vocabulary is enumerable and host-overridable —
 * `surface-shell-spec.md` §3.0, §8.2 item 30 (divergence D17).
 *
 * This is NOT localisation and does not attempt it. It is the seam finding F7
 * lands on: the closed key set below is what a Locale channel would address,
 * and its being closed is what makes F7 tractable.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SURFACE_STRINGS,
  SURFACE_STRING_KEYS,
  resolveSurfaceStrings,
} from '../src/strings.js';
import { composeSurfaceApp } from '../src/composition.js';
import { planTransitions } from '../src/transitions.js';
import { respondentSurface } from './fixtures.js';

describe('the string table', () => {
  it('is enumerable', () => {
    expect(SURFACE_STRING_KEYS.length).toBeGreaterThan(0);
    expect(new Set(SURFACE_STRING_KEYS).size).toBe(SURFACE_STRING_KEYS.length);
  });

  it('has a shipped default for every key — a partial override never blanks a page', () => {
    const strings = resolveSurfaceStrings();
    for (const key of SURFACE_STRING_KEYS) {
      expect(strings(key, { widgetName: 'w', trigger: 't', to: 'x', target: 'y' })).not.toBe('');
    }
  });

  it('is total over the key set by construction', () => {
    expect(Object.keys(DEFAULT_SURFACE_STRINGS).sort()).toEqual([...SURFACE_STRING_KEYS].sort());
  });
});

describe('host overrides', () => {
  it('takes a plain string and interpolates the same vars the default gets', () => {
    const strings = resolveSurfaceStrings({
      slotUnavailableWidgetUndeclared: 'Bileşen “{widgetName}” bu sürümde tanımlı değil.',
    });
    expect(strings('slotUnavailableWidgetUndeclared', { widgetName: 'x-queue' })).toBe(
      'Bileşen “x-queue” bu sürümde tanımlı değil.',
    );
  });

  it('takes a function for anything interpolation cannot express', () => {
    const strings = resolveSurfaceStrings({
      transitionContinue: (vars) => `Weiter zu ${vars.target ?? ''}`,
    });
    expect(strings('transitionContinue', { target: 'Quittung' })).toBe('Weiter zu Quittung');
  });

  it('falls back per key, so a partial translation degrades to mixed language', () => {
    const strings = resolveSurfaceStrings({ notFoundTitle: 'Sayfa bulunamadı.' });
    expect(strings('notFoundTitle')).toBe('Sayfa bulunamadı.');
    expect(strings('notFoundBody')).toBe(DEFAULT_SURFACE_STRINGS.notFoundBody({}));
  });

  it('leaves an unknown placeholder alone rather than printing "undefined"', () => {
    const strings = resolveSurfaceStrings({ notFoundTitle: 'No {thing} here.' });
    expect(strings('notFoundTitle', {})).toBe('No {thing} here.');
  });
});

describe('the transition planner reads the table', () => {
  const app = composeSurfaceApp([respondentSurface]);
  const apply = app.routes.find((handle) => handle.routeId === 'apply')!;

  it('uses the shipped default when the host overrides nothing', () => {
    const { transitions } = planTransitions({ handle: apply, app, hasExecutor: false });
    expect(transitions[0]?.reason).toContain('submit');
  });

  it('uses a host override for the refusal sentence a person reads', () => {
    const { transitions } = planTransitions({
      handle: apply,
      app,
      hasExecutor: false,
      strings: { transitionNoResponseActions: 'Bu sürüm “{trigger}” işlemini tanımlamıyor.' },
    });
    expect(transitions[0]?.reason).toBe('Bu sürüm “submit” işlemini tanımlamıyor.');
  });
});
