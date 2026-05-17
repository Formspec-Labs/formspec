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

    /// Returns the segment's content as a bracket-free flat key fragment.
    ///
    /// Use this when composing flat dotted keys where bracket syntax is not
    /// wanted in the output (e.g. mapping flatten transform):
    /// `Exact("name")` → `"name"`, `Indexed(0)` → `"0"`, `Wildcard` → `"*"`,
    /// `Special("@index")` → `"@index"`.
    ///
    /// For round-trippable serialization use [`Display`] / [`Path::to_string`].
    pub fn flat_key(&self) -> String {
        match self {
            PathSegment::Exact(s) | PathSegment::Special(s) => s.clone(),
            PathSegment::Indexed(i) => i.to_string(),
            PathSegment::Wildcard => "*".to_string(),
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
    ///
    /// Handles `a.b.c`, `a[0].b`, `a[*].b`, and `a[@index]`.
    ///
    /// **Bracket content is parsed semantically, not preserved textually.**
    /// `[01]` parses as `Indexed(1)` and serializes back as `[1]` — the leading
    /// zero is lost. Non-numeric, non-`*` bracket content becomes `Special` and
    /// is preserved verbatim.
    ///
    /// **Malformed input is silently normalized:** consecutive dots (`a..b`),
    /// leading dots (`.a`), and trailing dots (`a.`) collapse to the empty
    /// segments being dropped. An unclosed bracket (`a[`) is treated as part
    /// of the preceding segment.
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
            if i > 0
                && !matches!(
                    seg,
                    PathSegment::Indexed(_) | PathSegment::Wildcard | PathSegment::Special(_)
                )
            {
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
            if i > 0
                && !matches!(
                    seg,
                    PathSegment::Indexed(_) | PathSegment::Wildcard | PathSegment::Special(_)
                )
            {
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
    ///
    /// Operates on parsed segments, so malformed inputs are normalized: a
    /// trailing dot is dropped (`"field."` parses to one segment, so parent is
    /// `""`, not `"field"` as a pure `rfind('.')` would yield).
    pub fn parent_string(&self) -> String {
        if self.segments.len() <= 1 {
            return String::new();
        }
        let mut out = String::new();
        Self::write_segments(&self.segments[..self.segments.len() - 1], &mut out)
            .expect("writing to String cannot fail");
        out
    }

    /// Returns the last segment as a string (the "leaf key").
    pub fn leaf_key(&self) -> String {
        match self.segments.last() {
            Some(PathSegment::Exact(s)) => s.clone(),
            Some(seg) => seg.to_string(),
            None => String::new(),
        }
    }

    /// Serialize a segment slice using the standard Path dot/bracket layout.
    /// Shared by [`Display`] and [`Self::parent_string`] to avoid cloning the
    /// segment vec just to drop the tail.
    fn write_segments(segments: &[PathSegment], out: &mut impl fmt::Write) -> fmt::Result {
        for (i, seg) in segments.iter().enumerate() {
            if i > 0 && matches!(seg, PathSegment::Exact(_)) {
                out.write_char('.')?;
            }
            write!(out, "{seg}")?;
        }
        Ok(())
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
        Self::write_segments(&self.segments, f)
    }
}

// ── String facades over Path ─────────────────────────────────────────

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

    // ── PathSegment::flat_key (F-3 regression guard) ─────────────────

    #[test]
    fn flat_key_strips_brackets() {
        assert_eq!(PathSegment::Exact("name".into()).flat_key(), "name");
        assert_eq!(PathSegment::Indexed(0).flat_key(), "0");
        assert_eq!(PathSegment::Indexed(42).flat_key(), "42");
        assert_eq!(PathSegment::Wildcard.flat_key(), "*");
        assert_eq!(PathSegment::Special("@index".into()).flat_key(), "@index");
    }

    // ── String facades — parity with pre-refactor behavior ────

    #[test]
    fn test_normalize_segment() {
        assert_eq!(normalize_path_segment("items[0]"), "items");
        assert_eq!(normalize_path_segment("items[*]"), "items");
        assert_eq!(normalize_path_segment("field"), "field");
    }

    #[test]
    fn test_normalize_indexed_path() {
        assert_eq!(
            normalize_indexed_path("group[0].items[1].field"),
            "group.items.field"
        );
        assert_eq!(normalize_indexed_path("simple"), "simple");
        assert_eq!(normalize_indexed_path("a[0].b[*].c"), "a.b.c");
    }

    #[test]
    fn test_split_normalized_path() {
        assert_eq!(split_normalized_path("a.b.c"), vec!["a", "b", "c"]);
        assert_eq!(split_normalized_path("a[0].b"), vec!["a", "b"]);
        assert_eq!(split_normalized_path("single"), vec!["single"]);
    }

    // ── Tree navigation ───────────────────────────────────────────────

    struct TestItem {
        key: String,
        kids: Vec<TestItem>,
    }

    impl TreeItem for TestItem {
        fn key(&self) -> &str {
            &self.key
        }
        fn children(&self) -> &[TestItem] {
            &self.kids
        }
    }

    fn item(key: &str, children: Vec<TestItem>) -> TestItem {
        TestItem {
            key: key.to_string(),
            kids: children,
        }
    }

    fn leaf(key: &str) -> TestItem {
        TestItem {
            key: key.to_string(),
            kids: vec![],
        }
    }

    #[test]
    fn test_item_at_path() {
        let tree = vec![
            item("personal", vec![leaf("name"), leaf("email")]),
            item("address", vec![leaf("city"), leaf("zip")]),
        ];
        assert_eq!(item_at_path(&tree, "personal.name").unwrap().key(), "name");
        assert_eq!(item_at_path(&tree, "address.city").unwrap().key(), "city");
        assert!(item_at_path(&tree, "personal.phone").is_none());
        assert!(item_at_path(&tree, "missing").is_none());
    }

    #[test]
    fn test_item_location_at_path() {
        let tree = vec![item("group", vec![leaf("field1"), leaf("field2")])];
        let loc = item_location_at_path(&tree, "group.field2").unwrap();
        assert_eq!(loc.item.key(), "field2");
        assert_eq!(loc.index, 1);
        assert_eq!(loc.parent.len(), 2);
    }

    #[test]
    fn test_parent_path() {
        assert_eq!(parent_path("group.child.field"), "group.child");
        assert_eq!(parent_path("group.field"), "group");
        assert_eq!(parent_path("field"), "");
    }

    #[test]
    fn test_leaf_key() {
        assert_eq!(leaf_key("group.child.field"), "field");
        assert_eq!(leaf_key("field"), "field");
    }

    // ── Empty string edge cases ──────────────────────────────────────

    #[test]
    fn empty_string_normalize_segment() {
        assert_eq!(normalize_path_segment(""), "");
    }

    #[test]
    fn empty_string_normalize_indexed_path() {
        assert_eq!(normalize_indexed_path(""), "");
    }

    #[test]
    fn empty_string_split_normalized_path() {
        assert!(split_normalized_path("").is_empty());
    }

    #[test]
    fn empty_string_item_at_path() {
        let tree = vec![leaf("field")];
        assert!(item_at_path(&tree, "").is_none());
    }

    #[test]
    fn empty_string_item_location_at_path() {
        let tree = vec![leaf("field")];
        assert!(item_location_at_path(&tree, "").is_none());
    }

    #[test]
    fn empty_string_parent_path() {
        assert_eq!(parent_path(""), "");
    }

    #[test]
    fn empty_string_leaf_key() {
        assert_eq!(leaf_key(""), "");
    }

    // ── Deeply nested tree traversal (3+ levels) ────────────────────

    #[test]
    fn deeply_nested_item_at_path() {
        let tree = vec![item(
            "level1",
            vec![item("level2", vec![item("level3", vec![leaf("target")])])],
        )];
        let found = item_at_path(&tree, "level1.level2.level3.target").unwrap();
        assert_eq!(found.key(), "target");
    }

    #[test]
    fn deeply_nested_item_location_at_path() {
        let tree = vec![item("a", vec![item("b", vec![leaf("c1"), leaf("c2")])])];
        let loc = item_location_at_path(&tree, "a.b.c2").unwrap();
        assert_eq!(loc.item.key(), "c2");
        assert_eq!(loc.index, 1);
        assert_eq!(loc.parent.len(), 2);
    }

    // ── parent_path edge cases ───────────────────────────────────────

    /// F-2: New behavior — `parent_path(".field")` returns `""`. Old
    /// `rfind('.')` returned `""` as well; the new parser correctly drops
    /// the empty leading segment.
    #[test]
    fn parent_path_leading_dot() {
        assert_eq!(parent_path(".field"), "");
    }

    /// F-2: Behavior change made intentional. Old `rfind('.')` returned
    /// `"field"` for `"field."`; the new parser treats `"field."` as one
    /// segment (`[Exact("field")]`), so the parent is `""`. This is the
    /// canonical behavior — a trailing dot is malformed input and the
    /// normalized parse drops it.
    #[test]
    fn parent_path_trailing_dot() {
        assert_eq!(parent_path("field."), "");
    }

    #[test]
    fn parent_path_deep() {
        assert_eq!(parent_path("a.b.c.d.e"), "a.b.c.d");
    }

    /// F-2/F-9 parity: leaf_key on malformed input.
    #[test]
    fn leaf_key_trailing_dot() {
        // Trailing dot is normalized away, so leaf is the surviving segment.
        assert_eq!(leaf_key("field."), "field");
    }

    /// Spec: core/spec.md §5.3 (RFC 6901) — `01` is a valid key, not array
    /// index 1. Dotted segments without brackets are preserved verbatim.
    #[test]
    fn normalize_leading_zero_segment_preserved() {
        assert_eq!(normalize_indexed_path("items.01.key"), "items.01.key");
    }

    /// F-7: `[01]` parses as `Indexed(1)` — leading zero in bracket content
    /// is lost. `to_wildcard_string` still converts to `[*]`; `to_fel_string`
    /// serializes as `[2]` (1-based). Round-trip through Display loses the
    /// literal `01` representation. This is intentional; bracket content is
    /// parsed semantically, not preserved textually.
    #[test]
    fn leading_zero_in_brackets_parses_as_index() {
        let p = Path::parse("a[01].b");
        assert_eq!(p.segments[1], PathSegment::Indexed(1));
        assert_eq!(p.to_string(), "a[1].b");
        assert_eq!(p.to_wildcard_string(), "a[*].b");
        assert_eq!(p.to_fel_string(), "a[2].b");
    }

    /// Spec: core/spec.md §4.3.3 — `normalize_indexed_path` is idempotent.
    #[test]
    fn normalize_indexed_path_idempotent() {
        let paths = [
            "group[0].items[1].field",
            "a[0].b[*].c",
            "simple",
            "deep.nested.path",
            "items[0].children[1].key[2]",
            "",
        ];
        for path in &paths {
            let once = normalize_indexed_path(path);
            let twice = normalize_indexed_path(&once);
            assert_eq!(once, twice, "idempotence failed for input '{path}'");
        }
    }

    // ── Parser malformed-input handling ──────────────────────────────

    #[test]
    fn parse_consecutive_dots() {
        let p = Path::parse("a..b");
        assert_eq!(p.segments.len(), 2);
        assert_eq!(p.to_string(), "a.b");
    }

    #[test]
    fn parse_leading_dot() {
        let p = Path::parse(".a");
        assert_eq!(p.segments.len(), 1);
        assert_eq!(p.to_string(), "a");
    }

    #[test]
    fn parse_trailing_dot() {
        let p = Path::parse("a.");
        assert_eq!(p.segments.len(), 1);
        assert_eq!(p.to_string(), "a");
    }

    #[test]
    fn parse_unclosed_bracket() {
        // Unclosed `[` is permissive — `Path::parse` does not error. The
        // preceding key is committed at the `[`, and the bracket plus
        // remainder forms a second `Exact` segment starting with `[`.
        let p = Path::parse("a[unclosed");
        assert_eq!(p.segments.len(), 2);
        assert_eq!(p.segments[0], PathSegment::Exact("a".into()));
        if let PathSegment::Exact(s) = &p.segments[1] {
            assert!(
                s.starts_with('['),
                "second segment should preserve '[', got {s:?}"
            );
            assert!(s.contains("unclosed"));
        } else {
            panic!("expected Exact segment, got {:?}", p.segments[1]);
        }
    }

    // ── Property-based equivalence (F-5) ─────────────────────────────

    /// Previous-string oracle: pre-refactor `normalize_indexed_path` (split-then-strip).
    /// Property tests assert `Path::parse(x).strip_indices()` agrees with this.
    fn previous_normalize_indexed_path(path: &str) -> String {
        path.split('.')
            .map(|seg| match seg.find('[') {
                Some(idx) => &seg[..idx],
                None => seg,
            })
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(".")
    }

    /// Previous-string oracle: pre-refactor `to_wildcard_path` from `formspec-eval`.
    /// Replaces only fully-numeric bracket contents with `*`.
    fn previous_to_wildcard_path(path: &str) -> String {
        let mut result = String::new();
        let mut chars = path.chars().peekable();
        while let Some(ch) = chars.next() {
            if ch == '[' {
                let mut seg = String::new();
                let mut closed = false;
                for inner in chars.by_ref() {
                    if inner == ']' {
                        closed = true;
                        break;
                    }
                    seg.push(inner);
                }
                result.push('[');
                if closed && !seg.is_empty() && seg.chars().all(|c| c.is_ascii_digit()) {
                    result.push('*');
                } else {
                    result.push_str(&seg);
                }
                if closed {
                    result.push(']');
                }
            } else {
                result.push(ch);
            }
        }
        result
    }

    /// Previous-string oracle: pre-refactor `internal_path_to_fel_path` from
    /// `formspec-eval` — 1-base only fully-numeric bracket indices.
    fn previous_internal_path_to_fel_path(path: &str) -> String {
        let mut result = String::new();
        let mut chars = path.chars().peekable();
        while let Some(ch) = chars.next() {
            if ch != '[' {
                result.push(ch);
                continue;
            }
            let mut idx = String::new();
            let mut closed = false;
            while let Some(inner) = chars.peek().copied() {
                chars.next();
                if inner == ']' {
                    closed = true;
                    break;
                }
                idx.push(inner);
            }
            if closed
                && !idx.is_empty()
                && idx.chars().all(|c| c.is_ascii_digit())
                && let Ok(parsed) = idx.parse::<usize>()
            {
                result.push('[');
                result.push_str(&(parsed + 1).to_string());
                result.push(']');
            } else {
                result.push('[');
                result.push_str(&idx);
                if closed {
                    result.push(']');
                }
            }
        }
        result
    }

    proptest::proptest! {
        /// strip_indices matches the previous normalize_indexed_path oracle on
        /// well-formed paths (no leading zeros, no empty brackets, no
        /// non-ASCII keys).
        #[test]
        fn prop_strip_indices_matches_previous(
            path in r"[a-z][a-z0-9_]{0,5}(\[[1-9][0-9]{0,2}\])?(\.[a-z][a-z0-9_]{0,5}(\[[1-9][0-9]{0,2}\])?){0,4}"
        ) {
            let new_result = Path::parse(&path).strip_indices();
            let previous = previous_normalize_indexed_path(&path);
            proptest::prop_assert_eq!(new_result, previous);
        }

        /// to_wildcard_string matches previous_to_wildcard_path for purely
        /// numeric bracket content.
        #[test]
        fn prop_to_wildcard_matches_previous(
            path in r"[a-z][a-z0-9]{0,5}(\[[1-9][0-9]{0,2}\])?(\.[a-z][a-z0-9]{0,5}(\[[1-9][0-9]{0,2}\])?){0,4}"
        ) {
            let new_result = Path::parse(&path).to_wildcard_string();
            let previous = previous_to_wildcard_path(&path);
            proptest::prop_assert_eq!(new_result, previous);
        }

        /// to_fel_string matches previous_internal_path_to_fel_path for purely
        /// numeric bracket content.
        #[test]
        fn prop_to_fel_matches_previous(
            path in r"[a-z][a-z0-9]{0,5}(\[[1-9][0-9]{0,2}\])?(\.[a-z][a-z0-9]{0,5}(\[[1-9][0-9]{0,2}\])?){0,4}"
        ) {
            let new_result = Path::parse(&path).to_fel_string();
            let previous = previous_internal_path_to_fel_path(&path);
            proptest::prop_assert_eq!(new_result, previous);
        }

        /// strip_indices is idempotent on any well-formed path.
        #[test]
        fn prop_strip_indices_idempotent(
            path in r"[a-z][a-z0-9]{0,5}(\[[0-9]{1,3}\]|\[\*\])?(\.[a-z][a-z0-9]{0,5}(\[[0-9]{1,3}\]|\[\*\])?){0,4}"
        ) {
            let once = Path::parse(&path).strip_indices();
            let twice = Path::parse(&once).strip_indices();
            proptest::prop_assert_eq!(once, twice);
        }

        /// Parse-Display round-trip for well-formed paths. Stable wrt
        /// re-parsing: `parse(display(parse(x))) == parse(x)`.
        #[test]
        fn prop_parse_display_stable(
            path in r"[a-z][a-z0-9]{0,5}(\[[0-9]{1,3}\]|\[\*\])?(\.[a-z][a-z0-9]{0,5}(\[[0-9]{1,3}\]|\[\*\])?){0,4}"
        ) {
            let first = Path::parse(&path);
            let displayed = first.to_string();
            let second = Path::parse(&displayed);
            proptest::prop_assert_eq!(first, second);
        }

        /// flat_key never contains brackets — F-3 guard.
        #[test]
        fn prop_flat_key_has_no_brackets(
            path in r"[a-z][a-z0-9]{0,5}(\[[0-9]{1,3}\]|\[\*\])?(\.[a-z][a-z0-9]{0,5}(\[[0-9]{1,3}\]|\[\*\])?){0,4}"
        ) {
            let p = Path::parse(&path);
            for seg in &p.segments {
                let flat = seg.flat_key();
                proptest::prop_assert!(!flat.contains('['), "flat_key contained '[': {flat}");
                proptest::prop_assert!(!flat.contains(']'), "flat_key contained ']': {flat}");
            }
        }

        // ── Broader range proptests — beyond the ASCII-alpha well-formed
        //    subset above. These cover the edge cases that the original
        //    review (F-7) flagged: leading-zero brackets, Special bracket
        //    content, mixed Wildcard/Indexed/Special segments.

        /// Bracket content matching `^\d+$` always parses to `Indexed`,
        /// including leading-zero forms like `[01]` (semantic parse, not
        /// textual preservation — F-7).
        #[test]
        fn prop_pure_digit_brackets_parse_as_indexed(
            digits in r"0*[0-9]{1,3}"
        ) {
            let path = format!("a[{digits}].b");
            let p = Path::parse(&path);
            proptest::prop_assert_eq!(p.segments.len(), 3);
            let expected = digits.parse::<usize>().unwrap();
            proptest::prop_assert_eq!(&p.segments[1], &PathSegment::Indexed(expected));
        }

        /// Bracket content that does NOT match `^\d+$` and is not `*` always
        /// parses to `Special` with content preserved verbatim.
        #[test]
        fn prop_non_digit_brackets_parse_as_special(
            content in r"@[a-z]{1,4}|[a-z]+[0-9]+|-[0-9]+"
        ) {
            let path = format!("a[{content}].b");
            let p = Path::parse(&path);
            proptest::prop_assert_eq!(p.segments.len(), 3);
            proptest::prop_assert_eq!(&p.segments[1], &PathSegment::Special(content));
        }

        /// Round-trip stability across the *broader* grammar — including
        /// Wildcard/Special segments and mixed paths. parse(display(p)) == p.
        #[test]
        fn prop_parse_display_stable_broad(
            path in r"[a-z][a-z0-9_]{0,5}(\[(?:[0-9]{1,3}|\*|@[a-z]{1,4})\])?(\.[a-z][a-z0-9_]{0,5}(\[(?:[0-9]{1,3}|\*|@[a-z]{1,4})\])?){0,4}"
        ) {
            let first = Path::parse(&path);
            let displayed = first.to_string();
            let second = Path::parse(&displayed);
            proptest::prop_assert_eq!(first, second);
        }

        /// strip_indices remains idempotent across the broader grammar.
        #[test]
        fn prop_strip_indices_idempotent_broad(
            path in r"[a-z][a-z0-9_]{0,5}(\[(?:[0-9]{1,3}|\*|@[a-z]{1,4})\])?(\.[a-z][a-z0-9_]{0,5}(\[(?:[0-9]{1,3}|\*|@[a-z]{1,4})\])?){0,4}"
        ) {
            let once = Path::parse(&path).strip_indices();
            let twice = Path::parse(&once).strip_indices();
            proptest::prop_assert_eq!(once, twice);
        }

        /// flat_key never contains brackets even on the broader grammar.
        #[test]
        fn prop_flat_key_has_no_brackets_broad(
            path in r"[a-z][a-z0-9_]{0,5}(\[(?:[0-9]{1,3}|\*|@[a-z]{1,4})\])?(\.[a-z][a-z0-9_]{0,5}(\[(?:[0-9]{1,3}|\*|@[a-z]{1,4})\])?){0,4}"
        ) {
            let p = Path::parse(&path);
            for seg in &p.segments {
                let flat = seg.flat_key();
                proptest::prop_assert!(!flat.contains('['), "flat_key contained '[': {flat}");
                proptest::prop_assert!(!flat.contains(']'), "flat_key contained ']': {flat}");
            }
        }
    }
}
