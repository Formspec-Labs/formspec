//! Changeset dependency analysis — key extraction and connected-component grouping.
//!
//! Analyzes recorded changeset entries to determine which entries are coupled
//! by shared field keys (creates/references/targets relationships) and groups them
//! into dependency components that must be accepted or rejected together.

#![warn(missing_docs)]

pub mod extract;
pub mod graph;

pub use extract::{EntryKeys, RecordedCommand, RecordedEntry, extract_keys};
pub use graph::{DependencyGroup, compute_dependency_groups};
