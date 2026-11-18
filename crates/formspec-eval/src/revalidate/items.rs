//! Bind-level validation: required, type, constraint, cardinality, extension constraints.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashMap;

use chrono::NaiveDate;
use fancy_regex::Regex;
use fel_core::exact_json::Value;
use formspec_core::registry_client::version_satisfies;
use url::Url;

use fel_core::parse;

use crate::convert::resolve_value_by_path;
use crate::interpolation::interpolate_fel;
use crate::types::{
    ConstraintKind, ExtensionConstraint, ItemInfo, Severity, ValidationCode, ValidationResult,
    ValidationSource,
};

use crate::value_predicate::is_empty_bind_value;

use super::expr::{ConstraintSite, constraint_passes};
use super::{Findings, Validation};

impl Validation<'_> {
    /// Validates `items` and their descendants: required, type, constraint, extensions, cardinality.
    pub(super) fn validate_items(&self, items: &[ItemInfo], findings: &mut Findings) {
        for item in items {
            self.validate_item(item, findings);
        }
    }

    fn validate_item(&self, item: &ItemInfo, findings: &mut Findings) {
        let values = self.values;
        // Skip non-relevant items (validation suppressed per S5.6)
        if !item.mip.relevant {
            return;
        }

        // 9d: resolve value by walking nested objects for dotted paths
        let val = resolve_value_by_path(values, &item.path);

        // Required check
        if item.mip.required && is_empty_bind_value(&val) {
            findings.results.push(ValidationResult {
                path: item.path.clone(),
                severity: Severity::Error,
                constraint_kind: ConstraintKind::Required,
                code: ValidationCode::Required,
                message: "Required".to_string(),
                constraint: None,
                source: Some(ValidationSource::Bind),
                shape_id: None,
                context: None,
            });
        }

        // Type mismatch check — covers all 13 spec dataTypes.
        // Skip for null AND empty values (same gate as constraint checks per §3.8.1).
        if !is_empty_bind_value(&val)
            && let Some(ref dt) = item.data_type
        {
            let mismatch = match dt.as_str() {
                // String-family: must be a JSON string
                "string" | "text" => !val.is_string(),
                "choice" => !val.as_str().map_or(false, |s| {
                    item.option_values.is_empty() || item.option_values.iter().any(|o| o == s)
                }),

                // Numeric: integer must be whole, decimal any number
                "integer" => !val
                    .as_decimal()
                    .is_some_and(|number| number.fract().is_zero()),
                "number" | "decimal" => val.as_decimal().is_none(),

                "boolean" => !val.is_boolean(),

                // Date: string in YYYY-MM-DD format with valid ranges
                "date" => !val.as_str().map_or(false, is_valid_date),

                // DateTime: string in ISO 8601 date-time format
                "dateTime" => !val.as_str().map_or(false, is_valid_datetime),

                // Time: string in HH:MM:SS format
                "time" => !val.as_str().map_or(false, is_valid_time),

                // URI: string with a scheme component
                "uri" => !val.as_str().map_or(false, is_valid_uri),

                // multiChoice: array where every element is a string (and in options if defined)
                "multiChoice" => !val.as_array().map_or(false, |arr| {
                    arr.iter().all(|v| {
                        v.as_str().map_or(false, |s| {
                            item.option_values.is_empty()
                                || item.option_values.iter().any(|o| o == s)
                        })
                    })
                }),

                // money: object with amount (string or number) + currency (string, 3 uppercase letters)
                // Spec requires string amounts in responses, but we accept numeric for Postel's Law.
                "money" => {
                    !val.as_object().map_or(false, |obj| {
                        let amount_ok = obj.get("amount").map_or(false, |a| {
                            // Accept string decimal
                            a.as_str().map_or(false, |s| {
                                !s.is_empty()
                                    && s.bytes()
                                        .all(|b| b.is_ascii_digit() || b == b'.' || b == b'-')
                                    && rust_decimal::Decimal::from_str_exact(s).is_ok()
                            })
                            // Also accept numeric (Postel's Law — inbound values may use numbers)
                            || a.is_number()
                        });
                        let currency_ok = obj
                            .get("currency")
                            .and_then(Value::as_str)
                            .map_or(false, |s| {
                                s.len() == 3 && s.bytes().all(|b| b.is_ascii_uppercase())
                            });
                        amount_ok && currency_ok
                    })
                }

                // attachment: object with contentType (string).
                // url/data completeness is a submission-level check, not a type check.
                // If the item declares accepted MIME types, contentType must match one.
                "attachment" => {
                    !val.as_object().map_or(false, |obj| {
                        let ct = obj.get("contentType").and_then(Value::as_str);
                        ct.map_or(false, |s| {
                            if item.accept_types.is_empty() {
                                !s.is_empty()
                            } else {
                                item.accept_types.iter().any(|accepted| {
                                    // Support wildcard like "image/*"
                                    if let Some(prefix) = accepted.strip_suffix("/*") {
                                        s.starts_with(prefix)
                                            && s.as_bytes().get(prefix.len()) == Some(&b'/')
                                    } else {
                                        s == accepted
                                    }
                                })
                            }
                        })
                    })
                }

                _ => false,
            };
            if mismatch {
                findings.results.push(ValidationResult {
                    path: item.path.clone(),
                    severity: Severity::Error,
                    constraint_kind: ConstraintKind::Type,
                    code: ValidationCode::TypeMismatch,
                    message: format!("Invalid {dt}"),
                    constraint: None,
                    source: Some(ValidationSource::Bind),
                    shape_id: None,
                    context: None,
                });
            }
        }

        // Constraint check — skip for empty values (§3.8.1).
        // "A constraint that cannot be evaluated due to null inputs is not considered
        // violated."  The `required` bind, not `constraint`, enforces non-emptiness.
        if !is_empty_bind_value(&val)
            && let Some(ref expr) = item.constraint
        {
            let env = self.state.site(self.index, &item.path);

            // Core §3.10.1 definition errors (syntax error, undefined function) share
            // CONSTRAINT_PARSE_ERROR with a processor-generated message (Phase 3 step 1a);
            // only a `false` result is CONSTRAINT_FAILED, labeled by `constraintMessage`.
            let site = ConstraintSite {
                path: &item.path,
                shape_id: None,
                fel: self.fel,
            };
            let outcome = match parse(expr) {
                Ok(parsed) => site.settle(
                    self.fel.evaluate(&parsed, &env),
                    expr,
                    &mut findings.diagnostics,
                ),
                Err(e) => Err(e.to_string()),
            };
            let failure = match outcome {
                Ok(value) if constraint_passes(&value) => None,
                // `{{expression}}` in the message resolves while `$` and repeat siblings are still
                // bound to this field, the same way a Shape message does (Core §5: a surfaced message
                // carries no unresolved template).
                Ok(_) => Some((
                    ValidationCode::ConstraintFailed,
                    match item.constraint_message.as_deref() {
                        Some(message) => interpolate_fel(message, &env, self.fel).text,
                        None => format!("Constraint failed: {expr}"),
                    },
                )),
                Err(detail) => Some((
                    ValidationCode::ConstraintParseError,
                    format!("Constraint expression error: {detail}"),
                )),
            };
            if let Some((code, message)) = failure {
                findings.results.push(ValidationResult {
                    path: item.path.clone(),
                    severity: Severity::Error,
                    constraint_kind: ConstraintKind::Constraint,
                    code,
                    message,
                    constraint: Some(expr.clone()),
                    source: Some(ValidationSource::Bind),
                    shape_id: None,
                    context: None,
                });
            }
        }

        // Extension constraint enforcement
        validate_extension_constraints(
            item,
            &val,
            &self.ext_by_name,
            self.formspec_version,
            &mut findings.results,
        );

        // Cardinality check for repeatable groups
        if item.repeatable {
            let count = self.index.count(&item.path) as u64;
            if let Some(min) = item.repeat_min
                && count < min
            {
                findings.results.push(ValidationResult {
                    path: item.path.clone(),
                    severity: Severity::Error,
                    constraint_kind: ConstraintKind::Cardinality,
                    code: ValidationCode::MinRepeat,
                    message: format!("Minimum {min} entries required"),
                    constraint: None,
                    source: None,
                    shape_id: None,
                    context: None,
                });
            }
            if let Some(max) = item.repeat_max
                && count > max
            {
                findings.results.push(ValidationResult {
                    path: item.path.clone(),
                    severity: Severity::Error,
                    constraint_kind: ConstraintKind::Cardinality,
                    code: ValidationCode::MaxRepeat,
                    message: format!("Maximum {max} entries allowed"),
                    constraint: None,
                    source: None,
                    shape_id: None,
                    context: None,
                });
            }
        }

        self.validate_items(&item.children, findings);
    }
}

// ── Format validators for date/time/uri types ─────────────────────

/// YYYY-MM-DD — parsed and validated by chrono.
fn is_valid_date(s: &str) -> bool {
    // Require exactly YYYY-MM-DD format (10 chars) to reject looser chrono parses.
    s.len() == 10 && NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

/// ISO 8601 date-time — must have T separator, valid date, valid time, optional timezone.
///
/// Seconds are optional: `datetime-local` inputs emit `YYYY-MM-DDThh:mm`.
fn is_valid_datetime(s: &str) -> bool {
    // Try RFC 3339 (strict ISO 8601 profile with timezone)
    if chrono::DateTime::parse_from_rfc3339(s).is_ok() {
        return true;
    }
    [
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%dT%H:%MZ",
        "%Y-%m-%dT%H:%M%:z",
    ]
    .iter()
    .any(|format| chrono::NaiveDateTime::parse_from_str(s, format).is_ok())
}

/// HH:MM or HH:MM:SS with valid ranges — parsed by chrono.
fn is_valid_time(s: &str) -> bool {
    (s.len() == 5 && chrono::NaiveTime::parse_from_str(s, "%H:%M").is_ok())
        || (s.len() == 8 && chrono::NaiveTime::parse_from_str(s, "%H:%M:%S").is_ok())
}

/// RFC 3986 URI — parsed by the `url` crate.
fn is_valid_uri(s: &str) -> bool {
    !s.is_empty() && Url::parse(s).is_ok()
}

/// Check extension constraints (pattern, maxLength, min/max, status, compatibility) for a field.
fn validate_extension_constraints(
    item: &ItemInfo,
    val: &Value,
    ext_by_name: &HashMap<&str, &ExtensionConstraint>,
    formspec_version: &str,
    results: &mut Vec<ValidationResult>,
) {
    for ext_name in &item.extensions {
        let Some(constraint) = ext_by_name.get(ext_name.as_str()) else {
            // Extension not found in any loaded registry
            results.push(ValidationResult {
                path: item.path.clone(),
                severity: Severity::Error,
                constraint_kind: ConstraintKind::Constraint,
                code: ValidationCode::UnresolvedExtension,
                message: format!(
                    "Unresolved extension '{ext_name}': no matching registry entry loaded"
                ),
                constraint: None,
                source: Some(ValidationSource::External),
                shape_id: None,
                context: None,
            });
            continue;
        };

        // Status enforcement (§7.4)
        match constraint.status.as_str() {
            "retired" => {
                results.push(ValidationResult {
                    path: item.path.clone(),
                    severity: Severity::Warning,
                    constraint_kind: ConstraintKind::Constraint,
                    code: ValidationCode::ExtensionRetired,
                    message: format!("Extension '{ext_name}' is retired"),
                    constraint: None,
                    source: Some(ValidationSource::External),
                    shape_id: None,
                    context: None,
                });
            }
            "deprecated" => {
                let message = match &constraint.deprecation_notice {
                    Some(notice) => notice.clone(),
                    None => format!("Extension '{ext_name}' is deprecated"),
                };
                results.push(ValidationResult {
                    path: item.path.clone(),
                    severity: Severity::Info,
                    constraint_kind: ConstraintKind::Constraint,
                    code: ValidationCode::ExtensionDeprecated,
                    message,
                    constraint: None,
                    source: Some(ValidationSource::External),
                    shape_id: None,
                    context: None,
                });
            }
            _ => {} // stable, draft — no status warnings
        }

        // Compatibility check (§7.3)
        if let Some(ref compat_range) = constraint.compatibility_version {
            if !version_satisfies(formspec_version, compat_range) {
                results.push(ValidationResult {
                    path: item.path.clone(),
                    severity: Severity::Warning,
                    constraint_kind: ConstraintKind::Constraint,
                    code: ValidationCode::ExtensionCompatibilityMismatch,
                    message: format!(
                        "Extension '{ext_name}' requires formspec version {compat_range}"
                    ),
                    constraint: None,
                    source: Some(ValidationSource::External),
                    shape_id: None,
                    context: None,
                });
            }
        }

        // Skip value constraints if the value is null/empty (§3.8.1)
        if is_empty_bind_value(val) {
            continue;
        }

        let label = constraint
            .display_name
            .as_deref()
            .unwrap_or(ext_name.as_str());

        // Pattern constraint (string values only)
        if let Some(ref pattern) = constraint.pattern {
            if let Some(s) = val.as_str() {
                if let Ok(re) = Regex::new(pattern) {
                    if !re.is_match(s).unwrap_or(false) {
                        results.push(ValidationResult {
                            path: item.path.clone(),
                            severity: Severity::Error,
                            constraint_kind: ConstraintKind::Constraint,
                            code: ValidationCode::PatternMismatch,
                            message: format!("Must be a valid {label}"),
                            constraint: None,
                            source: Some(ValidationSource::External),
                            shape_id: None,
                            context: None,
                        });
                    }
                }
            }
        }

        // MaxLength constraint (string values only)
        if let Some(max_len) = constraint.max_length {
            if let Some(s) = val.as_str() {
                if s.chars().count() as u64 > max_len {
                    results.push(ValidationResult {
                        path: item.path.clone(),
                        severity: Severity::Error,
                        constraint_kind: ConstraintKind::Constraint,
                        code: ValidationCode::MaxLengthExceeded,
                        message: format!("{label} must be at most {max_len} characters"),
                        constraint: None,
                        source: Some(ValidationSource::External),
                        shape_id: None,
                        context: None,
                    });
                }
            }
        }

        // Minimum constraint (numeric values)
        if let Some(min) = constraint.minimum {
            if let Some(n) = val.as_decimal() {
                if n < min {
                    results.push(ValidationResult {
                        path: item.path.clone(),
                        severity: Severity::Error,
                        constraint_kind: ConstraintKind::Constraint,
                        code: ValidationCode::RangeUnderflow,
                        message: format!("{label} must be at least {min}"),
                        constraint: None,
                        source: Some(ValidationSource::External),
                        shape_id: None,
                        context: None,
                    });
                }
            }
        }

        // Maximum constraint (numeric values)
        if let Some(max) = constraint.maximum {
            if let Some(n) = val.as_decimal() {
                if n > max {
                    results.push(ValidationResult {
                        path: item.path.clone(),
                        severity: Severity::Error,
                        constraint_kind: ConstraintKind::Constraint,
                        code: ValidationCode::RangeOverflow,
                        message: format!("{label} must be at most {max}"),
                        constraint: None,
                        source: Some(ValidationSource::External),
                        shape_id: None,
                        context: None,
                    });
                }
            }
        }
    }
}
