/**
 * @filedesc The six lifecycle stages, in order, over ONE exemplar.
 *
 * ADR 0159 §The lifecycle thread names six stages and carries evidence at one
 * of them. This module walks all six on the ADR 0152 §9 acceptance bundle and
 * records what the substrate actually holds after each.
 *
 * ## The actor handoff, and why it is shaped this way
 *
 * `ProposalManagerFacade` reads the acting actor from `context.authoredBy`,
 * fixed at kernel construction (`ProposalManagerFacade.ts:4241`), and
 * `assertKernelInjectionCarriesNoPosture` refuses a kernel supplied together
 * with posture options. **One kernel is one actor.** There is no verb that
 * hands an in-flight artifact from one actor to another.
 *
 * So the handoff is modelled the way a real deployment must model it: the human
 * opens a new session and the authored state is replayed under their pen. The
 * replay is not taken on trust — `handOffToHuman` asserts that the documents the
 * human's kernel exports equal the ones the agent's kernel exported, field for
 * field, except the `routeClass` values the agent was refused. A replay that
 * diverged would fail there rather than quietly produce a second artifact.
 * The absence of a handoff verb is recorded as a beat, not hidden.
 */
import { initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine';
import { createWireframesMcp, type WireframesMcp, type WireframesUiGraphPolicyInput } from '@formspec-org/mcp-wireframes';
import type { UiGraphPolicyDocument } from '@formspec-org/types';
import {
  AI_AGENT_URN,
  HUMAN_URN,
  LIFECYCLE_POSTURE,
  contextFor,
  realEvidenceSchemaValidators,
  realSchemaValidators,
  writeArtifact,
  type Evidence,
} from './harness.js';
import {
  APP_TITLE,
  BRIEF,
  BRIEF_TEXT,
  BUNDLE_ID,
  CHANGE_REQUEST,
  DEFINITION_URL,
  DESIGNER_INSERTION,
  DESIGNER_RETITLE,
  ITEMS,
  REGENERATED_ROUTES,
  ROUTES,
  SUBMIT_ACTION,
  STAFF_SURFACE_ID,
  STAFF_SURFACE_URL,
  SURFACE_ID,
  SURFACE_URL,
  TENANT_MODULE,
  TENANT_TOKEN,
  TENANT_TOKEN_VALUE,
  UNITS,
  contributionIdFor,
  type RouteSpec,
  type UnitSpec,
} from './exemplar.js';

let engineReady: Promise<void> | undefined;
export function ensureEngine(): Promise<void> {
  engineReady ??= (async () => {
    await initFormspecEngine();
    await initFormspecEngineTools();
  })();
  return engineReady;
}

export function mcpFor(kind: 'ai-agent' | 'human', session: string): WireframesMcp {
  return createWireframesMcp(contextFor(kind, session), undefined, {
    postureDeclaration: LIFECYCLE_POSTURE,
  });
}

/** Reads the bundle-scope hash out of a minted URN so URNs are never guessed. */
function scopeOf(manifest: unknown): string {
  const url = (manifest as { experience?: { url?: string } } | undefined)?.experience?.url ?? '';
  return url.split(':')[3] ?? '';
}

async function manifestOf(mcp: WireframesMcp): Promise<Record<string, unknown>> {
  const preview = await mcp.renderPreview();
  if (!preview.ok) throw new Error(`renderPreview refused: ${preview.error.message}`);
  return preview.value as Record<string, unknown>;
}

async function surfaceOf(mcp: WireframesMcp, surfaceId: string = SURFACE_ID): Promise<unknown> {
  const exported = await mcp.kernel.exportSurfaceDocument({ surfaceId });
  if (exported.ok) return exported.value;
  const draft = await mcp.kernel.readSurfaceDraft({ surfaceId });
  if (!draft.ok) throw new Error(`readSurfaceDraft(${surfaceId}) refused: ${draft.error.message}`);
  return draft.value.surface;
}


/**
 * Mints the Response Actions document the route transitions resolve against.
 * `addAction` creates it on first call (ADR 0160 §4.2(b): the mint and the
 * declaration are one op), so there is no separate declare verb to call.
 */
async function declareSubmitAction(mcp: WireframesMcp): Promise<{ ok: boolean; message?: string }> {
  const manifest = await manifestOf(mcp);
  const urn = `urn:formspec:doc:${scopeOf(manifest)}:responseActions`;
  const added = await mcp.kernel.addAction({
    responseActionsId: urn,
    action: { id: SUBMIT_ACTION.id, intent: SUBMIT_ACTION.intent, effects: [...SUBMIT_ACTION.effects] },
  });
  return added.ok ? { ok: true } : { ok: false, message: `${added.error.code} — ${added.error.message}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Authoring primitives, shared by the first walk and by the regeneration walk
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthoredBaseline {
  routeClassRefusals: Array<{ routeId: string; routeClass: string; code: string; message: string; details?: Record<string, unknown> }>;
}

/**
 * Everything an `ai-agent` can author on this bundle: the brief, the units, the
 * Definition, the routes, and the slots. `classify` decides whether the routes
 * are offered with their `routeClass` — the agent offers it and is refused, the
 * human supplies it and is admitted. Both paths run the SAME function so the
 * only variable between them is who holds the pen.
 */
export async function authorBaseline(
  mcp: WireframesMcp,
  opts: {
    units: readonly UnitSpec[];
    items: readonly { path: string; label: string; dataType: string }[];
    classify: boolean;
    /** Defaults to the exemplar's own routes; the regeneration passes its own. */
    routes?: readonly RouteSpec[];
  },
): Promise<AuthoredBaseline> {
  const created = await mcp.wireframeFromBrief({
    bundleId: BUNDLE_ID,
    version: '1.0.0',
    title: APP_TITLE,
    brief: BRIEF_TEXT,
    surfaceUrl: SURFACE_URL,
    surfaceVersion: '1.0.0',
  });
  if (!created.ok) throw new Error(`wireframeFromBrief refused: ${created.error.message}`);

  const staff = await mcp.kernel.addSurface({ url: STAFF_SURFACE_URL, version: '1.0.0' });
  if (!staff.ok) throw new Error(`addSurface(staff) refused: ${staff.error.message}`);

  for (const unit of opts.units) {
    const added = await mcp.addExperienceUnit({
      unitId: unit.unitId,
      kind: unit.kind,
      title: unit.title,
      actorRef: unit.actorRef,
      taskRefs: [...unit.taskRefs],
    });
    if (!added.ok) throw new Error(`addExperienceUnit(${unit.unitId}) refused: ${added.error.message}`);
  }

  const declared = await mcp.declareDefinition({ url: DEFINITION_URL, version: '1.0.0' });
  if (!declared.ok) throw new Error(`declareDefinition refused: ${declared.error.message}`);
  for (const item of opts.items) {
    const added = await mcp.addDefinitionStub({
      definitionId: DEFINITION_URL,
      itemPath: item.path,
      label: item.label,
      dataType: item.dataType,
    });
    if (!added.ok) throw new Error(`addDefinitionStub(${item.path}) refused: ${added.error.message}`);
  }

  const action = await declareSubmitAction(mcp);
  if (!action.ok) throw new Error(`addAction refused: ${action.message}`);

  const routes = opts.routes ?? ROUTES;
  const routeClassRefusals: AuthoredBaseline['routeClassRefusals'] = [];
  for (const route of routes) {
    if (opts.classify) {
      const classified = await mcp.addRoute({
        surfaceId: route.surfaceId,
        routeId: route.routeId,
        path: route.path,
        title: route.title,
        routeClass: route.routeClass,
      });
      if (!classified.ok) throw new Error(`addRoute(${route.routeId}) refused: ${classified.error.message}`);
    } else {
      // The agent offers the class it believes the route carries and is refused.
      const attempt = await mcp.addRoute({
        surfaceId: route.surfaceId,
        routeId: route.routeId,
        path: route.path,
        title: route.title,
        routeClass: route.routeClass,
      });
      if (!attempt.ok) {
        routeClassRefusals.push({
          routeId: route.routeId,
          routeClass: route.routeClass,
          code: attempt.error.code,
          message: attempt.error.message,
          details: attempt.error.details as Record<string, unknown> | undefined,
        });
      }
      // The refusal is legible, not fatal: the same route without the protected
      // field lands, so the agent keeps drafting.
      const unclassified = await mcp.addRoute({
        surfaceId: route.surfaceId,
        routeId: route.routeId,
        path: route.path,
        title: route.title,
      });
      if (!unclassified.ok) throw new Error(`addRoute(${route.routeId}) unclassified refused: ${unclassified.error.message}`);
    }

    for (const slot of route.slots) {
      const title = slot.title;
      const bound = await mcp.bindSlot({
        surfaceId: route.surfaceId,
        routeId: route.routeId,
        slotId: slot.slotId,
        slotType: slot.slotType,
        binding: slot.binding,
        ...(title !== undefined ? { title } : {}),
      });
      if (!bound.ok) throw new Error(`bindSlot(${slot.slotId}) refused: ${bound.error.message}`);
    }
  }
  // Transitions are a second pass: the target route must already exist.
  for (const route of routes) {
    if (route.transitionTo === undefined) continue;
    const t = await mcp.kernel.addTransition({
      surfaceId: route.surfaceId,
      routeId: route.routeId,
      transition: { trigger: 'submit', to: route.transitionTo },
    });
    if (!t.ok) throw new Error(`addTransition(${route.routeId}) refused: ${t.error.message}`);
  }
  return { routeClassRefusals };
}

/** The 0160 verb family: bundle-local Registry + its entries, then the modules. */
export async function materialiseRegistry(mcp: WireframesMcp): Promise<{ registryUrl: string; entries: number }> {
  const registry = await mcp.declareRegistry({ version: '1.0.0' });
  if (!registry.ok) throw new Error(`declareRegistry refused: ${registry.error.message}`);

  const widgets = ROUTES.map((r) => r.chromeWidget);
  const moduleEntry = await mcp.addRegistryEntry({
    entry: {
      name: TENANT_MODULE,
      category: 'module',
      version: '0.1.0',
      status: 'stable',
      description: 'Tenant chrome module for the rent-assistance app.',
      compatibility: { formspecVersion: '>=1.0.0' },
      contributes: widgets.map(contributionIdFor),
    },
  });
  if (!moduleEntry.ok) throw new Error(`addRegistryEntry(module) refused: ${moduleEntry.error.message}`);

  let entries = 1;
  for (const widget of widgets) {
    // ADR 0160 §2.4's three vocabularies stay apart: `name` is the `^x-[a-z]…`
    // contribution id, `widgetName` lands in `widgetShape.widgetName`.
    const entry = await mcp.addRegistryEntry({
      entry: {
        name: contributionIdFor(widget),
        category: 'widget',
        version: '0.1.0',
        status: 'stable',
        description: `Widget ${widget} contributed by ${TENANT_MODULE}.`,
        compatibility: { formspecVersion: '>=1.0.0' },
        widgetShape: {
          props: { type: 'object' },
          childrenPolicy: 'no-children',
          tokenSlots: [{ name: 'surface', acceptedTokenCategories: ['color'] }],
        },
      },
      widgetName: widget,
    });
    if (!entry.ok) throw new Error(`addRegistryEntry(${widget}) refused: ${entry.error.message}`);
    entries += 1;
  }

  const declaredModule = await mcp.declareModule({ id: TENANT_MODULE, version: '0.1.0' });
  if (!declaredModule.ok) throw new Error(`declareModule refused: ${declaredModule.error.message}`);

  return { registryUrl: registry.value.url, entries };
}

/**
 * The UI Graph Policy the release stage validates against. Every route's chrome
 * widget carries a tenant-brand token assignment — including the three the
 * product's own trust story says MUST NOT be tenant-themed. Whether the
 * substrate refuses is the measurement, not an assertion.
 */
export function tenantThemedPolicyInputs() {
  return [
    { surfaceId: SURFACE_ID, surfaceUrl: SURFACE_URL, title: 'Tenant chrome policy — respondent' },
    { surfaceId: STAFF_SURFACE_ID, surfaceUrl: STAFF_SURFACE_URL, title: 'Tenant chrome policy — staff' },
  ].map(({ surfaceId, surfaceUrl, title }) => {
    const routes = ROUTES.filter((r) => r.surfaceId === surfaceId);
    return {
      surfaceUrl,
      surfaceVersion: '1.0.0',
      title,
      routePolicies: routes.map((r) => ({ routeId: r.routeId, a11y: { landmark: 'main' as const } })) as unknown as WireframesUiGraphPolicyInput['routePolicies'],
      theme: {
        assignments: routes.map((r) => ({
          widgetRef: { moduleId: TENANT_MODULE, widgetName: r.chromeWidget },
          slot: 'surface',
          token: TENANT_TOKEN,
        })),
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1 — IDEA
// ─────────────────────────────────────────────────────────────────────────────

export interface WalkState {
  agent: WireframesMcp;
  human?: WireframesMcp;
  /** The Surface as the AI first produced it — `old-generated` for bar 5. */
  oldGeneratedSurface?: unknown;
  /** The Surface after the designer's edits — `designer-edited` for bar 5. */
  designerEditedSurface?: unknown;
  /** The Surface a fresh kernel produces from the amended brief. */
  newGeneratedSurface?: unknown;
  bundleExport?: { manifest: unknown; documents: Record<string, unknown> };
  policy?: UiGraphPolicyDocument;
  baseline?: AuthoredBaseline;
}

export async function stageIdea(ev: Evidence, state: WalkState): Promise<void> {
  ev.openStage(
    'idea',
    'Someone describes the job in four sentences. Before a single field exists, the AI writes down who is involved and what each of them is trying to get done — one entry per sentence of the brief.',
  );

  const created = await state.agent.wireframeFromBrief({
    bundleId: BUNDLE_ID,
    version: '1.0.0',
    title: APP_TITLE,
    brief: BRIEF_TEXT,
    surfaceUrl: SURFACE_URL,
    surfaceVersion: '1.0.0',
  });
  ev.beat({
    actor: 'ai-agent',
    verb: 'wireframeFromBrief',
    intent: 'Start an app from the brief.',
    outcome: created.ok ? 'admitted' : 'refused',
    ...(created.ok ? {} : { message: created.error.message }),
    details: { bundleId: BUNDLE_ID, briefLines: BRIEF.length },
  });
  if (!created.ok) throw new Error(`wireframeFromBrief refused: ${created.error.message}`);

  ev.beat({
    actor: 'system',
    verb: 'wireframeFromBrief',
    intent: 'Keep the brief text itself, so later stages can point back at it.',
    outcome: 'recorded',
    message:
      'The brief is accepted as an argument and discarded. `wireframeFromBrief` forwards only id, version and title to `createBundle`; no verb persists the brief text. It survives into the substrate only as the units it produced.',
    details: { finding: 'no-brief-persistence' },
  });

  for (const unit of UNITS) {
    const added = await state.agent.addExperienceUnit({
      unitId: unit.unitId,
      kind: unit.kind,
      title: unit.title,
      actorRef: unit.actorRef,
      taskRefs: [...unit.taskRefs],
    });
    ev.beat({
      actor: 'ai-agent',
      verb: 'addExperienceUnit',
      intent: `Write down: "${unit.title}" — ${unit.actorRef} needs to ${unit.taskRefs.join(', ')}.`,
      outcome: added.ok ? 'admitted' : 'refused',
      ...(added.ok ? {} : { message: added.error.message }),
      details: { unitId: unit.unitId, kind: unit.kind, actorRef: unit.actorRef, taskRefs: unit.taskRefs, fromBrief: unit.fromBrief },
    });
    if (!added.ok) throw new Error(`addExperienceUnit refused: ${added.error.message}`);
  }

  const manifest = await manifestOf(state.agent);
  const experienceUrl = String((manifest.experience as { url?: string } | undefined)?.url ?? '');
  const experience = state.agent.kernel.resolveBundleLocal({
    artifactKind: 'experience',
    ref: { url: experienceUrl },
  } as never);
  const experienceDoc = experience?.status === 'loaded' ? experience.document : null;
  writeArtifact('stage-1-idea.experience.json', experienceDoc);

  ev.closeStage({
    hasExperience: experienceDoc !== null,
    experienceUrl,
    units: UNITS.map((u) => ({ id: u.unitId, title: u.title, actor: u.actorRef, tasks: u.taskRefs, fromBrief: u.fromBrief })),
    hasDefinition: Array.isArray(manifest.definitions) && (manifest.definitions as unknown[]).length > 0,
    artifact: 'evidence/stage-1-idea.experience.json',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2 — PLAN
// ─────────────────────────────────────────────────────────────────────────────

export async function stagePlan(ev: Evidence, state: WalkState): Promise<void> {
  ev.openStage(
    'plan',
    'The AI turns the journey into a real form: the questions people will answer, and the four pages the app has. Then it tries to say what kind of page each one is — and the deployment stops it. Deciding that a page is "a receipt a court relies on" is a call a person makes, not a machine.',
  );

  const declared = await state.agent.declareDefinition({ url: DEFINITION_URL, version: '1.0.0' });
  ev.beat({
    actor: 'ai-agent',
    verb: 'declareDefinition',
    intent: 'Create the form that holds the questions.',
    outcome: declared.ok ? 'admitted' : 'refused',
    ...(declared.ok ? {} : { message: declared.error.message }),
    details: { url: DEFINITION_URL },
  });
  if (!declared.ok) throw new Error(`declareDefinition refused: ${declared.error.message}`);

  // One beat for the whole question set. Four near-identical beats would be
  // noise in a timeline a non-engineer reads; the per-question detail is in the
  // expandable payload, where detail belongs.
  for (const item of ITEMS) {
    const added = await state.agent.addDefinitionStub({
      definitionId: DEFINITION_URL,
      itemPath: item.path,
      label: item.label,
      dataType: item.dataType,
    });
    if (!added.ok) throw new Error(`addDefinitionStub(${item.path}) refused: ${added.error.message}`);
  }
  ev.beat({
    actor: 'ai-agent',
    verb: 'addDefinitionStub',
    intent: `Write the questions people will answer: ${ITEMS.map((i) => `"${i.label}"`).join(', ')}.`,
    outcome: 'admitted',
    details: { items: ITEMS.map((i) => ({ path: i.path, dataType: i.dataType, fromBrief: i.fromBrief })) },
  });

  ev.beat({
    actor: 'system',
    verb: '(none)',
    intent: 'Connect the journey entries to the questions they collect.',
    outcome: 'recorded',
    message:
      'No kernel op writes `unit.itemRefs` after a unit exists — `bindActor` and `bindTask` exist, `bindItem` does not, and `addUnit` conflicts on re-add. The Experience-to-Definition link the ADR 0159 Plan row describes is unreachable through the verb surface; the two meet on the Surface route that binds both instead.',
    details: { finding: 'no-bindItem-verb', availableBinders: ['bindActor', 'bindTask'] },
  });

  const action = await declareSubmitAction(state.agent);
  ev.beat({
    actor: 'ai-agent',
    verb: 'addAction',
    intent: 'Say what happens when somebody presses Submit.',
    outcome: action.ok ? 'admitted' : 'refused',
    ...(action.ok ? {} : { message: action.message! }),
    details: { actionId: SUBMIT_ACTION.id, intent: SUBMIT_ACTION.intent, note: 'No declareResponseActions verb exists in the ADR 0160 v1 family; the kernel op mints the document on first call.' },
  });
  if (!action.ok) throw new Error(`addAction refused: ${action.message}`);

  const afterAction = await manifestOf(state.agent);
  ev.beat({
    actor: 'system',
    verb: '(check)',
    intent: 'Confirm the app now says what Submit does.',
    outcome: 'recorded',
    message:
      (afterAction as { responseActions?: unknown }).responseActions === undefined
        ? 'The Response Actions document was minted and no manifest slot names it. `readAppManifest` emits no `responseActions` key and `exportBundle` does not serialise it, so nothing in the graph can resolve the Submit behaviour — the transitions that fire it stay unresolved. This is ADR 0160 §4.2(b) ("no mint without a declaration") firing on a kind that ADR 0160 §6.5 does NOT list as deliberately excluded: it fixed the identical defect for `ensureExperience` and left this one.'
        : 'The app manifest names the Response Actions document.',
    details: {
      finding: 'response-actions-minted-but-undeclared',
      manifestSlots: Object.keys(afterAction),
      adr0160: '§4.2(b) mirror of the fixed `ensureExperience` defect; §6.5 excludes Locale, Mapping and Data Sources — not Response Actions',
    },
  });

  const staff = await state.agent.kernel.addSurface({ url: STAFF_SURFACE_URL, version: '1.0.0' });
  ev.beat({
    actor: 'ai-agent',
    verb: 'addSurface',
    intent: 'Give staff their own app. A caseworker queue is not a page an applicant can walk to.',
    outcome: staff.ok ? 'admitted' : 'refused',
    ...(staff.ok ? {} : { message: staff.error.message }),
    details: { surfaceUrl: STAFF_SURFACE_URL, surfaceId: STAFF_SURFACE_ID },
  });
  if (!staff.ok) throw new Error(`addSurface(staff) refused: ${staff.error.message}`);

  for (const route of ROUTES) {
    const attempt = await state.agent.addRoute({
      surfaceId: route.surfaceId,
      routeId: route.routeId,
      path: route.path,
      title: route.title,
      routeClass: route.routeClass,
    });
    ev.beat({
      actor: 'ai-agent',
      verb: 'addRoute',
      intent: `Say that ${route.path} is a "${route.routeClass}" page — ${route.why}`,
      outcome: attempt.ok ? 'admitted' : 'refused',
      ...(attempt.ok ? {} : { message: attempt.error.message }),
      details: {
        routeId: route.routeId,
        wantedRouteClass: route.routeClass,
        ...(attempt.ok ? {} : { errorCode: attempt.error.code, ...(attempt.error.details as Record<string, unknown> ?? {}) }),
      },
    });

    const unclassified = await state.agent.addRoute({
      surfaceId: route.surfaceId,
      routeId: route.routeId,
      path: route.path,
      title: route.title,
    });
    ev.beat({
      actor: 'ai-agent',
      verb: 'addRoute',
      intent: `Add ${route.path} without saying what kind of page it is, and keep working.`,
      outcome: unclassified.ok ? 'admitted' : 'refused',
      ...(unclassified.ok ? {} : { message: unclassified.error.message }),
      details: { routeId: route.routeId, routeClass: null },
    });
    if (!unclassified.ok) throw new Error(`addRoute refused: ${unclassified.error.message}`);

    for (const slot of route.slots) {
      const bound = await state.agent.bindSlot({
        surfaceId: route.surfaceId,
        routeId: route.routeId,
        slotId: slot.slotId,
        slotType: slot.slotType,
        binding: slot.binding,
        ...(slot.title !== undefined ? { title: slot.title } : {}),
      });
      if (!bound.ok) throw new Error(`bindSlot(${slot.slotId}) refused: ${bound.error.message}`);
    }
    ev.beat({
      actor: 'ai-agent',
      verb: 'bindSlot',
      intent: `Fill ${route.path} with what belongs on it.`,
      outcome: 'admitted',
      details: { routeId: route.routeId, slots: route.slots.map((s) => ({ id: s.slotId, type: s.slotType })) },
    });
  }

  // Second pass — a transition's target route must already exist.
  for (const route of ROUTES) {
    if (route.transitionTo === undefined) continue;
    const t = await state.agent.kernel.addTransition({
      surfaceId: route.surfaceId,
      routeId: route.routeId,
      transition: { trigger: 'submit', to: route.transitionTo },
    });
    if (!t.ok) throw new Error(`addTransition refused: ${t.error.message}`);
  }

  const surface = await surfaceOf(state.agent);
  state.oldGeneratedSurface = structuredClone(surface);
  writeArtifact('stage-2-plan.surface.json', surface);
  writeArtifact('bar5-old-generated.surface.json', surface);

  const routeClasses = (surface as { routes?: Array<{ id: string; routeClass?: string }> }).routes ?? [];
  ev.closeStage({
    routes: routeClasses.map((r) => ({ id: r.id, routeClass: r.routeClass ?? null })),
    classifiedRoutes: routeClasses.filter((r) => r.routeClass !== undefined).length,
    items: ITEMS.map((i) => i.path),
    artifact: 'evidence/stage-2-plan.surface.json',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3 — BUILD
// ─────────────────────────────────────────────────────────────────────────────

export async function stageBuild(ev: Evidence, state: WalkState): Promise<void> {
  ev.openStage(
    'build',
    'The app gets its parts list and its look. The AI is stopped again — declaring the theme is a decision about who controls appearance, and appearance is load-bearing on three of these four pages. A person takes over, declares it, and then makes two small edits of their own. Those two edits are the thing the last stage is about.',
  );

  const agentTheme = await state.agent.declareTheme({ version: '1.0.0' });
  ev.beat({
    actor: 'ai-agent',
    verb: 'declareTheme',
    intent: 'Create the theme that controls how the app looks.',
    outcome: agentTheme.ok ? 'admitted' : 'refused',
    ...(agentTheme.ok ? {} : { message: agentTheme.error.message }),
    details: agentTheme.ok ? {} : { errorCode: agentTheme.error.code, ...(agentTheme.error.details as Record<string, unknown> ?? {}) },
  });

  const agentManifest = await manifestOf(state.agent);
  ev.beat({
    actor: 'system',
    verb: '(check)',
    intent: 'Confirm the refused write left nothing behind.',
    outcome: 'recorded',
    message: agentManifest.theme === undefined
      ? 'No theme slot on the app manifest. The refused declaration wrote nothing.'
      : 'A theme slot exists despite the refusal — the refusal leaked.',
    details: { check: 'refused-theme-declaration-left-no-state', themeSlot: agentManifest.theme ?? null },
  });

  // ── The handoff ──────────────────────────────────────────────────────────
  const { human, replayMatched, divergence, amendAttempt } = await handOffToHuman(state);
  state.human = human;
  ev.beat({
    actor: 'system',
    verb: '(handoff)',
    intent: 'Hand the half-built app from the AI to a person.',
    outcome: 'recorded',
    message:
      "No verb transfers an in-flight artifact between actors. The kernel reads the acting actor from its construction context, and supplying a kernel together with posture options is a construction-time error, so one kernel is one actor. The handoff is modelled as a new session replaying the authored state; the replay is checked against the AI's own exported documents rather than assumed.",
    details: { from: AI_AGENT_URN, to: HUMAN_URN, replayMatchedAgentExport: replayMatched, ...(divergence ? { divergence } : {}), finding: 'no-actor-handoff-verb' },
  });
  ev.beat({
    actor: 'human',
    verb: 'addRoute',
    intent:
      `Change what kind of page ${AMEND_TARGET.path} is — from "${AMEND_TARGET.routeClass}" to "${AMEND_TO_ROUTE_CLASS}". The route already exists, and the person is the actor the deployment admits, so nothing but the route itself is left to say no.`,
    outcome: 'refused',
    message: amendAttempt.onAdmittedActor.message,
    details: {
      finding: 'route-class-is-write-once',
      probedOnWhoseKernel: "the human's — the actor this posture ADMITS, which is what makes the quoted refusal evidence of write-once rather than a second copy of the ADR 0152 refusal",
      routeId: AMEND_TARGET.routeId,
      alreadyWrittenRouteClass: AMEND_TARGET.routeClass,
      attemptedRouteClass: AMEND_TO_ROUTE_CLASS,
      errorCode: amendAttempt.onAdmittedActor.code,
      refusalDetails: amendAttempt.onAdmittedActor.details ?? null,
      sameCallOnTheAgentsKernel: amendAttempt.onRefusedActor,
      whyTheAgentsRefusalIsNotTheEvidence:
        "`ProposalManagerFacade.addRoute` checks the ADR 0152 posture as its first statement, before it resolves the Surface draft. On the agent's kernel the posture answers first, so the agent gets the stage-2 refusal again — a message about WHO may write `surface.routeClass`, which says nothing about whether an existing route's class can change.",
      surfaceOps: ['addRoute', 'bindSlot', 'removeSlot', 'addTransition'],
      missing: ['removeRoute', 'setRouteClass', 'updateRoute'],
      consequence:
        "`addRoute` is the only Surface op that writes a class, and it CONFLICTs on an id that already exists — so a route's class is fixed at the moment the route is created. ADR 0152's 'the refusal is legible, not fatal' therefore holds inside one session and breaks across the handoff: a route the agent was refused a class on is created unclassified, and nothing can classify it afterwards. The person must author the routes themselves, which is what this walk does.",
    },
  });

  const humanTheme = await human.declareTheme({ version: '1.0.0' });
  ev.beat({
    actor: 'human',
    verb: 'declareTheme',
    intent: 'Create the theme — the same call the AI was refused.',
    outcome: humanTheme.ok ? 'admitted' : 'refused',
    ...(humanTheme.ok ? {} : { message: humanTheme.error.message }),
    details: { url: humanTheme.ok ? humanTheme.value.url : null, samePostureAsRefusal: true },
  });
  if (!humanTheme.ok) throw new Error(`declareTheme(human) refused: ${humanTheme.error.message}`);

  const token = await human.setThemeToken({ key: TENANT_TOKEN, value: TENANT_TOKEN_VALUE });
  ev.beat({
    actor: 'human',
    verb: 'setThemeToken',
    intent: `Set the tenant's brand colour (${TENANT_TOKEN_VALUE}).`,
    outcome: token.ok ? 'admitted' : 'refused',
    ...(token.ok ? {} : { message: token.error.message }),
    details: { key: TENANT_TOKEN, value: TENANT_TOKEN_VALUE },
  });
  if (!token.ok) throw new Error(`setThemeToken refused: ${token.error.message}`);

  const registry = await materialiseRegistry(human);
  ev.beat({
    actor: 'human',
    verb: 'declareRegistry + addRegistryEntry',
    intent: 'Register the building blocks the pages are made of.',
    outcome: 'admitted',
    details: { registryUrl: registry.registryUrl, entries: registry.entries, hostDocumentsWired: 0 },
  });

  // ── The two deliberate human edits ───────────────────────────────────────
  const inserted = await human.bindSlot({
    surfaceId: SURFACE_ID,
    routeId: 'apply',
    slotId: DESIGNER_INSERTION.slotId,
    slotType: DESIGNER_INSERTION.slotType,
    binding: DESIGNER_INSERTION.binding,
    ...(DESIGNER_INSERTION.title !== undefined ? { title: DESIGNER_INSERTION.title } : {}),
  });
  ev.beat({
    actor: 'human',
    verb: 'bindSlot',
    intent: `Add one sentence the AI never wrote: "${String((DESIGNER_INSERTION.binding as { content: string }).content)}"`,
    outcome: inserted.ok ? 'admitted' : 'refused',
    ...(inserted.ok ? {} : { message: inserted.error.message }),
    details: { edit: 'DESIGNER-EDIT-1', deltaClass: 'designer-inserted', slotId: DESIGNER_INSERTION.slotId },
  });
  if (!inserted.ok) throw new Error(`bindSlot(insertion) refused: ${inserted.error.message}`);

  const removed = await human.kernel.removeSlot({ surfaceId: SURFACE_ID, routeId: 'apply', slotId: DESIGNER_RETITLE.slotId });
  if (!removed.ok) throw new Error(`removeSlot refused: ${removed.error.message}`);
  const retitled = await human.bindSlot({
    surfaceId: SURFACE_ID,
    routeId: 'apply',
    slotId: DESIGNER_RETITLE.slotId,
    slotType: 'definition-form',
    binding: { definitionRef: DEFINITION_URL },
    title: DESIGNER_RETITLE.designerTitle,
  });
  ev.beat({
    actor: 'human',
    verb: 'removeSlot + bindSlot',
    intent: `Rename the AI's "${DESIGNER_RETITLE.generatedTitle}" to "${DESIGNER_RETITLE.designerTitle}" — words an applicant actually understands.`,
    outcome: retitled.ok ? 'admitted' : 'refused',
    ...(retitled.ok ? {} : { message: retitled.error.message }),
    details: {
      edit: 'DESIGNER-EDIT-2',
      deltaClass: 'designer-modified',
      slotId: DESIGNER_RETITLE.slotId,
      from: DESIGNER_RETITLE.generatedTitle,
      to: DESIGNER_RETITLE.designerTitle,
      note: 'Two calls, not one: re-binding an existing slot id is a CONFLICT, so an edit is a remove plus an add.',
    },
  });
  if (!retitled.ok) throw new Error(`bindSlot(retitle) refused: ${retitled.error.message}`);

  const surface = await surfaceOf(human);
  state.designerEditedSurface = structuredClone(surface);
  writeArtifact('stage-3-build.surface.json', surface);
  writeArtifact('bar5-designer-edited.surface.json', surface);

  ev.closeStage({
    themeDeclaredBy: 'human',
    themeToken: { [TENANT_TOKEN]: TENANT_TOKEN_VALUE },
    registryEntries: registry.entries,
    designerEdits: [
      { id: 'DESIGNER-EDIT-1', deltaClass: 'designer-inserted', what: String((DESIGNER_INSERTION.binding as { content: string }).content) },
      { id: 'DESIGNER-EDIT-2', deltaClass: 'designer-modified', what: `slot title "${DESIGNER_RETITLE.generatedTitle}" → "${DESIGNER_RETITLE.designerTitle}"` },
    ],
    artifact: 'evidence/stage-3-build.surface.json',
  });
}

/** The route the write-once probe tries to re-class, and the class it tries. */
const AMEND_TARGET = ROUTES[0]!;
const AMEND_TO_ROUTE_CLASS: RouteSpec['routeClass'] = 'proof';

interface AmendAttempt {
  /** The refusal that proves write-once: the actor is admitted, the route is not. */
  onAdmittedActor: { code: string; message: string; details?: Record<string, unknown> };
  /** The same call on the agent's kernel — the ADR 0152 posture refusal, for contrast. */
  onRefusedActor: { code: string; message: string };
}

/**
 * Measures whether a route's class can be changed after the route exists.
 *
 * Run on the HUMAN's kernel on purpose. `ProposalManagerFacade.addRoute` checks
 * the ADR 0152 `surface.routeClass` posture as its FIRST statement, before it
 * resolves the Surface draft — so on the agent's kernel the posture always
 * answers first and the refusal is stage 2's, verbatim, whatever the route's
 * state. That message is about who may write the vocabulary; it carries no
 * information about write-once. The human is the actor the posture admits, so
 * the only thing left to refuse the write is the route's own existence.
 *
 * The agent-kernel call is still made and recorded, labelled as the contrast it
 * is rather than quoted as the finding.
 */
async function probeRouteClassAmendment(agent: WireframesMcp, human: WireframesMcp): Promise<AmendAttempt> {
  const call = (mcp: WireframesMcp) =>
    mcp.addRoute({
      surfaceId: AMEND_TARGET.surfaceId,
      routeId: AMEND_TARGET.routeId,
      path: AMEND_TARGET.path,
      title: AMEND_TARGET.title,
      routeClass: AMEND_TO_ROUTE_CLASS,
    });

  const admitted = await call(human);
  if (admitted.ok) {
    // Unreachable today, and deliberately fatal rather than absorbed: an
    // amendable route class falsifies the pre-registered finding AND leaves
    // `/apply` classified `proof`, so every later bar would be measuring a
    // different app than the one the walkthrough narrates.
    throw new Error(
      `write-once falsified: ${AMEND_TARGET.routeId} was re-classified in place as '${AMEND_TO_ROUTE_CLASS}'. The walk state is no longer the exemplar; re-run after updating the finding.`,
    );
  }
  const refused = await call(agent);

  return {
    onAdmittedActor: {
      code: admitted.error.code,
      message: admitted.error.message,
      ...(admitted.error.details ? { details: admitted.error.details as Record<string, unknown> } : {}),
    },
    onRefusedActor: refused.ok
      ? { code: '(admitted)', message: '(the agent was allowed to write a route class — the ADR 0152 posture is not in force)' }
      : { code: refused.error.code, message: refused.error.message },
  };
}

/**
 * Opens the human's session and replays the AI's authored state under it, then
 * checks the replay reproduced the artifact rather than a lookalike.
 *
 * The comparison excludes `routeClass`, which the agent was refused and the
 * human has not yet supplied — that difference is the point of the demo, not a
 * replay defect.
 */
async function handOffToHuman(
  state: WalkState,
): Promise<{ human: WireframesMcp; replayMatched: boolean; divergence?: string; amendAttempt: AmendAttempt }> {
  const human = mcpFor('human', 'handoff');
  // The human authors the routes classified. Not a shortcut: `addRoute` is the
  // only Surface op that writes a class and it conflicts on an existing id, so
  // authoring-time is the ONLY time a class can be written at all.
  await authorBaseline(human, { units: UNITS, items: ITEMS, classify: true });

  // Only now is the probe meaningful: the route exists, classified, under an
  // actor the posture admits.
  const amendAttempt = await probeRouteClassAmendment(state.agent, human);

  const agentSurface = stripRouteClass(await surfaceOf(state.agent));
  const humanSurface = stripRouteClass(await surfaceOf(human));
  const a = JSON.stringify(agentSurface);
  const b = JSON.stringify(humanSurface);
  return a === b
    ? { human, replayMatched: true, amendAttempt }
    : { human, replayMatched: false, divergence: firstDifference(a, b), amendAttempt };
}

function stripRouteClass(surface: unknown): unknown {
  const clone = structuredClone(surface) as { routes?: Array<Record<string, unknown>> };
  for (const route of clone.routes ?? []) delete route.routeClass;
  return clone;
}

function firstDifference(a: string, b: string): string {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return `at offset ${i}: agent=${a.slice(i, i + 60)} human=${b.slice(i, i + 60)}`;
  }
  return '(equal)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4 — SIGN-OFF
// ─────────────────────────────────────────────────────────────────────────────

export async function stageSignOff(ev: Evidence, state: WalkState): Promise<{ bundleExport: { manifest: unknown; documents: Record<string, unknown> } }> {
  const human = state.human;
  if (!human) throw new Error('stageSignOff requires the handoff to have run');

  ev.openStage(
    'sign-off',
    'A person states, on the record, what each page is: an intake form, a signing ceremony, a receipt a court reads, a staff queue. Then they sign the whole thing — not a screenshot of it, the exact bytes. The same deployment rule that stopped the AI lets the person through.',
  );

  // The classes are read back out of the kernel's own exported Surface, never
  // out of the spike's intent. v9's correction, kept: a document the spike
  // hand-derives can assert anything the spike wrote down.
  const persisted = new Map<string, string | undefined>();
  for (const surfaceId of [SURFACE_ID, STAFF_SURFACE_ID]) {
    const doc = (await surfaceOf(human, surfaceId)) as { routes?: Array<{ id: string; routeClass?: string }> };
    for (const route of doc.routes ?? []) persisted.set(route.id, route.routeClass);
  }
  for (const route of ROUTES) {
    const actual = persisted.get(route.routeId);
    ev.beat({
      actor: 'human',
      verb: 'addRoute(routeClass)',
      intent: `Put it on the record: ${route.path} is a "${route.routeClass}" page. ${route.why}`,
      outcome: actual === route.routeClass ? 'admitted' : 'refused',
      ...(actual === route.routeClass
        ? {}
        : { message: `The exported Surface carries routeClass=${actual ?? '(absent)'} on ${route.routeId}, not ${route.routeClass}.` }),
      details: {
        routeId: route.routeId,
        routeClass: route.routeClass,
        persistedRouteClass: actual ?? null,
        samePostureThatRefusedTheAgent: true,
        readBackFrom: 'kernel exportSurfaceDocument',
      },
    });
    if (actual !== route.routeClass) throw new Error(`routeClass not persisted on ${route.routeId}: ${String(actual)}`);
  }

  const exported = await human.exportBundle();
  ev.beat({
    actor: 'human',
    verb: 'exportBundle',
    intent: 'Produce the exact package that will ship.',
    outcome: exported.ok ? 'admitted' : 'refused',
    ...(exported.ok ? {} : { message: exported.error.message }),
    details: exported.ok
      ? { documents: Object.keys(exported.value.documents).length, keys: Object.keys(exported.value.documents) }
      : { error: exported.error.details },
  });
  if (!exported.ok) throw new Error(`exportBundle refused: ${exported.error.message}`);

  state.bundleExport = exported.value;
  writeArtifact('stage-4-signoff.bundle-export.json', exported.value);

  ev.closeStage({
    routeClasses: ROUTES.map((r) => ({ routeId: r.routeId, routeClass: r.routeClass })),
    exportedDocuments: Object.keys(exported.value.documents),
    artifact: 'evidence/stage-4-signoff.bundle-export.json',
  });
  return { bundleExport: exported.value };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5 — RELEASE
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleaseReport {
  report: {
    phases: Array<{ phase: string; status: string; reason?: string }>;
    diagnostics: Array<{ code: string; severity: string; message?: string; origin?: string; details?: Record<string, unknown>; primarySource?: { artifactSlot?: string; artifactKind?: string; jsonPointer?: string } }>;
  };
}

export async function stageRelease(ev: Evidence, state: WalkState): Promise<ReleaseReport> {
  const human = state.human;
  if (!human) throw new Error('stageRelease requires the handoff to have run');

  ev.openStage(
    'release',
    'The tenant pushes their brand colour onto all four pages. The substrate lets it through on the application form and refuses it on the other three — because on a receipt, a signing screen and a staff console, how it looks is part of what people rely on. Then the signature is checked from the files alone, with nothing running.',
  );

  const policyInputs = tenantThemedPolicyInputs();
  const policies: UiGraphPolicyDocument[] = [];
  for (const input of policyInputs) {
    const policy = await human.declareUiGraphPolicy(input);
    if (!policy.ok) throw new Error(`declareUiGraphPolicy refused: ${policy.error.message}`);
    policies.push(policy.value);
  }
  ev.beat({
    actor: 'human',
    verb: 'declareUiGraphPolicy',
    intent: 'Push the tenant brand colour onto all four pages.',
    outcome: 'admitted',
    details: {
      assignments: policyInputs.reduce((n, p) => n + p.theme.assignments.length, 0),
      surfaces: policyInputs.map((p) => p.surfaceUrl),
    },
  });
  state.policy = policies[0];

  const result = await human.produceAppGraphValidationReport({
    source: `lifecycle-v10://${BUNDLE_ID}/app-manifest`,
    schemaId: 'https://formspec.org/schemas/bundleManifest/2.3',
    schemaValidators: realSchemaValidators(),
    evidenceSchemaValidators: realEvidenceSchemaValidators(),
    uiGraphPolicies: policies.map((document, i) => ({
      schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
      source: `lifecycle-v10://${BUNDLE_ID}/ui-graph-policy/${i}`,
      document,
    })),
  });
  if (!result.ok) throw new Error(`produceAppGraphValidationReport refused: ${result.error.message}`);
  writeArtifact('stage-5-release.validation-report.json', result.value);

  const report = result.value as unknown as ReleaseReport;
  const themeRouteClass = report.report.diagnostics.filter((d) => d.code === 'THEME-ROUTE-CLASS');
  for (const route of ROUTES) {
    const fired = themeRouteClass.filter((d) => (d.details as { routeId?: string } | undefined)?.routeId === route.routeId);
    ev.beat({
      actor: 'system',
      verb: 'THEME-ROUTE-CLASS',
      intent: `Decide whether the tenant may restyle ${route.path} (a "${route.routeClass}" page).`,
      outcome: fired.length === 0 ? 'admitted' : 'refused',
      ...(fired.length > 0 ? { message: fired[0]!.message ?? '(no message)' } : {}),
      details: {
        routeId: route.routeId,
        routeClass: route.routeClass,
        widget: route.chromeWidget,
        fires: fired.length,
        ...(fired.length > 0 ? { reason: (fired[0]!.details as { reason?: string } | undefined)?.reason } : {}),
        why: route.why,
      },
    });
  }

  const crossArtifact = report.report.phases.find((p) => p.phase === 'cross-artifact');
  ev.closeStage({
    crossArtifactStatus: crossArtifact?.status ?? 'absent',
    diagnosticCounts: countByCode(report.report.diagnostics.filter((d) => d.severity === 'error')),
    themeRouteClassFires: themeRouteClass.length,
    artifact: 'evidence/stage-5-release.validation-report.json',
  });
  return report;
}

export function countByCode(diagnostics: Array<{ code: string }>): Record<string, number> {
  return diagnostics.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.code]: (acc[d.code] ?? 0) + 1 }), {});
}

/** ADR 0160 §7's structural scope split, carried from v9's `scopeOfDiagnostic`. */
export function scopeOfDiagnostic(d: { code: string; primarySource?: { artifactSlot?: string; artifactKind?: string; jsonPointer?: string } }): 'verb-family' | 'host-evidence' | 'corpus-identifier' | 'surface-composition' {
  const src = d.primarySource ?? {};
  if ((src.artifactSlot ?? '').startsWith('hostEvidence.')) return 'host-evidence';
  if (src.artifactKind === 'experience' && /^\/units\/\d+\/kind$/.test(src.jsonPointer ?? '')) return 'corpus-identifier';
  if (d.code === 'ARTIFACT-STUDIO-BUNDLE-LOCAL-UNPUBLISHABLE' && src.artifactKind === 'surface') return 'surface-composition';
  return 'verb-family';
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 6 — FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────

export async function stageFeedback(ev: Evidence, state: WalkState): Promise<void> {
  ev.openStage(
    'feedback',
    'Two weeks in, caseworkers report a missing question. The brief grows by one line, and the AI regenerates the app from it. The only question that matters here: are the two things the designer wrote still in the app afterwards?',
  );

  ev.beat({
    actor: 'human',
    verb: '(change request)',
    intent: CHANGE_REQUEST.text,
    outcome: 'recorded',
    details: { id: CHANGE_REQUEST.id, from: CHANGE_REQUEST.from, addsItem: CHANGE_REQUEST.addsItem.path, addsUnit: CHANGE_REQUEST.addsUnit.unitId },
  });

  // Regeneration: a fresh authoring pass over the AMENDED substrate. This is
  // what the GENERATION cross-cut does — project substrate into a starting-point
  // artifact at the target ring. Nothing here consults the designer's edits,
  // because nothing in the substrate offers a way to.
  const regenerator = mcpFor('ai-agent', 'regeneration');
  await authorBaseline(regenerator, {
    units: [...UNITS, CHANGE_REQUEST.addsUnit],
    items: [...ITEMS, CHANGE_REQUEST.addsItem],
    classify: false,
    routes: REGENERATED_ROUTES,
  });
  const regenerated = await surfaceOf(regenerator);
  state.newGeneratedSurface = structuredClone(regenerated);
  writeArtifact('stage-6-feedback.regenerated.surface.json', regenerated);
  writeArtifact('bar5-new-generated.surface.json', regenerated);

  ev.beat({
    actor: 'ai-agent',
    verb: 'regenerate',
    intent: 'Rebuild the app from the amended brief.',
    outcome: 'admitted',
    details: {
      units: UNITS.length + 1,
      items: ITEMS.length + 1,
      newItem: CHANGE_REQUEST.addsItem.path,
      routesBefore: ROUTES.length,
      routesAfter: REGENERATED_ROUTES.length,
      newRoute: '/apply/money',
    },
  });

  ev.closeStage({
    changeRequest: CHANGE_REQUEST.id,
    threeWayInputs: {
      oldGenerated: 'evidence/bar5-old-generated.surface.json',
      designerEdited: 'evidence/bar5-designer-edited.surface.json',
      newGenerated: 'evidence/bar5-new-generated.surface.json',
    },
    artifact: 'evidence/stage-6-feedback.regenerated.surface.json',
  });
}
