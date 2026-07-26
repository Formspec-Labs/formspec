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

    // The org step is a real form — the substrate's design center. v8 could not
    // walk the native path because nothing minted the Definition. v9 walks it:
    // declare the Definition, hang items on it, bind a definition-form slot.
    const declared = await mcp.declareDefinition({
      url: ONBOARDING_DEFINITION,
      version: '1.0.0',
    });

    const items = [
      { itemPath: '/organizationName', label: 'Organization name' },
      { itemPath: '/workspaceName', label: 'Workspace name' },
      { itemPath: '/workType', label: 'What kind of work?' },
    ];

    // The persona's first guess at a data type is `text/short`, from the mockup's
    // own field annotations. The refusal carries `details.validTypes`, so the
    // second attempt is informed by the error rather than by reading a spec —
    // exactly the loop an AI author would run. Both attempts are recorded.
    let dataType = 'text/short';
    let retriedAfterErrorDetails = false;
    const probe = await mcp.addDefinitionStub({
      definitionId: ONBOARDING_DEFINITION,
      itemPath: items[0].itemPath,
      label: items[0].label,
      dataType,
    });
    const firstAttempt = probe.ok
      ? `accepted "${dataType}"`
      : `refused "${dataType}" — ${probe.error.code}: ${probe.error.message}`;
    if (!probe.ok) {
      const details = probe.error.details as
        | { helperDetail?: { validTypes?: unknown } }
        | undefined;
      const valid = details?.helperDetail?.validTypes;
      if (Array.isArray(valid) && valid.every((v) => typeof v === 'string')) {
        dataType = valid.includes('text') ? 'text' : (valid[0] as string);
        retriedAfterErrorDetails = true;
      }
    }

    const stubs = [];
    for (const item of items) {
      stubs.push(
        await mcp.addDefinitionStub({
          definitionId: ONBOARDING_DEFINITION,
          itemPath: item.itemPath,
          label: item.label,
          dataType,
        }),
      );
    }
    const refusedStubs = stubs.filter((s) => !s.ok);

    // ── FINDING 21 — the Definition can now be minted and populated
    gap({
      id: 21,
      verb: 'declareDefinition + addDefinitionStub',
      family: 'mcp-verb-surface',
      wanted:
        'Mint the onboarding Definition inline and hang three items on it (organization name, workspace name, work type), then bind it as a `definition-form` slot — the one region in this corpus the substrate models natively.',
      got:
        declared.ok && refusedStubs.length === 0
          ? `declareDefinition accepted ${ONBOARDING_DEFINITION}, and all ${items.length} addDefinitionStub calls landed against it using dataType "${dataType}". The definition-form slot now references a Definition the manifest declares — the exact verb v8 asked for, in the exact shape v8 asked for it. One snag on the way, self-correcting: the first attempt ${firstAttempt}${retriedAfterErrorDetails ? ', and the refusal carried the valid set at `details.helperDetail.validTypes`, so the retry needed no spec' : ''}.`
          : declared.ok
            ? `declareDefinition accepted, but ${refusedStubs.length} of ${items.length} addDefinitionStub calls refused: ${refusedStubs.map((s) => (s.ok ? '' : `${s.error.code} — ${s.error.message}`)).join('; ')}`
            : `declareDefinition refused: ${declared.ok ? '' : `${declared.error.code} — ${declared.error.message}`}. The v8 result stands.`,
      severity: 'design-fit',
      why:
        'The wizard\'s step forms are the strongest design fit in the whole corpus, and this was the cheapest promotion in the v8 catalog. It shipped, and it works: one verb, one gap closed, no reshape.',
      v7Ref: 'F14',
      disposition: declared.ok && refusedStubs.length === 0 ? 'closed' : 'persists',
      suggestion: undefined,
    });

    for (const m of ['x-cloud-step-rail', 'x-cloud-tier-cards', 'x-cloud-region-picker', 'x-cloud-form-genesis']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'organization',
        path: '/onboarding/organization',
        routeClass: 'intake' as const,
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
        routeClass: 'operation' as const,
        title: 'Pick a deployment tier',
        slots: [
          {
            id: 'tierCards',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-tier-cards',
              widgetName: 'TierComparison',
              config: {
                dataSource: 'x-spike-v9:catalog:deployment-tiers',
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
        routeClass: 'operation' as const,
        title: 'Where should your data live?',
        slots: [
          {
            id: 'regionPicker',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-region-picker',
              widgetName: 'RegionPicker',
              config: {
                dataSource: 'x-spike-v9:catalog:regions',
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
        routeClass: 'operation' as const,
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
                dataSource: 'x-spike-v9:catalog:templates',
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
