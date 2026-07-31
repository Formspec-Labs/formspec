/** @filedesc Cross-document lint for outcome cases and generated reports. */

import { canonicalJsonEqual } from "./canonical.js";
import type {
  AppArtifactBinding,
  EvidenceClass,
  ExpectedObservation,
  FiniteJson,
  OutcomeResolvedLintContext,
  OutcomeLintFinding,
  OutcomeObservationKind,
  OutcomeVerificationCase,
  PairedSource,
  ProcedureStep,
  QualifiedSubjectRef,
  SemanticControlBinding,
  SourcePin,
} from "./types.js";

interface ExpectedBaseView {
  id: string;
  kind: OutcomeObservationKind;
  checkpointRef: string;
  requiredEvidence: EvidenceClass;
  stepRef?: string;
  ruleRefs: ExpectedObservation["ruleRefs"];
}

type ExpectedView =
  | (ExpectedBaseView & {
      kind: "app-graph";
      subject: QualifiedSubjectRef;
      relation: "resolves" | "mounted" | "direct-need-trace";
      state: "present" | "absent";
    })
  | (ExpectedBaseView & {
      kind: "validation-report";
      subject: QualifiedSubjectRef;
      definitionRef: string;
      definitionDigest: string;
      valid: boolean;
      containsIssues?: Array<{ path: string; code: string }>;
      excludesIssues?: Array<{ path: string; code: string }>;
    })
  | (ExpectedBaseView & {
      kind: "response";
      subject: QualifiedSubjectRef;
      definitionRef: string;
      definitionDigest: string;
      status?: string;
      item?: {
        path: string;
        presence: "present" | "absent";
        value?: FiniteJson;
      };
    })
  | (ExpectedBaseView & {
      kind: "action-invocation";
      actionsRef: string;
      actionsDigest: string;
      actionId: string;
      terminal: string;
      effects: unknown[];
    })
  | (ExpectedBaseView & {
      kind: "data-source-result";
      catalogRef: string;
      catalogDigest: string;
      sourceId: string;
      state: string;
      freshness?: string;
      recordId?: string;
      valueDigest?: string;
      recordStepRef?: string;
    })
  | (ExpectedBaseView & {
      kind: "route-state";
      surfaceRef: string;
      surfaceDigest: string;
      routeId: string;
    })
  | (ExpectedBaseView & {
      kind: "rendered-output";
      node: QualifiedSubjectRef;
      rendered: true;
      operable?: boolean;
      semanticValue?: FiniteJson;
    });

export const OUTCOME_EVIDENCE_COMPATIBILITY: Readonly<
  Record<OutcomeObservationKind, readonly EvidenceClass[]>
> = {
  "app-graph": ["structural"],
  "validation-report": ["simulated", "runtime"],
  response: ["simulated", "runtime"],
  "action-invocation": ["simulated", "runtime"],
  "data-source-result": ["simulated", "runtime"],
  "rendered-output": ["simulated", "runtime"],
  "route-state": ["simulated", "runtime"],
};

function finding(
  code: string,
  path: string,
  message: string
): OutcomeLintFinding {
  return { code, severity: "error", path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lintUnexpectedKeys(
  value: object,
  allowed: readonly string[],
  path: string
): OutcomeLintFinding[] {
  const allowedKeys = new Set(allowed);
  return Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .map((key) =>
      finding(
        "OUTCOME_CLOSED_PAYLOAD_FIELD_INVALID",
        `${path}/${key}`,
        `field ${key} is not admitted for this closed kind`
      )
    );
}

function sourceCandidates(
  sources: readonly PairedSource[],
  pin: SourcePin
): PairedSource[] {
  return sources.filter((source) => source.artifactRef === pin.artifactRef);
}

function lintPin(
  pin: SourcePin,
  path: string,
  sources: readonly PairedSource[]
): OutcomeLintFinding[] {
  if (pin.artifactRef.length === 0 || pin.artifactDigest.length === 0) {
    return [
      finding(
        "OUTCOME_OWNER_QUALIFIER_MISSING",
        path,
        "document-local identities require an owner reference and digest"
      ),
    ];
  }
  const matches = sourceCandidates(sources, pin);
  if (matches.length === 0) {
    return [
      finding(
        "OUTCOME_SOURCE_UNRESOLVED",
        path,
        `paired source ${pin.artifactRef} is missing`
      ),
    ];
  }
  if (matches.length > 1) {
    return [
      finding(
        "OUTCOME_SOURCE_AMBIGUOUS",
        path,
        `paired source ${pin.artifactRef} is ambiguous`
      ),
    ];
  }
  if (matches[0]?.artifactDigest !== pin.artifactDigest) {
    return [
      finding(
        "OUTCOME_SOURCE_STALE",
        path,
        `paired source ${pin.artifactRef} does not match digest ${pin.artifactDigest}`
      ),
    ];
  }
  return [];
}

function exactSource(
  sources: readonly PairedSource[],
  pin: SourcePin
): PairedSource | undefined {
  const matches = sourceCandidates(sources, pin);
  return matches.length === 1 &&
    matches[0]?.artifactDigest === pin.artifactDigest
    ? matches[0]
    : undefined;
}

function lintQualifiedSubject(
  subject: QualifiedSubjectRef,
  path: string,
  context: OutcomeResolvedLintContext
): OutcomeLintFinding[] {
  const findings = lintPin(
    {
      artifactRef: subject.artifactRef,
      artifactDigest: subject.artifactDigest,
    },
    path,
    context.sources
  );
  if (subject.subjectKind.length === 0 || subject.subjectRef.length === 0) {
    findings.push(
      finding(
        "OUTCOME_SUBJECT_IDENTITY_MISSING",
        path,
        "qualified subjects require a subject kind and local identity"
      )
    );
    return findings;
  }
  const source = exactSource(context.sources, {
    artifactRef: subject.artifactRef,
    artifactDigest: subject.artifactDigest,
  });
  if (source === undefined) {
    return findings;
  }
  if (source.subjects === undefined) {
    findings.push(
      finding(
        "OUTCOME_SUBJECT_CATALOG_MISSING",
        path,
        `paired source ${source.artifactRef} did not provide its subject inventory`
      )
    );
  } else if (
    !source.subjects.some(
      (candidate) =>
        candidate.kind === subject.subjectKind &&
        candidate.ref === subject.subjectRef
    )
  ) {
    findings.push(
      finding(
        "OUTCOME_SUBJECT_UNRESOLVED",
        path,
        `${subject.subjectKind} ${subject.subjectRef} does not resolve in ${source.artifactRef}`
      )
    );
  }
  return findings;
}

function readArray(document: unknown, key: string): unknown[] {
  if (!isRecord(document)) {
    return [];
  }
  const value = document[key];
  return Array.isArray(value) ? value : [];
}

function lintNeed(
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext
): OutcomeLintFinding[] {
  const path = "/need";
  const pin = {
    artifactRef: caseDocument.need.documentRef,
    artifactDigest: caseDocument.need.documentDigest,
  };
  const findings = lintPin(pin, path, context.sources);
  const source = exactSource(context.sources, pin);
  if (source === undefined) {
    return findings;
  }
  const matches = readArray(source.document, "needs").filter(
    (candidate) =>
      isRecord(candidate) &&
      candidate.id === caseDocument.need.id &&
      candidate.revision === caseDocument.need.revision
  );
  if (matches.length === 0) {
    findings.push(
      finding(
        "OUTCOME_NEED_UNRESOLVED",
        path,
        `Need ${caseDocument.need.id}@${caseDocument.need.revision} does not resolve`
      )
    );
  } else if (matches.length > 1) {
    findings.push(
      finding(
        "OUTCOME_NEED_AMBIGUOUS",
        path,
        `Need ${caseDocument.need.id}@${caseDocument.need.revision} is ambiguous`
      )
    );
  } else if ((matches[0] as Record<string, unknown>).status !== "adopted") {
    findings.push(
      finding(
        "OUTCOME_NEED_NOT_ADOPTED",
        path,
        "an outcome case must pin an adopted Need revision"
      )
    );
  }
  return findings;
}

function producingRoute(
  expectation: ExpectedView,
  caseDocument: OutcomeVerificationCase
):
  | {
      surfaceRef: string;
      surfaceDigest: string;
      routeId: string;
    }
  | undefined {
  if (expectation.kind === "app-graph") return undefined;
  const producing = caseDocument.procedure.find(
    (step) => step.id === expectation.stepRef
  );
  const open =
    producing?.kind === "open-route"
      ? producing
      : producing?.kind === "set-item" || producing?.kind === "activate-control"
      ? caseDocument.procedure.find(
          (step) =>
            step.kind === "open-route" && step.id === producing.renderStepRef
        )
      : undefined;
  return open?.kind === "open-route"
    ? {
        surfaceRef: open.surfaceRef,
        surfaceDigest: open.surfaceDigest,
        routeId: open.routeId,
      }
    : undefined;
}

function servingExperienceBindings(
  expectation: ExpectedView,
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext
) {
  const subject = expectationTechnicalSubject(expectation);
  if (expectation.kind === "app-graph") {
    return context.experienceUnitBindings.filter((binding) =>
      binding.subjects.some((candidate) =>
        canonicalJsonEqual(candidate, subject)
      )
    );
  }
  const route = producingRoute(expectation, caseDocument);
  return route === undefined
    ? []
    : context.experienceUnitBindings.filter(
        (binding) =>
          binding.surfaceRef === route.surfaceRef &&
          binding.surfaceDigest === route.surfaceDigest &&
          binding.routeId === route.routeId &&
          binding.subjects.some((candidate) =>
            canonicalJsonEqual(candidate, subject)
          )
      );
}

function lintExperience(
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext
): OutcomeLintFinding[] {
  if (caseDocument.experience === undefined) {
    return [
      finding(
        "OUTCOME_EXPERIENCE_PIN_REQUIRED",
        "/experience",
        "an outcome case must pin the Experience that defines how its Need is served"
      ),
    ];
  }
  const path = "/experience";
  const pin = {
    artifactRef: caseDocument.experience.documentRef,
    artifactDigest: caseDocument.experience.documentDigest,
  };
  const findings = lintPin(pin, path, context.sources);
  const source = exactSource(context.sources, pin);
  if (source === undefined) {
    return findings;
  }
  const matches = readArray(source.document, "units").filter(
    (candidate) =>
      isRecord(candidate) && candidate.id === caseDocument.experience?.unitId
  );
  if (matches.length === 0) {
    findings.push(
      finding(
        "OUTCOME_EXPERIENCE_UNIT_UNRESOLVED",
        path,
        `Experience Unit ${caseDocument.experience.unitId} does not resolve`
      )
    );
  } else if (matches.length > 1) {
    findings.push(
      finding(
        "OUTCOME_EXPERIENCE_UNIT_AMBIGUOUS",
        path,
        `Experience Unit ${caseDocument.experience.unitId} is ambiguous`
      )
    );
  } else {
    const unit = matches[0] as Record<string, unknown>;
    const citesPinnedNeed = readArray(unit, "needRefs").some(
      (candidate) =>
        isRecord(candidate) && candidate.id === caseDocument.need.id
    );
    if (!citesPinnedNeed) {
      findings.push(
        finding(
          "OUTCOME_EXPERIENCE_UNIT_NEED_MISMATCH",
          path,
          `Experience Unit ${caseDocument.experience.unitId} does not cite pinned Need ${caseDocument.need.id}`
        )
      );
    }
  }

  for (const [
    expectationIndex,
    rawExpectation,
  ] of caseDocument.expectedObservations.entries()) {
    const expectation = rawExpectation as unknown as ExpectedView;
    const servingBindings = servingExperienceBindings(
      expectation,
      caseDocument,
      context
    );
    if (servingBindings.length > 1) {
      findings.push(
        finding(
          "OUTCOME_EXPERIENCE_SERVICE_AMBIGUOUS",
          `/expectedObservations/${expectationIndex}/ruleRefs`,
          "the exact tested subject must resolve to one serving Experience Unit"
        )
      );
    }
    const unitRules = expectation.ruleRefs.flatMap((ruleRef, ruleIndex) =>
      ruleRef.kind === "artifact-declaration" &&
      ruleRef.subject.artifactRef === pin.artifactRef &&
      ruleRef.subject.artifactDigest === pin.artifactDigest &&
      ruleRef.subject.subjectKind === "experience-unit"
        ? [{ ruleRef, ruleIndex }]
        : []
    );
    if (unitRules.length === 0) {
      findings.push(
        finding(
          "OUTCOME_EXPERIENCE_RULE_REQUIRED",
          `/expectedObservations/${expectationIndex}/ruleRefs`,
          "an Experience-pinned case requires each expectation to cite a serving experience-unit"
        )
      );
      continue;
    }
    for (const { ruleRef, ruleIndex } of unitRules) {
      const cited = readArray(source.document, "units").filter(
        (candidate) =>
          isRecord(candidate) && candidate.id === ruleRef.subject.subjectRef
      );
      if (cited.length !== 1) {
        findings.push(
          finding(
            cited.length === 0
              ? "OUTCOME_EXPERIENCE_RULE_UNIT_UNRESOLVED"
              : "OUTCOME_EXPERIENCE_RULE_UNIT_AMBIGUOUS",
            `/expectedObservations/${expectationIndex}/ruleRefs/${ruleIndex}`,
            "an expectation's experience-unit rule must resolve exactly once in the pinned Experience"
          )
        );
        continue;
      }
      const citesPinnedNeed = readArray(cited[0], "needRefs").some(
        (candidate) =>
          isRecord(candidate) && candidate.id === caseDocument.need.id
      );
      if (!citesPinnedNeed) {
        findings.push(
          finding(
            "OUTCOME_EXPERIENCE_RULE_NEED_MISMATCH",
            `/expectedObservations/${expectationIndex}/ruleRefs/${ruleIndex}`,
            `cited Experience Unit ${ruleRef.subject.subjectRef} does not cite pinned Need ${caseDocument.need.id}`
          )
        );
      }
      if (
        !servingBindings.some(
          (binding) =>
            binding.experienceRef === ruleRef.subject.artifactRef &&
            binding.experienceDigest === ruleRef.subject.artifactDigest &&
            binding.unitId === ruleRef.subject.subjectRef
        )
      ) {
        findings.push(
          finding(
            "OUTCOME_EXPERIENCE_RULE_NOT_SERVING",
            `/expectedObservations/${expectationIndex}/ruleRefs/${ruleIndex}`,
            `cited Experience Unit ${ruleRef.subject.subjectRef} is not owner-mounted on the producing route or structural subject`
          )
        );
      }
    }
  }
  return findings;
}

function lintApp(
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext
): OutcomeLintFinding[] {
  const path = "/app";
  const pin = {
    artifactRef: caseDocument.app.id,
    artifactDigest: caseDocument.app.digest,
  };
  const findings = lintPin(pin, path, context.sources);
  const source = exactSource(context.sources, pin);
  if (source === undefined || !isRecord(source.document)) {
    return findings;
  }
  const manifest = isRecord(source.document.manifest)
    ? source.document.manifest
    : source.document;
  if (
    manifest.id !== caseDocument.app.id ||
    manifest.version !== caseDocument.app.version
  ) {
    findings.push(
      finding(
        "OUTCOME_APP_IDENTITY_MISMATCH",
        path,
        "paired App Manifest identity and version must match the case pin"
      )
    );
  }
  return findings;
}

function lintAppArtifactMembership(
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext,
  artifact: {
    artifactRef: string;
    artifactDigest: string;
    kind: AppArtifactBinding["kind"];
  },
  path: string
): OutcomeLintFinding[] {
  const matches = context.appArtifactBindings.filter(
    (binding) =>
      binding.appRef === caseDocument.app.id &&
      binding.appDigest === caseDocument.app.digest &&
      binding.artifactRef === artifact.artifactRef &&
      binding.artifactDigest === artifact.artifactDigest &&
      binding.kind === artifact.kind
  );
  return matches.length === 1
    ? []
    : [
        finding(
          matches.length === 0
            ? "OUTCOME_APP_ARTIFACT_UNRESOLVED"
            : "OUTCOME_APP_ARTIFACT_AMBIGUOUS",
          path,
          `${artifact.kind} must resolve exactly once from the pinned App Manifest`
        ),
      ];
}

function appArtifactKindForSubject(
  subject: QualifiedSubjectRef
):
  | "surface"
  | "definition"
  | "response-actions"
  | "data-sources"
  | "experience"
  | "needs"
  | undefined {
  if (subject.subjectKind.startsWith("surface-")) return "surface";
  if (subject.subjectKind.startsWith("definition-")) return "definition";
  if (subject.subjectKind.startsWith("response-action")) {
    return "response-actions";
  }
  if (subject.subjectKind === "data-source") return "data-sources";
  if (subject.subjectKind === "experience-unit") return "experience";
  if (subject.subjectKind === "need") return "needs";
  return undefined;
}

function bindingForControl(
  control: QualifiedSubjectRef,
  bindings: readonly SemanticControlBinding[],
  renderStepRef: string
): SemanticControlBinding[] {
  return bindings.filter(
    (binding) =>
      canonicalJsonEqual(binding.control, control) &&
      binding.renderStepRef === renderStepRef
  );
}

function lintStep(
  step: ProcedureStep,
  index: number,
  prior: ReadonlyMap<string, ProcedureStep>,
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext
): OutcomeLintFinding[] {
  const path = `/procedure/${index}`;
  const common = ["id", "kind"];
  const allowed =
    step.kind === "open-route"
      ? [...common, "surfaceRef", "surfaceDigest", "routeId"]
      : step.kind === "set-item"
      ? [
          ...common,
          "renderStepRef",
          "control",
          "definitionRef",
          "definitionDigest",
          "path",
          "value",
        ]
      : step.kind === "activate-control"
      ? [
          ...common,
          "renderStepRef",
          "control",
          "actionsRef",
          "actionsDigest",
          "actionId",
          "responseStepRef",
        ]
      : common;
  const findings: OutcomeLintFinding[] = lintUnexpectedKeys(
    step,
    allowed,
    path
  );
  if (step.kind === "open-route") {
    findings.push(
      ...lintAppArtifactMembership(
        caseDocument,
        context,
        {
          artifactRef: step.surfaceRef,
          artifactDigest: step.surfaceDigest,
          kind: "surface",
        },
        path
      ),
      ...lintQualifiedSubject(
        {
          artifactRef: step.surfaceRef,
          artifactDigest: step.surfaceDigest,
          subjectKind: "surface-route",
          subjectRef: step.routeId,
        },
        path,
        context
      )
    );
  } else if (step.kind === "set-item") {
    if (prior.get(step.renderStepRef)?.kind !== "open-route") {
      findings.push(
        finding(
          "OUTCOME_STEP_REF_INVALID",
          `${path}/renderStepRef`,
          "set-item must reference a prior open-route step"
        )
      );
    }
    if (step.control.subjectKind !== "definition-item") {
      findings.push(
        finding(
          "OUTCOME_SET_CONTROL_KIND_INVALID",
          `${path}/control/subjectKind`,
          "set-item controls must identify a definition-item"
        )
      );
    }
    findings.push(
      ...lintAppArtifactMembership(
        caseDocument,
        context,
        {
          artifactRef: step.definitionRef,
          artifactDigest: step.definitionDigest,
          kind: "definition",
        },
        path
      ),
      ...lintQualifiedSubject(step.control, `${path}/control`, context),
      ...lintPin(
        {
          artifactRef: step.definitionRef,
          artifactDigest: step.definitionDigest,
        },
        path,
        context.sources
      ),
      ...lintQualifiedSubject(
        {
          artifactRef: step.definitionRef,
          artifactDigest: step.definitionDigest,
          subjectKind: "definition-item",
          subjectRef: step.path,
        },
        `${path}/path`,
        context
      )
    );
    const bindings = bindingForControl(
      step.control,
      context.semanticControlBindings,
      step.renderStepRef
    );
    if (bindings.length !== 1) {
      findings.push(
        finding(
          bindings.length === 0
            ? "OUTCOME_CONTROL_BINDING_UNRESOLVED"
            : "OUTCOME_CONTROL_BINDING_AMBIGUOUS",
          `${path}/control`,
          "set-item control must resolve to exactly one semantic binding"
        )
      );
    } else {
      const expected = {
        ref: step.definitionRef,
        digest: step.definitionDigest,
        path: step.path,
      };
      if (!canonicalJsonEqual(bindings[0]?.definition, expected)) {
        findings.push(
          finding(
            "OUTCOME_CONTROL_DEFINITION_MISMATCH",
            `${path}/control`,
            "set-item control is not bound to the declared Definition item"
          )
        );
      }
    }
  } else if (step.kind === "activate-control") {
    const renderStep = prior.get(step.renderStepRef);
    const responseStep = prior.get(step.responseStepRef);
    if (renderStep?.kind !== "open-route") {
      findings.push(
        finding(
          "OUTCOME_STEP_REF_INVALID",
          `${path}/renderStepRef`,
          "activate-control must reference a prior open-route step"
        )
      );
    }
    if (responseStep?.kind !== "set-item") {
      findings.push(
        finding(
          "OUTCOME_STEP_REF_INVALID",
          `${path}/responseStepRef`,
          "activate-control must reference a prior set-item step"
        )
      );
    } else if (responseStep.renderStepRef !== step.renderStepRef) {
      findings.push(
        finding(
          "OUTCOME_RESPONSE_RENDER_MISMATCH",
          `${path}/responseStepRef`,
          "activate-control must use a Response from its rendered route"
        )
      );
    }
    if (step.control.subjectKind !== "response-action") {
      findings.push(
        finding(
          "OUTCOME_ACTIVATE_CONTROL_KIND_INVALID",
          `${path}/control/subjectKind`,
          "activate-control controls must identify a response-action"
        )
      );
    }
    findings.push(
      ...lintAppArtifactMembership(
        caseDocument,
        context,
        {
          artifactRef: step.actionsRef,
          artifactDigest: step.actionsDigest,
          kind: "response-actions",
        },
        path
      ),
      ...lintQualifiedSubject(step.control, `${path}/control`, context),
      ...lintPin(
        {
          artifactRef: step.actionsRef,
          artifactDigest: step.actionsDigest,
        },
        path,
        context.sources
      ),
      ...lintQualifiedSubject(
        {
          artifactRef: step.actionsRef,
          artifactDigest: step.actionsDigest,
          subjectKind: "response-action",
          subjectRef: step.actionId,
        },
        `${path}/actionId`,
        context
      )
    );
    const bindings = bindingForControl(
      step.control,
      context.semanticControlBindings,
      step.renderStepRef
    );
    if (bindings.length !== 1) {
      findings.push(
        finding(
          bindings.length === 0
            ? "OUTCOME_CONTROL_BINDING_UNRESOLVED"
            : "OUTCOME_CONTROL_BINDING_AMBIGUOUS",
          `${path}/control`,
          "activate-control must resolve to exactly one semantic binding"
        )
      );
    } else {
      const expected = {
        ref: step.actionsRef,
        digest: step.actionsDigest,
        id: step.actionId,
      };
      if (!canonicalJsonEqual(bindings[0]?.action, expected)) {
        findings.push(
          finding(
            "OUTCOME_CONTROL_ACTION_MISMATCH",
            `${path}/control`,
            "activate-control control is not bound to the declared Action"
          )
        );
      }
    }
  }
  return findings;
}

function lintRules(
  expectation: ExpectedView,
  path: string,
  context: OutcomeResolvedLintContext,
  need: { id: string; revision: number }
): OutcomeLintFinding[] {
  if (expectation.ruleRefs.length === 0) {
    return [
      finding(
        "OUTCOME_RULE_REFS_EMPTY",
        `${path}/ruleRefs`,
        "every expectation requires at least one rule reference"
      ),
    ];
  }
  const findings: OutcomeLintFinding[] = [];
  const artifactRules = expectation.ruleRefs.filter(
    (ruleRef) => ruleRef.kind === "artifact-declaration"
  );
  const specificationRules = expectation.ruleRefs.filter(
    (ruleRef) => ruleRef.kind === "specification-rule"
  );
  if (artifactRules.length === 0) {
    findings.push(
      finding(
        "OUTCOME_ARTIFACT_RULE_REQUIRED",
        `${path}/ruleRefs`,
        "technical expectations require an owner artifact declaration"
      )
    );
  }
  if (specificationRules.length === 0) {
    findings.push(
      finding(
        "OUTCOME_SPEC_RULE_REQUIRED",
        `${path}/ruleRefs`,
        "technical expectations require a versioned specification rule"
      )
    );
  }
  const primary = expectationPrimaryPin(expectation);
  const technicalSubject = expectationTechnicalSubject(expectation);
  if (
    artifactRules.length > 0 &&
    !artifactRules.some(
      (ruleRef) =>
        ruleRef.subject.artifactRef === primary.artifactRef &&
        ruleRef.subject.artifactDigest === primary.artifactDigest
    )
  ) {
    findings.push(
      finding(
        "OUTCOME_ARTIFACT_RULE_OWNER_MISMATCH",
        `${path}/ruleRefs`,
        "an artifact rule must cite the owner of the expected fact"
      )
    );
  }
  if (
    !artifactRules.some((ruleRef) =>
      canonicalJsonEqual(ruleRef.subject, technicalSubject)
    )
  ) {
    findings.push(
      finding(
        "OUTCOME_ARTIFACT_RULE_SUBJECT_MISMATCH",
        `${path}/ruleRefs`,
        "an artifact rule must cite the exact technical subject tested by the expectation"
      )
    );
  }
  for (let index = 0; index < expectation.ruleRefs.length; index += 1) {
    if (
      expectation.ruleRefs
        .slice(0, index)
        .some((candidate) =>
          canonicalJsonEqual(candidate, expectation.ruleRefs[index])
        )
    ) {
      findings.push(
        finding(
          "OUTCOME_RULE_REF_DUPLICATE",
          `${path}/ruleRefs/${index}`,
          "rule references must be unique"
        )
      );
    }
  }
  for (const [index, ruleRef] of expectation.ruleRefs.entries()) {
    const rulePath = `${path}/ruleRefs/${index}`;
    if (ruleRef.kind === "artifact-declaration") {
      findings.push(
        ...lintQualifiedSubject(ruleRef.subject, rulePath, context)
      );
      if (
        ruleRef.subject.subjectKind !== "experience-unit" &&
        !context.subjectNeedBindings.some(
          (binding) =>
            canonicalJsonEqual(binding.subject, ruleRef.subject) &&
            binding.needId === need.id &&
            binding.needRevision === need.revision
        )
      ) {
        findings.push(
          finding(
            "OUTCOME_ARTIFACT_RULE_NEED_TRACE_MISSING",
            rulePath,
            `owner subject does not carry direct need:${need.id}@${need.revision} trace`
          )
        );
      }
      continue;
    }
    if (
      ruleRef.specRef.length === 0 ||
      ruleRef.specVersion.length === 0 ||
      ruleRef.ruleId.length === 0
    ) {
      findings.push(
        finding(
          "OUTCOME_SPEC_RULE_UNVERSIONED",
          rulePath,
          "specification rules require a reference, version, and stable rule ID"
        )
      );
      continue;
    }
    const matches = context.specificationRules.filter(
      (candidate) =>
        candidate.specRef === ruleRef.specRef &&
        candidate.specVersion === ruleRef.specVersion &&
        candidate.ruleId === ruleRef.ruleId
    );
    if (matches.length !== 1) {
      findings.push(
        finding(
          matches.length === 0
            ? "OUTCOME_SPEC_RULE_UNRESOLVED"
            : "OUTCOME_SPEC_RULE_AMBIGUOUS",
          rulePath,
          `specification rule ${ruleRef.ruleId} must resolve exactly once`
        )
      );
    } else if (matches[0]?.current === false) {
      findings.push(
        finding(
          "OUTCOME_SPEC_RULE_STALE",
          rulePath,
          `specification rule ${ruleRef.ruleId} is stale`
        )
      );
    }
  }
  return findings;
}

function expectationTechnicalSubject(
  expectation: ExpectedView
): QualifiedSubjectRef {
  switch (expectation.kind) {
    case "app-graph":
    case "validation-report":
    case "response":
      return expectation.subject;
    case "action-invocation":
      return {
        artifactRef: expectation.actionsRef,
        artifactDigest: expectation.actionsDigest,
        subjectKind: "response-action",
        subjectRef: expectation.actionId,
      };
    case "data-source-result":
      return {
        artifactRef: expectation.catalogRef,
        artifactDigest: expectation.catalogDigest,
        subjectKind: "data-source",
        subjectRef: expectation.sourceId,
      };
    case "rendered-output":
      return expectation.node;
    case "route-state":
      return {
        artifactRef: expectation.surfaceRef,
        artifactDigest: expectation.surfaceDigest,
        subjectKind: "surface-route",
        subjectRef: expectation.routeId,
      };
  }
}

function expectationPrimaryPin(expectation: ExpectedView): SourcePin {
  switch (expectation.kind) {
    case "app-graph":
      return {
        artifactRef: expectation.subject.artifactRef,
        artifactDigest: expectation.subject.artifactDigest,
      };
    case "validation-report":
    case "response":
      return {
        artifactRef: expectation.definitionRef,
        artifactDigest: expectation.definitionDigest,
      };
    case "action-invocation":
      return {
        artifactRef: expectation.actionsRef,
        artifactDigest: expectation.actionsDigest,
      };
    case "data-source-result":
      return {
        artifactRef: expectation.catalogRef,
        artifactDigest: expectation.catalogDigest,
      };
    case "rendered-output":
      return {
        artifactRef: expectation.node.artifactRef,
        artifactDigest: expectation.node.artifactDigest,
      };
    case "route-state":
      return {
        artifactRef: expectation.surfaceRef,
        artifactDigest: expectation.surfaceDigest,
      };
  }
}

function lintPayloadSemantics(
  expectation: ExpectedView,
  path: string,
  context: OutcomeResolvedLintContext
): OutcomeLintFinding[] {
  const findings: OutcomeLintFinding[] = [];
  if (expectation.kind === "validation-report") {
    const includedIssues = new Set(
      (expectation.containsIssues ?? []).map((issue) =>
        JSON.stringify([issue.path, issue.code])
      )
    );
    if (
      (expectation.excludesIssues ?? []).some((issue) =>
        includedIssues.has(JSON.stringify([issue.path, issue.code]))
      )
    ) {
      findings.push(
        finding(
          "OUTCOME_VALIDATION_ISSUE_CONTRADICTION",
          path,
          "the same Validation issue path and code cannot be both required and excluded"
        )
      );
    }
    if (
      expectation.valid === false &&
      (expectation.containsIssues ?? []).length === 0
    ) {
      findings.push(
        finding(
          "OUTCOME_INVALID_VALIDATION_ISSUE_REQUIRED",
          `${path}/containsIssues`,
          "an invalid Bind expectation must require at least one exact issue path and code"
        )
      );
    }
  }
  if (expectation.kind === "response" && expectation.item === undefined) {
    findings.push(
      finding(
        "OUTCOME_RESPONSE_ITEM_REQUIRED",
        path,
        "a Response expectation must assert one exact Definition item"
      )
    );
  }
  if (
    expectation.kind === "action-invocation" &&
    expectation.effects.some((effect, index) => {
      if (!isRecord(effect)) {
        return true;
      }
      return effect.index !== index;
    })
  ) {
    findings.push(
      finding(
        "OUTCOME_EFFECT_TRACE_INCOMPLETE",
        `${path}/effects`,
        "the complete ordered effect trace must use contiguous indices from zero"
      )
    );
  }
  if (expectation.kind === "action-invocation") {
    const plans = context.actionPlans.filter(
      (plan) =>
        plan.actionsRef === expectation.actionsRef &&
        plan.actionsDigest === expectation.actionsDigest &&
        plan.actionId === expectation.actionId
    );
    if (plans.length !== 1) {
      findings.push(
        finding(
          plans.length === 0
            ? "OUTCOME_ACTION_PLAN_UNRESOLVED"
            : "OUTCOME_ACTION_PLAN_AMBIGUOUS",
          `${path}/effects`,
          "Action expectation must resolve exactly one owner effect plan"
        )
      );
    } else if (
      plans[0]!.effects.length !== expectation.effects.length ||
      plans[0]!.effects.some((effect, index) => {
        const expected = expectation.effects[index];
        return (
          !isRecord(expected) ||
          expected.index !== effect.index ||
          expected.type !== effect.type
        );
      })
    ) {
      findings.push(
        finding(
          "OUTCOME_EFFECT_TRACE_INCOMPLETE",
          `${path}/effects`,
          "expected effects must cover the owner's complete ordered Action plan"
        )
      );
    }
  }
  if (expectation.kind === "response" && expectation.item !== undefined) {
    if (
      expectation.item.presence === "present" &&
      expectation.item.value === undefined
    ) {
      findings.push(
        finding(
          "OUTCOME_PRESENT_VALUE_MISSING",
          `${path}/item`,
          "present Response values require the canonical value"
        )
      );
    }
    if (
      expectation.item.presence === "absent" &&
      expectation.item.value !== undefined
    ) {
      findings.push(
        finding(
          "OUTCOME_ABSENT_VALUE_PRESENT",
          `${path}/item`,
          "absent Response values cannot carry a value"
        )
      );
    }
  }
  if (
    expectation.kind === "rendered-output" &&
    (expectation as { rendered?: unknown }).rendered !== true
  ) {
    findings.push(
      finding(
        "OUTCOME_RENDERED_OUTPUT_NOT_COMMITTED",
        `${path}/rendered`,
        "a rendered-output expectation may assert only current, committed rendered output"
      )
    );
  }
  if (
    expectation.kind === "data-source-result" &&
    expectation.state === "unavailable" &&
    (expectation.freshness !== undefined ||
      expectation.recordId !== undefined ||
      expectation.valueDigest !== undefined)
  ) {
    findings.push(
      finding(
        "OUTCOME_UNAVAILABLE_SOURCE_FACT_INVALID",
        path,
        "an unavailable source cannot carry freshness or value identity"
      )
    );
  }
  if (
    expectation.kind === "data-source-result" &&
    expectation.state === "loaded" &&
    expectation.freshness === undefined
  ) {
    findings.push(
      finding(
        "OUTCOME_LOADED_SOURCE_FRESHNESS_MISSING",
        path,
        "a loaded source result requires owner-declared freshness"
      )
    );
  }
  return findings;
}

function lintExpectation(
  rawExpectation: ExpectedObservation,
  index: number,
  steps: ReadonlyMap<string, { step: ProcedureStep; index: number }>,
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext,
  need: { id: string; revision: number }
): OutcomeLintFinding[] {
  const expectation = rawExpectation as unknown as ExpectedView;
  const path = `/expectedObservations/${index}`;
  const common = [
    "id",
    "kind",
    "ruleRefs",
    "checkpointRef",
    "requiredEvidence",
  ];
  const allowed =
    expectation.kind === "app-graph"
      ? [...common, "subject", "relation", "state"]
      : expectation.kind === "validation-report"
      ? [
          ...common,
          "stepRef",
          "subject",
          "definitionRef",
          "definitionDigest",
          "valid",
          "containsIssues",
          "excludesIssues",
        ]
      : expectation.kind === "response"
      ? [
          ...common,
          "stepRef",
          "subject",
          "definitionRef",
          "definitionDigest",
          "status",
          "item",
        ]
      : expectation.kind === "action-invocation"
      ? [
          ...common,
          "stepRef",
          "actionsRef",
          "actionsDigest",
          "actionId",
          "terminal",
          "effects",
        ]
      : expectation.kind === "data-source-result"
      ? [
          ...common,
          "stepRef",
          "catalogRef",
          "catalogDigest",
          "sourceId",
          "state",
          "freshness",
          "recordId",
          "valueDigest",
          "recordStepRef",
        ]
      : expectation.kind === "rendered-output"
      ? [...common, "stepRef", "node", "rendered", "operable", "semanticValue"]
      : [
          ...common,
          "stepRef",
          "subject",
          "surfaceRef",
          "surfaceDigest",
          "routeId",
        ];
  const findings: OutcomeLintFinding[] = lintUnexpectedKeys(
    rawExpectation,
    allowed,
    path
  );
  const admittedEvidence =
    OUTCOME_EVIDENCE_COMPATIBILITY[expectation.kind] ?? [];
  if (!admittedEvidence.includes(expectation.requiredEvidence)) {
    findings.push(
      finding(
        "OUTCOME_EVIDENCE_CLASS_INVALID",
        `${path}/requiredEvidence`,
        `${expectation.requiredEvidence} cannot support ${expectation.kind}`
      )
    );
  }
  findings.push(
    ...lintRules(expectation, path, context, need),
    ...lintPin(expectationPrimaryPin(expectation), path, context.sources),
    ...lintPayloadSemantics(expectation, path, context)
  );
  const technicalSubject = expectationTechnicalSubject(expectation);
  const appArtifactKind = appArtifactKindForSubject(technicalSubject);
  if (appArtifactKind !== undefined) {
    findings.push(
      ...lintAppArtifactMembership(
        caseDocument,
        context,
        {
          artifactRef: technicalSubject.artifactRef,
          artifactDigest: technicalSubject.artifactDigest,
          kind: appArtifactKind,
        },
        path
      )
    );
  }
  if (expectation.kind === "app-graph") {
    findings.push(
      ...lintQualifiedSubject(expectation.subject, `${path}/subject`, context)
    );
  }
  if (
    expectation.kind === "validation-report" ||
    expectation.kind === "response"
  ) {
    findings.push(
      ...lintQualifiedSubject(expectation.subject, `${path}/subject`, context)
    );
    if (
      expectation.subject.artifactRef !== expectation.definitionRef ||
      expectation.subject.artifactDigest !== expectation.definitionDigest
    ) {
      findings.push(
        finding(
          "OUTCOME_EXPECTATION_SUBJECT_OWNER_MISMATCH",
          `${path}/subject`,
          "the exact tested subject must belong to the expectation's Definition"
        )
      );
    }
    const allowedKinds =
      expectation.kind === "validation-report"
        ? ["definition-bind"]
        : ["definition-item"];
    if (!allowedKinds.includes(expectation.subject.subjectKind)) {
      findings.push(
        finding(
          "OUTCOME_EXPECTATION_SUBJECT_KIND_INVALID",
          `${path}/subject/subjectKind`,
          `${expectation.kind} cannot test a ${expectation.subject.subjectKind} subject`
        )
      );
    }
    if (
      expectation.kind === "response" &&
      expectation.item !== undefined &&
      (expectation.subject.subjectKind !== "definition-item" ||
        expectation.subject.subjectRef !== expectation.item.path)
    ) {
      findings.push(
        finding(
          "OUTCOME_RESPONSE_SUBJECT_ITEM_MISMATCH",
          `${path}/subject`,
          "a Response item expectation must identify that exact definition-item"
        )
      );
    }
    if (
      expectation.kind === "validation-report" &&
      expectation.subject.subjectKind === "definition-bind"
    ) {
      for (const [field, issues] of [
        ["containsIssues", expectation.containsIssues ?? []],
        ["excludesIssues", expectation.excludesIssues ?? []],
      ] as const) {
        for (const [issueIndex, issue] of issues.entries()) {
          if (issue.path !== expectation.subject.subjectRef) {
            findings.push(
              finding(
                "OUTCOME_VALIDATION_SUBJECT_ISSUE_MISMATCH",
                `${path}/${field}/${issueIndex}/path`,
                "a Validation issue expectation must identify the exact definition-bind path named by its subject"
              )
            );
          }
        }
      }
    }
  }
  if (expectation.kind === "rendered-output") {
    findings.push(
      ...lintQualifiedSubject(expectation.node, `${path}/node`, context)
    );
  }
  if (expectation.kind === "action-invocation") {
    findings.push(
      ...lintQualifiedSubject(
        {
          artifactRef: expectation.actionsRef,
          artifactDigest: expectation.actionsDigest,
          subjectKind: "response-action",
          subjectRef: expectation.actionId,
        },
        `${path}/actionId`,
        context
      )
    );
  }
  if (expectation.kind === "data-source-result") {
    findings.push(
      ...lintQualifiedSubject(
        {
          artifactRef: expectation.catalogRef,
          artifactDigest: expectation.catalogDigest,
          subjectKind: "data-source",
          subjectRef: expectation.sourceId,
        },
        `${path}/sourceId`,
        context
      )
    );
    const recordStep = expectation.recordStepRef
      ? steps.get(expectation.recordStepRef)
      : undefined;
    if (
      expectation.recordStepRef !== undefined &&
      (recordStep === undefined ||
        (recordStep.step.kind !== "set-item" &&
          recordStep.step.kind !== "activate-control"))
    ) {
      findings.push(
        finding(
          "OUTCOME_DATA_RECORD_STEP_INVALID",
          `${path}/recordStepRef`,
          "a loaded Data Source result must identify a prior Response-producing step"
        )
      );
    }
    const producing = expectation.stepRef
      ? steps.get(expectation.stepRef)
      : undefined;
    if (
      recordStep !== undefined &&
      producing !== undefined &&
      recordStep.index >= producing.index
    ) {
      findings.push(
        finding(
          "OUTCOME_DATA_RECORD_STEP_ORDER_INVALID",
          `${path}/recordStepRef`,
          "recordStepRef must precede the Data Source load step"
        )
      );
    }
  }
  if (expectation.kind === "route-state") {
    const routeSubject = {
      artifactRef: expectation.surfaceRef,
      artifactDigest: expectation.surfaceDigest,
      subjectKind: "surface-route" as const,
      subjectRef: expectation.routeId,
    };
    if (
      !canonicalJsonEqual(
        (expectation as { subject?: unknown }).subject,
        routeSubject
      )
    ) {
      findings.push(
        finding(
          "OUTCOME_ROUTE_STATE_SUBJECT_MISMATCH",
          `${path}/subject`,
          "route-state must identify its exact Surface route subject"
        )
      );
    }
    findings.push(
      ...lintQualifiedSubject(routeSubject, `${path}/routeId`, context)
    );
  }

  const checkpoint = steps.get(expectation.checkpointRef);
  if (checkpoint?.step.kind !== "checkpoint") {
    findings.push(
      finding(
        "OUTCOME_CHECKPOINT_REF_INVALID",
        `${path}/checkpointRef`,
        "checkpointRef must resolve to a checkpoint step"
      )
    );
  }
  if (expectation.kind === "app-graph") {
    if (expectation.stepRef !== undefined) {
      findings.push(
        finding(
          "OUTCOME_STRUCTURAL_STEP_REF_FORBIDDEN",
          `${path}/stepRef`,
          "structural app-graph observations do not use runtime step bindings"
        )
      );
    }
  } else {
    const producing = expectation.stepRef
      ? steps.get(expectation.stepRef)
      : undefined;
    if (producing === undefined || producing.step.kind === "checkpoint") {
      findings.push(
        finding(
          "OUTCOME_STEP_REF_INVALID",
          `${path}/stepRef`,
          "runtime observations require a producing procedure step"
        )
      );
    } else if (
      checkpoint !== undefined &&
      checkpoint.index <= producing.index
    ) {
      findings.push(
        finding(
          "OUTCOME_CHECKPOINT_ORDER_INVALID",
          `${path}/checkpointRef`,
          "checkpoint must follow the producing step"
        )
      );
    }
    if (producing !== undefined && producing.step.kind !== "checkpoint") {
      const admittedProducingKinds: Record<
        Exclude<OutcomeObservationKind, "app-graph">,
        readonly ProcedureStep["kind"][]
      > = {
        "validation-report": ["set-item", "activate-control"],
        response: ["set-item", "activate-control"],
        "action-invocation": ["activate-control"],
        "data-source-result": ["open-route"],
        "rendered-output": ["open-route", "set-item", "activate-control"],
        "route-state": ["open-route", "activate-control"],
      };
      if (
        !admittedProducingKinds[expectation.kind].includes(producing.step.kind)
      ) {
        findings.push(
          finding(
            "OUTCOME_STEP_REF_KIND_INVALID",
            `${path}/stepRef`,
            `${expectation.kind} cannot bind to a ${producing.step.kind} step`
          )
        );
      }
    }
  }
  return findings;
}

export function lintOutcomeVerificationCase(
  caseDocument: OutcomeVerificationCase,
  context: OutcomeResolvedLintContext
): OutcomeLintFinding[] {
  const findings: OutcomeLintFinding[] = [
    ...lintNeed(caseDocument, context),
    ...lintApp(caseDocument, context),
    ...lintExperience(caseDocument, context),
  ];
  if (
    context.caseDigest !== undefined &&
    context.currentCaseDigest !== undefined &&
    context.caseDigest !== context.currentCaseDigest
  ) {
    findings.push(
      finding(
        "OUTCOME_CASE_STALE",
        "/",
        "caller-paired case digest does not match the current case"
      )
    );
  }
  const steps = new Map<string, { step: ProcedureStep; index: number }>();
  for (const [index, step] of caseDocument.procedure.entries()) {
    if (steps.has(step.id)) {
      findings.push(
        finding(
          "OUTCOME_STEP_ID_DUPLICATE",
          `/procedure/${index}/id`,
          `procedure step ID ${step.id} is duplicated`
        )
      );
    }
    const prior = new Map(
      [...steps.entries()].map(([id, value]) => [id, value.step])
    );
    findings.push(...lintStep(step, index, prior, caseDocument, context));
    if (!steps.has(step.id)) {
      steps.set(step.id, { step, index });
    }
  }

  if (caseDocument.expectedObservations.length === 0) {
    findings.push(
      finding(
        "OUTCOME_EXPECTATIONS_EMPTY",
        "/expectedObservations",
        "a case must declare at least one expected observation"
      )
    );
  }
  const expectationIds = new Set<string>();
  for (const [
    index,
    expectation,
  ] of caseDocument.expectedObservations.entries()) {
    if (expectationIds.has(expectation.id)) {
      findings.push(
        finding(
          "OUTCOME_EXPECTATION_ID_DUPLICATE",
          `/expectedObservations/${index}/id`,
          `expectation ID ${expectation.id} is duplicated`
        )
      );
    }
    expectationIds.add(expectation.id);
    findings.push(
      ...lintExpectation(
        expectation,
        index,
        steps,
        caseDocument,
        context,
        caseDocument.need
      )
    );
  }

  return findings.flat();
}

export function lintOutcomeVerificationReport(
  report: unknown
): OutcomeLintFinding[] {
  if (!isRecord(report)) {
    return [
      finding(
        "OUTCOME_REPORT_INVALID",
        "/",
        "outcome verification report must be an object"
      ),
    ];
  }
  const findings: OutcomeLintFinding[] = [];
  if (
    typeof report.generatedAt === "string" &&
    isRecord(report.boundary) &&
    typeof report.boundary.endedAt === "string"
  ) {
    const generatedAt = Date.parse(report.generatedAt);
    const boundaryEndedAt = Date.parse(report.boundary.endedAt);
    if (
      Number.isFinite(generatedAt) &&
      Number.isFinite(boundaryEndedAt) &&
      generatedAt < boundaryEndedAt
    ) {
      findings.push(
        finding(
          "OUTCOME_REPORT_GENERATED_BEFORE_BOUNDARY",
          "/generatedAt",
          "generatedAt must be recorded on or after the observation boundary ends"
        )
      );
    }
  }
  if (report.conclusion === "satisfied") {
    findings.push(
      finding(
        "OUTCOME_SATISFACTION_CONCLUSION_FORBIDDEN",
        "/conclusion",
        "outcome reports cannot conclude that a Need is satisfied"
      )
    );
  }
  const claimScope = report.claimScope;
  if (
    !isRecord(claimScope) ||
    claimScope.claim !== "declared-observations" ||
    claimScope.needSatisfaction !== "not-asserted"
  ) {
    findings.push(
      finding(
        "OUTCOME_CLAIM_SCOPE_INVALID",
        "/claimScope",
        "report scope must be declared-observations with Need satisfaction not asserted"
      )
    );
  }

  const results = Array.isArray(report.results)
    ? report.results.filter(isRecord)
    : undefined;
  if (results !== undefined) {
    const expectationIds = new Set<string>();
    for (const [index, result] of results.entries()) {
      if (typeof result.expectationId === "string") {
        if (expectationIds.has(result.expectationId)) {
          findings.push(
            finding(
              "OUTCOME_REPORT_EXPECTATION_ID_DUPLICATE",
              `/results/${index}/expectationId`,
              `result expectation ID ${result.expectationId} is duplicated`
            )
          );
        }
        expectationIds.add(result.expectationId);
      }
      for (const key of ["evidenceRefs", "correlationRefs"] as const) {
        const refs = result[key];
        if (
          refs !== undefined &&
          (!Array.isArray(refs) ||
            refs.some((ref) => typeof ref !== "string" || ref.length === 0) ||
            new Set(refs).size !== refs.length)
        ) {
          findings.push(
            finding(
              key === "evidenceRefs"
                ? "OUTCOME_REPORT_EVIDENCE_REFS_INVALID"
                : "OUTCOME_REPORT_CORRELATION_REFS_INVALID",
              `/results/${index}/${key}`,
              `${key} must contain unique non-empty references`
            )
          );
        }
      }
    }

    const conclusions = ["passed", "failed", "indeterminate", "stale"] as const;
    const counts = Object.fromEntries(
      conclusions.map((conclusion) => [
        conclusion,
        results.filter((result) => result.conclusion === conclusion).length,
      ])
    ) as Record<(typeof conclusions)[number], number>;
    const summary = report.summary;
    if (
      isRecord(summary) &&
      (summary.total !== results.length ||
        summary.passed !== counts.passed ||
        summary.failed !== counts.failed ||
        summary.indeterminate !== counts.indeterminate ||
        summary.stale !== counts.stale)
    ) {
      findings.push(
        finding(
          "OUTCOME_REPORT_SUMMARY_MISMATCH",
          "/summary",
          "summary counts must exactly match the result conclusions"
        )
      );
    }

    const precedence = {
      passed: 0,
      indeterminate: 1,
      failed: 2,
      stale: 3,
    } as const;
    const resultConclusions = results.flatMap((result) =>
      typeof result.conclusion === "string" && result.conclusion in precedence
        ? [result.conclusion as keyof typeof precedence]
        : []
    );
    if (
      resultConclusions.length === results.length &&
      resultConclusions.length > 0
    ) {
      const expectedConclusion = resultConclusions.reduce((worst, current) =>
        precedence[current] > precedence[worst] ? current : worst
      );
      if (report.conclusion !== expectedConclusion) {
        findings.push(
          finding(
            "OUTCOME_REPORT_CONCLUSION_MISMATCH",
            "/conclusion",
            `conclusion must be ${expectedConclusion} for these results`
          )
        );
      }
    }
    if (
      report.conclusion === "passed" &&
      results.some((result) => result.conclusion !== "passed")
    ) {
      findings.push(
        finding(
          "OUTCOME_REPORT_PASSED_RESULT_CONFLICT",
          "/conclusion",
          "a passed report cannot contain a non-passed result"
        )
      );
    }
  }

  if (Array.isArray(report.bindings)) {
    const bindingIds = new Set<string>();
    const bindingStepIds = new Set<string>();
    for (const [index, binding] of report.bindings.entries()) {
      if (!isRecord(binding)) continue;
      if (typeof binding.id === "string") {
        if (bindingIds.has(binding.id)) {
          findings.push(
            finding(
              "OUTCOME_REPORT_BINDING_ID_DUPLICATE",
              `/bindings/${index}/id`,
              `binding ID ${binding.id} is duplicated`
            )
          );
        }
        bindingIds.add(binding.id);
      }
      if (typeof binding.stepId === "string") {
        if (bindingStepIds.has(binding.stepId)) {
          findings.push(
            finding(
              "OUTCOME_REPORT_BINDING_STEP_ID_DUPLICATE",
              `/bindings/${index}/stepId`,
              `binding step ID ${binding.stepId} is duplicated`
            )
          );
        }
        bindingStepIds.add(binding.stepId);
      }
    }
  }

  if (Array.isArray(report.inspectedSources)) {
    const artifactRefs = new Set<string>();
    for (const [index, source] of report.inspectedSources.entries()) {
      if (!isRecord(source) || typeof source.artifactRef !== "string") continue;
      if (artifactRefs.has(source.artifactRef)) {
        findings.push(
          finding(
            "OUTCOME_REPORT_SOURCE_AMBIGUOUS",
            `/inspectedSources/${index}/artifactRef`,
            `inspected artifact ${source.artifactRef} is duplicated`
          )
        );
      }
      artifactRefs.add(source.artifactRef);
    }
  }

  if (
    report.conclusion === "passed" &&
    Array.isArray(report.diagnostics) &&
    report.diagnostics.some(
      (diagnostic) => isRecord(diagnostic) && diagnostic.severity === "error"
    )
  ) {
    findings.push(
      finding(
        "OUTCOME_REPORT_PASSED_DIAGNOSTIC_CONFLICT",
        "/diagnostics",
        "a passed report cannot contain an error diagnostic"
      )
    );
  }
  return findings;
}
