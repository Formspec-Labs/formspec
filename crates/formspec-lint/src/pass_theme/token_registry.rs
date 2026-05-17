//! Embedded platform token registry and declared-token validation (W700–W703, W708–W709).

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

use super::value_validators::{is_css_color, is_css_length, is_font_weight, is_line_height};
use super::PASS;

const TOKEN_REGISTRY_JSON: &str = include_str!("../../schemas/token-registry.json");

/// Parsed token registry mapping every platform token key to its semantic type.
pub(crate) struct TokenRegistry {
    token_types: HashMap<String, String>,
    all_keys: HashSet<String>,
}

impl TokenRegistry {
    fn from_json(json: &Value) -> Self {
        let mut token_types = HashMap::new();
        let mut all_keys = HashSet::new();

        if let Some(categories) = json.get("categories").and_then(|v| v.as_object()) {
            for (cat_key, category) in categories {
                let cat_type = category
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                if let Some(tokens) = category.get("tokens").and_then(|v| v.as_object()) {
                    for (token_key, entry) in tokens {
                        let entry_type = entry
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or(cat_type);
                        token_types.insert(token_key.clone(), entry_type.to_string());
                        all_keys.insert(token_key.clone());
                    }
                }

                if let Some(dark_prefix) = category.get("darkPrefix").and_then(|v| v.as_str())
                    && let Some(tokens) = category.get("tokens").and_then(|v| v.as_object())
                {
                    for (token_key, entry) in tokens {
                        if entry.get("dark").is_some()
                            && let Some(suffix) = token_key
                                .strip_prefix(cat_key.as_str())
                                .and_then(|s| s.strip_prefix('.'))
                        {
                            let dark_key = format!("{dark_prefix}.{suffix}");
                            token_types.insert(dark_key.clone(), "color".to_string());
                            all_keys.insert(dark_key);
                        }
                    }
                }
            }
        }

        TokenRegistry {
            token_types,
            all_keys,
        }
    }

    pub(crate) fn token_type(&self, key: &str) -> Option<&str> {
        self.token_types.get(key).map(|s| s.as_str())
    }

    pub(crate) fn contains(&self, key: &str) -> bool {
        self.all_keys.contains(key)
    }

    fn all_keys(&self) -> &HashSet<String> {
        &self.all_keys
    }
}

pub(crate) fn token_registry() -> &'static TokenRegistry {
    static REGISTRY: OnceLock<TokenRegistry> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        let json: Value = serde_json::from_str(TOKEN_REGISTRY_JSON)
            .expect("embedded token registry is valid JSON");
        TokenRegistry::from_json(&json)
    })
}

/// Validate `$.tokens` declarations against the platform registry (W700–W703, W708–W709).
pub(crate) fn lint_declared_tokens(theme: &Value, diags: &mut Vec<LintDiagnostic>) {
    let registry = token_registry();
    let Some(tokens) = theme.get("tokens").and_then(|v| v.as_object()) else {
        return;
    };

    for (name, value) in tokens {
        let path = format!("$.tokens.{name}");

        if !registry.contains(name) && !name.starts_with("x-") {
            diags.push(metadata::with_metadata(LintDiagnostic::warning(
                "W708",
                PASS,
                &path,
                format!(
                    "Token '{name}' is not a recognized platform token and does not use the 'x-' extension prefix"
                ),
            )));
        }

        let token_type = registry.token_type(name);
        let value_str = match value {
            Value::String(s) => Some(s.as_str()),
            Value::Number(n) => match token_type {
                Some("fontWeight") => {
                    let repr = n.to_string();
                    if !is_font_weight(&repr) {
                        diags.push(metadata::with_metadata(LintDiagnostic::warning(
                            "W702",
                            PASS,
                            &path,
                            format!("Font weight token '{name}' has invalid value: {repr} (expected 100-900 in steps of 100, or 'normal'/'bold')"),
                        )));
                    }
                    None
                }
                Some("number") => {
                    if let Some(f) = n.as_f64()
                        && f <= 0.0
                    {
                        diags.push(metadata::with_metadata(LintDiagnostic::warning(
                            "W703",
                            PASS,
                            &path,
                            format!("Number token '{name}' must be a positive number, got: {f}"),
                        )));
                    }
                    None
                }
                _ => None,
            },
            _ => None,
        };

        if let Some(s) = value_str {
            match token_type {
                Some("color") if !is_css_color(s) => {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        "W700",
                        PASS,
                        &path,
                        format!("Color token '{name}' has invalid CSS color value: '{s}'"),
                    )));
                }
                Some("dimension") if !is_css_length(s) => {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        "W701",
                        PASS,
                        &path,
                        format!("Dimension token '{name}' has invalid CSS length value: '{s}'"),
                    )));
                }
                Some("fontWeight") if !is_font_weight(s) => {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        "W702",
                        PASS,
                        &path,
                        format!("Font weight token '{name}' has invalid value: '{s}' (expected 100-900 in steps of 100, or 'normal'/'bold')"),
                    )));
                }
                Some("number") if !is_line_height(s) => {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        "W703",
                        PASS,
                        &path,
                        format!("Number token '{name}' must be a unitless positive number, got: '{s}'"),
                    )));
                }
                _ => {}
            }
        }
    }

    for key in registry.all_keys() {
        if !tokens.contains_key(key.as_str()) {
            diags.push(metadata::with_metadata(LintDiagnostic::info(
                "W709",
                PASS,
                "$.tokens",
                format!(
                    "Platform token '{key}' not declared in theme (platform default will be used)"
                ),
            )));
        }
    }
}
