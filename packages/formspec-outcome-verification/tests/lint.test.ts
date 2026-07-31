import { describe, expect, it } from "vitest";

import {
  lintOutcomeVerificationCase,
  lintOutcomeVerificationReport,
  type OutcomeResolvedLintContext,
  type OutcomeVerificationCase,
} from "../src/index.js";
import {
  actionControl,
  caseDocument,
  digest,
  digests,
  fieldControl,
  fixtureLintContext,
  lintSources,
  refs,
  surfaceFieldNode,
} from "./fixtures.js";

function context(): OutcomeResolvedLintContext {
  return fixtureLintContext();
}

function codes(
  document: OutcomeVerificationCase,
  lintContext = context()
): string[] {
  return lintOutcomeVerificationCase(document, lintContext).map(
    (finding) => finding.code
  );
}

describe("lintOutcomeVerificationCase", () => {
  it("accepts a fully caller-paired case", () => {
    expect(codes(structuredClone(caseDocument))).toEqual([]);
  });

  it("finds duplicate IDs and invalid step/checkpoint order", () => {
    const document = structuredClone(caseDocument);
    document.procedure[1]!.id = "open";
    document.expectedObservations[1]!.id = "graph";
    (
      document.expectedObservations[1] as { checkpointRef: string }
    ).checkpointRef = "open";

    const findings = codes(document);
    expect(findings).toContain("OUTCOME_STEP_ID_DUPLICATE");
    expect(findings).toContain("OUTCOME_EXPECTATION_ID_DUPLICATE");
    expect(findings).toContain("OUTCOME_CHECKPOINT_REF_INVALID");
  });

  it("requires a producer kind that can own the observed identity", () => {
    const document = structuredClone(caseDocument);
    (
      document.expectedObservations[3] as {
        stepRef: string;
      }
    ).stepRef = "open";
    expect(codes(document)).toContain("OUTCOME_STEP_REF_KIND_INVALID");
  });

  it("keeps activation on the rendered route that produced its Response", () => {
    const document = structuredClone(caseDocument);
    const secondOpen = structuredClone(document.procedure[0]!);
    secondOpen.id = "open:other";
    document.procedure.splice(2, 0, secondOpen);
    const activate = document.procedure.find(
      (step) => step.kind === "activate-control"
    );
    if (activate?.kind !== "activate-control") {
      throw new Error("fixture activate step is missing");
    }
    activate.renderStepRef = secondOpen.id;
    expect(codes(document)).toContain("OUTCOME_RESPONSE_RENDER_MISMATCH");
  });

  it("resolves the exact Need revision and required Experience Unit", () => {
    const need = structuredClone(caseDocument);
    need.need.revision = 99;
    expect(codes(need)).toContain("OUTCOME_NEED_UNRESOLVED");

    const statusContext = context();
    (
      statusContext.sources[0]!.document as {
        needs: Array<{ status: string }>;
      }
    ).needs[0]!.status = "proposed";
    expect(codes(structuredClone(caseDocument), statusContext)).toContain(
      "OUTCOME_NEED_NOT_ADOPTED"
    );

    const unpinned = structuredClone(
      caseDocument
    ) as Partial<OutcomeVerificationCase>;
    delete unpinned.experience;
    expect(codes(unpinned as OutcomeVerificationCase)).toContain(
      "OUTCOME_EXPERIENCE_PIN_REQUIRED"
    );

    const experience = structuredClone(caseDocument);
    experience.experience!.unitId = "missing";
    expect(codes(experience)).toContain("OUTCOME_EXPERIENCE_UNIT_UNRESOLVED");

    const unrelated = context();
    (
      unrelated.sources.at(-1)!.document as {
        units: Array<{ needRefs: Array<{ id: string }> }>;
      }
    ).units[0]!.needRefs = [{ id: "other-need" }];
    expect(codes(structuredClone(caseDocument), unrelated)).toContain(
      "OUTCOME_EXPERIENCE_UNIT_NEED_MISMATCH"
    );
  });

  it("binds every expectation to a serving Experience Unit for the pinned Need", () => {
    const experience = structuredClone(caseDocument);
    const experienceContext = context();
    const experienceSource = experienceContext.sources.at(-1)!;
    (
      experienceSource.document as {
        units: Array<{ id: string; needRefs: Array<{ id: string }> }>;
      }
    ).units.push({
      id: "serving",
      needRefs: [{ id: caseDocument.need.id }],
    });
    experienceSource.subjects!.push({
      kind: "experience-unit",
      ref: "serving",
    });
    const servingRule = experience.expectedObservations[1]!.ruleRefs.find(
      (candidate) =>
        candidate.kind === "artifact-declaration" &&
        candidate.subject.subjectKind === "experience-unit"
    );
    if (
      servingRule?.kind !== "artifact-declaration" ||
      servingRule.subject.subjectKind !== "experience-unit"
    ) {
      throw new Error("Experience rule fixture is missing");
    }
    servingRule.subject.subjectRef = "serving";
    expect(codes(experience, experienceContext)).toContain(
      "OUTCOME_EXPERIENCE_RULE_NOT_SERVING"
    );

    experienceContext.experienceUnitBindings[0] = {
      ...structuredClone(experienceContext.experienceUnitBindings[0]!),
      unitId: "serving",
    };
    expect(codes(experience, experienceContext)).toEqual([]);

    experience.expectedObservations[0]!.ruleRefs =
      experience.expectedObservations[0]!.ruleRefs.filter(
        (candidate) =>
          candidate.kind !== "artifact-declaration" ||
          candidate.subject.subjectKind !== "experience-unit"
      );
    expect(codes(experience, experienceContext)).toContain(
      "OUTCOME_EXPERIENCE_RULE_REQUIRED"
    );

    (
      experienceSource.document as {
        units: Array<{ id: string; needRefs: Array<{ id: string }> }>;
      }
    ).units[1]!.needRefs = [{ id: "other-need" }];
    expect(codes(experience, experienceContext)).toContain(
      "OUTCOME_EXPERIENCE_RULE_NEED_MISMATCH"
    );
  });

  it("requires direct owner-produced Need trace on every technical artifact rule", () => {
    const lintContext = context();
    const actionTrace = lintContext.subjectNeedBindings.find(
      (binding) => binding.subject.subjectKind === "response-action"
    );
    if (!actionTrace) throw new Error("Action Need trace fixture is missing");
    actionTrace.needId = "other-need";
    expect(codes(structuredClone(caseDocument), lintContext)).toContain(
      "OUTCOME_ARTIFACT_RULE_NEED_TRACE_MISSING"
    );
  });

  it("pins the exact App Manifest identity and version", () => {
    const lintContext = context();
    (
      lintContext.sources[1]!.document as {
        version: string;
      }
    ).version = "9.9.9";
    expect(codes(structuredClone(caseDocument), lintContext)).toContain(
      "OUTCOME_APP_IDENTITY_MISMATCH"
    );
  });

  it("catches missing, ambiguous, and stale sources and unresolved subjects", () => {
    const missing = context();
    missing.sources = missing.sources.filter(
      (source) => source.artifactRef !== refs.actions
    );
    expect(codes(structuredClone(caseDocument), missing)).toContain(
      "OUTCOME_SOURCE_UNRESOLVED"
    );

    const ambiguous = context();
    ambiguous.sources.push(structuredClone(ambiguous.sources[2]!));
    expect(codes(structuredClone(caseDocument), ambiguous)).toContain(
      "OUTCOME_SOURCE_AMBIGUOUS"
    );

    const stale = context();
    stale.sources[3]!.artifactDigest = digest("f");
    expect(codes(structuredClone(caseDocument), stale)).toContain(
      "OUTCOME_SOURCE_STALE"
    );

    const subject = context();
    subject.sources[2]!.subjects = [];
    expect(codes(structuredClone(caseDocument), subject)).toContain(
      "OUTCOME_SUBJECT_UNRESOLVED"
    );
  });

  it("requires versioned resolvable current rules", () => {
    const empty = structuredClone(caseDocument);
    (empty.expectedObservations[0] as { ruleRefs: unknown[] }).ruleRefs = [];
    expect(codes(empty)).toContain("OUTCOME_RULE_REFS_EMPTY");

    const unresolved = context();
    unresolved.specificationRules = [];
    expect(codes(structuredClone(caseDocument), unresolved)).toContain(
      "OUTCOME_SPEC_RULE_UNRESOLVED"
    );

    const stale = context();
    const indexed = stale.specificationRules.find(
      (candidate) => candidate.ruleId === "rendering.semantic-output"
    );
    if (indexed) indexed.current = false;
    expect(codes(structuredClone(caseDocument), stale)).toContain(
      "OUTCOME_SPEC_RULE_STALE"
    );

    const unversioned = structuredClone(caseDocument);
    const rule = unversioned.expectedObservations[0]!.ruleRefs.find(
      (candidate) => candidate.kind === "specification-rule"
    );
    if (rule?.kind === "specification-rule") {
      rule.specVersion = "";
    }
    expect(codes(unversioned)).toContain("OUTCOME_SPEC_RULE_UNVERSIONED");
  });

  it("requires both an owner declaration and a specification rule", () => {
    const noOwner = structuredClone(caseDocument);
    noOwner.expectedObservations[0]!.ruleRefs =
      noOwner.expectedObservations[0]!.ruleRefs.filter(
        (rule) => rule.kind !== "artifact-declaration"
      ) as (typeof noOwner.expectedObservations)[0]["ruleRefs"];
    expect(codes(noOwner)).toContain("OUTCOME_ARTIFACT_RULE_REQUIRED");

    const noSpec = structuredClone(caseDocument);
    noSpec.expectedObservations[0]!.ruleRefs =
      noSpec.expectedObservations[0]!.ruleRefs.filter(
        (rule) => rule.kind !== "specification-rule"
      ) as (typeof noSpec.expectedObservations)[0]["ruleRefs"];
    expect(codes(noSpec)).toContain("OUTCOME_SPEC_RULE_REQUIRED");

    const wrongOwner = structuredClone(caseDocument);
    const ownerRule = wrongOwner.expectedObservations[0]!.ruleRefs.find(
      (rule) => rule.kind === "artifact-declaration"
    );
    if (ownerRule?.kind === "artifact-declaration") {
      ownerRule.subject = {
        artifactRef: refs.actions,
        artifactDigest: digests.actions,
        subjectKind: "response-action",
        subjectRef: "submit",
      };
    }
    expect(codes(wrongOwner)).toContain("OUTCOME_ARTIFACT_RULE_OWNER_MISMATCH");
  });

  it("binds each artifact rule to the exact technical subject tested", () => {
    const document = structuredClone(caseDocument);
    const expectation = document.expectedObservations[1];
    if (expectation?.kind !== "validation-report") {
      throw new Error("validation expectation fixture is missing");
    }
    expectation.subject = {
      ...expectation.subject,
      subjectKind: "definition-item",
    };

    const findings = codes(document);
    expect(findings).toContain("OUTCOME_ARTIFACT_RULE_SUBJECT_MISMATCH");
    expect(findings).toContain("OUTCOME_EXPECTATION_SUBJECT_KIND_INVALID");
    expect(findings).not.toContain("OUTCOME_SUBJECT_UNRESOLVED");
  });

  it("binds Validation issue paths to the exact definition-bind subject", () => {
    const document = structuredClone(caseDocument);
    const expectation = document.expectedObservations[1];
    if (expectation?.kind !== "validation-report") {
      throw new Error("validation expectation fixture is missing");
    }
    expectation.containsIssues = [{ path: "sibling-field", code: "CHECKED" }];
    expectation.excludesIssues = [{ path: "another-sibling", code: "BROKEN" }];

    expect(
      codes(document).filter(
        (code) => code === "OUTCOME_VALIDATION_SUBJECT_ISSUE_MISMATCH"
      )
    ).toHaveLength(2);
  });

  it("requires a Response expectation to name and assert one exact item", () => {
    const document = structuredClone(caseDocument);
    const expectation = document.expectedObservations[2];
    if (expectation?.kind !== "response") {
      throw new Error("response expectation fixture is missing");
    }
    delete (expectation as { item?: unknown }).item;

    expect(codes(document)).toContain("OUTCOME_RESPONSE_ITEM_REQUIRED");
  });

  it("catches duplicate rules and contradictory closed expectations", () => {
    const duplicate = structuredClone(caseDocument);
    duplicate.expectedObservations[0]!.ruleRefs.push(
      structuredClone(duplicate.expectedObservations[0]!.ruleRefs[0]!)
    );
    expect(codes(duplicate)).toContain("OUTCOME_RULE_REF_DUPLICATE");

    const issueValidation = structuredClone(caseDocument);
    const issueExpectation = issueValidation
      .expectedObservations[1] as unknown as {
      containsIssues: Array<{ path: string; code: string }>;
      excludesIssues: Array<{ path: string; code: string }>;
    };
    issueExpectation.excludesIssues.push({
      ...issueExpectation.containsIssues[0]!,
    });
    expect(codes(issueValidation)).toContain(
      "OUTCOME_VALIDATION_ISSUE_CONTRADICTION"
    );

    const action = structuredClone(caseDocument);
    const actionExpectation = action.expectedObservations[3] as unknown as {
      effects: Array<{ index: number }>;
    };
    actionExpectation.effects[0]!.index = 2;
    expect(codes(action)).toContain("OUTCOME_EFFECT_TRACE_INCOMPLETE");
  });

  it("requires the complete owner-resolved Action effect plan", () => {
    const missing = context();
    missing.actionPlans = [];
    expect(codes(structuredClone(caseDocument), missing)).toContain(
      "OUTCOME_ACTION_PLAN_UNRESOLVED"
    );

    const incomplete = context();
    incomplete.actionPlans[0]!.effects.push({
      index: 1,
      type: "evidenceRequest",
    });
    expect(codes(structuredClone(caseDocument), incomplete)).toContain(
      "OUTCOME_EFFECT_TRACE_INCOMPLETE"
    );
  });

  it("leaves capability classification to preflight but rejects incompatible evidence classes", () => {
    const unsupported = context();
    unsupported.supportedObservationKinds = ["app-graph"];
    expect(codes(structuredClone(caseDocument), unsupported)).not.toContain(
      "OUTCOME_OBSERVATION_KIND_UNSUPPORTED"
    );

    const evidence = structuredClone(caseDocument);
    (
      evidence.expectedObservations[0] as {
        requiredEvidence: "runtime";
      }
    ).requiredEvidence = "runtime";
    expect(codes(evidence)).toContain("OUTCOME_EVIDENCE_CLASS_INVALID");
  });

  it("requires exact semantic control bindings", () => {
    const definition = context();
    definition.semanticControlBindings[0]!.definition!.path = "other";
    expect(codes(structuredClone(caseDocument), definition)).toContain(
      "OUTCOME_CONTROL_DEFINITION_MISMATCH"
    );

    const action = context();
    action.semanticControlBindings[1]!.action!.id = "other";
    expect(codes(structuredClone(caseDocument), action)).toContain(
      "OUTCOME_CONTROL_ACTION_MISMATCH"
    );
  });

  it("does not let an identical control from another rendered route satisfy a step", () => {
    const lintContext = context();
    lintContext.semanticControlBindings[0]!.renderStepRef = "open:other";

    expect(codes(structuredClone(caseDocument), lintContext)).toContain(
      "OUTCOME_CONTROL_BINDING_UNRESOLVED"
    );
  });

  it("rejects ambiguous Experience service for the exact tested subject", () => {
    const lintContext = context();
    lintContext.experienceUnitBindings.push(
      structuredClone(lintContext.experienceUnitBindings[0]!)
    );

    expect(codes(structuredClone(caseDocument), lintContext)).toContain(
      "OUTCOME_EXPERIENCE_SERVICE_AMBIGUOUS"
    );
  });

  it("rejects technical owners that belong to another App", () => {
    const lintContext = context();
    const definition = lintContext.appArtifactBindings.find(
      (binding) => binding.kind === "definition"
    );
    if (!definition) throw new Error("Definition App binding is missing");
    definition.appRef = "https://example.test/another-app";

    expect(codes(structuredClone(caseDocument), lintContext)).toContain(
      "OUTCOME_APP_ARTIFACT_UNRESOLVED"
    );
  });

  it("rejects an Experience Unit that is not mounted on the producing route", () => {
    const lintContext = context();
    lintContext.experienceUnitBindings[0]!.routeId = "another-route";

    expect(codes(structuredClone(caseDocument), lintContext)).toContain(
      "OUTCOME_EXPERIENCE_RULE_NOT_SERVING"
    );
  });

  it("requires owner-specific semantic control subject kinds", () => {
    const document = structuredClone(caseDocument);
    (
      document.procedure[1] as unknown as {
        control: { subjectKind: string };
      }
    ).control.subjectKind = "surface-node";
    (
      document.procedure[2] as unknown as {
        control: { subjectKind: string };
      }
    ).control.subjectKind = "surface-node";

    const findings = codes(document);
    expect(findings).toContain("OUTCOME_SET_CONTROL_KIND_INVALID");
    expect(findings).toContain("OUTCOME_ACTIVATE_CONTROL_KIND_INVALID");
  });

  it("checks Response value and data-source semantics", () => {
    const response = structuredClone(caseDocument);
    const responseExpectation = response.expectedObservations[2] as unknown as {
      item: { presence: string; value?: unknown };
    };
    responseExpectation.item.presence = "absent";
    expect(codes(response)).toContain("OUTCOME_ABSENT_VALUE_PRESENT");

    const data = structuredClone(caseDocument);
    const dataExpectation = data.expectedObservations[4] as unknown as {
      state: string;
      freshness?: string;
    };
    dataExpectation.state = "unavailable";
    expect(codes(data)).toContain("OUTCOME_UNAVAILABLE_SOURCE_FACT_INVALID");
  });

  it("rejects a rendered-output claim that is not a current positive commit", () => {
    const document = structuredClone(caseDocument);
    const rendered = document.expectedObservations.find(
      (expectation) => expectation.kind === "rendered-output"
    ) as unknown as { rendered: boolean };
    rendered.rendered = false;
    expect(codes(document)).toContain("OUTCOME_RENDERED_OUTPUT_NOT_COMMITTED");
  });

  it("rejects fields outside each closed step and observation payload", () => {
    const document = structuredClone(caseDocument);
    (document.procedure[0] as unknown as Record<string, unknown>).script =
      "productSpecific()";
    (
      document.expectedObservations[0] as unknown as Record<string, unknown>
    ).selector = "#product-specific";
    const findings = codes(document);
    expect(
      findings.filter((code) => code === "OUTCOME_CLOSED_PAYLOAD_FIELD_INVALID")
    ).toHaveLength(2);
  });

  it("rejects caller-paired case staleness before execution", () => {
    const lintContext = context();
    lintContext.caseDigest = digest("a");
    lintContext.currentCaseDigest = digest("b");
    expect(codes(structuredClone(caseDocument), lintContext)).toContain(
      "OUTCOME_CASE_STALE"
    );
  });
});

describe("lintOutcomeVerificationReport", () => {
  function reportFixture(): Record<string, unknown> {
    return {
      conclusion: "passed",
      claimScope: {
        claim: "declared-observations",
        needSatisfaction: "not-asserted",
      },
      inspectedSources: [
        {
          artifactRef: "https://example.test/need",
          artifactDigest: digest("a"),
        },
        {
          artifactRef: "https://example.test/app",
          artifactDigest: digest("b"),
        },
      ],
      bindings: [
        { id: "binding:open", stepId: "open" },
        { id: "binding:checkpoint", stepId: "checkpoint" },
      ],
      results: [
        {
          expectationId: "expectation:one",
          conclusion: "passed",
          evidenceRefs: ["evidence:one"],
          correlationRefs: ["correlation:one"],
        },
        {
          expectationId: "expectation:two",
          conclusion: "passed",
          evidenceRefs: [],
          correlationRefs: [],
        },
      ],
      summary: {
        total: 2,
        passed: 2,
        failed: 0,
        indeterminate: 0,
        stale: 0,
      },
      diagnostics: [],
    };
  }

  it("forbids satisfaction conclusions and scope expansion", () => {
    const findings = lintOutcomeVerificationReport({
      conclusion: "satisfied",
      claimScope: {
        claim: "need-satisfaction",
        needSatisfaction: "asserted",
      },
    });
    expect(findings.map((finding) => finding.code)).toEqual([
      "OUTCOME_SATISFACTION_CONCLUSION_FORBIDDEN",
      "OUTCOME_CLAIM_SCOPE_INVALID",
    ]);
  });

  it("accepts a semantically consistent report", () => {
    expect(lintOutcomeVerificationReport(reportFixture())).toEqual([]);
  });

  it("rejects a generation time before the observation boundary ends", () => {
    const report = reportFixture();
    report.generatedAt = "2026-07-31T11:59:59Z";
    report.boundary = {
      startedAt: "2026-07-31T12:00:00Z",
      endedAt: "2026-07-31T12:00:01Z",
    };

    expect(
      lintOutcomeVerificationReport(report).map((finding) => finding.code)
    ).toContain("OUTCOME_REPORT_GENERATED_BEFORE_BOUNDARY");
  });

  it("rejects duplicate result, binding, step, and source identities", () => {
    const report = reportFixture();
    const results = report.results as Array<Record<string, unknown>>;
    results[1]!.expectationId = results[0]!.expectationId;
    const bindings = report.bindings as Array<Record<string, unknown>>;
    bindings[1]!.id = bindings[0]!.id;
    bindings[1]!.stepId = bindings[0]!.stepId;
    const sources = report.inspectedSources as Array<Record<string, unknown>>;
    sources[1]!.artifactRef = sources[0]!.artifactRef;

    const findings = lintOutcomeVerificationReport(report).map(
      (finding) => finding.code
    );
    expect(findings).toContain("OUTCOME_REPORT_EXPECTATION_ID_DUPLICATE");
    expect(findings).toContain("OUTCOME_REPORT_BINDING_ID_DUPLICATE");
    expect(findings).toContain("OUTCOME_REPORT_BINDING_STEP_ID_DUPLICATE");
    expect(findings).toContain("OUTCOME_REPORT_SOURCE_AMBIGUOUS");
  });

  it("rejects inconsistent summaries, conclusions, and passed diagnostics", () => {
    const report = reportFixture();
    const results = report.results as Array<Record<string, unknown>>;
    results[1]!.conclusion = "failed";
    report.diagnostics = [{ severity: "error" }];

    const findings = lintOutcomeVerificationReport(report).map(
      (finding) => finding.code
    );
    expect(findings).toContain("OUTCOME_REPORT_SUMMARY_MISMATCH");
    expect(findings).toContain("OUTCOME_REPORT_CONCLUSION_MISMATCH");
    expect(findings).toContain("OUTCOME_REPORT_PASSED_RESULT_CONFLICT");
    expect(findings).toContain("OUTCOME_REPORT_PASSED_DIAGNOSTIC_CONFLICT");
  });

  it("rejects duplicate or empty evidence and correlation references", () => {
    const report = reportFixture();
    const result = (report.results as Array<Record<string, unknown>>)[0]!;
    result.evidenceRefs = ["evidence:one", "evidence:one"];
    result.correlationRefs = ["", "correlation:one"];

    const findings = lintOutcomeVerificationReport(report).map(
      (finding) => finding.code
    );
    expect(findings).toContain("OUTCOME_REPORT_EVIDENCE_REFS_INVALID");
    expect(findings).toContain("OUTCOME_REPORT_CORRELATION_REFS_INVALID");
  });
});
