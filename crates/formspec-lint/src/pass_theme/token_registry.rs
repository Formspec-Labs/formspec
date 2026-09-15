//! Embedded platform token registry and declared-token validation (W700–W703, W708–W709).

use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

use super::PASS;
use super::value_validators::{is_css_color, is_css_length, is_font_weight, is_line_height};

const TOKEN_REGISTRY_JSON: &str = include_str!("../../schemas/token-registry.json");

/// A renderer-owned color relationship inferred for every Theme override.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PlatformContrastPair {
    /// Stable relationship name used in diagnostics.
    pub(crate) id: String,
    /// Color token painted in front of the surface.
    pub(crate) foreground_token: String,
    /// Color token painted behind the foreground.
    pub(crate) background_token: String,
    /// Renderer usage that sets the standards floor.
    pub(crate) usage: String,
    /// Optional product floor above the usage minimum.
    pub(crate) minimum_ratio: Option<f64>,
}

/// Parsed token registry with values needed for Theme semantic checks.
#[derive(Debug)]
pub(crate) struct TokenRegistry {
    token_types: HashMap<String, String>,
    all_keys: HashSet<String>,
    /// Tokens each adapter resolves for itself while a Theme leaves them unset (registry §2.5).
    adapter_default: HashSet<String>,
    default_values: HashMap<String, String>,
    derived_from: HashMap<String, String>,
    contrast_pairs: Vec<PlatformContrastPair>,
}

impl TokenRegistry {
    fn from_json(json: &Value) -> Self {
        let mut token_types = HashMap::new();
        let mut all_keys = HashSet::new();
        let mut adapter_default = HashSet::new();
        let mut default_values = HashMap::new();
        let mut derived_from = HashMap::new();

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
                        if let Some(value) = entry.get("default").and_then(Value::as_str) {
                            default_values.insert(token_key.clone(), value.to_string());
                        }
                        if let Some(source) = entry.get("derivedFrom").and_then(Value::as_str) {
                            derived_from.insert(token_key.clone(), source.to_string());
                        }
                        if entry.get("adapterDefault").and_then(Value::as_bool) == Some(true) {
                            adapter_default.insert(token_key.clone());
                        }
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
                            all_keys.insert(dark_key.clone());
                            if let Some(value) = entry.get("dark").and_then(Value::as_str) {
                                default_values.insert(dark_key.clone(), value.to_string());
                            }
                            if let Some(source) = entry.get("derivedFrom").and_then(Value::as_str)
                                && let Some(source_suffix) = source
                                    .strip_prefix(cat_key.as_str())
                                    .and_then(|value| value.strip_prefix('.'))
                            {
                                derived_from
                                    .insert(dark_key, format!("{dark_prefix}.{source_suffix}"));
                            }
                        }
                    }
                }
            }
        }

        let contrast_pairs = json
            .get("contrastPairs")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(parse_platform_contrast_pair)
            .collect();

        TokenRegistry {
            token_types,
            all_keys,
            adapter_default,
            default_values,
            derived_from,
            contrast_pairs,
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

    /// Whether the adapter, not the platform theme, supplies this token's value when a Theme is silent.
    fn is_adapter_default(&self, key: &str) -> bool {
        self.adapter_default.contains(key)
    }

    /// Return inferred renderer relationships checked when either side changes.
    pub(crate) fn contrast_pairs(&self) -> &[PlatformContrastPair] {
        &self.contrast_pairs
    }

    /// Resolve an effective string after Theme overrides and token derivation.
    pub(crate) fn effective_string(
        &self,
        authored: &serde_json::Map<String, Value>,
        key: &str,
    ) -> Option<String> {
        self.effective_string_inner(authored, key, &mut HashSet::new())
    }

    fn effective_string_inner(
        &self,
        authored: &serde_json::Map<String, Value>,
        key: &str,
        visited: &mut HashSet<String>,
    ) -> Option<String> {
        if !visited.insert(key.to_string()) {
            return None;
        }
        if let Some(value) = authored.get(key) {
            return value.as_str().map(ToString::to_string);
        }
        if let Some(source) = self.derived_from.get(key) {
            return self.effective_string_inner(authored, source, visited);
        }
        self.default_values.get(key).cloned()
    }

    /// Check whether a Theme override changes this token directly or by derivation.
    pub(crate) fn is_affected(&self, authored: &serde_json::Map<String, Value>, key: &str) -> bool {
        self.is_affected_inner(authored, key, &mut HashSet::new())
    }

    fn is_affected_inner(
        &self,
        authored: &serde_json::Map<String, Value>,
        key: &str,
        visited: &mut HashSet<String>,
    ) -> bool {
        if !visited.insert(key.to_string()) {
            return false;
        }
        authored.contains_key(key)
            || self
                .derived_from
                .get(key)
                .is_some_and(|source| self.is_affected_inner(authored, source, visited))
    }
}

fn parse_platform_contrast_pair(value: &Value) -> Option<PlatformContrastPair> {
    Some(PlatformContrastPair {
        id: value.get("id")?.as_str()?.to_string(),
        foreground_token: value.get("foregroundToken")?.as_str()?.to_string(),
        background_token: value.get("backgroundToken")?.as_str()?.to_string(),
        usage: value.get("usage")?.as_str()?.to_string(),
        minimum_ratio: value.get("minimumRatio").and_then(Value::as_f64),
    })
}

pub(crate) fn token_registry() -> &'static TokenRegistry {
    static REGISTRY: OnceLock<TokenRegistry> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        let json: Value = serde_json::from_str(TOKEN_REGISTRY_JSON)
            .expect("embedded token registry is valid JSON");
        TokenRegistry::from_json(&json)
    })
}

/// THE brand token (token-registry-spec §2.4). There is no second brand key.
const BRAND_TOKEN: &str = "color.primary";

/// Token keys an author reaches for when they mean the brand and the registry
/// does not declare. Naming them buys a better W708 message and nothing else:
/// nothing aliases them onto [`BRAND_TOKEN`], because a silent alias is how a
/// tenant's brand colour travels the whole chain and paints nothing
/// (token-registry-spec §2.4).
const BRAND_LOOKALIKES: [&str; 6] = [
    "color.accent",
    "color.brand",
    "color.highlight",
    "color.dark.accent",
    "color.dark.brand",
    "color.dark.highlight",
];

/// Validate `$.tokens` declarations against the platform registry (W700–W703, W708–W709).
pub(crate) fn lint_declared_tokens(theme: &Value, diags: &mut Vec<LintDiagnostic>) {
    let registry = token_registry();
    let Some(tokens) = theme.get("tokens").and_then(|v| v.as_object()) else {
        return;
    };

    for (name, value) in tokens {
        let path = format!("$.tokens.{name}");

        if !registry.contains(name) && !name.starts_with("x-") {
            let hint = if BRAND_LOOKALIKES.contains(&name.as_str()) {
                format!(
                    " — the brand token is '{BRAND_TOKEN}', and nothing aliases '{name}' onto it, so this value is emitted as a CSS custom property no stylesheet reads"
                )
            } else {
                String::new()
            };
            diags.push(metadata::with_metadata(LintDiagnostic::warning(
                crate::LintCode::W708,
                PASS,
                &path,
                format!(
                    "Token '{name}' is not a recognized platform token and does not use the 'x-' extension prefix{hint}"
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
                            crate::LintCode::W702,
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
                            crate::LintCode::W703,
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
                        crate::LintCode::W700,
                        PASS,
                        &path,
                        format!("Color token '{name}' has invalid CSS color value: '{s}'"),
                    )));
                }
                Some("dimension") if !is_css_length(s) => {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::W701,
                        PASS,
                        &path,
                        format!("Dimension token '{name}' has invalid CSS length value: '{s}'"),
                    )));
                }
                Some("fontWeight") if !is_font_weight(s) => {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::W702,
                        PASS,
                        &path,
                        format!("Font weight token '{name}' has invalid value: '{s}' (expected 100-900 in steps of 100, or 'normal'/'bold')"),
                    )));
                }
                Some("number") if !is_line_height(s) => {
                    diags.push(metadata::with_metadata(LintDiagnostic::warning(
                        crate::LintCode::W703,
                        PASS,
                        &path,
                        format!(
                            "Number token '{name}' must be a unitless positive number, got: '{s}'"
                        ),
                    )));
                }
                _ => {}
            }
        }
    }

    for key in registry.all_keys() {
        if !tokens.contains_key(key.as_str()) {
            let source = if registry.is_adapter_default(key) {
                "the adapter's own value will be used"
            } else {
                "platform default will be used"
            };
            diags.push(metadata::with_metadata(LintDiagnostic::info(
                crate::LintCode::W709,
                PASS,
                "$.tokens",
                format!("Platform token '{key}' not declared in theme ({source})"),
            )));
        }
    }
}
