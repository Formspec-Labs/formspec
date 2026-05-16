//! WASM bindings for Formspec — exposes FEL, evaluation, assembly, mapping, and (with `lint`) linting to TS.
//!
//! All exported functions accept and return JSON strings (or simple scalars) for complex types.
//! The binding layer performs conversion only; behavior lives in `fel-core`, `formspec-core`,
//! `formspec-eval`, and (feature `lint`) `formspec-lint`.
//!
//! ## Layout
//! - `fel` — eval + analysis + path utils always; `fel-authoring`: tokenize/parse/print/rewrites/catalog
//! - `evaluate` — batch definition evaluation, screener (always in runtime WASM)
//! - `definition` — always: option sets + migrations; `definition-assembly`: `assembleDefinition`
//! - `value_coerce` — `coerceFieldValue` (always)
//! - `changeset` — changeset dependency analysis (key extraction, connected components)
//! - `document` — `document-api`: detect type, schema plan; `lint`: `lintDocument*`
//! - `mapping` — `mapping-api`
//! - `registry` — `registry-api`
//! - `changelog` — `changelog-api`
//! - `split_abi` — lockstep ABI version marker between runtime/tools artifacts
//! - `json_host` — internal JSON parse/stringify helpers
//! - `wasm_tests` — native `cargo nextest run` coverage (`#[cfg(test)]` only)

#[cfg(feature = "changelog-api")]
mod changelog;
mod changeset;
mod definition;
#[cfg(feature = "document-api")]
mod document;
mod evaluate;
mod fel;
mod json_host;
#[cfg(feature = "mapping-api")]
mod mapping;
#[cfg(feature = "registry-api")]
mod registry;
mod split_abi;
mod value_coerce;

#[cfg(test)]
mod wasm_tests;
