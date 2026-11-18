//! Phase 1: Rebuild — build the item tree from a definition JSON.

mod item_tree;
mod nested_data;
mod repeat_data;
mod repeat_expand;
mod repeat_references;

#[cfg(test)]
mod tests;

pub use item_tree::{parse_variables, rebuild_item_tree};
pub(crate) use nested_data::flatten_response_data;
#[cfg(test)]
use repeat_data::detect_repeat_count;
pub use repeat_data::expand_wildcard_path;
pub use repeat_expand::expand_repeat_instances;
pub(crate) use repeat_expand::expand_repeat_instances_counted;
pub(crate) use repeat_references::check as check_repeat_references;
