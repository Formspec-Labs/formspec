/**
 * @filedesc Translates `surfaces/onboarding.html` (route `/onboarding`) — the
 * five-step first-run wizard: step rail with completion state, org form, tier
 * selection cards with pricing, region picker with an irreversibility warning,
 * first-form chooser, publish & share. The one surface where the substrate's
 * intake-shaped primitives fit natively — so it is also the surface that shows
 * exactly where the fit stops.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/onboarding';
const SURFACE_URL = `${BUNDLE}/surfaces/wizard`;
const ONBOARDING_DEFINITION = 'https://formspec.cloud/definitions/onboarding-org';

export const onboarding: SurfaceScript = {
  id: 'onboarding',
  mockup: 'surfaces/onboarding.html',
  family: 'wizard',
  route: '/onboarding',
  surfaceId: 'wizard',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Get started',
  brief:
    'Five-step first-run wizard. Left rail lists steps with completion state and an estimated time. Step 2 collects organization name, workspace name, and work type. Step 3 presents four deployment tiers as comparison cards with prices and procurement claims. Step 4 picks a region and warns that the choice is irreversible after publishing. Step 5 creates the first form from template, import, prompt, or blank. Step 6 publishes and shares, producing a real public URL and a webhook. Every choice is revisable except region.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 20 — no step-sequence (wizard) contract
    gap({
      id: 20,
      verb: 'addRoute / bindSlot',
      family: 'app-composition',
      wanted:
        'An ordered step sequence: five steps, each with a completion predicate, a back/continue pair, a resumable position, and a rail that renders progress. The substrate should know step 4 cannot be entered before step 3 completes.',
      got:
        'Routes are an unordered set. Sequencing, gating, progress, and resumability are module state. Nothing stops a route from being deep-linked out of order, and nothing declares which steps are irreversible.',
      severity: 'missing-feature',
      why:
        'This is the "first hour is the product" surface, and it is one step from being expressible: the substrate already models multi-unit intake flows for respondents. The wizard shape exists for the respondent and not for the customer.',
      v7Ref: null,
      suggestion:
        'A `flow` axis on the Surface: ordered `steps[]` naming routeIds, each with `completeWhen` and an `irreversible` flag; the rail becomes a substrate-rendered region.',
    });

    // The org step is a real form — the substrate's design center. Try the
    // native path: mint a Definition, add items, bind a definition-form slot.
    const stub = await mcp.addDefinitionStub({
      definitionId: ONBOARDING_DEFINITION,
      itemPath: '/organizationName',
      label: 'Organization name',
      dataType: 'text/short',
    });

    // ── FINDING 21 — definition-form fits; minting the Definition still does not
    gap({
      id: 21,
      verb: 'addDefinitionStub',
      family: 'mcp-verb-surface',
      wanted:
        'Mint the onboarding Definition inline and hang three items on it (organization name, workspace name, work type), then bind it as a `definition-form` slot — the one region in this corpus the substrate models natively.',
      got: stub.ok
        ? 'addDefinitionStub accepted the item against an id the journey never created — so the form is authored against a Definition with no declared existence.'
        : `addDefinitionStub refused: ${stub.error.code} — ${stub.error.message}. There is no verb that creates the Definition the journey needs.`,
      severity: 'missing-feature',
      why:
        'The wizard\'s step forms are the strongest design fit in the whole corpus: `definition-form` is exactly right for them. The blocker is one missing verb, not a missing concept — which makes it the cheapest promotion in this catalog.',
      v7Ref: 'F14',
      suggestion:
        '`declareDefinition({ url, version, title })` as a peer of `wireframeFromBrief`; `addDefinitionStub` then attaches items to a Definition the graph knows exists.',
    });

    for (const m of ['x-cloud-step-rail', 'x-cloud-tier-cards', 'x-cloud-region-picker', 'x-cloud-form-genesis']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'organization',
        path: '/onboarding/organization',
        title: 'Tell us about your organization',
        slots: [
          {
            id: 'stepRail',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-step-rail',
              widgetName: 'StepRail',
              config: {
                steps: ['account', 'organization', 'tier', 'region', 'first-form', 'publish'],
                current: 'organization',
                estimate: '7 minutes',
              },
            },
            title: 'Steps',
            position: 'left',
            mockupRegion: 'step rail with completion ticks and estimated time',
          },
          {
            id: 'orgForm',
            slotType: 'definition-form' as const,
            binding: { definitionRef: ONBOARDING_DEFINITION, version: '1.0.0' },
            title: 'Organization',
            position: 'main',
            mockupRegion: 'org name + workspace + work-type form (the native design fit)',
          },
        ],
      },
      {
        routeId: 'tier',
        path: '/onboarding/tier',
        title: 'Pick a deployment tier',
        slots: [
          {
            id: 'tierCards',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-tier-cards',
              widgetName: 'TierComparison',
              config: {
                dataSource: 'x-spike-v8:catalog:deployment-tiers',
                tiers: ['shared', 'regulated', 'dedicated', 'air-gap'],
                recommended: 'regulated',
              },
            },
            title: 'Deployment tier',
            position: 'main',
            mockupRegion: 'four tier cards with price, claims, and a recommendation badge',
          },
        ],
      },
      {
        routeId: 'region',
        path: '/onboarding/region',
        title: 'Where should your data live?',
        slots: [
          {
            id: 'regionPicker',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-region-picker',
              widgetName: 'RegionPicker',
              config: {
                dataSource: 'x-spike-v8:catalog:regions',
                irreversibleAfter: 'first-publish',
              },
            },
            title: 'Region',
            position: 'main',
            mockupRegion: 'region picker with "you cannot move data after publishing" warning',
          },
        ],
      },
      {
        routeId: 'first-form',
        path: '/onboarding/first-form',
        title: 'Create your first form',
        slots: [
          {
            id: 'genesis',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-form-genesis',
              widgetName: 'FormGenesis',
              config: {
                paths: ['template', 'import', 'prompt-to-form', 'blank'],
                dataSource: 'x-spike-v8:catalog:templates',
              },
            },
            title: 'First form',
            position: 'main',
            mockupRegion: 'template / import / prompt-to-form / blank chooser plus template gallery',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Onboarding wizard policy',
      routePolicies: [
        { routeId: 'organization', a11y: { landmark: 'main', keyboardNavigation: true } },
        { routeId: 'tier', a11y: { landmark: 'main', keyboardNavigation: true } },
        { routeId: 'region', a11y: { landmark: 'main', keyboardNavigation: true } },
        { routeId: 'first-form', a11y: { landmark: 'main', keyboardNavigation: true } },
      ],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
