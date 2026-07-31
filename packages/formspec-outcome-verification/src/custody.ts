/** @filedesc Process-local issuance guard for persisted run custody. */

import { sha256Digest } from "./canonical.js";
import type {
  OutcomeLintClearance,
  OutcomeRunCustody,
  OutcomeRunnerEvidence,
  ResolvedTargetIdentity,
  RunnerAdmissionContext,
} from "./types.js";

const issuedCustodies = new WeakSet<object>();
const consumedCustodies = new WeakSet<object>();

export async function issueOutcomeRunCustody(input: {
  receiptRef: string;
  caseDigest: string;
  admission: RunnerAdmissionContext;
  target: ResolvedTargetIdentity;
  lintClearance: OutcomeLintClearance;
  runnerEvidence: OutcomeRunnerEvidence;
}): Promise<OutcomeRunCustody> {
  const custody = {
    receiptRef: input.receiptRef,
    caseDigest: input.caseDigest,
    runId: input.admission.runId,
    admissionContextDigest: input.admission.admissionDigest,
    target: structuredClone(input.target),
    lintClearanceDigest: input.lintClearance.clearanceDigest,
    actionPlanSetDigest: input.lintClearance.actionPlanSetDigest,
    runnerEvidenceDigest: await sha256Digest(input.runnerEvidence),
  } as OutcomeRunCustody;
  issuedCustodies.add(custody);
  return custody;
}

export function consumeOutcomeRunCustody(custody: OutcomeRunCustody): boolean {
  if (!issuedCustodies.has(custody) || consumedCustodies.has(custody)) {
    return false;
  }
  consumedCustodies.add(custody);
  return true;
}
