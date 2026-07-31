import { describe, expect, it, vi } from "vitest";

import {
  digestRunnerAdmissionContext,
  deriveActionInvocationId,
  deriveOutcomeReportId,
  generateOutcomeVerificationReport,
  OutcomeRunnerError,
  issueOutcomeLintClearance,
  runOutcomeVerificationCase as executeOutcomeCase,
  sha256Digest,
  type OutcomeRunnerPorts,
  type OutcomeRunBindingPort,
  type OutcomeStepKind,
  type OutcomeVerificationCase,
  type RunnerAdmissionContext,
} from "../src/index.js";
import {
  actionControl,
  admission,
  boundary,
  caseDocument,
  digest,
  digests,
  fieldControl,
  fixtureLintClearance,
  fixtureLintContext,
  fixtureOwnerFacts,
  fixtureRunBindings,
  fixtureResolvedTarget,
  fixtureSchemaValidation,
  fixtureTargetIdentities,
  fixtureVerifier,
  pairedSources,
  refs,
} from "./fixtures.js";

function ownerPlanning(
  durable = false,
  effects: Array<{
    index: number;
    type:
      | "mappingExecution"
      | "ledgerAppend"
      | "handoffAssembly"
      | "evidenceRequest"
      | "hostEvent"
      | "browserResource";
    durable: boolean;
  }> = [{ index: 0, type: "hostEvent", durable }]
): { effects: typeof effects } {
  return { effects };
}

function runBindingPort(
  _bindings = new Map<string, string>()
): OutcomeRunBindingPort {
  return fixtureRunBindings();
}

async function runCase(
  input: {
    caseDocument: OutcomeVerificationCase;
    admission: RunnerAdmissionContext | undefined;
    ports: OutcomeRunnerPorts;
  },
  dependencies: {
    ownerPlanning?: ReturnType<typeof ownerPlanning>;
    runBindings?: OutcomeRunBindingPort;
    supportedStepKinds?: readonly OutcomeStepKind[];
  } = {}
) {
  const lintContext = fixtureLintContext();
  if (dependencies.ownerPlanning) {
    lintContext.actionPlans[0]!.effects = dependencies.ownerPlanning.effects;
  }
  const lintClearance = await issueOutcomeLintClearance(
    {
      caseDocument: input.caseDocument,
      context: lintContext,
    },
    {
      schemaValidation: fixtureSchemaValidation,
      verifier: fixtureVerifier,
      ownerFacts: fixtureOwnerFacts(lintContext),
    }
  );
  return executeOutcomeCase(
    {
      caseDocument: input.caseDocument,
      admission: input.admission,
      lintClearance,
    },
    {
      targetIdentities: fixtureTargetIdentities,
      runBindings: dependencies.runBindings ?? runBindingPort(),
      ports: input.ports,
      supportedStepKinds: dependencies.supportedStepKinds ?? [
        "open-route",
        "set-item",
        "activate-control",
        "checkpoint",
      ],
      clock: { now: () => boundary.startedAt },
    }
  );
}

function ports(
  options: {
    activationRevision?: number;
    setResponseIds?: string[];
    setResponseRevisions?: number[];
  } = {}
) {
  const calls: string[] = [];
  let setCall = 0;
  const implementation: OutcomeRunnerPorts = {
    openRoute: vi.fn<OutcomeRunnerPorts["openRoute"]>(async (step) => {
      calls.push("open-route");
      return {
        id: "binding:open",
        stepId: step.id,
        kind: "open-route",
        surfaceRef: step.surfaceRef,
        surfaceDigest: step.surfaceDigest,
        routeId: step.routeId,
        routeInstanceId: "route-instance:1",
        renderInstanceId: "render:1",
        dataSourceRequestIds: ["request:1"],
      };
    }),
    setItem: vi.fn<OutcomeRunnerPorts["setItem"]>(
      async (step, renderBinding) => {
        calls.push("set-item");
        const call = setCall;
        setCall += 1;
        return {
          id: "binding:set",
          stepId: step.id,
          kind: "set-item",
          routeInstanceId: renderBinding.routeInstanceId,
          renderInstanceId: renderBinding.renderInstanceId,
          control: step.control,
          definitionRef: step.definitionRef,
          definitionDigest: step.definitionDigest,
          path: step.path,
          responseId: options.setResponseIds?.[call] ?? "response:1",
          responseRevision: options.setResponseRevisions?.[call] ?? call + 1,
        };
      }
    ),
    activateControl: vi.fn<OutcomeRunnerPorts["activateControl"]>(
      async (step, renderBinding, responseBinding, invocationId) => {
        calls.push("activate-control");
        return {
          id: "binding:activate",
          stepId: step.id,
          kind: "activate-control",
          routeInstanceId: renderBinding.routeInstanceId,
          renderInstanceId: renderBinding.renderInstanceId,
          control: step.control,
          actionsRef: step.actionsRef,
          actionsDigest: step.actionsDigest,
          actionId: step.actionId,
          invocationId,
          responseId: responseBinding.responseId,
          responseRevision: options.activationRevision ?? 2,
          effects: [
            {
              index: 0,
              type: "hostEvent",
              status: "succeeded",
              outcomeRef: "event:1",
            },
          ],
        };
      }
    ),
    checkpoint: vi.fn<OutcomeRunnerPorts["checkpoint"]>(
      async (step, priorBindings) => {
        calls.push("checkpoint");
        return {
          binding: {
            id: "binding:checkpoint",
            stepId: step.id,
            kind: "checkpoint",
            boundary,
            includedBindingRefs: priorBindings.map((binding) => binding.id),
          },
          observations: [],
        };
      }
    ),
  };
  return { implementation, calls };
}

function allPortCalls(portSet: OutcomeRunnerPorts): number {
  return Object.values(portSet).reduce(
    (total, port) =>
      total + ((port as ReturnType<typeof vi.fn>).mock?.calls.length ?? 0),
    0
  );
}

describe("runOutcomeVerificationCase admission", () => {
  it("makes zero port calls without admission", async () => {
    const portSet = ports().implementation;
    await expect(
      runCase({
        caseDocument,
        admission: undefined,
        ports: portSet,
      })
    ).rejects.toMatchObject({ code: "ADMISSION_REQUIRED" });
    expect(allPortCalls(portSet)).toBe(0);
  });

  it("rejects incomplete or credential-bearing admission shapes", async () => {
    const incomplete = await admission();
    delete (
      incomplete as unknown as {
        principal?: unknown;
      }
    ).principal;
    const incompletePorts = ports().implementation;
    await expect(
      runCase({
        caseDocument,
        admission: incomplete,
        ports: incompletePorts,
      })
    ).rejects.toMatchObject({ code: "ADMISSION_INVALID" });
    expect(allPortCalls(incompletePorts)).toBe(0);

    const credentialBearing = (await admission()) as RunnerAdmissionContext & {
      credential: string;
    };
    credentialBearing.credential = "must-not-enter-the-runner";
    const credentialPorts = ports().implementation;
    await expect(
      runCase({
        caseDocument,
        admission: credentialBearing,
        ports: credentialPorts,
      })
    ).rejects.toMatchObject({ code: "ADMISSION_INVALID" });
    expect(allPortCalls(credentialPorts)).toBe(0);
  });

  it("makes zero execution calls for a case digest conflict", async () => {
    const context = await admission();
    context.caseDigest = digests.app;
    context.admissionDigest = await digestRunnerAdmissionContext(context);
    const portSet = ports().implementation;
    await expect(
      runCase({
        caseDocument,
        admission: context,
        ports: portSet,
      })
    ).rejects.toMatchObject({ code: "CASE_DIGEST_MISMATCH" });
    expect(allPortCalls(portSet)).toBe(0);
  });

  it.each([
    "mappingExecution",
    "ledgerAppend",
    "handoffAssembly",
    "evidenceRequest",
  ] as const)(
    "rejects durable %s before the first executing step",
    async (type) => {
      const document = structuredClone(caseDocument);
      const actionExpectation = document.expectedObservations.find(
        (expectation) => expectation.kind === "action-invocation"
      );
      if (actionExpectation?.kind === "action-invocation") {
        actionExpectation.effects[0]!.type = type;
      }
      const context = await admission(document);
      const portSet = ports().implementation;
      await expect(
        runCase(
          {
            caseDocument: document,
            admission: context,
            ports: portSet,
          },
          {
            ownerPlanning: ownerPlanning(false, [
              { index: 0, type, durable: true },
            ]),
          }
        )
      ).rejects.toMatchObject({ code: "DURABLE_EFFECT_UNSUPPORTED" });
      expect(allPortCalls(portSet)).toBe(0);
    }
  );

  it("rejects a trusted durable classification mismatch before execution", async () => {
    const portSet = ports().implementation;
    await expect(
      runCase(
        {
          caseDocument,
          admission: await admission(),
          ports: portSet,
        },
        {
          ownerPlanning: ownerPlanning(true),
        }
      )
    ).rejects.toMatchObject({ code: "ACTION_PLAN_MISMATCH" });
    expect(allPortCalls(portSet)).toBe(0);
  });

  it("classifies an unsupported selected-runner step and consumes the run binding", async () => {
    const lintContext = fixtureLintContext();
    const lintClearance = await issueOutcomeLintClearance(
      { caseDocument, context: lintContext },
      {
        schemaValidation: fixtureSchemaValidation,
        verifier: fixtureVerifier,
        ownerFacts: fixtureOwnerFacts(lintContext),
      }
    );
    const runBindings = runBindingPort();
    const runnerAdmission = await admission();
    const portSet = ports().implementation;
    const run = await executeOutcomeCase(
      { caseDocument, admission: runnerAdmission, lintClearance },
      {
        targetIdentities: fixtureTargetIdentities,
        runBindings,
        ports: portSet,
        supportedStepKinds: ["open-route"],
        clock: { now: () => boundary.startedAt },
      }
    );

    expect(run.bindings).toEqual([]);
    expect(run.observations).toEqual([]);
    expect(allPortCalls(portSet)).toBe(0);

    const report = await generateOutcomeVerificationReport(
      {
        case: caseDocument,
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
      },
      {
        clock: { now: () => "2026-07-31T12:00:11.000Z" },
        runBindings,
      }
    );
    expect(report.conclusion).toBe("indeterminate");
    expect(
      report.results.every((result) => result.reasonCode === "MISSING_EVIDENCE")
    ).toBe(true);

    await expect(
      executeOutcomeCase(
        { caseDocument, admission: runnerAdmission, lintClearance },
        {
          targetIdentities: fixtureTargetIdentities,
          runBindings,
          ports: ports().implementation,
          supportedStepKinds: ["open-route"],
          clock: { now: () => boundary.startedAt },
        }
      )
    ).rejects.toMatchObject({ code: "RUN_BINDING_CONFLICT" });
  });

  it("atomically binds a new run and rejects every reused runId", async () => {
    const bindings = new Map<string, string>();
    const custody = runBindingPort(bindings);
    const context = await admission();
    await expect(
      runCase(
        {
          caseDocument,
          admission: context,
          ports: ports().implementation,
        },
        { runBindings: custody }
      )
    ).resolves.toBeDefined();
    const reusedPorts = ports().implementation;
    await expect(
      runCase(
        {
          caseDocument,
          admission: context,
          ports: reusedPorts,
        },
        { runBindings: custody }
      )
    ).rejects.toMatchObject({ code: "RUN_BINDING_CONFLICT" });
    expect(allPortCalls(reusedPorts)).toBe(0);

    const other = structuredClone(caseDocument);
    other.id = "case:other";
    const otherDigest = await sha256Digest(other);
    const otherAdmission = await admission();
    otherAdmission.caseDigest = otherDigest;
    otherAdmission.admissionDigest = await digestRunnerAdmissionContext(
      otherAdmission
    );
    const otherPorts = ports().implementation;
    await expect(
      runCase(
        {
          caseDocument: other,
          admission: otherAdmission,
          ports: otherPorts,
        },
        { runBindings: custody }
      )
    ).rejects.toMatchObject({ code: "RUN_BINDING_CONFLICT" });
    expect(allPortCalls(otherPorts)).toBe(0);
  });

  it("admits at most one of two concurrent conflicting case bindings", async () => {
    const custody = runBindingPort(new Map());
    const other = structuredClone(caseDocument);
    other.id = "case:concurrent-other";
    const otherAdmission = await admission();
    otherAdmission.caseDigest = await sha256Digest(other);
    otherAdmission.admissionDigest = await digestRunnerAdmissionContext(
      otherAdmission
    );
    const basePorts = ports().implementation;
    const otherPorts = ports().implementation;
    const results = await Promise.allSettled([
      runCase(
        {
          caseDocument,
          admission: await admission(),
          ports: basePorts,
        },
        { runBindings: custody }
      ),
      runCase(
        {
          caseDocument: other,
          admission: otherAdmission,
          ports: otherPorts,
        },
        { runBindings: custody }
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(rejected?.reason).toMatchObject({
      code: "RUN_BINDING_CONFLICT",
    });
    expect(
      [allPortCalls(basePorts), allPortCalls(otherPorts)].filter(
        (count) => count === 0
      )
    ).toHaveLength(1);
  });

  it("rejects production-like targets and incomplete Action plans before execution", async () => {
    const targetContext = await admission();
    (targetContext.target as { class: string }).class = "production";
    const targetPorts = ports().implementation;
    await expect(
      runCase({
        caseDocument,
        admission: targetContext,
        ports: targetPorts,
      })
    ).rejects.toMatchObject({ code: "ADMISSION_INVALID" });
    expect(allPortCalls(targetPorts)).toBe(0);

    const planPorts = ports().implementation;
    await expect(
      runCase(
        {
          caseDocument,
          admission: await admission(),
          ports: planPorts,
        },
        { ownerPlanning: ownerPlanning(false, []) }
      )
    ).rejects.toMatchObject({
      name: "OutcomeLintClearanceError",
      findings: [
        expect.objectContaining({
          code: "OUTCOME_EFFECT_TRACE_INCOMPLETE",
        }),
      ],
    });
    expect(allPortCalls(planPorts)).toBe(0);
  });

  it("rejects an Action paired to a Response from another rendered route", async () => {
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
    const caseDigest = await sha256Digest(document);
    const context = await admission();
    context.caseDigest = caseDigest;
    context.admissionDigest = await digestRunnerAdmissionContext(context);
    const portSet = ports().implementation;

    const rejected = await runCase({
      caseDocument: document,
      admission: context,
      ports: portSet,
    }).catch((error: unknown) => error);
    expect(rejected).toMatchObject({
      name: "OutcomeLintClearanceError",
    });
    expect(
      (rejected as { findings: Array<{ code: string }> }).findings
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OUTCOME_RESPONSE_RENDER_MISMATCH",
        }),
      ])
    );
    expect(allPortCalls(portSet)).toBe(0);
  });

  it("verifies the sanitized admission digest before execution", async () => {
    const context = await admission();
    context.admissionDigest = digests.app;
    const portSet = ports().implementation;
    await expect(
      runCase({
        caseDocument,
        admission: context,
        ports: portSet,
      })
    ).rejects.toMatchObject({ code: "ADMISSION_DIGEST_MISMATCH" });
    expect(allPortCalls(portSet)).toBe(0);
  });

  it("keeps caller authorization separate from selected-runner capability", async () => {
    const runBindings = runBindingPort();
    const narrowed = await admission();
    narrowed.admittedStepKinds = ["open-route", "set-item", "checkpoint"];
    narrowed.admissionDigest = await digestRunnerAdmissionContext(narrowed);
    const deniedPorts = ports().implementation;

    await expect(
      runCase(
        {
          caseDocument,
          admission: narrowed,
          ports: deniedPorts,
        },
        { runBindings }
      )
    ).rejects.toMatchObject({ code: "STEP_NOT_ADMITTED" });
    expect(allPortCalls(deniedPorts)).toBe(0);

    await expect(
      runCase(
        {
          caseDocument,
          admission: await admission(),
          ports: ports().implementation,
        },
        { runBindings }
      )
    ).resolves.toBeDefined();
  });

  it("binds admitted step kinds into the sanitized admission digest", async () => {
    const context = await admission();
    context.admittedStepKinds = ["open-route"];
    const portSet = ports().implementation;

    await expect(
      runCase({
        caseDocument,
        admission: context,
        ports: portSet,
      })
    ).rejects.toMatchObject({ code: "ADMISSION_DIGEST_MISMATCH" });
    expect(allPortCalls(portSet)).toBe(0);
  });
});

describe("runOutcomeVerificationCase execution", () => {
  it("uses only semantic control ports and records owner-returned bindings", async () => {
    const context = await admission();
    const { implementation, calls } = ports();
    const outcome = await runCase({
      caseDocument,
      admission: context,
      ports: implementation,
    });

    expect(calls).toEqual([
      "open-route",
      "set-item",
      "activate-control",
      "checkpoint",
    ]);
    expect(Object.keys(implementation)).toEqual([
      "openRoute",
      "setItem",
      "activateControl",
      "checkpoint",
    ]);
    expect(outcome.bindings.map((binding) => binding.id)).toEqual([
      "binding:open",
      "binding:set",
      "binding:activate",
      "binding:checkpoint",
    ]);
    expect(
      outcome.bindings[0]?.kind === "open-route"
        ? outcome.bindings[0].dataSourceRequestIds
        : undefined
    ).toEqual(["request:1"]);
  });

  it("derives a target-scoped deterministic activation identity", async () => {
    const context = await admission();
    const firstPorts = ports().implementation;
    const secondPorts = ports().implementation;
    const first = await runCase({
      caseDocument,
      admission: context,
      ports: firstPorts,
    });
    const second = await runCase({
      caseDocument,
      admission: context,
      ports: secondPorts,
    });
    const firstBinding = first.bindings.find(
      (binding) => binding.kind === "activate-control"
    );
    const secondBinding = second.bindings.find(
      (binding) => binding.kind === "activate-control"
    );
    expect(
      firstBinding?.kind === "activate-control"
        ? firstBinding.invocationId
        : undefined
    ).toBe(
      secondBinding?.kind === "activate-control"
        ? secondBinding.invocationId
        : undefined
    );
    expect(
      firstBinding?.kind === "activate-control"
        ? firstBinding.invocationId
        : undefined
    ).toBe(
      await deriveActionInvocationId({
        targetIdentityDigest: first.target.targetIdentityDigest,
        caseDigest: context.caseDigest,
        runId: context.runId,
        stepId: "activate",
        actionsDigest: digests.actions,
        actionId: "submit",
      })
    );

    const base = {
      targetIdentityDigest: (await fixtureResolvedTarget())
        .targetIdentityDigest,
      caseDigest: context.caseDigest,
      runId: context.runId,
      stepId: "activate",
      actionsDigest: digests.actions,
      actionId: "submit",
    };
    const baseId = await deriveActionInvocationId(base);
    for (const changed of [
      { ...base, caseDigest: digests.app },
      { ...base, targetIdentityDigest: digest("6") },
      { ...base, runId: "run:other" },
      { ...base, stepId: "activate-other" },
      { ...base, actionsDigest: digests.definition },
      { ...base, actionId: "other" },
    ]) {
      expect(await deriveActionInvocationId(changed)).not.toBe(baseId);
    }

    const reportId = await deriveOutcomeReportId({
      targetIdentityDigest: base.targetIdentityDigest,
      runId: base.runId,
      caseDigest: base.caseDigest,
    });
    expect(
      await deriveOutcomeReportId({
        targetIdentityDigest: digest("6"),
        runId: base.runId,
        caseDigest: base.caseDigest,
      })
    ).not.toBe(reportId);
  });

  it("allows an owner to advance the Response revision but rejects regression", async () => {
    await expect(
      runCase({
        caseDocument,
        admission: await admission(),
        ports: ports({ activationRevision: 3 }).implementation,
      })
    ).resolves.toBeDefined();

    await expect(
      runCase({
        caseDocument,
        admission: await admission(),
        ports: ports({ activationRevision: 0 }).implementation,
      })
    ).rejects.toMatchObject({ code: "OWNER_BINDING_INVALID" });
  });

  it("keeps all values for one rendered Definition on one monotonic Response", async () => {
    const document = structuredClone(caseDocument);
    const secondSet = structuredClone(document.procedure[1]!);
    if (secondSet.kind !== "set-item") {
      throw new Error("fixture set step is missing");
    }
    secondSet.id = "set-again";
    document.procedure.splice(2, 0, secondSet);
    const activate = document.procedure.find(
      (step) => step.kind === "activate-control"
    );
    if (activate?.kind !== "activate-control") {
      throw new Error("fixture activate step is missing");
    }
    activate.responseStepRef = secondSet.id;
    const caseDigest = await sha256Digest(document);
    const context = await admission();
    context.caseDigest = caseDigest;
    context.admissionDigest = await digestRunnerAdmissionContext(context);

    await expect(
      runCase({
        caseDocument: document,
        admission: context,
        ports: ports({
          setResponseIds: ["response:1", "response:other"],
        }).implementation,
      })
    ).rejects.toMatchObject({ code: "OWNER_BINDING_INVALID" });

    await expect(
      runCase({
        caseDocument: document,
        admission: context,
        ports: ports({
          setResponseIds: ["response:1", "response:1"],
          setResponseRevisions: [2, 1],
        }).implementation,
      })
    ).rejects.toMatchObject({ code: "OWNER_BINDING_INVALID" });
  });

  it("runs an unrelated case through the unchanged generic ports", async () => {
    const unrelated = structuredClone(caseDocument);
    unrelated.id = "case:unrelated-room-schedule";
    unrelated.procedure[0] = {
      id: "open",
      kind: "open-route",
      surfaceRef: refs.surface,
      surfaceDigest: digests.surface,
      routeId: "route",
    };
    const unrelatedDigest = await sha256Digest(unrelated);
    const context = await admission();
    context.caseDigest = unrelatedDigest;
    context.admissionDigest = await digestRunnerAdmissionContext(context);
    const result = await runCase({
      caseDocument: unrelated as OutcomeVerificationCase,
      admission: context,
      ports: ports().implementation,
    });
    expect(result.caseDigest).toBe(unrelatedDigest);
  });

  it("exposes stable error codes", () => {
    expect(
      new OutcomeRunnerError("ADMISSION_REQUIRED", "missing")
    ).toMatchObject({ name: "OutcomeRunnerError", code: "ADMISSION_REQUIRED" });
  });
});
