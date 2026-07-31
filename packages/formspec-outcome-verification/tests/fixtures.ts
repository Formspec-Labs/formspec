import type {
  NormalizedObservation,
  OutcomeComparatorInput,
  OutcomeComparatorDependencies,
  OutcomeLintContext,
  OutcomeLintClearance,
  OutcomeOwnerFactsPort,
  OutcomeResolvedLintContext,
  OutcomeRunBindingPort,
  OutcomeRunnerDependencies,
  OutcomeSchemaValidationPort,
  OutcomeVerificationCase,
  PairedSource,
  RunnerAdmissionFacts,
  RunnerAdmissionContext,
  ResolvedTargetIdentity,
  SourcePin,
  StepBinding,
} from "../src/index.js";
import {
  digestRunnerAdmissionContext,
  digestOutcomeImplementationSet,
  digestResolvedTargetIdentity,
  issueOutcomeLintClearance,
  OUTCOME_V01_SPECIFICATION_RULE_INDEX,
  runOutcomeVerificationCase,
  sha256Digest,
} from "../src/index.js";

export const digest = (character: string): string =>
  `sha256:${character.repeat(64)}`;

export const refs = {
  needs: "https://example.test/needs",
  experience: "https://example.test/experience",
  app: "https://example.test/app",
  surface: "https://example.test/surface",
  definition: "https://example.test/definition",
  actions: "https://example.test/actions",
  data: "https://example.test/data-sources",
} as const;

export const digests = {
  needs:
    "sha256:2708958f8294b00f934ba484e4b694e3193b0ae5d2cedb79f7812e370867fc0f",
  experience:
    "sha256:2bc283cc72403be992fe88eb024640bb650c9f96d2056b884571516235a0b91a",
  app: "sha256:08c4b0ff806721c05033dfdcd2cd5e488f7b127a646b5e5724d109f8b1303bbf",
  surface:
    "sha256:858d3edd9c8186f99bc96dce3a1bbf69cf9d269265ea76a99d3365efdaa48097",
  definition:
    "sha256:a023382e06c669833ae95227de68bbb998c39d38596873736b79c6c978eea2a5",
  actions:
    "sha256:f7aac8ead272249d4b6716c582ee289ee3bfa5bd338b0fc87487d09f305f9bec",
  data: "sha256:14154b5aacb9b0c2c483f4b4fce6ed7881fc102dfe7e76369c9aeaa7f7cac8ce",
} as const;

export const fieldControl = {
  artifactRef: refs.definition,
  artifactDigest: digests.definition,
  subjectKind: "definition-item",
  subjectRef: "field",
} as const;

export const actionControl = {
  artifactRef: refs.actions,
  artifactDigest: digests.actions,
  subjectKind: "response-action",
  subjectRef: "submit",
} as const;

export const surfaceFieldNode = {
  artifactRef: refs.surface,
  artifactDigest: digests.surface,
  subjectKind: "surface-node",
  subjectRef: "route/field",
} as const;

const rule = {
  kind: "specification-rule",
  specRef: "https://formspec.org/specs/surface",
  specVersion: "0.2.0-draft.1",
  ruleId: "rendering.semantic-output",
} as const;

const artifactRule = (subject: import("../src/index.js").QualifiedSubjectRef) =>
  ({
    kind: "artifact-declaration",
    subject,
  } as const);

const definitionItem = {
  artifactRef: refs.definition,
  artifactDigest: digests.definition,
  subjectKind: "definition-item",
  subjectRef: "field",
} as const;

const definitionBind = {
  artifactRef: refs.definition,
  artifactDigest: digests.definition,
  subjectKind: "definition-bind",
  subjectRef: "field",
} as const;

const actionSubject = {
  artifactRef: refs.actions,
  artifactDigest: digests.actions,
  subjectKind: "response-action",
  subjectRef: "submit",
} as const;

const dataSubject = {
  artifactRef: refs.data,
  artifactDigest: digests.data,
  subjectKind: "data-source",
  subjectRef: "schedule",
} as const;

const experienceUnit = {
  artifactRef: refs.experience,
  artifactDigest: digests.experience,
  subjectKind: "experience-unit",
  subjectRef: "complete-task-unit",
} as const;

export const surfaceRouteSubject = {
  artifactRef: refs.surface,
  artifactDigest: digests.surface,
  subjectKind: "surface-route",
  subjectRef: "route",
} as const;

export const caseDocument: OutcomeVerificationCase = {
  $formspecOutcomeVerificationCase: "0.1",
  id: "case:test",
  version: "0.1.0",
  need: {
    documentRef: refs.needs,
    documentDigest: digests.needs,
    id: "complete-task",
    revision: 2,
  },
  experience: {
    documentRef: refs.experience,
    documentDigest: digests.experience,
    unitId: experienceUnit.subjectRef,
  },
  app: {
    id: refs.app,
    version: "1.2.3",
    digest: digests.app,
  },
  procedure: [
    {
      id: "open",
      kind: "open-route",
      surfaceRef: refs.surface,
      surfaceDigest: digests.surface,
      routeId: "route",
    },
    {
      id: "set",
      kind: "set-item",
      renderStepRef: "open",
      control: fieldControl,
      definitionRef: refs.definition,
      definitionDigest: digests.definition,
      path: "field",
      value: { alpha: 1, beta: 2 },
    },
    {
      id: "activate",
      kind: "activate-control",
      renderStepRef: "open",
      control: actionControl,
      actionsRef: refs.actions,
      actionsDigest: digests.actions,
      actionId: "submit",
      responseStepRef: "set",
    },
    {
      id: "after",
      kind: "checkpoint",
    },
  ],
  expectedObservations: [
    {
      id: "graph",
      kind: "app-graph",
      ruleRefs: [
        artifactRule(surfaceFieldNode),
        artifactRule(experienceUnit),
        rule,
      ],
      checkpointRef: "after",
      requiredEvidence: "structural",
      subject: surfaceFieldNode,
      relation: "mounted",
      state: "present",
    },
    {
      id: "validation",
      kind: "validation-report",
      ruleRefs: [
        artifactRule(definitionBind),
        artifactRule(experienceUnit),
        rule,
      ],
      checkpointRef: "after",
      requiredEvidence: "runtime",
      stepRef: "set",
      subject: definitionBind,
      definitionRef: refs.definition,
      definitionDigest: digests.definition,
      valid: true,
      containsIssues: [{ path: "field", code: "CHECKED" }],
      excludesIssues: [{ path: "field", code: "BROKEN" }],
    },
    {
      id: "response",
      kind: "response",
      ruleRefs: [
        artifactRule(definitionItem),
        artifactRule(experienceUnit),
        rule,
      ],
      checkpointRef: "after",
      requiredEvidence: "runtime",
      stepRef: "set",
      subject: definitionItem,
      definitionRef: refs.definition,
      definitionDigest: digests.definition,
      status: "in-progress",
      item: {
        path: "field",
        presence: "present",
        value: { alpha: 1, beta: 2 },
      },
    },
    {
      id: "action",
      kind: "action-invocation",
      ruleRefs: [
        artifactRule(actionSubject),
        artifactRule(experienceUnit),
        rule,
      ],
      checkpointRef: "after",
      requiredEvidence: "runtime",
      stepRef: "activate",
      actionsRef: refs.actions,
      actionsDigest: digests.actions,
      actionId: "submit",
      terminal: "completed",
      effects: [
        {
          index: 0,
          type: "hostEvent",
          status: "succeeded",
          outcomeRef: "event:1",
        },
      ],
    },
    {
      id: "data",
      kind: "data-source-result",
      ruleRefs: [artifactRule(dataSubject), artifactRule(experienceUnit), rule],
      checkpointRef: "after",
      requiredEvidence: "runtime",
      stepRef: "open",
      catalogRef: refs.data,
      catalogDigest: digests.data,
      sourceId: "schedule",
      state: "loaded",
      freshness: "fresh",
      recordId: "record:1",
      valueDigest: digest("7"),
    },
    {
      id: "route-state",
      kind: "route-state",
      ruleRefs: [
        artifactRule(surfaceRouteSubject),
        artifactRule(experienceUnit),
        {
          kind: "specification-rule",
          specRef: "https://formspec.org/specs/surface",
          specVersion: "0.2.0-draft.1",
          ruleId: "routing.current-route-state",
        },
      ],
      checkpointRef: "after",
      requiredEvidence: "runtime",
      stepRef: "activate",
      subject: surfaceRouteSubject,
      surfaceRef: refs.surface,
      surfaceDigest: digests.surface,
      routeId: "route",
    },
    {
      id: "rendered",
      kind: "rendered-output",
      ruleRefs: [
        artifactRule(surfaceFieldNode),
        artifactRule(experienceUnit),
        rule,
      ],
      checkpointRef: "after",
      requiredEvidence: "runtime",
      stepRef: "open",
      node: surfaceFieldNode,
      rendered: true,
      operable: true,
      semanticValue: { alpha: 1, beta: 2 },
    },
  ],
};

export const boundary = {
  startedAt: "2026-07-31T12:00:00.000Z",
  endedAt: "2026-07-31T12:00:10.000Z",
} as const;

export const observationBoundary = {
  startedAt: "2026-07-31T12:00:01.000Z",
  endedAt: "2026-07-31T12:00:09.000Z",
} as const;

export const bindings: StepBinding[] = [
  {
    id: "binding:open",
    stepId: "open",
    kind: "open-route",
    surfaceRef: refs.surface,
    surfaceDigest: digests.surface,
    routeId: "route",
    routeInstanceId: "route-instance:1",
    renderInstanceId: "render:1",
    dataSourceRequestIds: ["request:1"],
  },
  {
    id: "binding:set",
    stepId: "set",
    kind: "set-item",
    routeInstanceId: "route-instance:1",
    renderInstanceId: "render:1",
    control: fieldControl,
    definitionRef: refs.definition,
    definitionDigest: digests.definition,
    path: "field",
    responseId: "response:1",
    responseRevision: 1,
  },
  {
    id: "binding:activate",
    stepId: "activate",
    kind: "activate-control",
    routeInstanceId: "route-instance:1",
    renderInstanceId: "render:1",
    control: actionControl,
    actionsRef: refs.actions,
    actionsDigest: digests.actions,
    actionId: "submit",
    invocationId: "invocation:1",
    responseId: "response:1",
    responseRevision: 2,
    effects: [
      {
        index: 0,
        type: "hostEvent",
        status: "succeeded",
        outcomeRef: "event:1",
      },
    ],
  },
  {
    id: "binding:checkpoint",
    stepId: "after",
    kind: "checkpoint",
    boundary,
    includedBindingRefs: ["binding:open", "binding:set", "binding:activate"],
  },
];

const adapter = {
  id: "adapter:test",
  version: "1.0.0",
  digest: digest("f"),
};

export const fixtureVerifier = {
  id: "verifier:test",
  version: "1.0.0",
  digest: digest("e"),
};

export const observations: NormalizedObservation[] = [
  {
    id: "observation:graph",
    expectationId: "graph",
    kind: "app-graph",
    evidenceClass: "structural",
    source: {
      artifactRef: refs.surface,
      artifactDigest: digests.surface,
    },
    boundary: observationBoundary,
    checkpointBindingRef: "binding:checkpoint",
    adapter,
    payload: {
      subject: surfaceFieldNode,
      relation: "mounted",
      state: "present",
    },
  },
  {
    id: "observation:validation",
    expectationId: "validation",
    kind: "validation-report",
    evidenceClass: "runtime",
    source: {
      artifactRef: refs.definition,
      artifactDigest: digests.definition,
    },
    boundary: observationBoundary,
    checkpointBindingRef: "binding:checkpoint",
    stepBindingRef: "binding:set",
    adapter,
    payload: {
      definitionRef: refs.definition,
      definitionDigest: digests.definition,
      responseId: "response:1",
      responseRevision: 1,
      valid: true,
      issues: [
        { path: "field", code: "CHECKED" },
        { path: "field", code: "CHECKED" },
      ],
    },
  },
  {
    id: "observation:response",
    expectationId: "response",
    kind: "response",
    evidenceClass: "runtime",
    source: {
      artifactRef: refs.definition,
      artifactDigest: digests.definition,
    },
    boundary: observationBoundary,
    checkpointBindingRef: "binding:checkpoint",
    stepBindingRef: "binding:set",
    adapter,
    payload: {
      definitionRef: refs.definition,
      definitionDigest: digests.definition,
      responseId: "response:1",
      responseRevision: 1,
      responseDigest: digest("0"),
      status: "in-progress",
      item: {
        path: "field",
        presence: "present",
        value: { beta: 2, alpha: 1 },
      },
    },
  },
  {
    id: "observation:action",
    expectationId: "action",
    kind: "action-invocation",
    evidenceClass: "runtime",
    source: {
      artifactRef: refs.actions,
      artifactDigest: digests.actions,
    },
    boundary: observationBoundary,
    checkpointBindingRef: "binding:checkpoint",
    stepBindingRef: "binding:activate",
    adapter,
    payload: {
      actionsRef: refs.actions,
      actionsDigest: digests.actions,
      actionId: "submit",
      terminal: "completed",
      effects: [
        {
          index: 0,
          type: "hostEvent",
          status: "succeeded",
          outcomeRef: "event:1",
        },
      ],
      invocationId: "invocation:1",
      responseId: "response:1",
    },
  },
  {
    id: "observation:data",
    expectationId: "data",
    kind: "data-source-result",
    evidenceClass: "runtime",
    source: {
      artifactRef: refs.data,
      artifactDigest: digests.data,
    },
    boundary: observationBoundary,
    checkpointBindingRef: "binding:checkpoint",
    stepBindingRef: "binding:open",
    adapter,
    payload: {
      catalogRef: refs.data,
      catalogDigest: digests.data,
      sourceId: "schedule",
      state: "loaded",
      freshness: "fresh",
      recordId: "record:1",
      valueDigest: digest("7"),
      requestId: "request:1",
    },
  },
  {
    id: "observation:route-state",
    expectationId: "route-state",
    kind: "route-state",
    evidenceClass: "runtime",
    source: {
      artifactRef: refs.surface,
      artifactDigest: digests.surface,
    },
    boundary: observationBoundary,
    checkpointBindingRef: "binding:checkpoint",
    stepBindingRef: "binding:activate",
    adapter,
    payload: {
      surfaceRef: refs.surface,
      surfaceDigest: digests.surface,
      routeId: "route",
      routeInstanceId: "route-instance:1",
    },
  },
  {
    id: "observation:rendered",
    expectationId: "rendered",
    kind: "rendered-output",
    evidenceClass: "runtime",
    source: {
      artifactRef: refs.surface,
      artifactDigest: digests.surface,
    },
    boundary: observationBoundary,
    checkpointBindingRef: "binding:checkpoint",
    stepBindingRef: "binding:open",
    adapter,
    payload: {
      node: surfaceFieldNode,
      rendered: true,
      operable: true,
      semanticValue: { beta: 2, alpha: 1 },
      renderInstanceId: "render:1",
    },
  },
];

export const pairedSources: [SourcePin, ...SourcePin[]] = [
  { artifactRef: refs.needs, artifactDigest: digests.needs },
  { artifactRef: refs.experience, artifactDigest: digests.experience },
  { artifactRef: refs.app, artifactDigest: digests.app },
  { artifactRef: refs.surface, artifactDigest: digests.surface },
  { artifactRef: refs.definition, artifactDigest: digests.definition },
  { artifactRef: refs.actions, artifactDigest: digests.actions },
  { artifactRef: refs.data, artifactDigest: digests.data },
];

export const fixtureImplementations = {
  host: { id: "host:test", version: "1.0.0", digest: digest("a") },
  renderer: {
    id: "renderer:test",
    version: "1.0.0",
    digest: digest("b"),
  },
  runner: {
    id: "runner:test",
    version: "1.0.0",
    digest: digest("c"),
  },
  runtime: {
    id: "runtime:test",
    version: "1.0.0",
    digest: digest("d"),
  },
  verifier: fixtureVerifier,
  adapter,
};

export async function fixtureResolvedTarget(
  request: RunnerAdmissionContext["target"] = {
    class: "preview",
    ref: "preview:test",
  }
): Promise<ResolvedTargetIdentity> {
  const implementationSetDigest = await digestOutcomeImplementationSet(
    fixtureImplementations
  );
  const buildRef = "urn:test:build";
  const buildDigest = digest("8");
  return {
    ...request,
    buildRef,
    buildDigest,
    implementations: structuredClone(fixtureImplementations),
    implementationSetDigest,
    targetIdentityDigest: await digestResolvedTargetIdentity({
      ...request,
      buildRef,
      buildDigest,
      implementationSetDigest,
    }),
  };
}

export const fixtureTargetIdentities = {
  async resolveTarget(request: RunnerAdmissionContext["target"]) {
    return fixtureResolvedTarget(request);
  },
};

let receiptSequence = 0;

export function fixtureRunBindings(): OutcomeRunBindingPort {
  const byKey = new Map<string, string>();
  const records = new Map<
    string,
    import("../src/index.js").OutcomeExecutionReceiptRecord & {
      runnerEvidenceDigest?: string;
    }
  >();
  return {
    async beginRun(input) {
      const key = `${input.targetIdentityDigest}\u0000${input.runId}`;
      if (byKey.has(key)) return { status: "conflict" };
      receiptSequence += 1;
      const receiptRef = `urn:test:receipt:${receiptSequence}`;
      byKey.set(key, receiptRef);
      records.set(receiptRef, {
        receiptRef,
        evidenceDigest: "",
        reportId: "",
        evidence: {} as import("../src/index.js").OutcomeExecutionEvidence,
      });
      return { status: "bound", receiptRef };
    },
    async completeRun(input) {
      const record = records.get(input.receiptRef);
      if (
        record === undefined ||
        record.runnerEvidenceDigest !== undefined ||
        input.runnerEvidenceDigest !== (await sha256Digest(input.evidence))
      ) {
        return "conflict";
      }
      record.runnerEvidenceDigest = input.runnerEvidenceDigest;
      return "completed";
    },
    async finalizeEvidence(input) {
      const record = records.get(input.receiptRef);
      const runnerEvidence = {
        bindings: input.evidence.bindings,
        observations: input.evidence.observations,
        boundary: input.evidence.boundary,
      };
      if (
        record === undefined ||
        record.runnerEvidenceDigest !== (await sha256Digest(runnerEvidence)) ||
        input.evidenceDigest !== (await sha256Digest(input.evidence)) ||
        record.evidenceDigest.length > 0
      ) {
        return "conflict";
      }
      Object.assign(record, {
        evidenceDigest: input.evidenceDigest,
        reportId: input.reportId,
        evidence: structuredClone(input.evidence),
      });
      return "finalized";
    },
    async recordReport(input) {
      const record = records.get(input.receiptRef);
      if (
        record === undefined ||
        record.evidenceDigest !== input.evidenceDigest ||
        record.reportId !== input.reportId ||
        record.reportDigest !== undefined
      ) {
        return "conflict";
      }
      record.reportDigest = input.reportDigest;
      return "recorded";
    },
    async readReceipt(receiptRef) {
      const record = records.get(receiptRef);
      return record === undefined ? undefined : structuredClone(record);
    },
  };
}

export async function admission(
  document: OutcomeVerificationCase = caseDocument,
  runId = "run:test"
): Promise<RunnerAdmissionContext> {
  const caseDigest = await sha256Digest(document);
  const facts: RunnerAdmissionFacts = {
    target: {
      class: "preview",
      ref: "preview:test",
    },
    mode: "new",
    runId,
    caseDigest,
    admittedStepKinds: [
      "open-route",
      "set-item",
      "activate-control",
      "checkpoint",
    ],
    principal: { kind: "actor", ref: "actor:test" },
  };
  return {
    ...facts,
    admissionDigest: await digestRunnerAdmissionContext(facts),
  };
}

function fixtureRunnerPorts(
  observed: NormalizedObservation[] = observations
): import("../src/index.js").OutcomeRunnerPorts {
  let invocationId = "";
  return {
    async openRoute(step) {
      return {
        ...structuredClone(bindings[0]!),
        stepId: step.id,
        surfaceRef: step.surfaceRef,
        surfaceDigest: step.surfaceDigest,
        routeId: step.routeId,
      } as Extract<StepBinding, { kind: "open-route" }>;
    },
    async setItem(step) {
      return {
        ...structuredClone(bindings[1]!),
        stepId: step.id,
        control: step.control,
        definitionRef: step.definitionRef,
        definitionDigest: step.definitionDigest,
        path: step.path,
      } as Extract<StepBinding, { kind: "set-item" }>;
    },
    async activateControl(step, _render, response, derivedId) {
      invocationId = derivedId;
      return {
        ...structuredClone(bindings[2]!),
        stepId: step.id,
        control: step.control,
        actionsRef: step.actionsRef,
        actionsDigest: step.actionsDigest,
        actionId: step.actionId,
        invocationId: derivedId,
        responseId: response.responseId,
      } as Extract<StepBinding, { kind: "activate-control" }>;
    },
    async checkpoint(step, prior) {
      const produced = structuredClone(observed);
      const action = produced.find(
        (entry) => entry.kind === "action-invocation"
      );
      if (action?.kind === "action-invocation") {
        action.payload.invocationId = invocationId;
      }
      return {
        binding: {
          ...structuredClone(bindings[3]!),
          stepId: step.id,
          includedBindingRefs: prior.map((binding) => binding.id),
        } as Extract<StepBinding, { kind: "checkpoint" }>,
        observations: produced,
      };
    },
  };
}

const comparatorDependencies = new WeakMap<
  OutcomeComparatorInput,
  OutcomeComparatorDependencies
>();

export function fixtureComparatorDependencies(
  request: OutcomeComparatorInput
): OutcomeComparatorDependencies {
  const dependencies = comparatorDependencies.get(request);
  if (dependencies === undefined) {
    throw new Error("fixture comparator dependencies are unavailable");
  }
  return dependencies;
}

export async function comparatorRequest(): Promise<OutcomeComparatorInput> {
  const caseCopy = structuredClone(caseDocument);
  const runnerAdmission = await admission(caseCopy);
  const lintClearance = await fixtureLintClearance(caseCopy);
  const runBindings = fixtureRunBindings();
  const run = await runOutcomeVerificationCase(
    {
      caseDocument: caseCopy,
      admission: runnerAdmission,
      lintClearance,
    },
    {
      targetIdentities: fixtureTargetIdentities,
      runBindings,
      ports: fixtureRunnerPorts(),
      supportedStepKinds: [
        "open-route",
        "set-item",
        "activate-control",
        "checkpoint",
      ],
      clock: { now: () => boundary.startedAt },
    }
  );
  const request: OutcomeComparatorInput = {
    case: caseCopy,
    caseDigest: run.caseDigest,
    lintClearance,
    pairedSources: structuredClone(pairedSources),
    run: {
      runId: run.runId,
      admissionContextDigest: runnerAdmission.admissionDigest,
      target: run.target,
    },
    custody: run.custody,
    bindings: run.bindings,
    boundary: run.boundary,
    observations: run.observations,
  };
  comparatorDependencies.set(request, {
    clock: { now: () => "2026-07-31T12:00:11.000Z" },
    runBindings,
  });
  return request;
}

export const lintSources: PairedSource[] = [
  {
    artifactRef: refs.needs,
    artifactDigest: digests.needs,
    document: {
      $formspecNeeds: "1.0",
      needs: [{ id: "complete-task", revision: 2, status: "adopted" }],
    },
  },
  {
    artifactRef: refs.app,
    artifactDigest: digests.app,
    document: {
      $formspecBundle: "2.4",
      id: refs.app,
      version: "1.2.3",
    },
  },
  {
    artifactRef: refs.surface,
    artifactDigest: digests.surface,
    document: {
      $formspecSurface: "0.1",
      routes: [
        {
          id: "route",
          "x-generation": {
            anchors: ["need:complete-task@2"],
          },
          slots: [
            {
              id: "experience",
              slotType: "experience-unit",
              binding: {
                experienceRef: refs.experience,
                unitRef: experienceUnit.subjectRef,
              },
            },
            {
              id: "field",
              slotType: "definition-form",
              binding: {
                definitionRef: refs.definition,
              },
              "x-generation": {
                anchors: ["need:complete-task@2"],
              },
            },
          ],
        },
      ],
    },
    subjects: [
      { kind: "surface-route", ref: "route" },
      { kind: "surface-node", ref: "route/field" },
      { kind: "surface-node", ref: "route/submit" },
    ],
  },
  {
    artifactRef: refs.definition,
    artifactDigest: digests.definition,
    document: {
      $formspec: "1.0",
      items: [
        {
          key: "field",
          "x-generation": {
            anchors: ["need:complete-task@2"],
          },
        },
      ],
      binds: [
        {
          path: "field",
          "x-generation": {
            anchors: ["need:complete-task@2"],
          },
        },
      ],
    },
    subjects: [
      { kind: "definition-item", ref: "field" },
      { kind: "definition-bind", ref: "field" },
    ],
  },
  {
    artifactRef: refs.actions,
    artifactDigest: digests.actions,
    document: {
      $formspecResponseActions: "0.1",
      targetDefinition: { url: refs.definition },
      actions: [
        {
          id: "submit",
          "x-generation": {
            anchors: ["need:complete-task@2"],
          },
          effects: [{ type: "hostEvent" }],
        },
      ],
    },
    subjects: [{ kind: "response-action", ref: "submit" }],
  },
  {
    artifactRef: refs.data,
    artifactDigest: digests.data,
    document: {
      $formspecDataSources: "0.1",
      sources: [
        {
          id: "schedule",
          "x-generation": {
            anchors: ["need:complete-task@2"],
          },
        },
      ],
    },
    subjects: [{ kind: "data-source", ref: "schedule" }],
  },
  {
    artifactRef: refs.experience,
    artifactDigest: digests.experience,
    document: {
      $formspecExperience: "1.0",
      units: [
        {
          id: experienceUnit.subjectRef,
          needRefs: [{ id: caseDocument.need.id }],
        },
      ],
    },
    subjects: [{ kind: "experience-unit", ref: experienceUnit.subjectRef }],
  },
];

export function fixtureLintContext(): OutcomeResolvedLintContext {
  return {
    sources: structuredClone(lintSources),
    specificationRules: structuredClone(OUTCOME_V01_SPECIFICATION_RULE_INDEX),
    supportedStepKinds: [
      "open-route",
      "set-item",
      "activate-control",
      "checkpoint",
    ],
    supportedObservationKinds: [
      "app-graph",
      "validation-report",
      "response",
      "action-invocation",
      "data-source-result",
      "route-state",
      "rendered-output",
    ],
    semanticControlBindings: [
      {
        control: fieldControl,
        renderStepRef: "open",
        definition: {
          ref: refs.definition,
          digest: digests.definition,
          path: "field",
        },
      },
      {
        control: actionControl,
        renderStepRef: "open",
        action: {
          ref: refs.actions,
          digest: digests.actions,
          id: "submit",
        },
      },
    ],
    experienceUnitBindings: [
      {
        surfaceRef: refs.surface,
        surfaceDigest: digests.surface,
        routeId: "route",
        experienceRef: refs.experience,
        experienceDigest: digests.experience,
        unitId: experienceUnit.subjectRef,
        subjects: [
          surfaceFieldNode,
          surfaceRouteSubject,
          fieldControl,
          definitionBind,
          definitionItem,
          actionSubject,
          dataSubject,
        ],
      },
    ],
    subjectNeedBindings: [
      fieldControl,
      definitionBind,
      definitionItem,
      actionSubject,
      dataSubject,
      surfaceFieldNode,
      surfaceRouteSubject,
    ].map((subject) => ({
      subject,
      needId: caseDocument.need.id,
      needRevision: caseDocument.need.revision,
    })),
    actionPlans: [
      {
        actionsRef: refs.actions,
        actionsDigest: digests.actions,
        actionId: "submit",
        effects: [{ index: 0, type: "hostEvent", durable: false }],
      },
    ],
    appArtifactBindings: [
      {
        appRef: refs.app,
        appDigest: digests.app,
        artifactRef: refs.surface,
        artifactDigest: digests.surface,
        kind: "surface",
      },
      {
        appRef: refs.app,
        appDigest: digests.app,
        artifactRef: refs.definition,
        artifactDigest: digests.definition,
        kind: "definition",
      },
      {
        appRef: refs.app,
        appDigest: digests.app,
        artifactRef: refs.actions,
        artifactDigest: digests.actions,
        kind: "response-actions",
      },
      {
        appRef: refs.app,
        appDigest: digests.app,
        artifactRef: refs.data,
        artifactDigest: digests.data,
        kind: "data-sources",
      },
    ],
  };
}

export const fixtureSchemaValidation: OutcomeSchemaValidationPort = {
  identity: {
    id: "schema:test",
    version: "1.0.0",
    digest: digest("4"),
  },
  async validate(input) {
    return {
      valid: typeof input.document === "object" && input.document !== null,
      schemaId: `urn:test:schema:${input.kind}`,
    };
  },
};

export function fixtureOwnerFacts(
  context: OutcomeResolvedLintContext = fixtureLintContext()
): OutcomeOwnerFactsPort {
  return {
    identity: {
      id: "owner-facts:test",
      version: "1.0.0",
      digest: digest("9"),
    },
    async deriveFacts({ sources }) {
      return {
        sources: sources.map((source) => {
          const paired = context.sources.find(
            (candidate) =>
              candidate.artifactRef === source.artifactRef &&
              candidate.artifactDigest === source.artifactDigest
          );
          return {
            ...structuredClone(source),
            subjects: structuredClone(paired?.subjects ?? []),
          };
        }),
        semanticControlBindings: structuredClone(
          context.semanticControlBindings
        ),
        experienceUnitBindings: structuredClone(context.experienceUnitBindings),
        subjectNeedBindings: structuredClone(context.subjectNeedBindings),
        appArtifactBindings: structuredClone(context.appArtifactBindings),
        actionPlans: structuredClone(context.actionPlans),
      };
    },
  };
}

export async function fixtureLintClearance(
  document: OutcomeVerificationCase = caseDocument
): Promise<OutcomeLintClearance> {
  const lintContext = fixtureLintContext();
  const firstOpen = document.procedure.find(
    (step) => step.kind === "open-route"
  );
  if (firstOpen?.kind === "open-route") {
    lintContext.experienceUnitBindings[0]!.routeId = firstOpen.routeId;
    for (const binding of lintContext.semanticControlBindings) {
      binding.renderStepRef = firstOpen.id;
    }
  }
  return issueOutcomeLintClearance(
    {
      caseDocument: document,
      context: lintContext,
    },
    {
      schemaValidation: fixtureSchemaValidation,
      verifier: fixtureVerifier,
      ownerFacts: fixtureOwnerFacts(lintContext),
    }
  );
}
