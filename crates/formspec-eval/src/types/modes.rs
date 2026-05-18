//! NRB, whitespace normalization, and excluded-value modes.

/// Excluded-value behavior when a field is non-relevant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExcludedValueMode {
    /// Hide from shapes / env as null.
    Null,
    /// Keep current value visible to cross-field rules.
    Keep,
}

impl ExcludedValueMode {
    /// Parse definition/bind wire value; unknown strings are rejected.
    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "null" => Some(ExcludedValueMode::Null),
            "keep" => Some(ExcludedValueMode::Keep),
            _ => None,
        }
    }

    /// Serialize to the definition `excludedValue` wire string.
    pub fn as_wire_str(self) -> &'static str {
        match self {
            ExcludedValueMode::Null => "null",
            ExcludedValueMode::Keep => "keep",
        }
    }
}

/// NRB (Non-Relevant Behavior) mode.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NrbMode {
    /// Remove the field from output data.
    Remove,
    /// Set the field to null.
    Empty,
    /// Leave the field value unchanged.
    Keep,
}

impl NrbMode {
    /// Parse host/config string; unknown values map to [`NrbMode::Remove`].
    pub(crate) fn from_str_lossy(s: &str) -> Self {
        match s {
            "empty" => NrbMode::Empty,
            "keep" => NrbMode::Keep,
            _ => NrbMode::Remove,
        }
    }
}

/// Whitespace normalization mode.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum WhitespaceMode {
    /// Strip leading and trailing Unicode whitespace.
    Trim,
    /// Collapse internal runs of whitespace to a single ASCII space.
    Normalize,
    /// Remove all Unicode whitespace characters.
    Remove,
    /// Leave string values unchanged.
    Preserve,
}

impl WhitespaceMode {
    /// Parse host/config string; unknown values map to [`WhitespaceMode::Preserve`].
    pub(crate) fn from_str_lossy(s: &str) -> Self {
        match s {
            "trim" => WhitespaceMode::Trim,
            "normalize" => WhitespaceMode::Normalize,
            "remove" => WhitespaceMode::Remove,
            _ => WhitespaceMode::Preserve,
        }
    }

    /// Apply this normalization mode to `s`.
    pub(crate) fn apply(self, s: &str) -> String {
        match self {
            WhitespaceMode::Trim => s.trim().to_string(),
            WhitespaceMode::Normalize => s.split_whitespace().collect::<Vec<_>>().join(" "),
            WhitespaceMode::Remove => s.chars().filter(|c| !c.is_whitespace()).collect(),
            WhitespaceMode::Preserve => s.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn test_whitespace_mode_apply() {
        assert_eq!(WhitespaceMode::Trim.apply("  hello  "), "hello");
        assert_eq!(
            WhitespaceMode::Normalize.apply("  hello   world  "),
            "hello world"
        );
        assert_eq!(WhitespaceMode::Remove.apply("a b c"), "abc");
        assert_eq!(WhitespaceMode::Preserve.apply("  hi  "), "  hi  ");
    }

    #[test]
    fn test_nrb_mode_from_str() {
        assert_eq!(NrbMode::from_str_lossy("remove"), NrbMode::Remove);
        assert_eq!(NrbMode::from_str_lossy("empty"), NrbMode::Empty);
        assert_eq!(NrbMode::from_str_lossy("keep"), NrbMode::Keep);
        assert_eq!(NrbMode::from_str_lossy("unknown"), NrbMode::Remove);
    }

    #[test]
    fn whitespace_trim_handles_unicode_whitespace() {
        let input = "\u{00A0}hello\u{2003}";
        let result = WhitespaceMode::Trim.apply(input);
        assert_eq!(
            result, "hello",
            "trim strips Unicode whitespace (NBSP, em space)"
        );
    }

    #[test]
    fn whitespace_normalize_collapses_unicode() {
        let input = "hello\u{00A0}\u{2003}world";
        let result = WhitespaceMode::Normalize.apply(input);
        assert_eq!(
            result, "hello world",
            "normalize collapses Unicode whitespace to single ASCII space"
        );
    }

    #[test]
    fn whitespace_remove_strips_unicode() {
        let input = "a\u{00A0}b\u{2003}c";
        let result = WhitespaceMode::Remove.apply(input);
        assert_eq!(result, "abc", "remove strips Unicode whitespace characters");
    }
}
