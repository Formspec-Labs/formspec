//! Effective Theme color-pair contrast checks (W714).
#![expect(
    clippy::missing_docs_in_private_items,
    reason = "Small parsing helpers are described by their focused tests"
)]

use serde_json::{Map, Value};

use crate::metadata;
use crate::types::LintDiagnostic;

use super::PASS;
use super::token_registry::{PlatformContrastPair, TokenRegistry};

// Rust guideline compliant 2026-02-21

/// WCAG 2.2 Level AA floor for normal-sized text.
const NORMAL_TEXT_MINIMUM: f64 = 4.5;
/// WCAG 2.2 floor for large text and non-text UI component boundaries.
const LARGE_OR_NON_TEXT_MINIMUM: f64 = 3.0;

#[derive(Debug)]
struct ContrastPair {
    id: String,
    foreground_token: String,
    background_token: String,
    usage: String,
    minimum_ratio: Option<f64>,
}

impl From<&PlatformContrastPair> for ContrastPair {
    fn from(value: &PlatformContrastPair) -> Self {
        Self {
            id: value.id.clone(),
            foreground_token: value.foreground_token.clone(),
            background_token: value.background_token.clone(),
            usage: value.usage.clone(),
            minimum_ratio: value.minimum_ratio,
        }
    }
}

/// Check inferred platform pairs affected by overrides and explicit custom pairs.
pub(crate) fn lint_contrast_pairs(
    theme: &Value,
    registry: &TokenRegistry,
    diags: &mut Vec<LintDiagnostic>,
) {
    let empty_tokens = Map::new();
    let authored = theme
        .get("tokens")
        .and_then(Value::as_object)
        .unwrap_or(&empty_tokens);

    for pair in registry.contrast_pairs() {
        if !registry.is_affected(authored, &pair.foreground_token)
            && !registry.is_affected(authored, &pair.background_token)
        {
            continue;
        }
        let path = inferred_path(authored, registry, pair);
        lint_pair(
            &ContrastPair::from(pair),
            path,
            false,
            authored,
            registry,
            diags,
        );
    }

    let Some(pairs) = theme.get("contrastPairs").and_then(Value::as_array) else {
        return;
    };
    for (index, value) in pairs.iter().enumerate() {
        let Some(pair) = parse_authored_pair(value) else {
            continue;
        };
        lint_pair(
            &pair,
            format!("$.contrastPairs[{index}]"),
            true,
            authored,
            registry,
            diags,
        );
    }
}

fn inferred_path(
    authored: &Map<String, Value>,
    registry: &TokenRegistry,
    pair: &PlatformContrastPair,
) -> String {
    let token = if registry.is_affected(authored, &pair.foreground_token) {
        &pair.foreground_token
    } else {
        &pair.background_token
    };
    format!("$.tokens.{token}")
}

fn parse_authored_pair(value: &Value) -> Option<ContrastPair> {
    Some(ContrastPair {
        id: value.get("id")?.as_str()?.to_string(),
        foreground_token: value.get("foregroundToken")?.as_str()?.to_string(),
        background_token: value.get("backgroundToken")?.as_str()?.to_string(),
        usage: value.get("usage")?.as_str()?.to_string(),
        minimum_ratio: value.get("minimumRatio").and_then(Value::as_f64),
    })
}

fn lint_pair(
    pair: &ContrastPair,
    path: String,
    report_missing: bool,
    authored: &Map<String, Value>,
    registry: &TokenRegistry,
    diags: &mut Vec<LintDiagnostic>,
) {
    let foreground = registry.effective_string(authored, &pair.foreground_token);
    let background = registry.effective_string(authored, &pair.background_token);

    let (Some(foreground), Some(background)) = (foreground, background) else {
        if report_missing {
            diags.push(metadata::with_metadata(LintDiagnostic::warning(
                crate::LintCode::W714,
                PASS,
                path,
                format!(
                    "Contrast pair '{}' cannot be evaluated because '{}' or '{}' has no effective string color value",
                    pair.id, pair.foreground_token, pair.background_token
                ),
            )));
        }
        return;
    };

    let (Some(foreground_rgb), Some(background_rgb)) = (
        parse_opaque_srgb(&foreground),
        parse_opaque_srgb(&background),
    ) else {
        // CSS colors that depend on another surface, a color space, or alpha
        // compositing do not have enough local evidence for a truthful ratio.
        return;
    };

    let ratio = contrast_ratio(foreground_rgb, background_rgb);
    let minimum = minimum_ratio(&pair.usage, pair.minimum_ratio);
    if ratio + f64::EPSILON >= minimum {
        return;
    }

    diags.push(metadata::with_metadata(LintDiagnostic::warning(
        crate::LintCode::W714,
        PASS,
        path,
        format!(
            "Contrast pair '{}' resolves '{}' ({foreground}) against '{}' ({background}) at {ratio:.2}:1; {} requires at least {minimum:.2}:1",
            pair.id,
            pair.foreground_token,
            pair.background_token,
            pair.usage
        ),
    )));
}

fn minimum_ratio(usage: &str, declared: Option<f64>) -> f64 {
    let standards_floor = match usage {
        "normalText" => NORMAL_TEXT_MINIMUM,
        "largeText" | "uiComponent" => LARGE_OR_NON_TEXT_MINIMUM,
        _ => NORMAL_TEXT_MINIMUM,
    };
    declared.map_or(standards_floor, |value| value.max(standards_floor))
}

fn parse_opaque_srgb(value: &str) -> Option<[f64; 3]> {
    let color = csscolorparser::parse(value).ok()?;
    if (color.a - 1.0).abs() > f32::EPSILON {
        return None;
    }
    Some([
        f64::from(color.r) * 255.0,
        f64::from(color.g) * 255.0,
        f64::from(color.b) * 255.0,
    ])
}

fn contrast_ratio(foreground: [f64; 3], background: [f64; 3]) -> f64 {
    let foreground_luminance = relative_luminance(foreground);
    let background_luminance = relative_luminance(background);
    let lighter = foreground_luminance.max(background_luminance);
    let darker = foreground_luminance.min(background_luminance);
    (lighter + 0.05) / (darker + 0.05)
}

fn relative_luminance(color: [f64; 3]) -> f64 {
    let [red, green, blue] = color.map(linear_channel);
    0.2126 * red + 0.7152 * green + 0.0722 * blue
}

fn linear_channel(channel: f64) -> f64 {
    let normalized = channel / 255.0;
    if normalized <= 0.04045 {
        normalized / 12.92
    } else {
        ((normalized + 0.055) / 1.055).powf(2.4)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::pass_theme::token_registry::token_registry;

    #[test]
    fn parses_supported_opaque_css_colors() {
        assert_eq!(parse_opaque_srgb("#fff"), Some([255.0, 255.0, 255.0]));
        let integer_rgb = parse_opaque_srgb("rgb(0, 127, 255)").expect("opaque integer rgb");
        assert!((integer_rgb[0] - 0.0).abs() < 0.001);
        assert!((integer_rgb[1] - 127.0).abs() < 0.001);
        assert!((integer_rgb[2] - 255.0).abs() < 0.001);
        let percent_rgb = parse_opaque_srgb("rgba(0%, 50%, 100%, 1)").expect("opaque percent rgb");
        assert!((percent_rgb[0] - 0.0).abs() < 0.001);
        assert!((percent_rgb[1] - 127.5).abs() < 0.001);
        assert!((percent_rgb[2] - 255.0).abs() < 0.001);
    }

    #[test]
    fn skips_colors_without_a_local_opaque_srgb_value() {
        assert_eq!(parse_opaque_srgb("rgba(0, 0, 0, 0.5)"), None);
        assert_eq!(parse_opaque_srgb("transparent"), None);
    }

    #[test]
    fn parses_named_and_hsl_css_colors() {
        assert_eq!(parse_opaque_srgb("red"), Some([255.0, 0.0, 0.0]));
        let black = parse_opaque_srgb("hsl(0, 0%, 0%)").expect("opaque HSL");
        assert!(black.iter().all(|channel| channel.abs() < 0.001));
    }

    #[test]
    fn wcag_ratio_has_expected_extremes() {
        assert!((contrast_ratio([0.0; 3], [255.0; 3]) - 21.0).abs() < 0.001);
        assert!((contrast_ratio([255.0; 3], [255.0; 3]) - 1.0).abs() < 0.001);
    }

    #[test]
    fn platform_pairs_have_unique_ids_and_resolvable_colors() {
        let registry = token_registry();
        let authored = Map::new();
        let mut ids = HashSet::new();
        assert!(!registry.contrast_pairs().is_empty());

        for pair in registry.contrast_pairs() {
            assert!(
                ids.insert(pair.id.as_str()),
                "duplicate pair id: {}",
                pair.id
            );
            for token in [&pair.foreground_token, &pair.background_token] {
                let value = registry
                    .effective_string(&authored, token)
                    .unwrap_or_else(|| panic!("pair {} has unresolved token {token}", pair.id));
                assert!(
                    parse_opaque_srgb(&value).is_some(),
                    "pair {} token {token} is not an opaque CSS color: {value}",
                    pair.id
                );
            }
        }
    }
}
