//! Bidirectional mapping engine for transforming data between formats.
//!
//! Executes mapping rules to transform data between Formspec response format and external formats
//! (forward: Formspec → external, reverse: external → Formspec). Implementation is split across
//! `types`, `path`, `env`, `transforms`, `engine`, and `document`.

mod document;
mod engine;
mod engine_helpers;
mod env;
mod parse;
mod path;
mod transforms;
mod types;
mod wire_json;

#[cfg(test)]
mod tests;

pub use document::execute_mapping_doc;
pub use engine::execute_mapping;
pub use parse::{
    parse_coerce_type, parse_mapping_direction_field, parse_mapping_document_from_value,
    parse_mapping_rules_from_value,
};
pub use types::*;
pub use wire_json::{
    mapping_direction_wire, mapping_result_to_json_value, parse_mapping_direction_wire,
};
