/** @filedesc Generic outcome-case runner with fail-closed caller admission. */

import { canonicalJsonEqual, sha256Digest } from "./canonical.js";
import {
  actionPlansForOutcomeLintClearance,
  validateOutcomeLintClearance,
} from "./clearance.js";
import { issueOutcomeRunCustody } from "./custody.js";
import {
  digestResolvedTargetIdentity,
  resolvedTargetIdentityIsValid,
} from "./target-identity.js";
import type {
  ActivateControlBinding,
  ActivateControlStep,
  CheckpointBinding,
  OpenRouteBinding,
  OutcomeLintClearance,
  OutcomeLintActionPlan,
  OutcomeRunResult,
  OutcomeRunnerDependencies,
  OutcomeVerificationCase,
  ProcedureStep,
  OwnerResolvedActionPlan,
  RunnerAdmissionContext,
  RunnerAdmissionFacts,
  RunnerPortContext,
  SetItemBinding,
  StepBinding,
} from "./types.js";

export type OutcomeRunnerErrorCode =
  | "ADMISSION_REQUIRED"
  | "ADMISSION_INVALID"
  | "ADMISSION_DIGEST_MISMATCH"
  | "CASE_DIGEST_MISMATCH"
  | "RUN_BINDING_CONFLICT"
  | "STEP_NOT_ADMITTED"
  | "PROCEDURE_INVALID"
  | "LINT_CLEARANCE_INVALID"
  | "TARGET_RESOLUTION_FAILED"
  | "TARGET_IDENTITY_INVALID"
  | "ACTION_PLAN_MISSING"
  | "ACTION_PLAN_AMBIGUOUS"
  | "ACTION_PLAN_MISMATCH"
  | "DURABLE_EFFECT_UNSUPPORTED"
  | "OWNER_BINDING_INVALID";

export class OutcomeRunnerError extends Error {
  readonly code: OutcomeRunnerErrorCode;

  constructor(code: OutcomeRunnerErrorCode, message: string) {
    super(message);
    this.name = "OutcomeRunnerError";
    this.code = code;
  }
}

function requireNonEmpty(
  value: unknown,
  name: string
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new OutcomeRunnerError("ADMISSION_INVALID", `${name} is required`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  admitted: readonly string[]
): boolean {
  const keys = new Set(admitted);
  return Object.keys(value).every((key) => keys.has(key));
}

function admissionShapeIsClosed(admission: RunnerAdmissionContext): boolean {
  if (
    !isRecord(admission) ||
    !hasOnlyKeys(admission, [
      "target",
      "mode",
      "runId",
      "caseDigest",
      "admittedStepKinds",
      "principal",
      "admissionDigest",
    ]) ||
    !isRecord(admission.target) ||
    !hasOnlyKeys(admission.target, ["class", "ref"]) ||
    !Array.isArray(admission.admittedStepKinds) ||
    !isRecord(admission.principal) ||
    !hasOnlyKeys(admission.principal, ["kind", "ref"])
  ) {
    return false;
  }
  return true;
}

const OUTCOME_STEP_KINDS = new Set<ProcedureStep["kind"]>([
  "open-route",
  "set-item",
  "activate-control",
  "checkpoint",
]);

function ownerPlanShapeIsClosed(plan: OwnerResolvedActionPlan): boolean {
  return (
    isRecord(plan) &&
    hasOnlyKeys(plan, [
      "stepId",
      "actionsRef",
      "actionsDigest",
      "actionId",
      "effects",
    ]) &&
    typeof plan.stepId === "string" &&
    typeof plan.actionsRef === "string" &&
    typeof plan.actionsDigest === "string" &&
    typeof plan.actionId === "string" &&
    Array.isArray(plan.effects) &&
    plan.effects.every(
      (effect) =>
        isRecord(effect) &&
        hasOnlyKeys(effect, ["index", "type", "durable"]) &&
        typeof effect.index === "number" &&
        typeof effect.type === "string" &&
        typeof effect.durable === "boolean"
    )
  );
}

function planMatchesStep(
  plan: OwnerResolvedActionPlan,
  step: ActivateControlStep
): boolean {
  return (
    plan.stepId === step.id &&
    plan.actionsRef === step.actionsRef &&
    plan.actionsDigest === step.actionsDigest &&
    plan.actionId === step.actionId
  );
}

const DURABLE_EFFECT_TYPES = new Set([
  "mappingExecution",
  "ledgerAppend",
  "handoffAssembly",
  "evidenceRequest",
]);
const NON_DURABLE_EFFECT_TYPES = new Set(["hostEvent", "browserResource"]);

function preflightProcedure(caseDocument: OutcomeVerificationCase): void {
  const seen = new Map<string, ProcedureStep>();
  for (const step of caseDocument.procedure) {
    if (seen.has(step.id)) {
      throw new OutcomeRunnerError(
        "PROCEDURE_INVALID",
        `duplicate procedure step ${step.id}`
      );
    }
    if (step.kind === "set-item") {
      if (seen.get(step.renderStepRef)?.kind !== "open-route") {
        throw new OutcomeRunnerError(
          "PROCEDURE_INVALID",
          `set-item ${step.id} must reference a prior open-route step`
        );
      }
    }
    if (step.kind === "activate-control") {
      const renderStep = seen.get(step.renderStepRef);
      const responseStep = seen.get(step.responseStepRef);
      if (renderStep?.kind !== "open-route") {
        throw new OutcomeRunnerError(
          "PROCEDURE_INVALID",
          `activate-control ${step.id} must reference a prior open-route step`
        );
      }
      if (responseStep?.kind !== "set-item") {
        throw new OutcomeRunnerError(
          "PROCEDURE_INVALID",
          `activate-control ${step.id} must reference a prior set-item step`
        );
      }
      if (responseStep.renderStepRef !== step.renderStepRef) {
        throw new OutcomeRunnerError(
          "PROCEDURE_INVALID",
          `activate-control ${step.id} must use a Response from its rendered route`
        );
      }
    }
    seen.set(step.id, step);
  }
}

async function resolveAndPreflightActionPlans(
  caseDocument: OutcomeVerificationCase,
  resolvedPlans: readonly OutcomeLintActionPlan[]
): Promise<OwnerResolvedActionPlan[]> {
  const plans: OwnerResolvedActionPlan[] = [];
  for (const step of caseDocument.procedure) {
    if (step.kind !== "activate-control") {
      continue;
    }
    const matches = resolvedPlans.filter(
      (plan) =>
        plan.actionsRef === step.actionsRef &&
        plan.actionsDigest === step.actionsDigest &&
        plan.actionId === step.actionId
    );
    const ownerPlan = matches[0];
    if (matches.length !== 1 || ownerPlan === undefined) {
      throw new OutcomeRunnerError(
        matches.length === 0 ? "ACTION_PLAN_MISSING" : "ACTION_PLAN_AMBIGUOUS",
        `activate-control ${step.id} must have exactly one cleared Action plan`
      );
    }
    const plan: OwnerResolvedActionPlan = {
      stepId: step.id,
      ...ownerPlan,
    };
    if (!ownerPlanShapeIsClosed(plan)) {
      throw new OutcomeRunnerError(
        "ACTION_PLAN_MISMATCH",
        `owner Action plan for ${step.id} has an invalid shape`
      );
    }
    if (!planMatchesStep(plan, step)) {
      throw new OutcomeRunnerError(
        "ACTION_PLAN_MISMATCH",
        `Action plan for ${step.id} does not match its qualified Action`
      );
    }
    if (plan.effects.length === 0) {
      throw new OutcomeRunnerError(
        "ACTION_PLAN_MISMATCH",
        `Action plan for ${step.id} must contain its complete effect chain`
      );
    }
    const indices = new Set<number>();
    for (const [position, effect] of plan.effects.entries()) {
      if (
        !Number.isInteger(effect.index) ||
        effect.index !== position ||
        effect.type.length === 0 ||
        indices.has(effect.index)
      ) {
        throw new OutcomeRunnerError(
          "ACTION_PLAN_MISMATCH",
          `Action plan for ${step.id} has an invalid or duplicate effect`
        );
      }
      indices.add(effect.index);
      const durableByType = DURABLE_EFFECT_TYPES.has(effect.type);
      if (
        (!durableByType && !NON_DURABLE_EFFECT_TYPES.has(effect.type)) ||
        effect.durable !== durableByType
      ) {
        throw new OutcomeRunnerError(
          "ACTION_PLAN_MISMATCH",
          `Action plan for ${step.id} misclassifies effect ${effect.index}`
        );
      }
      if (durableByType) {
        throw new OutcomeRunnerError(
          "DURABLE_EFFECT_UNSUPPORTED",
          `durable effect ${effect.index} of ${step.id} is outside v0.1 preview/test execution`
        );
      }
    }
    plans.push(plan);
  }
  return plans;
}

async function preflightAdmission(
  caseDocument: OutcomeVerificationCase,
  admission: RunnerAdmissionContext | undefined
): Promise<string> {
  if (admission === undefined) {
    throw new OutcomeRunnerError(
      "ADMISSION_REQUIRED",
      "a caller-supplied RunnerAdmissionContext is required"
    );
  }
  if (!admissionShapeIsClosed(admission)) {
    throw new OutcomeRunnerError(
      "ADMISSION_INVALID",
      "RunnerAdmissionContext must use its closed sanitized shape"
    );
  }
  if (
    admission.target.class !== "preview" &&
    admission.target.class !== "test"
  ) {
    throw new OutcomeRunnerError(
      "ADMISSION_INVALID",
      "only preview and test targets are admitted"
    );
  }
  requireNonEmpty(admission.target.ref, "target.ref");
  if (admission.mode !== "new") {
    throw new OutcomeRunnerError(
      "ADMISSION_INVALID",
      "v0.1 admits new runs only"
    );
  }
  requireNonEmpty(admission.runId, "runId");
  requireNonEmpty(admission.caseDigest, "caseDigest");
  requireNonEmpty(admission.admissionDigest, "admissionDigest");
  if (
    admission.admittedStepKinds.length === 0 ||
    admission.admittedStepKinds.some((kind) => !OUTCOME_STEP_KINDS.has(kind)) ||
    new Set(admission.admittedStepKinds).size !==
      admission.admittedStepKinds.length
  ) {
    throw new OutcomeRunnerError(
      "ADMISSION_INVALID",
      "admittedStepKinds must be a non-empty unique list of known step kinds"
    );
  }
  requireNonEmpty(admission.principal?.ref, "principal.ref");
  if (
    admission.principal.kind !== "actor" &&
    admission.principal.kind !== "capability"
  ) {
    throw new OutcomeRunnerError(
      "ADMISSION_INVALID",
      "principal.kind must be actor or capability"
    );
  }

  const actualCaseDigest = await sha256Digest(caseDocument);
  if (actualCaseDigest !== admission.caseDigest) {
    throw new OutcomeRunnerError(
      "CASE_DIGEST_MISMATCH",
      "admission is not bound to the canonical case digest"
    );
  }
  const actualAdmissionDigest = await digestRunnerAdmissionContext(admission);
  if (actualAdmissionDigest !== admission.admissionDigest) {
    throw new OutcomeRunnerError(
      "ADMISSION_DIGEST_MISMATCH",
      "admissionContextDigest does not match the sanitized admission facts"
    );
  }
  preflightProcedure(caseDocument);
  const unauthorizedKinds = [
    ...new Set(
      caseDocument.procedure
        .map((step) => step.kind)
        .filter((kind) => !admission.admittedStepKinds.includes(kind))
    ),
  ];
  if (unauthorizedKinds.length > 0) {
    throw new OutcomeRunnerError(
      "STEP_NOT_ADMITTED",
      `admission does not authorize procedure step kinds: ${unauthorizedKinds.join(
        ", "
      )}`
    );
  }
  return actualCaseDigest;
}

export async function digestRunnerAdmissionContext(
  admission: RunnerAdmissionContext | RunnerAdmissionFacts
): Promise<string> {
  const { admissionDigest: _admissionDigest, ...facts } =
    admission as RunnerAdmissionContext;
  return sha256Digest(facts);
}

function assertOpenBinding(
  step: Extract<ProcedureStep, { kind: "open-route" }>,
  binding: OpenRouteBinding
): void {
  const dataSourceRequestIds = binding.dataSourceRequestIds ?? [];
  if (
    binding.kind !== "open-route" ||
    binding.id.length === 0 ||
    binding.stepId !== step.id ||
    binding.surfaceRef !== step.surfaceRef ||
    binding.surfaceDigest !== step.surfaceDigest ||
    binding.routeId !== step.routeId ||
    binding.routeInstanceId.length === 0 ||
    binding.renderInstanceId.length === 0 ||
    dataSourceRequestIds.some((id) => id.length === 0) ||
    new Set(dataSourceRequestIds).size !== dataSourceRequestIds.length
  ) {
    throw new OutcomeRunnerError(
      "OWNER_BINDING_INVALID",
      `owner returned an invalid route binding for ${step.id}`
    );
  }
}

function assertSetBinding(
  step: Extract<ProcedureStep, { kind: "set-item" }>,
  renderBinding: OpenRouteBinding,
  binding: SetItemBinding
): void {
  if (
    binding.kind !== "set-item" ||
    binding.id.length === 0 ||
    binding.stepId !== step.id ||
    binding.renderInstanceId !== renderBinding.renderInstanceId ||
    binding.routeInstanceId !== renderBinding.routeInstanceId ||
    !canonicalJsonEqual(binding.control, step.control) ||
    binding.definitionRef !== step.definitionRef ||
    binding.definitionDigest !== step.definitionDigest ||
    binding.path !== step.path ||
    binding.responseId.length === 0 ||
    !Number.isInteger(binding.responseRevision) ||
    binding.responseRevision < 0
  ) {
    throw new OutcomeRunnerError(
      "OWNER_BINDING_INVALID",
      `owner returned an invalid item binding for ${step.id}`
    );
  }
}

function assertResponseContinuity(
  binding: SetItemBinding,
  priorBindings: readonly StepBinding[]
): void {
  const priorSetBindings = priorBindings.filter(
    (candidate): candidate is SetItemBinding =>
      candidate.kind === "set-item" &&
      candidate.renderInstanceId === binding.renderInstanceId &&
      candidate.definitionRef === binding.definitionRef &&
      candidate.definitionDigest === binding.definitionDigest
  );
  if (
    priorSetBindings.some(
      (candidate) =>
        candidate.responseId !== binding.responseId ||
        candidate.responseRevision > binding.responseRevision
    )
  ) {
    throw new OutcomeRunnerError(
      "OWNER_BINDING_INVALID",
      `owner returned a discontinuous Response binding for ${binding.stepId}`
    );
  }
}

function assertActivateBinding(
  step: ActivateControlStep,
  renderBinding: OpenRouteBinding,
  responseBinding: SetItemBinding,
  invocationId: string,
  plan: OwnerResolvedActionPlan,
  binding: ActivateControlBinding
): void {
  const completeEffects =
    binding.effects.length === plan.effects.length &&
    plan.effects.every((effect, position) => {
      const observed = binding.effects[position];
      return (
        observed?.index === effect.index &&
        observed.type === effect.type &&
        typeof observed.status === "string" &&
        observed.status.length > 0
      );
    });
  if (
    binding.kind !== "activate-control" ||
    binding.id.length === 0 ||
    binding.stepId !== step.id ||
    binding.renderInstanceId !== renderBinding.renderInstanceId ||
    binding.routeInstanceId !== renderBinding.routeInstanceId ||
    !canonicalJsonEqual(binding.control, step.control) ||
    binding.actionsRef !== step.actionsRef ||
    binding.actionsDigest !== step.actionsDigest ||
    binding.actionId !== step.actionId ||
    binding.invocationId !== invocationId ||
    responseBinding.renderInstanceId !== renderBinding.renderInstanceId ||
    binding.responseId !== responseBinding.responseId ||
    binding.responseRevision < responseBinding.responseRevision ||
    !completeEffects
  ) {
    throw new OutcomeRunnerError(
      "OWNER_BINDING_INVALID",
      `owner returned an invalid Action binding for ${step.id}`
    );
  }
}

function assertCheckpointBinding(
  stepId: string,
  priorBindings: readonly StepBinding[],
  binding: CheckpointBinding
): void {
  const expectedRefs = priorBindings.map((candidate) => candidate.id);
  if (
    binding.kind !== "checkpoint" ||
    binding.id.length === 0 ||
    binding.stepId !== stepId ||
    !canonicalJsonEqual(binding.includedBindingRefs, expectedRefs) ||
    !Number.isFinite(Date.parse(binding.boundary.startedAt)) ||
    !Number.isFinite(Date.parse(binding.boundary.endedAt)) ||
    Date.parse(binding.boundary.endedAt) <
      Date.parse(binding.boundary.startedAt)
  ) {
    throw new OutcomeRunnerError(
      "OWNER_BINDING_INVALID",
      `owner returned an invalid checkpoint binding for ${stepId}`
    );
  }
}

export async function deriveActionInvocationId(input: {
  targetIdentityDigest: string;
  caseDigest: string;
  runId: string;
  stepId: string;
  actionsDigest: string;
  actionId: string;
}): Promise<string> {
  const digest = await sha256Digest({
    targetIdentityDigest: input.targetIdentityDigest,
    caseDigest: input.caseDigest,
    runId: input.runId,
    stepId: input.stepId,
    actionsDigest: input.actionsDigest,
    actionId: input.actionId,
  });
  return `urn:formspec:outcome-invocation:${digest.slice("sha256:".length)}`;
}

export async function runOutcomeVerificationCase(
  input: {
    caseDocument: OutcomeVerificationCase;
    admission: RunnerAdmissionContext | undefined;
    lintClearance: OutcomeLintClearance;
  },
  dependencies: OutcomeRunnerDependencies
): Promise<OutcomeRunResult> {
  const caseDigest = await preflightAdmission(
    input.caseDocument,
    input.admission
  );
  const admission = input.admission as RunnerAdmissionContext;
  const target = await dependencies.targetIdentities.resolveTarget(
    admission.target
  );
  if (target === undefined) {
    throw new OutcomeRunnerError(
      "TARGET_RESOLUTION_FAILED",
      "environment could not resolve the requested target"
    );
  }
  if (!(await resolvedTargetIdentityIsValid(target, admission.target))) {
    throw new OutcomeRunnerError(
      "TARGET_IDENTITY_INVALID",
      "environment returned an invalid or mismatched target identity"
    );
  }
  if (
    !(await validateOutcomeLintClearance(input.lintClearance, {
      caseDigest,
      verifierImplementationDigest: target.implementations.verifier.digest,
    }))
  ) {
    throw new OutcomeRunnerError(
      "LINT_CLEARANCE_INVALID",
      "runner requires current schema and cross-document lint clearance"
    );
  }
  const clearedPlans = actionPlansForOutcomeLintClearance(input.lintClearance);
  if (clearedPlans === undefined) {
    throw new OutcomeRunnerError(
      "LINT_CLEARANCE_INVALID",
      "clearance did not retain its trusted Action plan set"
    );
  }
  const ownerPlans = await resolveAndPreflightActionPlans(
    input.caseDocument,
    clearedPlans
  );
  const context: RunnerPortContext = { admission, caseDigest, target };
  const runBinding = await dependencies.runBindings.beginRun({
    targetIdentityDigest: target.targetIdentityDigest,
    runId: admission.runId,
    caseDigest,
    admissionContextDigest: admission.admissionDigest,
    principal: admission.principal,
    lintClearanceDigest: input.lintClearance.clearanceDigest,
    actionPlanSetDigest: input.lintClearance.actionPlanSetDigest,
  });
  if (runBinding.status === "conflict") {
    throw new OutcomeRunnerError(
      "RUN_BINDING_CONFLICT",
      "environment already binds this target and runId to another case"
    );
  }
  const unsupportedStepKinds = [
    ...new Set(
      input.caseDocument.procedure
        .map((step) => step.kind)
        .filter((kind) => !dependencies.supportedStepKinds.includes(kind))
    ),
  ];
  if (unsupportedStepKinds.length > 0) {
    const observedAt = dependencies.clock.now();
    if (!Number.isFinite(Date.parse(observedAt))) {
      throw new OutcomeRunnerError(
        "OWNER_BINDING_INVALID",
        "runner clock must return RFC3339 for classified evidence"
      );
    }
    const runnerEvidence = {
      bindings: [],
      observations: [],
      boundary: { startedAt: observedAt, endedAt: observedAt },
    };
    if (
      (await dependencies.runBindings.completeRun({
        receiptRef: runBinding.receiptRef,
        runnerEvidenceDigest: await sha256Digest(runnerEvidence),
        evidence: runnerEvidence,
      })) !== "completed"
    ) {
      throw new OutcomeRunnerError(
        "RUN_BINDING_CONFLICT",
        "environment could not complete classified run custody"
      );
    }
    return {
      caseDigest,
      runId: admission.runId,
      target,
      boundary: runnerEvidence.boundary,
      custody: await issueOutcomeRunCustody({
        receiptRef: runBinding.receiptRef,
        caseDigest,
        admission,
        target,
        lintClearance: input.lintClearance,
        runnerEvidence,
      }),
      bindings: [],
      observations: [],
    };
  }
  const bindings: StepBinding[] = [];
  const observations: OutcomeRunResult["observations"] = [];

  for (const step of input.caseDocument.procedure) {
    if (step.kind === "open-route") {
      const binding = await dependencies.ports.openRoute(step, context);
      assertOpenBinding(step, binding);
      if (bindings.some((candidate) => candidate.id === binding.id)) {
        throw new OutcomeRunnerError(
          "OWNER_BINDING_INVALID",
          `owner returned duplicate binding ID ${binding.id}`
        );
      }
      bindings.push(binding);
      continue;
    }
    if (step.kind === "set-item") {
      const renderBinding = bindings.find(
        (binding): binding is OpenRouteBinding =>
          binding.kind === "open-route" && binding.stepId === step.renderStepRef
      );
      if (renderBinding === undefined) {
        throw new OutcomeRunnerError(
          "PROCEDURE_INVALID",
          `render binding ${step.renderStepRef} is unavailable`
        );
      }
      const binding = await dependencies.ports.setItem(
        step,
        renderBinding,
        context
      );
      assertSetBinding(step, renderBinding, binding);
      assertResponseContinuity(binding, bindings);
      if (bindings.some((candidate) => candidate.id === binding.id)) {
        throw new OutcomeRunnerError(
          "OWNER_BINDING_INVALID",
          `owner returned duplicate binding ID ${binding.id}`
        );
      }
      bindings.push(binding);
      continue;
    }
    if (step.kind === "activate-control") {
      const renderBinding = bindings.find(
        (binding): binding is OpenRouteBinding =>
          binding.kind === "open-route" && binding.stepId === step.renderStepRef
      );
      const responseBinding = bindings.find(
        (binding): binding is SetItemBinding =>
          binding.kind === "set-item" && binding.stepId === step.responseStepRef
      );
      if (renderBinding === undefined || responseBinding === undefined) {
        throw new OutcomeRunnerError(
          "PROCEDURE_INVALID",
          `owner bindings for ${step.id} are unavailable`
        );
      }
      const invocationId = await deriveActionInvocationId({
        targetIdentityDigest: target.targetIdentityDigest,
        caseDigest,
        runId: admission.runId,
        stepId: step.id,
        actionsDigest: step.actionsDigest,
        actionId: step.actionId,
      });
      const binding = await dependencies.ports.activateControl(
        step,
        renderBinding,
        responseBinding,
        invocationId,
        context
      );
      const plan = ownerPlans.find(
        (candidate) => candidate.stepId === step.id
      ) as OwnerResolvedActionPlan;
      assertActivateBinding(
        step,
        renderBinding,
        responseBinding,
        invocationId,
        plan,
        binding
      );
      if (bindings.some((candidate) => candidate.id === binding.id)) {
        throw new OutcomeRunnerError(
          "OWNER_BINDING_INVALID",
          `owner returned duplicate binding ID ${binding.id}`
        );
      }
      bindings.push(binding);
      continue;
    }

    const priorBindings = [...bindings];
    const captured = await dependencies.ports.checkpoint(
      step,
      priorBindings,
      context
    );
    assertCheckpointBinding(step.id, priorBindings, captured.binding);
    if (bindings.some((candidate) => candidate.id === captured.binding.id)) {
      throw new OutcomeRunnerError(
        "OWNER_BINDING_INVALID",
        `owner returned duplicate binding ID ${captured.binding.id}`
      );
    }
    bindings.push(captured.binding);
    observations.push(...captured.observations);
  }

  const checkpoints = bindings.filter(
    (binding): binding is CheckpointBinding => binding.kind === "checkpoint"
  );
  const firstCheckpoint = checkpoints[0];
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  if (firstCheckpoint === undefined || lastCheckpoint === undefined) {
    throw new OutcomeRunnerError(
      "PROCEDURE_INVALID",
      "an executable outcome case requires a checkpoint"
    );
  }
  const runnerEvidence = {
    bindings,
    observations,
    boundary: {
      startedAt: firstCheckpoint.boundary.startedAt,
      endedAt: lastCheckpoint.boundary.endedAt,
    },
  };
  if (
    (await dependencies.runBindings.completeRun({
      receiptRef: runBinding.receiptRef,
      runnerEvidenceDigest: await sha256Digest(runnerEvidence),
      evidence: runnerEvidence,
    })) !== "completed"
  ) {
    throw new OutcomeRunnerError(
      "RUN_BINDING_CONFLICT",
      "environment could not complete run custody"
    );
  }
  return {
    caseDigest,
    runId: admission.runId,
    target,
    boundary: runnerEvidence.boundary,
    custody: await issueOutcomeRunCustody({
      receiptRef: runBinding.receiptRef,
      caseDigest,
      admission,
      target,
      lintClearance: input.lintClearance,
      runnerEvidence,
    }),
    bindings,
    observations,
  };
}
