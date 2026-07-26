/**
 * @filedesc Translates `surfaces/forms-index v3.html` (route
 * `/o/:org/w/:ws/forms`) — the Form Owner's home list: stat strip, state tabs,
 * search + filter chips, group-by control, bulk-action bar, grouped form rows
 * with proof-distribution bars, and a first-class empty state.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/forms-index';
const SURFACE_URL = `${BUNDLE}/surfaces/forms`;

export const formsIndex: SurfaceScript = {
  id: 'forms-index',
  mockup: 'surfaces/forms-index v3.html',
  family: 'collection-index',
  route: '/o/:org/w/:ws/forms',
  surfaceId: 'forms',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Forms',
  brief:
    'Form Owner home. Header stat strip (14 forms · 9 live · 1 closing this week · 26 824 responses all-time). State tab bar with per-state counts. Search box plus removable filter chips (deployment, owner). Group-by and sort controls. Bulk-selection action bar (pause, duplicate, move to program, tag, export, archive). Pinned section then program-grouped form rows, each carrying state chip, intake window, owner, active + draft version, deployment tier, definition id, tags, proof-distribution bar, completion meter, new-response delta, last activity, and row actions. Empty state when a filter matches nothing.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 7 — no `list` slot type (v7 F8 recurs under real SaaS demand)
    gap({
      id: 7,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'A `list` (collection) slot type: rows bound to a data source, per-row columns, row state chip, row actions, grouping, sort, pagination.',
      got:
        'slotType ∈ { definition-form, experience-unit, module-widget, static-content, embed-route }. The product\'s primary owner surface becomes one `module-widget` the substrate cannot see into.',
      severity: 'missing-feature',
      why:
        'Forms index is the authenticated home of the paying persona. If the substrate cannot describe it, the substrate does not describe the product — it describes the intake form the product sells.',
      v7Ref: 'F8',
      suggestion:
        'Promote `collection` as a sixth slot type: dataSource + column descriptors + rowActions[] + grouping/sort/pagination declarations.',
    });

    // ── FINDING 8 — no `filter-bar` slot type (v7 F7 recurs)
    gap({
      id: 8,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'A `filter-bar` slot type carrying facets (state, deployment, owner, program), chip removal, free-text search, and a declared feed into the list slot.',
      got:
        'A second opaque `module-widget`. The filter→list relationship is invisible to the validator, so nothing checks that the facets the bar offers exist on the collection the list renders.',
      severity: 'missing-feature',
      why:
        'Every authenticated index surface in the mockup set (forms, responses, envelopes, webhooks, audit, members) carries a filter bar. Six of the eleven translated surfaces hit this.',
      v7Ref: 'F7',
      suggestion:
        'Promote `filter-bar` with facet descriptors typed against the target collection\'s data source, plus a named producer→consumer edge (see the cross-slot contract gap).',
    });

    // ── FINDING 9 — static-content has no metric/stat kind (v7 F13 recurs)
    gap({
      id: 9,
      verb: 'bindSlot(static-content)',
      family: 'slot-taxonomy',
      wanted:
        'A `stat-strip` static-content kind: labelled metrics bound to a data source ("14 forms", "9 live", "26 824 responses all-time"), with a delta and a threshold state.',
      got:
        '`static-content` accepts authored strings only. Live counts are not authored strings; they are the header of every SaaS surface in the corpus. Falls back to `heading`, losing the numbers entirely.',
      severity: 'missing-feature',
      why:
        'Ten of the eleven translated surfaces open with a data-bound header strip. Authoring them as headings throws away the product\'s primary information scent.',
      v7Ref: 'F13',
      suggestion:
        'Extend static-content kinds with `stat-strip` (label/value/delta/threshold, each value a data-source path) and `badge-row`.',
    });

    // ── FINDING 10 — collection state (empty / loading / partial / error) is unauthorable
    gap({
      id: 10,
      verb: 'bindSlot',
      family: 'state-and-status',
      wanted:
        'Per-slot state variants: the mockup ships a designed empty state ("No forms here yet" with a create affordance), and the product needs loading, partial-result, and fetch-error variants alongside it.',
      got:
        'A slot binds one shape. There is no place to declare "this is what this region renders when the collection is empty / still loading / failed". State variants live in module code the substrate cannot inspect.',
      severity: 'missing-feature',
      why:
        'Empty and error states are where SaaS UIs are won or lost, and where accessibility and copy review actually matter. Leaving them out of the graph means the substrate cannot lint the states a user is most likely to be stuck in.',
      v7Ref: null,
      suggestion:
        'Add `stateVariants` to the slot shape — a closed set (`empty` | `loading` | `partial` | `error` | `unauthorized`) each binding a static-content or slot-shaped fallback.',
    });

    // ── FINDING 11 — no multi-subject (bulk) action contract
    gap({
      id: 11,
      verb: 'bindSlot / Response Actions',
      family: 'action-vocabulary',
      wanted:
        'A bulk-action contract: "2 selected across 1 program → pause / duplicate / move / tag / export / archive", each action naming its subject set, its authority requirement, and its confirmation posture.',
      got:
        'Response Actions are shaped for one respondent completing one response. Nothing expresses an action whose subject is a selection of N workspace artifacts. The whole bar becomes module-private.',
      severity: 'reshape-needed',
      why:
        'Bulk operations are the reason an owner with 14 forms and 26 824 responses uses a console instead of a spreadsheet. They are also the highest-blast-radius actions in the product, so they are exactly the ones an audit trail must carry.',
      v7Ref: null,
      suggestion:
        'Extend the reviewer-action family (v7 F9) with a `subjectSelector` axis: single | selection | filtered-set, plus a required confirmation/step-up posture per action.',
    });

    const listModule = await mcp.declareModule({ id: 'x-cloud-forms-collection', version: '0.1.0' });
    if (!listModule.ok) throw new Error(`declareModule refused: ${listModule.error.code}`);
    const filterModule = await mcp.declareModule({ id: 'x-cloud-filter-bar', version: '0.1.0' });
    if (!filterModule.ok) throw new Error(`declareModule refused: ${filterModule.error.code}`);
    const bulkModule = await mcp.declareModule({ id: 'x-cloud-bulk-action-bar', version: '0.1.0' });
    if (!bulkModule.ok) throw new Error(`declareModule refused: ${bulkModule.error.code}`);

    const routes = [
      {
        routeId: 'index',
        path: '/o/:org/w/:ws/forms',
        routeClass: 'operation' as const,
        title: 'Forms',
        slots: [
          {
            id: 'headerStats',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: 'Forms', level: 1 },
            title: 'Forms',
            position: 'top',
            mockupRegion: 'header stat strip — 14 forms · 9 live · 1 closes this week · 26 824 responses',
          },
          {
            id: 'stateTabs',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-filter-bar',
              widgetName: 'StateTabs',
              config: {
                // x-spike-v9 — module-private. The cost of the data-source gap.
                dataSource: 'x-spike-v9:workspace:forms',
                facets: [{ id: 'state', values: ['all', 'live', 'paused', 'draft', 'closed', 'archived'] }],
              },
            },
            title: 'State',
            position: 'top',
            mockupRegion: 'state tab bar with per-state counts',
          },
          {
            id: 'filterBar',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-filter-bar',
              widgetName: 'FormsFilterBar',
              config: {
                dataSource: 'x-spike-v9:workspace:forms',
                facets: [
                  { id: 'deployment', values: ['shared', 'regulated', 'dedicated', 'air-gap'] },
                  { id: 'owner', source: 'x-spike-v9:workspace:members' },
                  { id: 'program', source: 'x-spike-v9:workspace:programs' },
                ],
                search: true,
                groupBy: ['program', 'recent-activity'],
              },
            },
            title: 'Filters',
            position: 'top',
            mockupRegion: 'search + removable filter chips + group-by/sort controls',
          },
          {
            id: 'bulkActions',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-bulk-action-bar',
              widgetName: 'BulkActionBar',
              config: {
                actions: ['pause', 'duplicate', 'move-to-program', 'add-tag', 'export', 'archive'],
                subject: 'x-spike-v9:selection:forms',
              },
            },
            title: 'Bulk actions',
            position: 'top',
            mockupRegion: 'bulk-selection action bar ("2 selected across 1 program")',
          },
          {
            id: 'formsList',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-forms-collection',
              widgetName: 'FormsCollection',
              config: {
                dataSource: 'x-spike-v9:workspace:forms',
                grouping: 'program',
                pinned: true,
                columns: [
                  'title', 'state', 'window', 'owner', 'activeVersion', 'draftVersion',
                  'deployment', 'definitionId', 'tags', 'proofDistribution', 'completion',
                  'newDelta', 'lastActivity',
                ],
                rowActions: ['copy-link', 'preview', 'more'],
                emptyState: 'x-spike-v9:state:no-forms',
              },
            },
            title: 'Forms',
            position: 'main',
            mockupRegion: 'pinned + program-grouped form rows with proof bars, completion meters, row actions',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Forms index policy',
      routePolicies: [{ routeId: 'index', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
