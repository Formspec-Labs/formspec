//! Core types for the Formspec evaluator.

mod definition;
pub mod determination;
mod evaluation;
mod extensions;
mod item_tree;
mod modes;
mod paths;
mod taxonomy;

pub use definition::VariableDef;
pub use determination::{
    AnswerInput, AnswerState, DeterminationRecord, DeterminationStatus, EliminationReason,
    InputEntry, OverrideBlock, PhaseResult, PhaseStatus, PhaseStrategy, RouteResult, ScreenerRef,
    ValidityBlock, parse_answer_state,
};
pub(crate) use evaluation::error_paths;
pub use evaluation::{
    EvalContext, EvalDiagnostic, EvalSubject, EvalTrigger, EvaluationResult, ItemText,
    ItemTextRequest, ValidationResult,
};
pub use extensions::ExtensionConstraint;
pub use item_tree::{ItemInfo, MipState, RemoteOptionSource};
pub use modes::{ExcludedValueMode, NrbMode, WhitespaceMode};
pub use taxonomy::{ConstraintKind, Severity, ValidationCode, ValidationSource};

pub(crate) use paths::{
    collect_data_types, collect_mip_state, collect_non_relevant, find_item_by_path, parent_path,
    strip_indices, to_wildcard_path,
};
