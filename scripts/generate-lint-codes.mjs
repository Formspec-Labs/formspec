#!/usr/bin/env node

/**
 * @filedesc Generates Rust `LintCode` enum from specs/lint-codes.json (SWEEP-001).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const REGISTRY_PATH = path.join(ROOT_DIR, "specs", "lint-codes.json");
const OUT_PATH = path.join(
  ROOT_DIR,
  "crates",
  "formspec-lint",
  "src",
  "generated",
  "lint_code.rs",
);
const CHECK_MODE = process.argv.includes("--check");

function readRegistry() {
  const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  const rules = parsed.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error("specs/lint-codes.json must have a non-empty `rules` array");
  }
  return rules;
}

function variantName(code) {
  return code;
}

function generateRust(rules) {
  const codes = rules.map((r) => {
    const code = r.code;
    if (!code || !/^[EW]\d{3}$/.test(code)) {
      throw new Error(`invalid lint code: ${code}`);
    }
    return { code, pass: r.pass };
  });

  const seen = new Set();
  for (const { code } of codes) {
    if (seen.has(code)) {
      throw new Error(`duplicate lint code: ${code}`);
    }
    seen.add(code);
  }

  const variants = codes
    .map(({ code }) => `    /// Registry code \`${code}\`.\n    ${variantName(code)},`)
    .join("\n");

  const asWireArms = codes
    .map(
      ({ code }) =>
        `            LintCode::${variantName(code)} => "${code}",`,
    )
    .join("\n");

  const parseArms = codes
    .map(
      ({ code }) => `            "${code}" => Some(LintCode::${variantName(code)}),`,
    )
    .join("\n");

  const passArms = codes
    .map(
      ({ code, pass }) =>
        `            LintCode::${variantName(code)} => ${pass},`,
    )
    .join("\n");

  const allVariants = codes
    .map(({ code }) => `LintCode::${variantName(code)}`)
    .join(", ");

  return `//! AUTO-GENERATED from specs/lint-codes.json — DO NOT EDIT.
//! Regenerate: \`npm run docs:generate\` or \`node scripts/generate-lint-codes.mjs\`.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Canonical lint diagnostic code (registry-driven).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LintCode {
${variants}
}

impl LintCode {
    /// JSON / diagnostic wire string (e.g. \`"E300"\`).
    pub const fn as_wire_str(self) -> &'static str {
        match self {
${asWireArms}
        }
    }

    /// Lint pass number from the registry.
    pub const fn pass(self) -> u8 {
        match self {
${passArms}
        }
    }

    /// Parse a wire code; returns \`None\` for unknown values.
    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
${parseArms}
            _ => None,
        }
    }

    /// Every registered code (for registry consistency checks).
    pub const ALL: &'static [Self] = &[${allVariants}];
}

impl fmt::Display for LintCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_wire_str())
    }
}

impl Serialize for LintCode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for LintCode {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown lint code: {s}")))
    }
}

impl FromStr for LintCode {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse_wire(s).ok_or(())
    }
}

impl PartialEq<str> for LintCode {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for LintCode {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn lint_code_serde_round_trip() {
        let code = LintCode::E300;
        let wire = serde_json::to_value(code).unwrap();
        assert_eq!(wire, json!("E300"));
        let back: LintCode = serde_json::from_value(wire).unwrap();
        assert_eq!(back, code);
    }

    #[test]
    fn registry_variant_count_matches_json() {
        assert_eq!(LintCode::ALL.len(), ${codes.length});
    }
}
`;
}

function main() {
  const rules = readRegistry();
  const content = generateRust(rules);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

  if (CHECK_MODE) {
    if (!fs.existsSync(OUT_PATH)) {
      console.error(`missing generated file: ${OUT_PATH}`);
      process.exit(1);
    }
    const existing = fs.readFileSync(OUT_PATH, "utf8");
    if (existing !== content) {
      console.error(
        "generated lint_code.rs is stale — run: node scripts/generate-lint-codes.mjs",
      );
      process.exit(1);
    }
    return;
  }

  if (fs.existsSync(OUT_PATH)) {
    const existing = fs.readFileSync(OUT_PATH, "utf8");
    if (existing === content) {
      return;
    }
  }
  fs.writeFileSync(OUT_PATH, content);
  console.log(`wrote ${path.relative(ROOT_DIR, OUT_PATH)} (${rules.length} codes)`);
}

main();
