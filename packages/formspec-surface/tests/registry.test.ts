/**
 * @filedesc Widget resolution through the Registry, and the entry-flattening rule.
 *
 * The load-bearing case is the PascalCase one: a Surface `module-widget`
 * binding's `widgetName` matches `widgetShape.widgetName`, which carries no
 * pattern, NOT the `^x-[a-z]…` contribution id. A registry keyed on the id
 * resolves nothing the day a module uses a PascalCase widget name — which the
 * schema explicitly permits (ADR 0160 §2.4).
 */
import { describe, expect, it } from 'vitest';
import type { RegistryDocument } from '@formspec-org/types';
import {
  createWidgetRegistry,
  flattenRegistryEntries,
  widgetContributionFor,
} from '../src/registry.js';
import { registryDocument } from './fixtures.js';

const entries = registryDocument.entries ?? [];
const Banner = () => 'banner';
const Panel = () => 'panel';

describe('widgetContributionFor', () => {
  it('resolves a PascalCase widgetShape.widgetName to its contribution id', () => {
    const entry = widgetContributionFor(
      { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' },
      entries,
    );
    expect(entry?.name).toBe('x-acme-banner');
  });

  it('does NOT resolve a binding written as the contribution id', () => {
    // Wrong vocabulary. Accepting it here would make the two names silently
    // interchangeable until one collided.
    expect(
      widgetContributionFor({ moduleId: 'x-acme-chrome', widgetName: 'x-acme-banner' }, entries),
    ).toBeUndefined();
  });

  it('resolves when the two names happen to coincide', () => {
    const entry = widgetContributionFor(
      { moduleId: 'x-acme-chrome', widgetName: 'x-acme-panel' },
      entries,
    );
    expect(entry?.name).toBe('x-acme-panel');
  });

  it('reaches a widget only through its declaring module', () => {
    expect(
      widgetContributionFor({ moduleId: 'x-other-module', widgetName: 'IntakeBanner' }, entries),
    ).toBeUndefined();
  });
});

describe('createWidgetRegistry', () => {
  const registry = createWidgetRegistry({
    modules: [{ moduleId: 'x-acme-chrome', widgets: { IntakeBanner: Banner, 'x-acme-panel': Panel } }],
    registryEntries: entries,
  });

  it('resolves a declared, implemented widget and reports its contribution id', () => {
    const resolution = registry.resolve({ moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' });
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;
    expect(resolution.component).toBe(Banner);
    expect(resolution.contributionName).toBe('x-acme-banner');
  });

  it('reports "declared but nothing ships it" distinctly from "nothing declares it"', () => {
    const bare = createWidgetRegistry({ modules: [], registryEntries: entries });
    expect(bare.resolve({ moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' }).status).toBe(
      'unimplemented',
    );
    expect(bare.resolve({ moduleId: 'x-acme-chrome', widgetName: 'Ghost' }).status).toBe(
      'undeclared',
    );
  });

  it('phrases the unresolved cases so a caller does not invent its own wording', () => {
    const bare = createWidgetRegistry({ modules: [], registryEntries: entries });
    const key = { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' };
    const diagnostic = bare.diagnose(key, bare.resolve(key), { routeId: 'r' });
    expect(diagnostic?.code).toBe('WIDGET-UNIMPLEMENTED');
    expect(diagnostic?.message).toContain('IntakeBanner');
  });

  it('says nothing about a resolved widget', () => {
    const key = { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' };
    expect(registry.diagnose(key, registry.resolve(key), {})).toBeUndefined();
  });

  it('resolves a component even when no Registry declares it, and says so', () => {
    // A host that registers a module the bundle never declared still gets its
    // component; the missing declaration is the bundle's problem, not a reason
    // to blank the page.
    const resolution = registry.resolve({ moduleId: 'x-acme-chrome', widgetName: 'x-acme-panel' });
    expect(resolution.status).toBe('resolved');
  });

  it('does not cross module boundaries', () => {
    const two = createWidgetRegistry({
      modules: [
        { moduleId: 'x-a', widgets: { Thing: Banner } },
        { moduleId: 'x-b', widgets: { Thing: Panel } },
      ],
    });
    const a = two.resolve({ moduleId: 'x-a', widgetName: 'Thing' });
    const b = two.resolve({ moduleId: 'x-b', widgetName: 'Thing' });
    expect(a.status === 'resolved' && a.component).toBe(Banner);
    expect(b.status === 'resolved' && b.component).toBe(Panel);
  });
});

describe('flattenRegistryEntries', () => {
  it('flattens in manifest-then-author order', () => {
    const { entries: flat, diagnostics } = flattenRegistryEntries([registryDocument]);
    expect(flat.map((entry) => entry.name)).toEqual([
      'x-acme-chrome',
      'x-acme-banner',
      'x-acme-panel',
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('gives the first declaration precedence and REPORTS the loser', () => {
    const second = {
      $formspecRegistry: '1.0',
      entries: [{ name: 'x-acme-banner', category: 'widget', version: '9.9.9', status: 'stable' }],
    } as unknown as RegistryDocument;
    const { entries: flat, diagnostics } = flattenRegistryEntries([registryDocument, second]);
    expect(flat.filter((entry) => entry.name === 'x-acme-banner')).toHaveLength(1);
    expect(flat.find((entry) => entry.name === 'x-acme-banner')?.version).toBe('0.1.0');
    expect(diagnostics.map((d) => d.code)).toEqual(['REGISTRY-ENTRY-NAME-COLLISION']);
  });

  it('handles a registry with no entries', () => {
    const empty = { $formspecRegistry: '1.0' } as unknown as RegistryDocument;
    expect(flattenRegistryEntries([empty]).entries).toEqual([]);
  });
});

describe('WIDGET-UNDECLARED reports declaration, not delivery (§3.3, D9)', () => {
  const Host = () => 'host-supplied';
  const key = { moduleId: 'x-acme-chrome', widgetName: 'NotInAnyRegistry' };
  const site = { surfaceId: 's', routeId: 'r', slotId: 'w' };

  const registry = createWidgetRegistry({
    modules: [{ moduleId: 'x-acme-chrome', widgets: { NotInAnyRegistry: Host } }],
    registryEntries: flattenRegistryEntries([registryDocument]).entries,
  });

  it('still renders the host component', () => {
    // "A shell MAY render it; it MUST say it did."
    const resolution = registry.resolve(key);
    expect(resolution.status).toBe('resolved');
  });

  it('marks the resolution undeclared rather than collapsing the two axes', () => {
    const resolution = registry.resolve(key);
    expect(resolution.status === 'resolved' && resolution.declared).toBe(false);
  });

  it('FIRES WIDGET-UNDECLARED even though a host component exists', () => {
    // D9. Suppressing the diagnostic because the pixels happened to work makes
    // host-supplied content indistinguishable from bundle-declared content,
    // which is the one distinction a signed bundle exists to make.
    const diagnostic = registry.diagnose(key, registry.resolve(key), site);
    expect(diagnostic?.code).toBe('WIDGET-UNDECLARED');
    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.details?.hostComponentRendered).toBe(true);
  });

  it('says nothing when the bundle declares the widget AND a module supplies it', () => {
    const declared = createWidgetRegistry({
      modules: [{ moduleId: 'x-acme-chrome', widgets: { IntakeBanner: Host } }],
      registryEntries: flattenRegistryEntries([registryDocument]).entries,
    });
    const declaredKey = { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' };
    const resolution = declared.resolve(declaredKey);
    expect(resolution.status === 'resolved' && resolution.declared).toBe(true);
    expect(declared.diagnose(declaredKey, resolution, site)).toBeUndefined();
  });

  it('keeps undeclared and unimplemented distinct — they name different people', () => {
    const noModules = createWidgetRegistry({
      registryEntries: flattenRegistryEntries([registryDocument]).entries,
    });
    const declaredKey = { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' };
    expect(noModules.diagnose(declaredKey, noModules.resolve(declaredKey), site)?.code).toBe(
      'WIDGET-UNIMPLEMENTED',
    );
    expect(noModules.diagnose(key, noModules.resolve(key), site)?.code).toBe('WIDGET-UNDECLARED');
  });
});
