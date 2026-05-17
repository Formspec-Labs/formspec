//! Closed taxonomies for validation diagnostics (SWEEP-001).

use std::borrow::Cow;
use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Validation severity on the wire (`error` / `warning` / `info`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

impl Severity {
    pub fn as_wire_str(self) -> &'static str {
        match self {
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Info => "info",
        }
    }

    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "error" => Some(Severity::Error),
            "warning" => Some(Severity::Warning),
            "info" => Some(Severity::Info),
            _ => None,
        }
    }
}

impl Serialize for Severity {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for Severity {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown severity: {s}")))
    }
}

/// What kind of rule produced the validation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ConstraintKind {
    Required,
    Constraint,
    Type,
    Cardinality,
    Shape,
    Definition,
}

impl ConstraintKind {
    pub fn as_wire_str(self) -> &'static str {
        match self {
            ConstraintKind::Required => "required",
            ConstraintKind::Constraint => "constraint",
            ConstraintKind::Type => "type",
            ConstraintKind::Cardinality => "cardinality",
            ConstraintKind::Shape => "shape",
            ConstraintKind::Definition => "definition",
        }
    }

    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "required" => Some(ConstraintKind::Required),
            "constraint" => Some(ConstraintKind::Constraint),
            "type" => Some(ConstraintKind::Type),
            "cardinality" => Some(ConstraintKind::Cardinality),
            "shape" => Some(ConstraintKind::Shape),
            "definition" => Some(ConstraintKind::Definition),
            _ => None,
        }
    }
}

impl Serialize for ConstraintKind {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for ConstraintKind {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown constraint_kind: {s}")))
    }
}

/// Origin layer for a validation result.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ValidationSource {
    Bind,
    Shape,
    Definition,
    /// Extension registry constraint (not a bind or shape rule).
    External,
}

impl ValidationSource {
    pub fn as_wire_str(self) -> &'static str {
        match self {
            ValidationSource::Bind => "bind",
            ValidationSource::Shape => "shape",
            ValidationSource::Definition => "definition",
            ValidationSource::External => "external",
        }
    }

    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "bind" => Some(ValidationSource::Bind),
            "shape" => Some(ValidationSource::Shape),
            "definition" => Some(ValidationSource::Definition),
            "external" => Some(ValidationSource::External),
            _ => None,
        }
    }
}

impl Serialize for ValidationSource {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for ValidationSource {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s).ok_or_else(|| serde::de::Error::custom(format!("unknown source: {s}")))
    }
}

/// Machine validation code (known codes + definition-authored shape codes).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ValidationCode {
    Required,
    TypeMismatch,
    ConstraintFailed,
    ConstraintParseError,
    MinRepeat,
    MaxRepeat,
    UnresolvedExtension,
    ExtensionRetired,
    ExtensionDeprecated,
    ExtensionCompatibilityMismatch,
    PatternMismatch,
    MaxLengthExceeded,
    RangeUnderflow,
    RangeOverflow,
    CircularDependency,
    /// Shape rule `code` from the definition (e.g. `SHAPE_FAILED`).
    Shape(String),
}

impl ValidationCode {
    pub fn from_wire(s: &str) -> Self {
        match s {
            "REQUIRED" => Self::Required,
            "TYPE_MISMATCH" => Self::TypeMismatch,
            "CONSTRAINT_FAILED" => Self::ConstraintFailed,
            "CONSTRAINT_PARSE_ERROR" => Self::ConstraintParseError,
            "MIN_REPEAT" => Self::MinRepeat,
            "MAX_REPEAT" => Self::MaxRepeat,
            "UNRESOLVED_EXTENSION" => Self::UnresolvedExtension,
            "EXTENSION_RETIRED" => Self::ExtensionRetired,
            "EXTENSION_DEPRECATED" => Self::ExtensionDeprecated,
            "EXTENSION_COMPATIBILITY_MISMATCH" => Self::ExtensionCompatibilityMismatch,
            "PATTERN_MISMATCH" => Self::PatternMismatch,
            "MAX_LENGTH_EXCEEDED" => Self::MaxLengthExceeded,
            "RANGE_UNDERFLOW" => Self::RangeUnderflow,
            "RANGE_OVERFLOW" => Self::RangeOverflow,
            "CIRCULAR_DEPENDENCY" => Self::CircularDependency,
            other => Self::Shape(other.to_string()),
        }
    }

    pub fn as_wire_str(&self) -> Cow<'_, str> {
        Cow::Borrowed(match self {
            ValidationCode::Required => "REQUIRED",
            ValidationCode::TypeMismatch => "TYPE_MISMATCH",
            ValidationCode::ConstraintFailed => "CONSTRAINT_FAILED",
            ValidationCode::ConstraintParseError => "CONSTRAINT_PARSE_ERROR",
            ValidationCode::MinRepeat => "MIN_REPEAT",
            ValidationCode::MaxRepeat => "MAX_REPEAT",
            ValidationCode::UnresolvedExtension => "UNRESOLVED_EXTENSION",
            ValidationCode::ExtensionRetired => "EXTENSION_RETIRED",
            ValidationCode::ExtensionDeprecated => "EXTENSION_DEPRECATED",
            ValidationCode::ExtensionCompatibilityMismatch => "EXTENSION_COMPATIBILITY_MISMATCH",
            ValidationCode::PatternMismatch => "PATTERN_MISMATCH",
            ValidationCode::MaxLengthExceeded => "MAX_LENGTH_EXCEEDED",
            ValidationCode::RangeUnderflow => "RANGE_UNDERFLOW",
            ValidationCode::RangeOverflow => "RANGE_OVERFLOW",
            ValidationCode::CircularDependency => "CIRCULAR_DEPENDENCY",
            ValidationCode::Shape(s) => s.as_str(),
        })
    }
}

impl fmt::Display for ValidationCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.as_wire_str())
    }
}

impl Serialize for ValidationCode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for ValidationCode {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(Self::from_wire(&s))
    }
}

impl FromStr for ValidationCode {
    type Err = std::convert::Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Self::from_wire(s))
    }
}

impl PartialEq<str> for Severity {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for Severity {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

impl PartialEq<str> for ConstraintKind {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for ConstraintKind {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

impl PartialEq<str> for ValidationCode {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for ValidationCode {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

impl PartialEq<str> for ValidationSource {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for ValidationSource {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn severity_serde_round_trip() {
        let v = json!("warning");
        let sev: Severity = serde_json::from_value(v).unwrap();
        assert_eq!(sev, Severity::Warning);
        assert_eq!(serde_json::to_value(sev).unwrap(), json!("warning"));
    }

    #[test]
    fn severity_rejects_unknown_wire_value() {
        let err = serde_json::from_value::<Severity>(json!("critical")).unwrap_err();
        assert!(err.to_string().contains("unknown severity"));
    }

    #[test]
    fn constraint_kind_and_source_round_trip() {
        let kind: ConstraintKind = serde_json::from_value(json!("type")).unwrap();
        assert_eq!(kind, ConstraintKind::Type);
        let source: ValidationSource = serde_json::from_value(json!("external")).unwrap();
        assert_eq!(source, ValidationSource::External);
    }

    #[test]
    fn validation_code_from_wire_and_custom_shape() {
        assert_eq!(ValidationCode::from_wire("REQUIRED"), ValidationCode::Required);
        let custom = ValidationCode::from_wire("MY_SHAPE_RULE");
        assert_eq!(custom.as_wire_str(), "MY_SHAPE_RULE");
        assert!(matches!(custom, ValidationCode::Shape(_)));
    }

    #[test]
    fn validation_code_serde_preserves_shape_code() {
        let code = ValidationCode::Shape("CUSTOM".into());
        let wire = serde_json::to_value(&code).unwrap();
        let back: ValidationCode = serde_json::from_value(wire).unwrap();
        assert_eq!(back, code);
    }
}
