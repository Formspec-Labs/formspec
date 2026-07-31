/** @filedesc Verifier-owned v0.1 rule index used by safe clearance. */

import { sha256Digest } from "./canonical.js";
import type { SpecificationRule } from "./types.js";

export const OUTCOME_V01_SPECIFICATION_RULE_INDEX = Object.freeze([
  {
    specRef: "https://formspec.org/specs/app-graph-validator",
    specVersion: "1.0.0-draft.1",
    ruleId: "rendered-node.direct-need-trace",
  },
  {
    specRef: "https://formspec.org/specs/core",
    specVersion: "1.0.0-draft.1",
    ruleId: "response.snapshot-status",
  },
  {
    specRef: "https://formspec.org/specs/core",
    specVersion: "1.0.0-draft.1",
    ruleId: "validation.constraint-result",
  },
  {
    specRef: "https://formspec.org/specs/data-sources",
    specVersion: "1.0.0-draft.1",
    ruleId: "loader.qualified-result",
  },
  {
    specRef: "https://formspec.org/specs/response-actions",
    specVersion: "1.0.0-draft.1",
    ruleId: "invocation.blocking-gate",
  },
  {
    specRef: "https://formspec.org/specs/surface",
    specVersion: "0.2.0-draft.1",
    ruleId: "routing.current-route-state",
  },
  {
    specRef: "https://formspec.org/specs/surface",
    specVersion: "0.2.0-draft.1",
    ruleId: "rendering.semantic-output",
  },
] satisfies readonly SpecificationRule[]);

export function digestOutcomeSpecificationRuleIndex(): Promise<string> {
  return sha256Digest(OUTCOME_V01_SPECIFICATION_RULE_INDEX);
}
