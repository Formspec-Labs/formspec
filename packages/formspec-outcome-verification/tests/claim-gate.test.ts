import { describe, expect, it } from "vitest";

import {
  digestDemoClaimContext,
  digestResolvedTargetIdentity,
  digestOutcomeSpecificationRuleIndex,
  evaluateOutcomeClaimGate as evaluateGate,
  generateOutcomeVerificationReport,
  sha256Digest,
  type OutcomeClaimEvidence,
  type OutcomeClaimGateInput,
} from "../src/index.js";
import {
  admission,
  comparatorRequest,
  digest,
  fixtureComparatorDependencies,
  fixtureLintContext,
  fixtureOwnerFacts,
  fixtureResolvedTarget,
  fixtureSchemaValidation,
  fixtureTargetIdentities,
} from "./fixtures.js";

const evidenceDependencies = new WeakMap<
  OutcomeClaimEvidence,
  import("../src/index.js").OutcomeClaimGateDependencies
>();
const inputDependencies = new WeakMap<
  OutcomeClaimGateInput,
  import("../src/index.js").OutcomeClaimGateDependencies
>();

function evaluateOutcomeClaimGate(input: OutcomeClaimGateInput) {
  const dependencies = inputDependencies.get(input);
  if (!dependencies) throw new Error("fixture gate dependencies missing");
  return evaluateGate(input, dependencies);
}

async function evidence(): Promise<OutcomeClaimEvidence> {
  const request = await comparatorRequest();
  const comparatorDependencies = fixtureComparatorDependencies(request);
  const report = await generateOutcomeVerificationReport(
    request,
    comparatorDependencies
  );
  const {
    case: caseDocument,
    caseDigest: _caseDigest,
    pairedSources: _pairedSources,
    lintClearance: _lintClearance,
    custody: _custody,
    ...comparison
  } = request;
  const entry = {
    caseDocument,
    lintContext: fixtureLintContext(),
    admission: await admission(),
    comparison: {
      ...comparison,
      generatedAt: report.generatedAt,
    },
    report,
    reportDigest: await sha256Digest(report),
  };
  evidenceDependencies.set(entry, {
    schemaValidation: fixtureSchemaValidation,
    targetIdentities: fixtureTargetIdentities,
    ownerFacts: fixtureOwnerFacts(fixtureLintContext()),
    runBindings: comparatorDependencies.runBindings,
  });
  return entry;
}

async function approvedInput(
  evidenceEntries: OutcomeClaimEvidence[],
  requiredCaseDigests?: string[]
): Promise<OutcomeClaimGateInput> {
  const first = evidenceEntries[0] ?? (await evidence());
  const required =
    requiredCaseDigests ??
    (await Promise.all(
      evidenceEntries.map((entry) => sha256Digest(entry.caseDocument))
    ));
  const claimContext = {
    evidenceProfile: "runtime-demo" as const,
    app: { ...first.caseDocument.app },
    target: structuredClone(first.report.run.target),
    verificationDependencies: {
      schemaValidator: structuredClone(fixtureSchemaValidation.identity),
      ownerFacts: fixtureOwnerFacts(fixtureLintContext()).identity,
      specificationRuleIndexDigest: await digestOutcomeSpecificationRuleIndex(),
    },
    requiredCaseDigests: required,
  };
  const gateInput: OutcomeClaimGateInput = {
    claimContext,
    evidence: evidenceEntries,
    humanAdequacyApproval: {
      demoClaimContextDigest: await digestDemoClaimContext(claimContext),
      reviewedContext: structuredClone(claimContext),
      reviewerRef: "reviewer:test",
      reviewedAt: "2026-07-31T12:30:00.000Z",
    },
  };
  const dependencies = evidenceDependencies.get(first);
  if (!dependencies) throw new Error("fixture evidence dependencies missing");
  inputDependencies.set(gateInput, dependencies);
  return gateInput;
}

describe("evaluateOutcomeClaimGate", () => {
  it("supports only the exact approved demo evidence context", async () => {
    const entry = await evidence();
    const result = await evaluateOutcomeClaimGate(await approvedInput([entry]));
    expect(result).toMatchObject({
      supported: true,
      claim: "demo",
      humanAdequacyApproved: true,
      reasons: [],
    });
  });

  it("never infers approval and rejects stale context approval", async () => {
    const input = await approvedInput([await evidence()]);
    delete input.humanAdequacyApproval;
    expect((await evaluateOutcomeClaimGate(input)).reasons).toContain(
      "HUMAN_ADEQUACY_NOT_APPROVED"
    );

    const stale = await approvedInput([await evidence()]);
    stale.humanAdequacyApproval!.demoClaimContextDigest = digest("f");
    expect((await evaluateOutcomeClaimGate(stale)).reasons).toContain(
      "HUMAN_ADEQUACY_APPROVAL_STALE"
    );
  });

  it("fails empty, duplicate, missing, and duplicate evidence sets", async () => {
    const entry = await evidence();
    const caseDigest = await sha256Digest(entry.caseDocument);
    expect(
      (await evaluateOutcomeClaimGate(await approvedInput([], []))).reasons
    ).toContain("REQUIRED_CASE_SET_EMPTY");
    expect(
      (
        await evaluateOutcomeClaimGate(
          await approvedInput([entry], [caseDigest, caseDigest])
        )
      ).reasons
    ).toContain("REQUIRED_CASE_DIGEST_DUPLICATE");
    expect(
      (
        await evaluateOutcomeClaimGate(
          await approvedInput([entry], [digest("a")])
        )
      ).reasons
    ).toContain("REQUIRED_REPORT_MISSING");
    expect(
      (
        await evaluateOutcomeClaimGate(
          await approvedInput([entry, structuredClone(entry)], [caseDigest])
        )
      ).reasons
    ).toContain("REPORT_DUPLICATE");
  });

  it("rejects report tampering and mismatched report identity", async () => {
    const tampered = await evidence();
    tampered.report.summary.total += 1;
    expect(
      (await evaluateOutcomeClaimGate(await approvedInput([tampered]))).reasons
    ).toContain("REPORT_DIGEST_MISMATCH");

    const wrongId = await evidence();
    wrongId.report.id = "urn:formspec:outcome-report:wrong";
    wrongId.reportDigest = await sha256Digest(wrongId.report);
    expect(
      (await evaluateOutcomeClaimGate(await approvedInput([wrongId]))).reasons
    ).toContain("REPORT_ID_MISMATCH");
  });

  it("reruns report lint and exact comparison from the evidence bundle", async () => {
    const inconsistent = await evidence();
    inconsistent.report.results[1]!.expectationId =
      inconsistent.report.results[0]!.expectationId;
    inconsistent.reportDigest = await sha256Digest(inconsistent.report);
    const reasons = (
      await evaluateOutcomeClaimGate(await approvedInput([inconsistent]))
    ).reasons;
    expect(reasons).toContain("REPORT_INCONSISTENT");
  });

  it("rejects build and implementation context substitutions", async () => {
    const build = await approvedInput([await evidence()]);
    build.claimContext.target.buildDigest = digest("f");
    build.humanAdequacyApproval!.reviewedContext = structuredClone(
      build.claimContext
    );
    build.humanAdequacyApproval!.demoClaimContextDigest =
      await digestDemoClaimContext(build.claimContext);
    expect((await evaluateOutcomeClaimGate(build)).reasons).toContain(
      "TARGET_BUILD_MISMATCH"
    );

    const implementation = await approvedInput([await evidence()]);
    implementation.claimContext.target.implementationSetDigest = digest("e");
    implementation.humanAdequacyApproval!.reviewedContext = structuredClone(
      implementation.claimContext
    );
    implementation.humanAdequacyApproval!.demoClaimContextDigest =
      await digestDemoClaimContext(implementation.claimContext);
    expect((await evaluateOutcomeClaimGate(implementation)).reasons).toContain(
      "IMPLEMENTATION_SET_MISMATCH"
    );
  });

  it("rejects stale verifier dependency identities", async () => {
    const input = await approvedInput([await evidence()]);
    input.claimContext.verificationDependencies.schemaValidator.digest =
      digest("0");
    input.humanAdequacyApproval!.reviewedContext = structuredClone(
      input.claimContext
    );
    input.humanAdequacyApproval!.demoClaimContextDigest =
      await digestDemoClaimContext(input.claimContext);

    expect((await evaluateOutcomeClaimGate(input)).reasons).toContain(
      "VERIFICATION_DEPENDENCY_MISMATCH"
    );
  });

  it("ignores caller-embedded fake trusted ports", async () => {
    const input = (await approvedInput([
      await evidence(),
    ])) as OutcomeClaimGateInput & {
      schemaValidation: { validate(): Promise<{ valid: boolean }> };
      targetIdentities: { resolveTarget(): Promise<undefined> };
    };
    input.schemaValidation = {
      async validate() {
        return { valid: false };
      },
    };
    input.targetIdentities = {
      async resolveTarget() {
        return undefined;
      },
    };

    expect(await evaluateOutcomeClaimGate(input)).toMatchObject({
      supported: true,
      reasons: [],
    });
  });

  it("rejects simulated evidence from the runtime-demo profile", async () => {
    const entry = await evidence();
    entry.comparison.observations[1]!.evidenceClass = "simulated";

    expect(
      (await evaluateOutcomeClaimGate(await approvedInput([entry]))).reasons
    ).toContain("EVIDENCE_PROFILE_MISMATCH");
  });

  it("rejects receipt reference, evidence, and stored report digest tampering", async () => {
    const missing = await evidence();
    missing.report.executionReceipt.ref = "urn:test:receipt:missing";
    missing.reportDigest = await sha256Digest(missing.report);
    expect(
      (await evaluateOutcomeClaimGate(await approvedInput([missing]))).reasons
    ).toContain("EXECUTION_RECEIPT_MISSING");

    const evidenceDigest = await evidence();
    evidenceDigest.report.executionReceipt.evidenceDigest = digest("0");
    evidenceDigest.reportDigest = await sha256Digest(evidenceDigest.report);
    expect(
      (await evaluateOutcomeClaimGate(await approvedInput([evidenceDigest])))
        .reasons
    ).toContain("EVIDENCE_BUNDLE_INVALID");

    const storedDigest = await evidence();
    const storedInput = await approvedInput([storedDigest]);
    const dependencies = inputDependencies.get(storedInput);
    if (!dependencies) throw new Error("fixture gate dependencies missing");
    inputDependencies.set(storedInput, {
      ...dependencies,
      runBindings: {
        ...dependencies.runBindings,
        async readReceipt(receiptRef) {
          const receipt = await dependencies.runBindings.readReceipt(
            receiptRef
          );
          return receipt === undefined
            ? undefined
            : { ...receipt, reportDigest: digest("f") };
        },
      },
    });
    expect((await evaluateOutcomeClaimGate(storedInput)).reasons).toContain(
      "EXECUTION_RECEIPT_MISMATCH"
    );
  });

  it("resolves the target independently and rejects a different environment build", async () => {
    const input = await approvedInput([await evidence()]);
    const dependencies = inputDependencies.get(input);
    if (!dependencies) throw new Error("fixture gate dependencies missing");
    const otherBuild = await fixtureResolvedTarget();
    otherBuild.buildRef = "urn:test:build:other";
    otherBuild.buildDigest = digest("7");
    otherBuild.targetIdentityDigest = await digestResolvedTargetIdentity({
      class: otherBuild.class,
      ref: otherBuild.ref,
      buildRef: otherBuild.buildRef,
      buildDigest: otherBuild.buildDigest,
      implementationSetDigest: otherBuild.implementationSetDigest,
    });
    inputDependencies.set(input, {
      ...dependencies,
      targetIdentities: {
        async resolveTarget() {
          return structuredClone(otherBuild);
        },
      },
    });

    expect((await evaluateOutcomeClaimGate(input)).reasons).toContain(
      "TARGET_BUILD_MISMATCH"
    );
  });

  it("treats malformed human approval as absent instead of throwing", async () => {
    const input = await approvedInput([await evidence()]);
    input.humanAdequacyApproval = {
      demoClaimContextDigest: "",
      reviewedContext: undefined,
      reviewerRef: "",
      reviewedAt: "not-a-time",
    } as unknown as NonNullable<OutcomeClaimGateInput["humanAdequacyApproval"]>;

    expect((await evaluateOutcomeClaimGate(input)).reasons).toContain(
      "HUMAN_ADEQUACY_NOT_APPROVED"
    );
  });
});
