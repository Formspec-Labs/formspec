//! Formspec Definition Evaluator — 4-phase batch processor.
//!
//! ## Layout
//! The main path is [`pipeline::evaluate`] with [`EvalOptions`]:
//! 1. [`mod@rebuild`] — definition → item tree and repeat expansion for existing rows
//! 2. [`mod@recalculate`] — relevance, required, readonly, variables, calculate ([`recalculate()`])
//! 3. [`mod@revalidate`] — required/type/constraint, extensions, shapes ([`revalidate()`])
//! 4. [`mod@nrb`] — output shaping for non-relevant fields
//!
//! Cross-cutting: [`mod@convert`] (path resolution), private `fel_json` (money-aware JSON→`Value` for env fields),
//! private `runtime_context` (inline instances and previous non-relevant paths).
//! [`mod@screener_eval`] evaluates standalone screener documents. The optional `create`
//! feature provides separate entry points for new Responses and repeat rows.
//! [`HostFelContext`] holds one form's FEL state so a host evaluates ad-hoc expressions by Item path without
//! re-serializing the form per call.
//!
//! ## Documentation
//!
//! - Human overview: crate `README.md` (phases, API map, context).
//! - API reference: `cargo doc -p formspec-eval --no-deps --open`.
//! - Markdown API export: `docs/rustdoc-md/API.md` (regenerate with `npm run docs:formspec-eval`).
#![warn(missing_docs)]
#![warn(clippy::missing_docs_in_private_items)]

mod fel_eval;
mod fel_json;
mod value_predicate;

pub mod convert;
pub mod explanations;
pub mod host_context;
pub mod interpolation;
pub mod nrb;
pub mod rebuild;
pub mod recalculate;
pub mod revalidate;
pub mod screener_eval;
pub mod screener_qualification;
pub mod types;

mod assemble_candidate;
#[cfg(feature = "create")]
mod create;
mod eval_json;
mod eval_options;
mod output_data;
mod pipeline;
mod registry_constraints;
mod runtime_context;
mod scope;

/// Exact JSON values for text-based evaluator input and output.
pub use fel_core::exact_json;

/// Whether new-Response creation is available in this build.
pub const CREATION_COMPILED: bool = cfg!(feature = "create");

#[doc(inline)]
pub use assemble_candidate::{CandidateAssemblyError, assemble_candidate, assemble_candidate_json};

#[cfg(feature = "create")]
pub use create::{
    CreateOptions, CreateResult, CreationDiagnostic, create_repeat_row, create_response,
};

pub use convert::resolve_value_by_path;
pub use eval_json::{
    EvalHostContextBundle, eval_context_from_json_object, eval_host_context_from_json_map,
    evaluation_result_to_host_snapshot_json_value, evaluation_result_to_json_value,
    evaluation_result_to_json_value_styled, item_text_request_from_json_object,
};
pub use eval_options::EvalOptions;
pub use host_context::HostFelContext;
pub use nrb::{apply_nrb, resolve_nrb};
pub use output_data::filed_response_data_matches;
pub use pipeline::{EvaluateFiledError, PreparedDefinition, evaluate, evaluate_filed};
pub use rebuild::parse_variables;
pub use rebuild::{expand_repeat_instances, expand_wildcard_path, rebuild_item_tree};
pub use recalculate::dependency_scope::{DependencyQuery, ReadScope, definition_dependency_scopes};
pub use recalculate::recalculate;
pub use registry_constraints::extension_constraints_from_registry_documents;
pub use revalidate::revalidate;
pub use screener_eval::evaluate_screener_document;
#[doc(inline)]
pub use screener_qualification::{
    ScreenerDeterminationQualification, ScreenerQualificationRefusal,
    admit_screener_qualification_profile, qualify_screener_determination,
};
pub use types::{
    AnswerInput, AnswerState, DeterminationRecord, EvalContext, EvalDiagnostic, EvalSubject,
    EvalTrigger, EvaluationResult, ExtensionConstraint, InputEntry, ItemInfo, ItemText,
    ItemTextRequest, NrbMode, OverrideBlock, PhaseResult, RouteResult, ScreenerRef,
    ValidationResult, ValidityBlock, VariableDef, WhitespaceMode, parse_answer_state,
};
