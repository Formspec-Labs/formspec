//! Typed keys for Formspec filing units.
// Rust guideline compliant 2026-02-21

use std::ops::Neg;

use serde::Serialize;

/// A filed unit's typed key value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum SubjectKey {
    /// Text preserved verbatim.
    String(String),
    /// Signed integer in the I-JSON safe range.
    Integer(i64),
}

impl SubjectKey {
    /// Checks the inclusive I-JSON bounds for an already integral key.
    ///
    /// RFC 7493 §2.2 sets these bounds so browsers preserve key values
    /// exactly. The selector uses integers and the evaluator uses exact decimals.
    #[inline]
    pub fn is_integer_in_range<T>(value: &T) -> bool
    where
        T: Copy + From<i64> + Neg<Output = T> + PartialOrd,
    {
        const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;
        let max = T::from(MAX_SAFE_INTEGER);
        (-max..=max).contains(value)
    }
}
