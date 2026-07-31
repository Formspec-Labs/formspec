import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { OUTCOME_V01_SPECIFICATION_RULE_INDEX } from "../src/index.js";

const authoritativeSpecByRef = new Map([
  [
    "https://formspec.org/specs/app-graph-validator",
    "../../../specs/app-graph/app-graph-validator-spec.md",
  ],
  ["https://formspec.org/specs/core", "../../../specs/core/spec.md"],
  [
    "https://formspec.org/specs/data-sources",
    "../../../specs/data-sources/data-sources-spec.md",
  ],
  [
    "https://formspec.org/specs/response-actions",
    "../../../specs/response-actions/response-actions-spec.md",
  ],
  [
    "https://formspec.org/specs/surface",
    "../../../specs/surface/surface-spec.md",
  ],
]);

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("OUTCOME_V01_SPECIFICATION_RULE_INDEX", () => {
  it("binds every indexed rule exactly once to its authoritative spec version", () => {
    const identities = new Set<string>();
    for (const rule of OUTCOME_V01_SPECIFICATION_RULE_INDEX) {
      const relativePath = authoritativeSpecByRef.get(rule.specRef);
      expect(relativePath, `unmapped spec ${rule.specRef}`).toBeDefined();
      const document = readFileSync(
        new URL(relativePath!, import.meta.url),
        "utf8"
      );
      const declarations =
        document.match(
          new RegExp(
            "Normative rule `" + escapeRegularExpression(rule.ruleId) + "`",
            "g"
          )
        ) ?? [];
      expect(declarations, rule.ruleId).toHaveLength(1);
      expect(document).toMatch(
        new RegExp(
          `^version: ${escapeRegularExpression(rule.specVersion)}$`,
          "m"
        )
      );
      identities.add(
        `${rule.specRef}\u0000${rule.specVersion}\u0000${rule.ruleId}`
      );
    }
    expect(identities).toHaveLength(
      OUTCOME_V01_SPECIFICATION_RULE_INDEX.length
    );
  });
});
