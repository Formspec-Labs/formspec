//! Phase 1: Rebuild — build the item tree from a definition JSON.

mod expressions;
mod item_tree;
mod nested_data;
mod repeat_data;
mod repeat_expand;

#[cfg(test)]
mod tests;

pub(crate) use expressions::{ExtensionCalls, check as check_expressions};
pub use item_tree::{parse_variables, rebuild_item_tree};
pub(crate) use nested_data::{DataStep, FlatInput, UndeclaredEntry, flatten_response_data};
#[cfg(test)]
use repeat_data::detect_repeat_count;
pub use repeat_data::expand_wildcard_path;
pub use repeat_expand::expand_repeat_instances;
pub(crate) use repeat_expand::{apply_indexed_binds, expand_repeat_instances_counted};
