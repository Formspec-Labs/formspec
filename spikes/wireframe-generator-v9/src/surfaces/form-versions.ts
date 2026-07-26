/**
 * @filedesc Translates `surfaces/form-versions.html` (route
 * `/forms/:id/versions`) — the diff surface: immutable version lineage with
 * lifecycle chips, an A/B compare selector, a semantic change list, and a
 * source-level unified diff over the definition's FEL files.
 *
 * Added on the v7 cross-check pass: v7's F11 (`diff` / `split-tree` slot) had no
 * exemplar among the first eleven translations, and the corpus turned out to
 * contain a full diff surface.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/form-versions';
const SURFACE_URL = `${BUNDLE}/surfaces/versions`;

export const formVersions: SurfaceScript = {
  id: 'form-versions',
  mockup: 'surfaces/form-versions.html',
  family: 'diff-compare',
  route: '/forms/:id/versions',
  surfaceId: 'versions',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Versions & diff',
  brief:
    'Version lineage and diff. Header states the immutability rule: every published version is pinned at submission, receipts cite the exact version hash, retiring a version retains its responses. Left rail lists versions with lifecycle chips (draft, active, retired) and change summaries. Compare selector picks an A side and a B side. Semantic change list marks each change as added, removed, or modified, in product language ("cap raised from 0.10 to 0.12. Existing responses under v1.0.2 remain validated against the old rule"). Below it, a source-level unified diff over the definition\'s FEL files with hunk headers and line numbers.',

  async author({ mcp, gap, bindRoute }) {
    // ── FINDING 35 — no diff / compare slot type (v7 F11 recurs)
    gap({
      id: 35,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'A compare slot: two version refs, an alignment key, and two rendering registers — a semantic change list (rule cap raised, locale key added, bind removed) and a source-level unified diff — over the same alignment.',
      got:
        'Two opaque modules and a hand-rolled selector. The substrate owns both sides of this comparison — they are its own Definition documents — and still cannot express that the surface compares them.',
      severity: 'missing-feature',
      why:
        'This is the strongest form of the gap in the corpus: the artifacts being diffed are Formspec artifacts. If the substrate cannot describe a diff of its own documents, no consumer can generate one consistently, and the change list a reviewer approves is whatever a widget decided to render.',
      v7Ref: 'F11',
      suggestion:
        'A `compare` slot type: two artifact refs of the same kind, an alignment strategy, and a declared change taxonomy (`added` | `removed` | `modified` | `annotated`) the renderer maps to registers.',
    });

    // ── FINDING 36 — artifact lineage and pinning have no substrate expression
    gap({
      id: 36,
      verb: 'bindSlot',
      family: 'state-and-status',
      wanted:
        'Declare version lineage as first-class: an ordered chain of immutable versions with lifecycle states, content hashes, the pinning rule ("receipts cite the exact version hash they were submitted against"), and the retention rule for responses under a retired version.',
      got:
        'A list module with strings. Lifecycle, hash, pin, and retention are conventions inside the widget, so the surface that explains the product\'s immutability guarantee is itself unverifiable.',
      severity: 'missing-feature',
      why:
        'Version pinning is what makes a receipt mean something years later. The rule appears on the versions surface, the response detail, the receipt, and the certificate. Four renderings, one shared invariant, zero substrate expression of it.',
      v7Ref: null,
      suggestion:
        'A `lineage` data-source kind returning an ordered version chain with lifecycle, hash, and supersession edges, plus a slot kind that renders it — so the pin claim is checkable rather than typeset.',
    });

    for (const m of ['x-cloud-version-lifecycle', 'x-cloud-compare-selector', 'x-cloud-change-list', 'x-cloud-source-diff']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'versions',
        path: '/forms/:id/versions',
        routeClass: 'operation' as const,
        title: 'Versions & diff',
        slots: [
          {
            id: 'immutabilityHeader',
            slotType: 'static-content' as const,
            binding: {
              kind: 'text',
              content:
                'Every published version is immutable and pinned at submission. Receipts cite the exact version hash they were submitted against. Retiring a version retains every response under it.',
            },
            title: 'Versions & diff',
            position: 'top',
            mockupRegion: 'immutability statement + download / publish actions',
          },
          {
            id: 'versionRail',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-version-lifecycle',
              widgetName: 'VersionRail',
              config: {
                dataSource: 'x-spike-v9:workspace:forms/:id/versions',
                lifecycle: ['draft', 'active', 'retired'],
                publishes: 'x-spike-v9:channel:compare-sides',
              },
            },
            title: 'Versions',
            position: 'left',
            mockupRegion: 'version rail — v1.0.4 draft, v1.0.3 active, v1.0.2/v1.0.1 retired with change summaries',
          },
          {
            id: 'compareSelector',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-compare-selector',
              widgetName: 'CompareSelector',
              config: {
                consumes: 'x-spike-v9:channel:compare-sides',
                sides: ['a', 'b'],
                summary: ['changes', 'linesAdded', 'linesRemoved'],
              },
            },
            title: 'Compare',
            position: 'main',
            mockupRegion: 'A/B compare selector with 7 changes · +18 / −9 lines',
          },
          {
            id: 'changeList',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-change-list',
              widgetName: 'SemanticChangeList',
              config: {
                consumes: 'x-spike-v9:channel:compare-sides',
                changeTaxonomy: ['added', 'removed', 'modified'],
                register: 'plain-language',
              },
            },
            title: 'What changed',
            position: 'main',
            mockupRegion: 'semantic change list in product language, with the back-compat note per change',
          },
          {
            id: 'sourceDiff',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-source-diff',
              widgetName: 'UnifiedDiff',
              config: {
                consumes: 'x-spike-v9:channel:compare-sides',
                files: ['rules/budget.fspec', 'fields/org.fspec', 'binds/total.fspec'],
                register: 'source',
              },
            },
            title: 'Source diff',
            position: 'main',
            mockupRegion: 'unified FEL diff with hunk headers and line numbers',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Versions & diff policy',
      routePolicies: [{ routeId: 'versions', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
