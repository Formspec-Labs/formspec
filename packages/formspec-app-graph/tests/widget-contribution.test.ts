import { describe, expect, it } from 'vitest';
import {
  resolveWidgetContribution,
  type WidgetContributionEntry,
} from '../src/index.js';

const entries: WidgetContributionEntry[] = [
  {
    name: 'x-acme-chrome',
    category: 'module',
    contributes: ['x-acme-banner', 'x-acme-panel', 'x-acme-coincident'],
  },
  {
    name: 'x-other-chrome',
    category: 'module',
    contributes: ['x-other-banner'],
  },
  {
    name: 'x-acme-banner',
    category: 'widget',
    widgetShape: { widgetName: 'IntakeBanner' },
  },
  {
    name: 'x-acme-panel',
    category: 'widget',
    widgetShape: { widgetName: 'x-AcmePanel' },
  },
  {
    name: 'x-acme-coincident',
    category: 'widget',
    widgetShape: { widgetName: 'x-acme-coincident' },
  },
  {
    name: 'x-other-banner',
    category: 'widget',
    widgetShape: { widgetName: 'IntakeBanner' },
  },
];

describe('resolveWidgetContribution', () => {
  it('resolves a PascalCase widgetShape.widgetName', () => {
    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' },
      entries,
    )?.name).toBe('x-acme-banner');
  });

  it('rejects the contribution id when it is not the widget name', () => {
    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'x-acme-banner' },
      entries,
    )).toBeUndefined();
  });

  it('resolves when the contribution id and widget name genuinely coincide', () => {
    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'x-acme-coincident' },
      entries,
    )?.name).toBe('x-acme-coincident');
  });

  it('does not substitute a Theme custom-widget vocabulary spelling', () => {
    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'x-AcmePanel' },
      entries,
    )?.name).toBe('x-acme-panel');
    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'x-acmepanel' },
      entries,
    )).toBeUndefined();
  });

  it('scopes coincident widget names to the named module', () => {
    expect(resolveWidgetContribution(
      { moduleId: 'x-other-chrome', widgetName: 'IntakeBanner' },
      entries,
    )?.name).toBe('x-other-banner');
    expect(resolveWidgetContribution(
      { moduleId: 'x-missing-module', widgetName: 'IntakeBanner' },
      entries,
    )).toBeUndefined();
  });

  it('refuses ambiguous matching contributions instead of selecting by order', () => {
    const ambiguous: WidgetContributionEntry[] = [
      {
        name: 'x-acme-chrome',
        category: 'module',
        contributes: ['x-acme-first', 'x-acme-second'],
      },
      {
        name: 'x-acme-first',
        category: 'widget',
        widgetShape: { widgetName: 'SameWidget' },
      },
      {
        name: 'x-acme-second',
        category: 'widget',
        widgetShape: { widgetName: 'SameWidget' },
      },
    ];

    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'SameWidget' },
      ambiguous,
    )).toBeUndefined();
    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'SameWidget' },
      [...ambiguous].reverse(),
    )).toBeUndefined();
  });

  it('does not treat inherited Registry fields as contribution evidence', () => {
    const inheritedModule = Object.create({
      name: 'x-acme-chrome',
      category: 'module',
      contributes: ['x-acme-inherited'],
    }) as WidgetContributionEntry;
    const inheritedWidget = Object.create({
      name: 'x-acme-inherited',
      category: 'widget',
      widgetShape: { widgetName: 'InheritedWidget' },
    }) as WidgetContributionEntry;

    expect(resolveWidgetContribution(
      { moduleId: 'x-acme-chrome', widgetName: 'InheritedWidget' },
      [inheritedModule, inheritedWidget],
    )).toBeUndefined();
  });
});
