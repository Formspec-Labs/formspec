/** @filedesc Non-bypassable schema and cross-document lint preflight. */

import {
  canonicalJson,
  canonicalJsonEqual,
  sha256Digest,
} from "./canonical.js";
import { lintOutcomeVerificationCase } from "./lint.js";
import {
  digestOutcomeSpecificationRuleIndex,
  OUTCOME_V01_SPECIFICATION_RULE_INDEX,
} from "./rule-index.js";
import type {
  ImplementationIdentity,
  OutcomeLintActionPlan,
  OutcomeLintClearance,
  OutcomeLintClearanceDependencies,
  OutcomeLintContext,
  OutcomeLintFinding,
  OutcomeOwnerFactsPort,
  OutcomeResolvedLintContext,
  OutcomeSchemaValidationPort,
  OutcomeVerificationCase,
  SourcePin,
} from "./types.js";

const issuedClearances = new WeakSet<object>();
const clearanceActionPlans = new WeakMap<
  object,
  readonly OutcomeLintActionPlan[]
>();

export class OutcomeLintClearanceError extends Error {
  readonly findings: readonly OutcomeLintFinding[];

  constructor(message: string, findings: readonly OutcomeLintFinding[] = []) {
    super(message);
    this.name = "OutcomeLintClearanceError";
    this.findings = findings;
  }
}

function sorted<T>(values: readonly T[]): T[] {
  return [...values].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right))
  );
}

export function digestOutcomeSourceSet(
  sources: readonly SourcePin[]
): Promise<string> {
  return sha256Digest(
    sorted(
      sources.map((source) => ({
        artifactRef: source.artifactRef,
        artifactDigest: source.artifactDigest,
      }))
    )
  );
}

async function lintContextDigest(
  context: OutcomeResolvedLintContext,
  schemaValidation: OutcomeSchemaValidationPort,
  verifier: ImplementationIdentity,
  ownerFacts: OutcomeOwnerFactsPort,
  specificationRuleIndexDigest: string,
  schemaReceipts: readonly {
    kind: "case" | "source";
    artifactRef: string;
    artifactDigest: string;
    schemaId: string;
  }[]
): Promise<string> {
  return sha256Digest({
    schemaValidator: schemaValidation.identity,
    verifier,
    ownerFacts: ownerFacts.identity,
    specificationRuleIndexDigest,
    schemaReceipts: sorted(schemaReceipts),
    specificationRules: sorted(context.specificationRules),
    supportedStepKinds: sorted(context.supportedStepKinds),
    supportedObservationKinds: sorted(context.supportedObservationKinds),
    semanticControlBindings: sorted(context.semanticControlBindings),
    experienceUnitBindings: sorted(context.experienceUnitBindings),
    subjectNeedBindings: sorted(context.subjectNeedBindings),
    appArtifactBindings: sorted(context.appArtifactBindings),
    actionPlans: sorted(context.actionPlans),
  });
}

async function clearanceDigest(input: {
  caseDigest: string;
  sourceSetDigest: string;
  lintContextDigest: string;
  verifierImplementationDigest: string;
  specificationRuleIndexDigest: string;
  ownerFactsImplementationDigest: string;
  actionPlanSetDigest: string;
}): Promise<string> {
  return sha256Digest(input);
}

export async function issueOutcomeLintClearance(
  input: {
    caseDocument: OutcomeVerificationCase;
    context: OutcomeLintContext;
  },
  dependencies: OutcomeLintClearanceDependencies
): Promise<OutcomeLintClearance> {
  const caseDigest = await sha256Digest(input.caseDocument);
  const schemaReceipts = [];
  const caseSchema = await dependencies.schemaValidation.validate({
    kind: "case",
    artifactRef: input.caseDocument.id,
    document: input.caseDocument,
  });
  if (!caseSchema.valid || caseSchema.schemaId.length === 0) {
    throw new OutcomeLintClearanceError(
      `case schema validation failed: ${(caseSchema.diagnostics ?? []).join(
        "; "
      )}`
    );
  }
  schemaReceipts.push({
    kind: "case" as const,
    artifactRef: input.caseDocument.id,
    artifactDigest: caseDigest,
    schemaId: caseSchema.schemaId,
  });

  for (const source of input.context.sources) {
    const actualDigest = await sha256Digest(source.document);
    if (actualDigest !== source.artifactDigest) {
      throw new OutcomeLintClearanceError(
        `paired source ${source.artifactRef} digest does not match its document`
      );
    }
    const result = await dependencies.schemaValidation.validate({
      kind: "source",
      artifactRef: source.artifactRef,
      document: source.document,
    });
    if (!result.valid || result.schemaId.length === 0) {
      throw new OutcomeLintClearanceError(
        `source schema validation failed for ${source.artifactRef}: ${(
          result.diagnostics ?? []
        ).join("; ")}`
      );
    }
    schemaReceipts.push({
      kind: "source" as const,
      artifactRef: source.artifactRef,
      artifactDigest: source.artifactDigest,
      schemaId: result.schemaId,
    });
  }

  const ownerResolution = await dependencies.ownerFacts.deriveFacts({
    caseDocument: input.caseDocument,
    sources: input.context.sources,
  });
  const sourceResolutionMatches =
    ownerResolution.sources.length === input.context.sources.length &&
    input.context.sources.every((source) => {
      const matches = ownerResolution.sources.filter(
        (candidate) =>
          candidate.artifactRef === source.artifactRef &&
          candidate.artifactDigest === source.artifactDigest &&
          canonicalJsonEqual(candidate.document, source.document)
      );
      return matches.length === 1;
    });
  if (!sourceResolutionMatches) {
    throw new OutcomeLintClearanceError(
      "trusted owner facts did not resolve the exact paired source set"
    );
  }
  const specificationRuleIndexDigest =
    await digestOutcomeSpecificationRuleIndex();
  const lintContext: OutcomeResolvedLintContext = {
    ...input.context,
    ...ownerResolution,
    specificationRules: [...OUTCOME_V01_SPECIFICATION_RULE_INDEX],
    caseDigest,
    currentCaseDigest: caseDigest,
  };
  const findings = lintOutcomeVerificationCase(input.caseDocument, lintContext);
  if (findings.length > 0) {
    throw new OutcomeLintClearanceError(
      "cross-document outcome lint failed",
      findings
    );
  }
  const sourceSetDigest = await digestOutcomeSourceSet(lintContext.sources);
  const contextDigest = await lintContextDigest(
    lintContext,
    dependencies.schemaValidation,
    dependencies.verifier,
    dependencies.ownerFacts,
    specificationRuleIndexDigest,
    schemaReceipts
  );
  const actionPlanSetDigest = await sha256Digest({
    ownerFacts: dependencies.ownerFacts.identity,
    plans: sorted(lintContext.actionPlans),
  });
  const digestFacts = {
    caseDigest,
    sourceSetDigest,
    lintContextDigest: contextDigest,
    verifierImplementationDigest: dependencies.verifier.digest,
    specificationRuleIndexDigest,
    ownerFactsImplementationDigest: dependencies.ownerFacts.identity.digest,
    actionPlanSetDigest,
  };
  const clearance = {
    ...digestFacts,
    clearanceDigest: await clearanceDigest(digestFacts),
  } as OutcomeLintClearance;
  issuedClearances.add(clearance);
  clearanceActionPlans.set(clearance, structuredClone(lintContext.actionPlans));
  return clearance;
}

export async function validateOutcomeLintClearance(
  clearance: OutcomeLintClearance,
  expected: {
    caseDigest: string;
    sources?: readonly SourcePin[];
    verifierImplementationDigest?: string;
  }
): Promise<boolean> {
  if (
    !issuedClearances.has(clearance) ||
    clearance.caseDigest !== expected.caseDigest ||
    (expected.verifierImplementationDigest !== undefined &&
      clearance.verifierImplementationDigest !==
        expected.verifierImplementationDigest) ||
    clearance.clearanceDigest !==
      (await clearanceDigest({
        caseDigest: clearance.caseDigest,
        sourceSetDigest: clearance.sourceSetDigest,
        lintContextDigest: clearance.lintContextDigest,
        verifierImplementationDigest: clearance.verifierImplementationDigest,
        specificationRuleIndexDigest: clearance.specificationRuleIndexDigest,
        ownerFactsImplementationDigest:
          clearance.ownerFactsImplementationDigest,
        actionPlanSetDigest: clearance.actionPlanSetDigest,
      }))
  ) {
    return false;
  }
  return expected.sources === undefined
    ? true
    : clearance.sourceSetDigest ===
        (await digestOutcomeSourceSet(expected.sources));
}

export function actionPlansForOutcomeLintClearance(
  clearance: OutcomeLintClearance
): readonly OutcomeLintActionPlan[] | undefined {
  const plans = clearanceActionPlans.get(clearance);
  return plans === undefined ? undefined : structuredClone(plans);
}
