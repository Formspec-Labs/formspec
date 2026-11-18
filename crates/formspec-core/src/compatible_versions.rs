//! Shared matching for Definition versions and Node-style semantic version ranges.

// Rust guideline compliant 2026-02-21

use semver_rs::{Options, Range, Version};

/// Reports whether a Definition version satisfies a range, including prereleases.
///
/// Returns `None` if the range or version cannot be parsed.
///
/// # Examples
///
/// ```
/// use formspec_core::compatible_version_satisfied;
///
/// assert_eq!(compatible_version_satisfied(">=1.0.0 <2.0.0", "2.0.0-rc.1"), Some(true));
/// assert_eq!(compatible_version_satisfied(">=1.0.0 <2.0.0", "2.0.0"), Some(false));
/// assert_eq!(compatible_version_satisfied("*", "1.0"), None);
/// ```
pub fn compatible_version_satisfied(range: &str, version: &str) -> Option<bool> {
    Some(parse_compatible_range(range)?.test(&parse_definition_version(version)?))
}

/// Parses a Node-style range with the prerelease policy used by companion documents.
pub(crate) fn parse_compatible_range(range: &str) -> Option<Range> {
    Range::new(range)
        .with_options(Options::builder().include_prerelease(true).build())
        .parse()
        .ok()
}

/// Parses a concrete version, rejecting the parser's empty and wildcard sentinels.
pub(crate) fn parse_definition_version(version: &str) -> Option<Version> {
    Version::new(version)
        .parse()
        .ok()
        .filter(|version| !version.is_empty() && !version.is_any())
}
