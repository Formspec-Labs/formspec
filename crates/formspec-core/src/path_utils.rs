//! Dotted path normalization and tree item navigation by path.
//!
//! Paths use dot notation: `group.field`, `parent.child.leaf`.
//! Indices `[N]` and wildcards `[*]` are supported.

use serde_json::{Value, json};
use std::fmt;
use std::str::FromStr;

use crate::JsonWireStyle;
use crate::wire_keys::item_location_parent_key;

/// A single segment in a dotted path.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PathSegment {
    /// Exact key: `name`
    Exact(String),
    /// Wildcard: `[*]`
    Wildcard,
    /// Numeric index: `[0]`
    Indexed(usize),
    /// Special index or property (e.g., `[@index]`).
    Special(String),
}

impl PathSegment {
    /// Returns the key part of the segment if it's an Exact segment.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            PathSegment::Exact(s) => Some(s),
            _ => None,
        }
    }
}

impl fmt::Display for PathSegment {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PathSegment::Exact(s) => write!(f, "{}", s),
            PathSegment::Wildcard => write!(f, "[*]"),
            PathSegment::Indexed(i) => write!(f, "[{}]", i),
            PathSegment::Special(s) => write!(f, "[{}]", s),
        }
    }
}

/// A parsed dotted path.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct Path {
    /// The constituent segments of the path.
    pub segments: Vec<PathSegment>,
}

impl Path {
    /// Create a new empty path.
    pub fn new() -> Self {
        Self::default()
    }

    /// Parse a dotted path string into a Path object.
    /// Handles `a.b.c`, `a[0].b`, `a[*].b`, and `a[@index]`.
    pub fn parse(s: &str) -> Self {
        if s.is_empty() {
            return Self::default();
        }

        let mut segments = Vec::new();
        let mut current = String::new();
        let chars: Vec<char> = s.chars().collect();
        let mut i = 0;

        while i < chars.len() {
            match chars[i] {
                '.' => {
                    if !current.is_empty() {
                        segments.push(PathSegment::Exact(std::mem::take(&mut current)));
                    }
                    i += 1;
                }
                '[' => {
                    if !current.is_empty() {
                        segments.push(PathSegment::Exact(std::mem::take(&mut current)));
                    }
                    let start = i + 1;
                    let mut end = start;
                    while end < chars.len() && chars[end] != ']' {
                        end += 1;
                    }

                    if end < chars.len() {
                        let content: String = chars[start..end].iter().collect();
                        if content == "*" {
                            segments.push(PathSegment::Wildcard);
                        } else if let Ok(idx) = content.parse::<usize>() {
                            segments.push(PathSegment::Indexed(idx));
                        } else {
                            segments.push(PathSegment::Special(content));
                        }
                        i = end + 1;
                    } else {
                        // Unclosed bracket, treat remainder as part of current segment
                        current.push('[');
                        i += 1;
                    }
                }
                ch => {
                    current.push(ch);
                    i += 1;
                }
            }
        }

        if !current.is_empty() {
            segments.push(PathSegment::Exact(current));
        }

        Path { segments }
    }

    /// Returns the "base" path string with all indices and wildcards removed.
    /// `a[0].b[*].c` → `a.b.c`
    pub fn strip_indices(&self) -> String {
        self.segments
            .iter()
            .filter_map(|seg| match seg {
                PathSegment::Exact(s) => Some(s.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(".")
    }

    /// Returns a path string where all numeric indices are replaced with wildcards.
    /// `a[0].b[1].c` → `a[*].b[*].c`
    pub fn to_wildcard_string(&self) -> String {
        let mut result = String::new();
        for (i, seg) in self.segments.iter().enumerate() {
            if i > 0 && !matches!(seg, PathSegment::Indexed(_) | PathSegment::Wildcard | PathSegment::Special(_)) {
                result.push('.');
            }
            match seg {
                PathSegment::Exact(s) => result.push_str(s),
                PathSegment::Wildcard | PathSegment::Indexed(_) => result.push_str("[*]"),
                PathSegment::Special(s) => {
                    result.push('[');
                    result.push_str(s);
                    result.push(']');
                }
            }
        }
        result
    }

    /// Returns a path string suitable for FEL (1-based indexing for display).
    /// `a[0].b` → `a[1].b`
    pub fn to_fel_string(&self) -> String {
        let mut result = String::new();
        for (i, seg) in self.segments.iter().enumerate() {
            if i > 0 && !matches!(seg, PathSegment::Indexed(_) | PathSegment::Wildcard | PathSegment::Special(_)) {
                result.push('.');
            }
            match seg {
                PathSegment::Exact(s) => result.push_str(s),
                PathSegment::Wildcard => result.push_str("[*]"),
                PathSegment::Indexed(idx) => {
                    result.push('[');
                    result.push_str(&(idx + 1).to_string());
                    result.push(']');
                }
                PathSegment::Special(s) => {
                    result.push('[');
                    result.push_str(s);
                    result.push(']');
                }
            }
        }
        result
    }

    /// Returns the parent path as a string.
    pub fn parent_string(&self) -> String {
        if self.segments.is_empty() {
            return String::new();
        }
        let mut parent_segs = self.segments.clone();
        parent_segs.pop();
        Path { segments: parent_segs }.to_string()
    }

    /// Returns the last segment as a string (the "leaf key").
    pub fn leaf_key(&self) -> String {
        match self.segments.last() {
            Some(PathSegment::Exact(s)) => s.clone(),
            Some(seg) => seg.to_string(),
            None => String::new(),
        }
    }
}

impl FromStr for Path {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self::parse(s))
    }
}

impl fmt::Display for Path {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, seg) in self.segments.iter().enumerate() {
            if i > 0 && !matches!(seg, PathSegment::Indexed(_) | PathSegment::Wildcard | PathSegment::Special(_)) {
                write!(f, ".")?;
            }
            write!(f, "{}", seg)?;
        }
        Ok(())
    }
}

// ── Legacy compatibility helpers (to be phased out) ──────────────────

/// Strip repeat indices from a single path segment: `lineItems[0]` → `lineItems`.
pub fn normalize_path_segment(segment: &str) -> &str {
    match segment.find('[') {
        Some(idx) => &segment[..idx],
        None => segment,
    }
}

/// Strip all repeat indices from a dotted path.
/// `group[0].items[1].field` → `group.items.field`
pub fn normalize_indexed_path(path: &str) -> String {
    Path::parse(path).strip_indices()
}

/// Split a normalized dotted path into segments, filtering empties.
pub fn split_normalized_path(path: &str) -> Vec<String> {
    Path::parse(path)
        .segments
        .into_iter()
        .filter_map(|seg| match seg {
            PathSegment::Exact(s) => Some(s),
            _ => None,
        })
        .collect()
}

/// Extract the parent path from a dotted path.
/// `group.child.field` → `group.child`
/// `field` → `""`
pub fn parent_path(path: &str) -> String {
    Path::parse(path).parent_string()
}

/// Extract the last segment from a dotted path.
/// `group.child.field` → `field`
/// `field` → `field`
pub fn leaf_key(path: &str) -> String {
    Path::parse(path).leaf_key()
}

// ── Tree Navigation ──────────────────────────────────────────────────

/// A generic tree node shape for path traversal.
pub trait TreeItem {
    /// Stable segment key for this node (matches one dotted path segment).
    fn key(&self) -> &str;
    /// Child nodes for the next path segment.
    fn children(&self) -> &[Self]
    where
        Self: Sized;
}

/// A resolved position in a tree: the parent slice, index within it, and the item itself.
#[derive(Debug)]
pub struct ItemLocation<'a, T> {
    /// Sibling slice containing [`Self::item`].
    pub parent: &'a [T],
    /// Index of [`Self::item`] within `parent`.
    pub index: usize,
    /// The resolved node.
    pub item: &'a T,
}

/// Find an item by normalized dotted path, walking children at each segment.
pub fn item_at_path<'a, T: TreeItem>(items: &'a [T], path: &str) -> Option<&'a T> {
    let segments = split_normalized_path(path);
    if segments.is_empty() {
        return None;
    }

    let mut current_items = items;
    for (i, seg) in segments.iter().enumerate() {
        let found = current_items.iter().find(|item| item.key() == seg)?;
        if i == segments.len() - 1 {
            return Some(found);
        }
        current_items = found.children();
    }
    None
}

/// Resolve the location triple (parent, index, item) for a dotted path.
pub fn item_location_at_path<'a, T: TreeItem>(
    items: &'a [T],
    path: &str,
) -> Option<ItemLocation<'a, T>> {
    let segments = split_normalized_path(path);
    if segments.is_empty() {
        return None;
    }

    let mut current_items = items;
    for (i, seg) in segments.iter().enumerate() {
        let idx = current_items.iter().position(|item| item.key() == seg)?;
        let item = &current_items[idx];
        if i == segments.len() - 1 {
            return Some(ItemLocation {
                parent: current_items,
                index: idx,
                item,
            });
        }
        current_items = item.children();
    }
    None
}

// ── JSON definition item arrays (`items` tree) ──────────────────

/// Resolve an item in a JSON `items` array by dotted path (`key` / `children` shape).
pub fn json_definition_item_at_path<'a>(items: &'a [Value], path: &str) -> Option<&'a Value> {
    let segments = split_normalized_path(path);
    if segments.is_empty() {
        return None;
    }

    let mut current_items = items;
    for (index, segment) in segments.iter().enumerate() {
        let found = current_items
            .iter()
            .find(|item| item.get("key").and_then(Value::as_str) == Some(segment.as_str()))?;
        if index == segments.len() - 1 {
            return Some(found);
        }
        current_items = found.get("children").and_then(Value::as_array)?;
    }
    None
}

/// `(index, item)` within its parent `children` slice for a dotted path.
pub fn json_definition_item_location_at_path<'a>(
    items: &'a [Value],
    path: &str,
) -> Option<(usize, &'a Value)> {
    let segments = split_normalized_path(path);
    if segments.is_empty() {
        return None;
    }

    let mut current_items = items;
    for (depth, segment) in segments.iter().enumerate() {
        let index = current_items
            .iter()
            .position(|item| item.get("key").and_then(Value::as_str) == Some(segment.as_str()))?;
        let item = &current_items[index];
        if depth == segments.len() - 1 {
            return Some((index, item));
        }
        current_items = item.get("children").and_then(Value::as_array)?;
    }
    None
}

/// `itemLocationAtPath` JSON (`parentPath` / `parent_path`, …) or null.
pub fn definition_item_location_to_json_value(
    items: &[Value],
    path: &str,
    style: JsonWireStyle,
) -> Value {
    let parent_key = item_location_parent_key(style);
    match json_definition_item_location_at_path(items, path) {
        Some((index, item)) => {
            let mut m = serde_json::Map::new();
            m.insert(parent_key.to_string(), json!(parent_path(path)));
            m.insert("index".into(), json!(index));
            m.insert("item".into(), item.clone());
            Value::Object(m)
        }
        None => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn test_path_parse() {
        let p = Path::parse("a.b[0].c[*].d[@index]");
        assert_eq!(p.segments.len(), 7);
        assert_eq!(p.segments[0], PathSegment::Exact("a".into()));
        assert_eq!(p.segments[1], PathSegment::Exact("b".into()));
        assert_eq!(p.segments[2], PathSegment::Indexed(0));
        assert_eq!(p.segments[3], PathSegment::Exact("c".into()));
        assert_eq!(p.segments[4], PathSegment::Wildcard);
        assert_eq!(p.segments[5], PathSegment::Exact("d".into()));
        assert_eq!(p.segments[6], PathSegment::Special("@index".into()));
    }

    #[test]
    fn test_path_display() {
        let p = Path::parse("items[0].total");
        assert_eq!(p.to_string(), "items[0].total");
        
        let p2 = Path::parse("a.b[*].c");
        assert_eq!(p2.to_string(), "a.b[*].c");
    }

    #[test]
    fn test_strip_indices() {
        let p = Path::parse("group[0].items[1].field");
        assert_eq!(p.strip_indices(), "group.items.field");
    }

    #[test]
    fn test_to_wildcard_string() {
        let p = Path::parse("a[0].b[1].c");
        assert_eq!(p.to_wildcard_string(), "a[*].b[*].c");
    }

    #[test]
    fn test_to_fel_string() {
        let p = Path::parse("a[0].b");
        assert_eq!(p.to_fel_string(), "a[1].b");
    }

    // ... (rest of the tests from previous version, updated for new return types)
}
