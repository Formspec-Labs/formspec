//! Formspec Definition Evaluator — 4-phase batch processor.
//!
//! ## Layout
//! The main path is [`pipeline::evaluate_definition_full_with_instances_and_context`]:
//! 1. [`mod@rebuild`] — definition → item tree, initial values, repeat expansion, wildcard binds
//! 2. [`mod@recalculate`] — relevance, required, readonly, variables, calculate ([`recalculate()`])
//! 3. [`mod@revalidate`] — required/type/constraint, extensions, shapes ([`revalidate()`])
//! 4. [`mod@nrb`] — output shaping for non-relevant fields
//!
//! Cross-cutting: [`mod@convert`] (path resolution), private `fel_json` (money-aware JSON→`Value` for env fields),
//! private `runtime_seed` (prePopulate / previous non-relevant). [`mod@screener_eval`] evaluates standalone screener documents.
//!
//! ## Documentation
//!
//! - Human overview: crate `README.md` (phases, API map, context).
//! - API reference: `cargo doc -p formspec-eval --no-deps --open`.
//! - Markdown API export: `docs/rustdoc-md/API.md` (regenerate with `npm run docs:formspec-eval`).
#![warn(missing_docs)]
#![warn(clippy::missing_docs_in_private_items)]

mod fel_json;
mod value_predicate;

pub mod convert;
pub mod nrb;
pub mod rebuild;
pub mod recalculate;
pub mod revalidate;
pub mod screener_eval;
pub mod types;

mod eval_json;
mod pipeline;
mod registry_constraints;
mod runtime_seed;

pub use convert::resolve_value_by_path;
pub use eval_json::{
    EvalHostContextBundle, eval_context_from_json_object, eval_host_context_from_json_map,
    evaluation_result_to_json_value, evaluation_result_to_json_value_styled,
};
pub use nrb::{apply_nrb, resolve_nrb};
pub use pipeline::{
    evaluate_definition, evaluate_definition_full, evaluate_definition_full_with_context,
    evaluate_definition_full_with_instances, evaluate_definition_full_with_instances_and_context,
    evaluate_definition_with_context, evaluate_definition_with_trigger,
    evaluate_definition_with_trigger_and_context,
};
pub use rebuild::parse_variables;
pub use rebuild::{expand_repeat_instances, expand_wildcard_path, rebuild_item_tree};
pub use recalculate::{recalculate, topo_sort_variables};
pub use registry_constraints::extension_constraints_from_registry_documents;
pub use revalidate::revalidate;
pub use screener_eval::evaluate_screener_document;
pub use types::{
    AnswerInput, AnswerState, DeterminationRecord, EvalContext, EvalTrigger, EvaluationResult,
    ExtensionConstraint, InputEntry, ItemInfo, NrbMode, OverrideBlock, PhaseResult, RouteResult,
    ScreenerRef, ValidationResult, ValidityBlock, VariableDef, WhitespaceMode, parse_answer_state,
};
