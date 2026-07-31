import { describe, expect, it, vi } from "vitest";

import {
  canonicalJson,
  compareCanonicalFiniteJson,
  compareOutcomeVerification as compareOutcomeEvidence,
  generateOutcomeVerificationReport,
  sha256Digest,
  type GeneratedCaseIdentity,
  type GeneratedReportIdentity,
} from "../src/index.js";
import {
  comparatorRequest,
  digest,
  digests,
  fixtureComparatorDependencies,
  fixtureLintClearance,
} from "./fixtures.js";

const compareOutcomeVerification = (
  request: Awaited<ReturnType<typeof comparatorRequest>>
) => compareOutcomeEvidence(request, "2026-07-31T12:00:11.000Z");

const generatedCaseIdentity: GeneratedCaseIdentity = true;
const generatedReportIdentity: GeneratedReportIdentity = true;

describe("canonical JSON", () => {
  it("ignores object member order while preserving array order", () => {
    expect(
      compareCanonicalFiniteJson(
        { beta: 2, alpha: [1, 2] },
        { alpha: [1, 2], beta: 2 }
      )
    ).toBe(true);
    expect(compareCanonicalFiniteJson([1, 2], [2, 1])).toBe(false);
  });

  it("rejects non-finite numbers and host objects", async () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/non-finite/);
    await expect(sha256Digest({ value: new Date() })).rejects.toThrow(
      /host object/
    );
  });

  it("uses generated document types as exact public identities", () => {
    expect(generatedCaseIdentity).toBe(true);
    expect(generatedReportIdentity).toBe(true);
  });
});

describe("compareOutcomeVerification", () => {
  it("passes all seven closed observation kinds and preserves explicit time", async () => {
    const request = await comparatorRequest();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("comparator must not read the clock");
    });
    const report = await compareOutcomeVerification(request);
    expect(clock).not.toHaveBeenCalled();
    clock.mockRestore();

    expect(report.conclusion).toBe("passed");
    expect(report.summary).toEqual({
      total: 7,
      passed: 7,
      failed: 0,
      indeterminate: 0,
      stale: 0,
    });
    expect(report.generatedAt).toBe("2026-07-31T12:00:11.000Z");
    expect(report.claimScope).toEqual({
      claim: "declared-observations",
      needSatisfaction: "not-asserted",
    });
    expect(report.results.map((result) => result.reasonCode)).toEqual([
      "MATCH",
      "MATCH",
      "MATCH",
      "MATCH",
      "MATCH",
      "MATCH",
      "MATCH",
    ]);
  });

  it("reports contradictory facts as failed", async () => {
    const request = await comparatorRequest();
    const observations = structuredClone(request.observations);
    const changes: Array<(observation: Record<string, unknown>) => void> = [
      (observation) => {
        (observation.payload as Record<string, unknown>).state = "absent";
      },
      (observation) => {
        (observation.payload as Record<string, unknown>).valid = false;
      },
      (observation) => {
        (observation.payload as Record<string, unknown>).status = "stopped";
      },
      (observation) => {
        (observation.payload as Record<string, unknown>).terminal = "failed";
      },
      (observation) => {
        (observation.payload as Record<string, unknown>).recordId = "other";
      },
      (observation) => {
        (observation.payload as Record<string, unknown>).routeId = "other";
      },
      (observation) => {
        (observation.payload as Record<string, unknown>).operable = false;
      },
    ];
    observations.forEach((observation, index) =>
      changes[index]?.(observation as unknown as Record<string, unknown>)
    );
    request.observations = observations;

    const report = await compareOutcomeVerification(request);
    expect(report.conclusion).toBe("failed");
    expect(report.summary.failed).toBe(7);
    expect(
      report.results.every(
        (result) => result.reasonCode === "EXPECTED_VALUE_MISMATCH"
      )
    ).toBe(true);
  });

  it("treats missing, duplicate, unsupported, and wrong-class evidence as indeterminate", async () => {
    const missingRequest = await comparatorRequest();
    missingRequest.observations = missingRequest.observations.slice(1);
    const missing = await compareOutcomeVerification(missingRequest);
    expect(missing.results[0]?.reasonCode).toBe("MISSING_EVIDENCE");
    expect(missing.results[0]?.conclusion).toBe("indeterminate");

    const duplicateRequest = await comparatorRequest();
    duplicateRequest.observations.push(
      structuredClone(duplicateRequest.observations[0]!)
    );
    const duplicate = await compareOutcomeVerification(duplicateRequest);
    expect(duplicate.results[0]?.reasonCode).toBe("DUPLICATE_EVIDENCE");

    const kindRequest = await comparatorRequest();
    Object.assign(kindRequest.observations[0]!, {
      kind: "unknown-kind",
    });
    const unsupported = await compareOutcomeVerification(kindRequest);
    expect(unsupported.results[0]?.reasonCode).toBe(
      "UNSUPPORTED_OBSERVATION_KIND"
    );

    const classRequest = await comparatorRequest();
    Object.assign(classRequest.observations[0]!, {
      evidenceClass: "runtime",
    });
    const wrongClass = await compareOutcomeVerification(classRequest);
    expect(wrongClass.results[0]?.reasonCode).toBe("EVIDENCE_CLASS_MISMATCH");

    const adapterRequest = await comparatorRequest();
    adapterRequest.observations[0]!.adapter.id = "adapter:other";
    const wrongAdapter = await compareOutcomeVerification(adapterRequest);
    expect(wrongAdapter.results[0]?.reasonCode).toBe("UNBOUND_EVIDENCE");
  });

  it("fails closed on stale case, source, evidence, and time boundaries", async () => {
    const caseRequest = await comparatorRequest();
    caseRequest.caseDigest = digest("a");
    const staleCase = await compareOutcomeVerification(caseRequest);
    expect(staleCase.conclusion).toBe("stale");
    expect(
      staleCase.results.every((result) => result.reasonCode === "STALE_CASE")
    ).toBe(true);

    const sourceRequest = await comparatorRequest();
    sourceRequest.pairedSources[0].artifactDigest = digest("b");
    await expect(compareOutcomeVerification(sourceRequest)).rejects.toThrow(
      "OUTCOME_LINT_CLEARANCE_INVALID"
    );

    const evidenceRequest = await comparatorRequest();
    evidenceRequest.observations[0]!.source.artifactDigest = digest("c");
    const staleEvidence = await compareOutcomeVerification(evidenceRequest);
    expect(staleEvidence.results[0]?.reasonCode).toBe("STALE_EVIDENCE");

    const timeRequest = await comparatorRequest();
    timeRequest.observations[0]!.boundary = {
      startedAt: "2026-07-31T12:00:12.000Z",
      endedAt: "2026-07-31T12:00:13.000Z",
    };
    const staleTime = await compareOutcomeVerification(timeRequest);
    expect(staleTime.results[0]?.reasonCode).toBe("STALE_EVIDENCE");
  });

  it("requires exact step, checkpoint, and owner-produced causal identities", async () => {
    const stepRequest = await comparatorRequest();
    stepRequest.observations[1]!.stepBindingRef = "binding:open";
    const wrongStep = await compareOutcomeVerification(stepRequest);
    expect(wrongStep.results[1]?.reasonCode).toBe("UNBOUND_EVIDENCE");

    const checkpointRequest = await comparatorRequest();
    checkpointRequest.observations[1]!.checkpointBindingRef = "binding:open";
    const wrongCheckpoint = await compareOutcomeVerification(checkpointRequest);
    expect(wrongCheckpoint.results[1]?.reasonCode).toBe("UNBOUND_EVIDENCE");

    const definitionOwnerRequest = await comparatorRequest();
    const validationPayload = definitionOwnerRequest.observations[1]!
      .payload as {
      definitionDigest: string;
    };
    validationPayload.definitionDigest = digests.actions;
    const wrongDefinitionOwner = await compareOutcomeVerification(
      definitionOwnerRequest
    );
    expect(wrongDefinitionOwner.results[1]?.reasonCode).toBe(
      "UNBOUND_EVIDENCE"
    );

    const actionOwnerRequest = await comparatorRequest();
    const actionPayload = actionOwnerRequest.observations[3]!.payload as {
      actionsDigest: string;
    };
    actionPayload.actionsDigest = digests.definition;
    const wrongActionOwner = await compareOutcomeVerification(
      actionOwnerRequest
    );
    expect(wrongActionOwner.results[3]?.reasonCode).toBe("UNBOUND_EVIDENCE");

    const dataRequest = await comparatorRequest();
    const data = dataRequest.observations[4] as unknown as {
      payload: { requestId: string };
    };
    data.payload.requestId = "request:other";
    const unboundData = await compareOutcomeVerification(dataRequest);
    expect(unboundData.results[4]?.reasonCode).toBe("UNBOUND_EVIDENCE");

    const actionRequest = await comparatorRequest();
    const action = actionRequest.observations[3] as unknown as {
      payload: { invocationId: string };
    };
    action.payload.invocationId = "invocation:other";
    const unboundAction = await compareOutcomeVerification(actionRequest);
    expect(unboundAction.results[3]?.reasonCode).toBe("UNBOUND_EVIDENCE");

    const revisionRequest = await comparatorRequest();
    const validation = revisionRequest.observations[1] as unknown as {
      payload: { responseRevision: number };
    };
    validation.payload.responseRevision = 2;
    const staleRevision = await compareOutcomeVerification(revisionRequest);
    expect(staleRevision.results[1]?.reasonCode).toBe("UNBOUND_EVIDENCE");

    const issuePathRequest = await comparatorRequest();
    const issuePathObservation = issuePathRequest
      .observations[1] as unknown as {
      payload: { issues: Array<{ path: string; code: string }> };
    };
    issuePathObservation.payload.issues = [
      { path: "another-field", code: "CHECKED" },
    ];
    const wrongIssuePath = await compareOutcomeVerification(issuePathRequest);
    expect(wrongIssuePath.results[1]?.reasonCode).toBe(
      "EXPECTED_VALUE_MISMATCH"
    );

    const observationIdRequest = await comparatorRequest();
    observationIdRequest.observations[1]!.id =
      observationIdRequest.observations[0]!.id;
    const ambiguousObservation = await compareOutcomeVerification(
      observationIdRequest
    );
    expect(ambiguousObservation.results[0]?.reasonCode).toBe(
      "AMBIGUOUS_EVIDENCE"
    );
    expect(ambiguousObservation.results[1]?.reasonCode).toBe(
      "AMBIGUOUS_EVIDENCE"
    );

    const bindingIdRequest = await comparatorRequest();
    bindingIdRequest.bindings[1]!.id = bindingIdRequest.bindings[0]!.id;
    bindingIdRequest.observations[1]!.stepBindingRef =
      bindingIdRequest.bindings[0]!.id;
    const ambiguousBinding = await compareOutcomeVerification(bindingIdRequest);
    expect(ambiguousBinding.results[1]?.reasonCode).toBe("UNBOUND_EVIDENCE");
  });

  it("fails a retained route expectation after navigation changes the current route", async () => {
    const request = await comparatorRequest();
    const route = request.observations.find(
      (observation) => observation.kind === "route-state"
    );
    if (route?.kind !== "route-state") {
      throw new Error("route-state observation fixture is missing");
    }
    route.payload.routeId = "completed";

    const report = await compareOutcomeVerification(request);
    const result = report.results.find(
      (candidate) => candidate.expectationId === "route-state"
    );
    expect(result).toMatchObject({
      conclusion: "failed",
      reasonCode: "EXPECTED_VALUE_MISMATCH",
    });
  });

  it("does not let a case edit upgrade owner-reported evidence", async () => {
    const request = await comparatorRequest();
    const route = request.case.expectedObservations.find(
      (expectation) => expectation.kind === "route-state"
    );
    if (route?.kind !== "route-state") {
      throw new Error("route-state expectation fixture is missing");
    }
    route.requiredEvidence = "simulated";
    request.caseDigest = await sha256Digest(request.case);
    request.lintClearance = await fixtureLintClearance(request.case);

    const report = await compareOutcomeVerification(request);
    const result = report.results.find(
      (candidate) => candidate.expectationId === "route-state"
    );
    expect(result).toMatchObject({
      conclusion: "indeterminate",
      reasonCode: "EVIDENCE_CLASS_MISMATCH",
      observedEvidence: "runtime",
    });
  });

  it("rejects a stale data record when a record-producing step is pinned", async () => {
    const request = await comparatorRequest();
    const open = request.case.procedure.find(
      (step) => step.kind === "open-route"
    );
    if (open?.kind !== "open-route") {
      throw new Error("open-route fixture is missing");
    }
    const dataOpen = {
      ...structuredClone(open),
      id: "open:data",
    };
    request.case.procedure.splice(2, 0, dataOpen);
    const data = request.case.expectedObservations.find(
      (expectation) => expectation.kind === "data-source-result"
    );
    if (data?.kind !== "data-source-result") {
      throw new Error("data-source expectation fixture is missing");
    }
    data.stepRef = dataOpen.id;
    data.recordStepRef = "set";
    const openBinding = request.bindings.find(
      (binding) => binding.kind === "open-route"
    );
    if (openBinding?.kind !== "open-route") {
      throw new Error("open-route binding fixture is missing");
    }
    const dataBinding = {
      ...structuredClone(openBinding),
      id: "binding:open:data",
      stepId: dataOpen.id,
      dataSourceRequestIds: ["request:data"],
    };
    request.bindings.splice(2, 0, dataBinding);
    const checkpoint = request.bindings.find(
      (binding) => binding.kind === "checkpoint"
    );
    if (checkpoint?.kind !== "checkpoint") {
      throw new Error("checkpoint binding fixture is missing");
    }
    checkpoint.includedBindingRefs.push(dataBinding.id);
    const observation = request.observations.find(
      (candidate) => candidate.kind === "data-source-result"
    );
    if (observation?.kind !== "data-source-result") {
      throw new Error("data-source observation fixture is missing");
    }
    observation.stepBindingRef = dataBinding.id;
    observation.payload.requestId = "request:data";
    request.caseDigest = await sha256Digest(request.case);
    request.lintClearance = await fixtureLintClearance(request.case);

    const report = await compareOutcomeVerification(request);
    const result = report.results.find(
      (candidate) => candidate.expectationId === "data"
    );
    expect(result).toMatchObject({
      conclusion: "indeterminate",
      reasonCode: "UNBOUND_EVIDENCE",
    });
  });

  it("rejects an invalid Bind expectation without an exact issue", async () => {
    const request = await comparatorRequest();
    const expected = request.case.expectedObservations[1] as {
      valid: boolean;
      containsIssues?: Array<{ path: string; code: string }>;
      excludesIssues?: Array<{ path: string; code: string }>;
    };
    expected.valid = false;
    delete expected.containsIssues;
    delete expected.excludesIssues;
    const payload = request.observations[1]!.payload as {
      valid: boolean;
      issues: Array<{ path: string; code: string }>;
    };
    payload.valid = false;
    payload.issues = [];
    await expect(fixtureLintClearance(request.case)).rejects.toMatchObject({
      findings: [
        expect.objectContaining({
          code: "OUTCOME_INVALID_VALIDATION_ISSUE_REQUIRED",
        }),
      ],
    });
  });

  it("requires a complete digest-pinned Response snapshot for absence", async () => {
    const request = await comparatorRequest();
    const expected = request.case.expectedObservations[2] as unknown as {
      item: { path: string; presence: string; value?: unknown };
    };
    expected.item.presence = "absent";
    delete expected.item.value;
    const observed = request.observations[2] as unknown as {
      payload: {
        item: { path: string; presence: string; value?: unknown };
        responseDigest?: string;
      };
    };
    observed.payload.item.presence = "absent";
    delete observed.payload.item.value;
    delete observed.payload.responseDigest;
    request.caseDigest = await sha256Digest(request.case);
    request.lintClearance = await fixtureLintClearance(request.case);

    const unsupported = await compareOutcomeVerification(request);
    expect(unsupported.results[2]?.conclusion).toBe("indeterminate");
    expect(unsupported.results[2]?.reasonCode).toBe("UNBOUND_EVIDENCE");

    observed.payload.responseDigest = digest("0");
    const supported = await compareOutcomeVerification(request);
    expect(supported.results[2]?.conclusion).toBe("passed");
  });

  it("uses stale over failed over indeterminate over passed precedence", async () => {
    const request = await comparatorRequest();
    request.observations = request.observations.slice(1);
    const response = request.observations.find(
      (observation) => observation.expectationId === "response"
    ) as unknown as { payload: { status: string } };
    response.payload.status = "stopped";
    const rendered = request.observations.find(
      (observation) => observation.expectationId === "rendered"
    );
    rendered!.source.artifactDigest = digest("d");

    const report = await compareOutcomeVerification(request);
    expect(report.summary.indeterminate).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.stale).toBe(1);
    expect(report.conclusion).toBe("stale");
  });

  it("consumes runner custody even when supplied runner evidence was tampered", async () => {
    const request = await comparatorRequest();
    const dependencies = fixtureComparatorDependencies(request);
    const original = structuredClone(request.observations);
    const response = request.observations.find(
      (observation) => observation.kind === "response"
    );
    if (response?.kind !== "response") {
      throw new Error("response observation fixture is missing");
    }
    response.payload.status = "tampered";

    await expect(
      generateOutcomeVerificationReport(request, dependencies)
    ).rejects.toThrow("OUTCOME_RUN_CUSTODY_INVALID");

    request.observations = original;
    await expect(
      generateOutcomeVerificationReport(request, dependencies)
    ).rejects.toThrow("OUTCOME_RUN_CUSTODY_INVALID");
  });
});
