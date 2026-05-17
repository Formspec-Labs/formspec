//! Core types for the Formspec evaluator.

mod definition;
pub mod determination;
mod evaluation;
mod taxonomy;
mod extensions;
mod item_tree;
mod modes;
mod paths;

pub use definition::VariableDef;
pub use determination::{
    AnswerInput, AnswerState, DeterminationRecord, InputEntry, OverrideBlock, PhaseResult,
    RouteResult, ScreenerRef, ValidityBlock, parse_answer_state,
};
pub use evaluation::{EvalContext, EvalTrigger, EvaluationResult, ValidationResult};
pub use taxonomy::{ConstraintKind, Severity, ValidationCode, ValidationSource};
pub use extensions::ExtensionConstraint;
pub use item_tree::ItemInfo;
pub use modes::{NrbMode, WhitespaceMode};

pub(crate) use paths::{
    collect_data_types, collect_mip_state, collect_non_relevant, find_item_by_path,
    find_item_by_path_mut, internal_path_to_fel_path, parent_path, resolve_qualified_repeat_refs,
    strip_indices, to_wildcard_path,
};
