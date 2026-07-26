/**
 * @filedesc Translates `surfaces/form-edit.html` (route `/forms/:id/edit`) —
 * the editor shell: draft chrome with autosave and publish, lens tabs, spec
 * outline, full-bleed Studio canvas slot, inspector pane bound to the selected
 * bind, AI-provenance block, and a lint footer carrying real rule codes.
 */
import type { SurfaceScript } from '../harness.js';

const BUNDLE = 'https://formspec.cloud/apps/console/form-edit';
const SURFACE_URL = `${BUNDLE}/surfaces/editor`;

export const formEdit: SurfaceScript = {
  id: 'form-edit',
  mockup: 'surfaces/form-edit.html',
  family: 'editor-shell',
  route: '/forms/:id/edit',
  surfaceId: 'editor',
  bundleId: BUNDLE,
  surfaceUrl: SURFACE_URL,
  title: 'Edit — 2026 Community Grant Application',
  brief:
    'Editor shell wrapping the Studio canvas. Header carries draft state, autosave timestamp, preview-as-respondent, save draft, publish. Lens tabs (Design / Logic / Theme / Spec). Left pane is a spec outline: fields, binds, rules, locales, theme, signature, with counts. Center is a full-bleed slot owned by @formspec-org/studio — our chrome wraps, their canvas owns. Right pane is an inspector bound to whatever the canvas has selected: identity, type, validation, FEL rule, per-locale help text, and AI-edit provenance. Footer carries spec validity, bind verifiability, and lint findings with codes.',

  async author({ mcp, gap, bindRoute, registryDeclared, registryUrl }) {
    // ── FINDING 18 — the registry can be named; nothing can fill it
    //
    // v8 recorded this as "no verb to admit a module or to point the validator
    // at a registry". Half of that is now false: `declareRegistry` exists and
    // takes the URL. The other half held exactly as written — the verb makes a
    // Registry *referenceable*, and no verb writes an entry into it, so the
    // author who just declared the registry has nothing to declare into it.
    gap({
      id: 18,
      verb: 'declareRegistry / declareModule / bindSlot(module-widget)',
      family: 'mcp-verb-surface',
      wanted:
        'Slot the first-party Studio canvas (`@formspec-org/studio`) into the editor route and have the graph resolve it — this is a shipped package in the same org, not a tenant extension.',
      got: registryDeclared
        ? `\`declareRegistry\` accepted ${registryUrl} and \`declareModule\` accepted the id — then the validator still emits MODULE-* because the Registry the manifest now points at has no entries and no verb can give it any. The verb published the pointer, not the content; its own docstring says so.`
        : '`declareRegistry` refused, so the v8 result stands verbatim: MODULE-UNRESOLVED and MODULE-CONTRIBUTION-MISSING with no admission path at all.',
      severity: 'reshape-needed',
      why:
        'The product\'s own designer still cannot be composed into the product\'s own app graph through the product\'s own authoring MCP. The gap moved one hop — from "no registry" to "an empty registry" — and MODULE-* remains the highest-count diagnostic in the run.',
      v7Ref: null,
      disposition: 'narrowed',
      suggestion:
        '`declareRegistryEntry({ registryUrl, name, category, version, contributes })` as the missing peer of `declareRegistry`, or a first-party registry the platform serves so `x-formspec-studio-canvas` resolves without any tenant authoring at all.',
    });

    // ── FINDING 19 — inspector pane needs the cross-slot selection contract
    gap({
      id: 19,
      verb: 'bindSlot',
      family: 'cross-slot-contract',
      wanted:
        'The inspector renders whatever the canvas has selected ($budget.indirect). Declaring "this slot consumes the selection published by that slot" would let the validator check that the inspector\'s fields exist on the selected artifact kind.',
      got:
        'No cross-slot channel. Selection is module-private state shared out of band between two slots the graph believes are unrelated.',
      severity: 'missing-feature',
      why:
        'Editor and master-detail layouts are half the authenticated corpus (form-edit, form-detail, response-detail, envelope-detail, dev-webhooks, admin-members). The relationship the user perceives as central is the one the graph cannot see.',
      v7Ref: 'F5',
      suggestion:
        '`publishes` / `consumes` named channels on the slot shape, validated for existence and type at graph time.',
    });

    // ── FINDING 34 — no `tree` slot type (v7 F2 recurs; recorded on the v7 cross-check pass)
    gap({
      id: 34,
      verb: 'bindSlot',
      family: 'slot-taxonomy',
      wanted:
        'The spec outline is a tree: six groups (fields, binds, rules, locales, theme, signature) with counts, expand/collapse, and per-node selection that drives the inspector. A `tree` slot bound to the draft definition would let the validator check that the node kinds match the artifact\'s own structure.',
      got:
        'A module. The outline renders the substrate\'s own Definition document, and the substrate has no primitive for rendering a hierarchy of it.',
      severity: 'missing-feature',
      why:
        'v7 found this against a policy source vault and it recurs here against the product\'s own definition outline — the same shape appears in the WOS case tree and the response-detail answer groups. Hierarchy is not an authoring-tool peculiarity; it is how structured artifacts are navigated.',
      v7Ref: 'F2',
      suggestion:
        '`tree` slot type with a node-shape contract (id, parentId, label, kind, count) and a selection channel — the same channel finding 19 asks for.',
    });

    for (const m of ['x-formspec-studio-canvas', 'x-cloud-spec-outline', 'x-cloud-inspector', 'x-cloud-lint-footer']) {
      const declared = await mcp.declareModule({ id: m, version: '0.1.0' });
      if (!declared.ok) throw new Error(`declareModule refused: ${declared.error.code}`);
    }

    const routes = [
      {
        routeId: 'edit',
        path: '/forms/:id/edit',
        routeClass: 'operation' as const,
        title: 'Edit',
        slots: [
          {
            id: 'editorChrome',
            slotType: 'static-content' as const,
            binding: { kind: 'heading', content: '2026 Community Grant Application', level: 1 },
            title: 'Editing v1.0.4 (draft)',
            position: 'top',
            mockupRegion: 'editor header — draft chip, "Saved 4s ago · auto-save on", preview/save/publish actions',
          },
          {
            id: 'lensTabs',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-spec-outline',
              widgetName: 'LensTabs',
              config: { lenses: ['design', 'logic', 'theme', 'spec'] },
            },
            title: 'Lenses',
            position: 'top',
            mockupRegion: 'lens tab bar (Design / Logic / Theme / Spec)',
          },
          {
            id: 'specOutline',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-spec-outline',
              widgetName: 'SpecOutline',
              config: {
                dataSource: 'x-spike-v9:workspace:forms/:id/draft-definition',
                groups: ['fields', 'binds', 'rules', 'locales', 'theme', 'signature'],
                publishes: 'x-spike-v9:selection:bind',
              },
            },
            title: 'Spec',
            position: 'left',
            mockupRegion: 'spec outline tree — 18 fields, 2 binds, 7 rules, 3 locales',
          },
          {
            id: 'studioCanvas',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-formspec-studio-canvas',
              widgetName: 'StudioCanvas',
              config: {
                dataSource: 'x-spike-v9:workspace:forms/:id/draft-definition',
                fullBleed: true,
                publishes: 'x-spike-v9:selection:bind',
              },
            },
            title: 'Canvas',
            position: 'main',
            mockupRegion: 'full-bleed Studio canvas — our chrome wraps, their canvas owns',
          },
          {
            id: 'inspector',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-inspector',
              widgetName: 'BindInspector',
              config: {
                consumes: 'x-spike-v9:selection:bind',
                sections: ['identity', 'type', 'validation', 'fel-rule', 'help-text-by-locale', 'provenance'],
              },
            },
            title: 'Inspector',
            position: 'right',
            mockupRegion: 'inspector — $budget.indirect identity/type/validation/FEL rule/locale help/AI provenance',
          },
          {
            id: 'lintFooter',
            slotType: 'module-widget' as const,
            binding: {
              moduleId: 'x-cloud-lint-footer',
              widgetName: 'LintFooter',
              config: {
                dataSource: 'x-spike-v9:workspace:forms/:id/lint',
                severities: ['error', 'warning', 'info'],
              },
            },
            title: 'Validation',
            position: 'bottom',
            mockupRegion: 'lint footer — spec valid, 2/2 binds verifiable, L201 locale key missing, A104 reading grade',
          },
        ],
      },
    ];

    for (const route of routes) await bindRoute(route);

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      title: 'Form editor policy',
      routePolicies: [{ routeId: 'edit', a11y: { landmark: 'main', keyboardNavigation: true } }],
    });
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.code}`);

    return { routes, policy: policy.value };
  },
};
