#![allow(clippy::missing_docs_in_private_items)]

use super::value_validators::{is_css_color, is_css_length, is_font_weight, is_line_height};
use super::lint_theme;
use super::token_registry::token_registry;
use super::token_refs::extract_token_refs;
use crate::types::LintDiagnostic;
use serde_json::json;

    // Helper: find diagnostics with a specific code
    fn with_code<'a>(diags: &'a [LintDiagnostic], code: &str) -> Vec<&'a LintDiagnostic> {
        diags.iter().filter(|d| d.code == code).collect()
    }

    // ── 1. Empty theme — no diagnostics ─────────────────────────

    #[test]
    fn empty_theme_produces_no_diagnostics() {
        let theme = json!({});
        let diags = lint_theme(&theme, None);
        assert!(diags.is_empty());
    }

    #[test]
    fn minimal_theme_with_empty_tokens_only_emits_w709() {
        // An empty tokens object causes W709 (info) for every platform token
        let theme = json!({ "tokens": {} });
        let diags = lint_theme(&theme, None);
        // All diagnostics should be W709 (info severity)
        for d in &diags {
            assert_eq!(d.code, "W709", "Only W709 expected, got {}", d.code);
        }
        assert!(
            !diags.is_empty(),
            "Should emit W709 for missing platform tokens"
        );
    }

    // ── 2. Valid hex color — no W700 ────────────────────────────

    #[test]
    fn valid_hex_color_no_w700() {
        let theme = json!({
            "tokens": {
                "color.primary": "#0057B7",
                "color.error": "#D32F2F",
                "color.surface": "#00000000"
            }
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W700").is_empty());
    }

    #[test]
    fn valid_short_hex_color_no_w700() {
        // Use a known registry color token
        let theme = json!({ "tokens": { "color.background": "#FFF" } });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W700").is_empty());
    }

    #[test]
    fn valid_functional_colors_no_w700() {
        let theme = json!({
            "tokens": {
                "color.foreground": "rgb(255, 0, 0)",
                "color.border": "rgba(0, 0, 0, 0.5)",
                "color.card": "hsl(120, 50%, 50%)",
                "color.muted": "hsla(240, 100%, 50%, 0.7)"
            }
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W700").is_empty());
    }

    // ── 3. Invalid color token value — W700 ─────────────────────

    #[test]
    fn invalid_color_emits_w700() {
        let theme = json!({
            "tokens": {
                "color.primary": "not-a-color"
            }
        });
        let diags = lint_theme(&theme, None);
        let w700 = with_code(&diags, "W700");
        assert_eq!(w700.len(), 1);
        assert!(w700[0].path.contains("color.primary"));
        assert!(w700[0].message.contains("not-a-color"));
    }

    #[test]
    fn invalid_hex_too_long_emits_w700() {
        let theme = json!({ "tokens": { "color.border": "#1234567890" } });
        let diags = lint_theme(&theme, None);
        assert_eq!(with_code(&diags, "W700").len(), 1);
    }

    #[test]
    fn invalid_hex_bad_chars_emits_w700() {
        let theme = json!({ "tokens": { "color.border": "#GGHHII" } });
        let diags = lint_theme(&theme, None);
        assert_eq!(with_code(&diags, "W700").len(), 1);
    }

    // ── 4. CSS length validation ────────────────────────────────

    #[test]
    fn valid_css_lengths_no_w701() {
        // Use registry-known dimension tokens
        let theme = json!({
            "tokens": {
                "spacing.sm": "8px",
                "spacing.md": "1rem",
                "spacing.lg": "50%",
                "spacing.xs": "0",
                "radius.sm": "24px",
                "radius.md": "3em"
            }
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W701").is_empty());
    }

    #[test]
    fn invalid_css_length_emits_w701() {
        // Use a registry-known dimension token with invalid value
        let theme = json!({
            "tokens": {
                "spacing.sm": "not-a-length"
            }
        });
        let diags = lint_theme(&theme, None);
        let w701 = with_code(&diags, "W701");
        assert_eq!(w701.len(), 1);
        assert!(w701[0].message.contains("not-a-length"));
    }

    #[test]
    fn bare_number_string_invalid_length_emits_w701() {
        // "8" without a unit is not valid CSS length (only "0" is special)
        let theme = json!({ "tokens": { "spacing.md": "8" } });
        let diags = lint_theme(&theme, None);
        assert_eq!(with_code(&diags, "W701").len(), 1);
    }

    // ── 5. Font weight validator ──────────────────────────────────
    // The current platform registry has no fontWeight-typed tokens, so these
    // test the validator directly. lint_theme() will dispatch to is_font_weight
    // for any future registry token with type "fontWeight".

    #[test]
    fn valid_font_weights() {
        assert!(is_font_weight("400"));
        assert!(is_font_weight("bold"));
        assert!(is_font_weight("normal"));
    }

    #[test]
    fn valid_font_weight_numeric_range() {
        for w in (100..=900).step_by(100) {
            assert!(is_font_weight(&w.to_string()), "Weight {w} should be valid");
        }
    }

    #[test]
    fn invalid_font_weight_350() {
        assert!(!is_font_weight("350"));
    }

    #[test]
    fn font_weight_zero_invalid() {
        assert!(!is_font_weight("0"));
    }

    #[test]
    fn font_weight_1000_invalid() {
        assert!(!is_font_weight("1000"));
    }

    // ── 6. Line height / number validator ──────────────────────────
    // No "number"-typed tokens in the current registry, so test the validator
    // directly. lint_theme() dispatches to is_line_height for "number" type.

    #[test]
    fn valid_line_height() {
        assert!(is_line_height("1.5"));
    }

    #[test]
    fn line_height_with_unit_invalid() {
        assert!(!is_line_height("1.5px"));
    }

    #[test]
    fn line_height_zero_invalid() {
        assert!(!is_line_height("0"));
    }

    #[test]
    fn line_height_negative_invalid() {
        assert!(!is_line_height("-1.2"));
    }

    // ── 7. Token reference missing — W704 ───────────────────────

    #[test]
    fn missing_token_ref_emits_w704() {
        let theme = json!({
            "tokens": { "color.primary": "#000" },
            "defaults": {
                "style": { "color": "$token.missing" }
            }
        });
        let diags = lint_theme(&theme, None);
        let w704 = with_code(&diags, "W704");
        assert_eq!(w704.len(), 1);
        assert!(w704[0].message.contains("$token.missing"));
    }

    #[test]
    fn missing_token_ref_in_selector_apply() {
        let theme = json!({
            "tokens": {},
            "selectors": [{
                "match": "*",
                "apply": { "style": { "bg": "$token.nope" } }
            }]
        });
        let diags = lint_theme(&theme, None);
        assert_eq!(with_code(&diags, "W704").len(), 1);
    }

    #[test]
    fn missing_token_ref_in_selector_properties() {
        let theme = json!({
            "tokens": {},
            "selectors": [{
                "match": "*",
                "properties": { "bg": "$token.nope" }
            }]
        });
        let diags = lint_theme(&theme, None);
        assert_eq!(with_code(&diags, "W704").len(), 1);
    }

    #[test]
    fn missing_token_ref_in_items_override() {
        let theme = json!({
            "tokens": { "color.primary": "#000" },
            "items": {
                "field1": { "style": { "color": "$token.nonexistent" } }
            }
        });
        let diags = lint_theme(&theme, None);
        assert_eq!(with_code(&diags, "W704").len(), 1);
    }

    // ── 8. Token reference — no W704 for existing ───────────────

    #[test]
    fn existing_token_ref_no_w704() {
        let theme = json!({
            "tokens": {
                "color.primary": "#0057B7",
                "spacing.md": "16px"
            },
            "defaults": {
                "style": {
                    "color": "$token.color.primary",
                    "padding": "$token.spacing.md"
                }
            }
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W704").is_empty());
    }

    #[test]
    fn non_token_dollar_ref_ignored() {
        let theme = json!({
            "tokens": {},
            "defaults": { "style": { "content": "$fieldName" } }
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W704").is_empty());
    }

    // ── W708: Unknown non-extension token ────────────────────────

    #[test]
    fn w708_typo_token_emits_warning() {
        let theme = json!({
            "tokens": { "color.priary": "#000" }
        });
        let diags = lint_theme(&theme, None);
        let w708 = with_code(&diags, "W708");
        assert_eq!(w708.len(), 1);
        assert!(w708[0].message.contains("color.priary"));
    }

    #[test]
    fn w708_extension_token_no_warning() {
        let theme = json!({
            "tokens": { "x-custom.foo": "#abc" }
        });
        let diags = lint_theme(&theme, None);
        assert!(
            with_code(&diags, "W708").is_empty(),
            "Extension tokens (x- prefix) should not emit W708"
        );
    }

    #[test]
    fn w708_known_token_no_warning() {
        let theme = json!({
            "tokens": { "color.primary": "#000" }
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W708").is_empty());
    }

    // ── W709: Missing platform tokens (informational) ───────────

    #[test]
    fn w709_missing_platform_token_emits_info() {
        // Provide one token but not all — W709 fires for missing ones
        let theme = json!({
            "tokens": { "color.primary": "#000" }
        });
        let diags = lint_theme(&theme, None);
        let w709 = with_code(&diags, "W709");
        // There are many registry tokens, so at least some should be missing
        assert!(
            !w709.is_empty(),
            "Should emit W709 for missing platform tokens"
        );
        // Verify it mentions a known missing token
        assert!(
            w709.iter().any(|d| d.message.contains("color.error")
                || d.message.contains("spacing.md")
                || d.message.contains("color.background")),
            "W709 should mention a specific missing token"
        );
    }

    #[test]
    fn w709_not_emitted_when_no_tokens_object() {
        // W709 only fires when a tokens object exists
        let theme = json!({});
        let diags = lint_theme(&theme, None);
        assert!(
            with_code(&diags, "W709").is_empty(),
            "W709 should not fire when tokens object is absent"
        );
    }

    // ── W700 via registry dispatch ──────────────────────────────

    #[test]
    fn registry_dispatched_color_invalid_emits_w700() {
        let theme = json!({
            "tokens": { "color.primary": "not-a-color" }
        });
        let diags = lint_theme(&theme, None);
        let w700 = with_code(&diags, "W700");
        assert_eq!(w700.len(), 1);
        assert!(w700[0].message.contains("not-a-color"));
    }

    // ── 9. Duplicate page IDs — E710 ────────────────────────────

    #[test]
    fn duplicate_page_ids_emit_e710() {
        let theme = json!({
            "pages": [
                { "id": "info", "title": "Info" },
                { "id": "review", "title": "Review" },
                { "id": "info", "title": "Info Again" }
            ]
        });
        let diags = lint_theme(&theme, None);
        let e710 = with_code(&diags, "E710");
        assert_eq!(e710.len(), 1);
        assert!(e710[0].message.contains("info"));
        assert!(e710[0].path.contains("pages[2]"));
    }

    #[test]
    fn unique_page_ids_no_e710() {
        let theme = json!({
            "pages": [
                { "id": "page1", "title": "Page 1" },
                { "id": "page2", "title": "Page 2" }
            ]
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "E710").is_empty());
    }

    // ── 10. Token registry lookup ─────────────────────────────────

    #[test]
    fn registry_knows_color_tokens() {
        let reg = token_registry();
        assert_eq!(reg.token_type("color.primary"), Some("color"));
        assert_eq!(reg.token_type("color.error"), Some("color"));
        assert_eq!(reg.token_type("color.background"), Some("color"));
        assert!(reg.contains("color.primary"));
    }

    #[test]
    fn registry_knows_dimension_tokens() {
        let reg = token_registry();
        assert_eq!(reg.token_type("spacing.sm"), Some("dimension"));
        assert_eq!(reg.token_type("spacing.md"), Some("dimension"));
        assert_eq!(reg.token_type("radius.sm"), Some("dimension"));
        assert!(reg.contains("spacing.lg"));
    }

    #[test]
    fn registry_knows_font_family_tokens() {
        let reg = token_registry();
        assert_eq!(reg.token_type("font.family"), Some("fontFamily"));
    }

    #[test]
    fn registry_unknown_token_returns_none() {
        let reg = token_registry();
        assert_eq!(reg.token_type("nonexistent.token"), None);
        assert!(!reg.contains("nonexistent.token"));
    }

    #[test]
    fn registry_includes_dark_mode_keys() {
        let reg = token_registry();
        // color category has darkPrefix "color.dark"
        assert!(
            reg.contains("color.dark.primary"),
            "dark variant of color.primary"
        );
        assert_eq!(reg.token_type("color.dark.primary"), Some("color"));
    }

    // ── 11. $token.X extraction ─────────────────────────────────

    #[test]
    fn extract_single_ref() {
        let refs = extract_token_refs("$token.color.primary");
        assert_eq!(refs, vec!["color.primary"]);
    }

    #[test]
    fn extract_multiple_refs() {
        let refs =
            extract_token_refs("border: 1px solid $token.color.border, bg: $token.color.surface");
        assert_eq!(refs, vec!["color.border", "color.surface"]);
    }

    #[test]
    fn extract_no_refs() {
        let refs = extract_token_refs("no tokens here $field.name");
        assert!(refs.is_empty());
    }

    #[test]
    fn extract_ref_at_end_of_string() {
        let refs = extract_token_refs("color: $token.x");
        assert_eq!(refs, vec!["x"]);
    }

    #[test]
    fn extract_ref_followed_by_delimiter() {
        let refs = extract_token_refs("'$token.abc'");
        assert_eq!(refs, vec!["abc"]);
    }

    // ── W711: Responsive breakpoint not declared ────────────────

    #[test]
    fn undeclared_breakpoint_emits_w711() {
        let theme = json!({
            "breakpoints": { "sm": 576, "md": 768 },
            "pages": [{
                "id": "p1",
                "regions": [{
                    "key": "field1",
                    "responsive": {
                        "sm": { "span": 12 },
                        "xl": { "span": 6 }
                    }
                }]
            }]
        });
        let diags = lint_theme(&theme, None);
        let w711 = with_code(&diags, "W711");
        assert_eq!(w711.len(), 1);
        assert!(w711[0].message.contains("xl"));
    }

    #[test]
    fn declared_breakpoint_no_w711() {
        let theme = json!({
            "breakpoints": { "sm": 576, "md": 768 },
            "pages": [{
                "id": "p1",
                "regions": [{
                    "key": "f",
                    "responsive": { "sm": { "span": 12 }, "md": { "span": 6 } }
                }]
            }]
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W711").is_empty());
    }

    #[test]
    fn no_breakpoints_declared_all_responsive_keys_warn() {
        let theme = json!({
            "pages": [{
                "id": "p1",
                "regions": [{
                    "key": "f",
                    "responsive": { "sm": { "span": 12 } }
                }]
            }]
        });
        let diags = lint_theme(&theme, None);
        assert_eq!(with_code(&diags, "W711").len(), 1);
    }

    // ── Cross-artifact: W705-W707 ───────────────────────────────

    #[test]
    fn w705_theme_item_key_not_in_definition() {
        let theme = json!({
            "items": {
                "name": { "widget": "textInput" },
                "ghost": { "widget": "textarea" }
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{ "key": "name", "dataType": "string" }]
        });
        let diags = lint_theme(&theme, Some(&def));
        let w705 = with_code(&diags, "W705");
        assert_eq!(w705.len(), 1);
        assert!(w705[0].message.contains("ghost"));
    }

    #[test]
    fn w705_all_keys_match_no_warning() {
        let theme = json!({
            "items": { "name": { "widget": "textInput" } }
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{ "key": "name", "dataType": "string" }]
        });
        let diags = lint_theme(&theme, Some(&def));
        assert!(with_code(&diags, "W705").is_empty());
    }

    #[test]
    fn w705_skipped_without_definition() {
        let theme = json!({
            "items": { "ghost": { "widget": "textInput" } }
        });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "W705").is_empty());
    }

    #[test]
    fn w706_region_key_not_in_definition() {
        let theme = json!({
            "pages": [{
                "id": "p1",
                "regions": [
                    { "key": "name", "span": 12 },
                    { "key": "phantom", "span": 6 }
                ]
            }]
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{ "key": "name" }]
        });
        let diags = lint_theme(&theme, Some(&def));
        let w706 = with_code(&diags, "W706");
        assert_eq!(w706.len(), 1);
        assert!(w706[0].message.contains("phantom"));
    }

    #[test]
    fn w707_target_url_mismatch() {
        let theme = json!({
            "targetDefinition": {
                "url": "https://example.com/forms/other"
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/budget"
        });
        let diags = lint_theme(&theme, Some(&def));
        let w707 = with_code(&diags, "W707");
        assert_eq!(w707.len(), 1);
        assert!(w707[0].message.contains("other"));
        assert!(w707[0].message.contains("budget"));
    }

    #[test]
    fn w707_matching_url_no_warning() {
        let theme = json!({
            "targetDefinition": {
                "url": "https://example.com/forms/budget"
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.com/forms/budget"
        });
        let diags = lint_theme(&theme, Some(&def));
        assert!(with_code(&diags, "W707").is_empty());
    }

    #[test]
    fn w707_skipped_when_definition_has_no_url() {
        let theme = json!({
            "targetDefinition": { "url": "https://example.com/forms/x" }
        });
        let def = json!({ "$formspec": "1.0", "items": [] });
        let diags = lint_theme(&theme, Some(&def));
        assert!(with_code(&diags, "W707").is_empty());
    }

    // ── All diagnostics use pass 6 ──────────────────────────────

    #[test]
    fn all_diagnostics_are_pass_6() {
        let theme = json!({
            "tokens": { "color.primary": "nope", "spacing.sm": "nah" },
            "defaults": { "style": { "x": "$token.ghost" } },
            "pages": [
                { "id": "dup" },
                { "id": "dup" }
            ]
        });
        let diags = lint_theme(&theme, None);
        assert!(!diags.is_empty());
        for d in &diags {
            assert_eq!(d.pass, 6, "Diagnostic {} should be pass 6", d.code);
        }
    }

    // ── Nested children found by cross-artifact checks ──────────

    #[test]
    fn w705_finds_nested_child_keys() {
        let theme = json!({
            "items": {
                "amount": { "widget": "numberInput" }
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{
                "key": "lines",
                "children": [{ "key": "amount", "dataType": "decimal" }]
            }]
        });
        let diags = lint_theme(&theme, Some(&def));
        assert!(
            with_code(&diags, "W705").is_empty(),
            "amount is a nested child, should match"
        );
    }

    /// Dotted nested path (e.g., "lines.amount") should match a nested child.
    #[test]
    fn w705_dotted_nested_path_matches() {
        let theme = json!({
            "items": {
                "lines.amount": { "widget": "numberInput" }
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{
                "key": "lines",
                "children": [{ "key": "amount", "dataType": "decimal" }]
            }]
        });
        let diags = lint_theme(&theme, Some(&def));
        assert!(
            with_code(&diags, "W705").is_empty(),
            "lines.amount is a valid dotted path, should not warn"
        );
    }

    /// Dotted path that doesn't correspond to the actual nesting should warn.
    #[test]
    fn w705_invalid_dotted_path_warns() {
        let theme = json!({
            "items": {
                "lines.ghost": { "widget": "numberInput" }
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{
                "key": "lines",
                "children": [{ "key": "amount", "dataType": "decimal" }]
            }]
        });
        let diags = lint_theme(&theme, Some(&def));
        assert_eq!(
            with_code(&diags, "W705").len(),
            1,
            "lines.ghost is not a valid path"
        );
    }

    /// Deeply nested dotted path (3 levels) should match.
    #[test]
    fn w705_deep_dotted_path_matches() {
        let theme = json!({
            "items": {
                "section.group.field": { "widget": "textInput" }
            }
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{
                "key": "section",
                "children": [{
                    "key": "group",
                    "children": [{ "key": "field", "dataType": "string" }]
                }]
            }]
        });
        let diags = lint_theme(&theme, Some(&def));
        assert!(
            with_code(&diags, "W705").is_empty(),
            "section.group.field is a valid dotted path"
        );
    }

    // ── Finding 56: rgb() content not validated ────────────────

    /// Spec: theme-spec.md §3.2 (line 251) — is_css_color intentionally only
    /// checks the wrapper format (rgb(...), hsl(...), etc), not the validity
    /// of the content inside the parentheses.
    #[test]
    fn functional_color_content_not_validated() {
        assert!(
            is_css_color("rgb(not, valid, at all)"),
            "is_css_color only checks the wrapper, not content validity"
        );
    }

    // ── Finding 57: Named CSS colors ─────────────────────────────

    /// Spec: theme-spec.md §3.2 (line 251) — "Colors (hex, rgb, hsl, named)".
    /// Named colors like "red", "navy", "transparent" must be accepted.
    #[test]
    fn named_css_colors_accepted() {
        for name in &[
            "red",
            "blue",
            "green",
            "navy",
            "transparent",
            "rebeccapurple",
            "coral",
        ] {
            assert!(
                is_css_color(name),
                "Named color '{name}' should be accepted"
            );
        }
    }

    /// Spec: theme-spec.md §3.2 — named colors are case-insensitive.
    #[test]
    fn named_css_colors_case_insensitive() {
        assert!(is_css_color("Red"));
        assert!(is_css_color("BLUE"));
        assert!(is_css_color("Navy"));
    }

    /// Spec: theme-spec.md §3.2 — named color tokens should not emit W700.
    #[test]
    fn named_color_token_no_w700() {
        let theme = json!({
            "tokens": {
                "color.primary": "red",
                "color.error": "navy",
                "color.background": "transparent"
            }
        });
        let diags = lint_theme(&theme, None);
        assert!(
            with_code(&diags, "W700").is_empty(),
            "Named colors should not emit W700"
        );
    }

    // ── Finding 58: 4-char hex (#RGBA) ───────────────────────────

    /// Spec: theme-spec.md §3.2 — "hex" includes CSS Color Level 4's #RGBA format.
    #[test]
    fn four_char_hex_rgba_accepted() {
        assert!(is_css_color("#F00A"), "#RGBA (4-char hex) should be valid");
        assert!(is_css_color("#abcd"), "lowercase #RGBA should be valid");
    }

    /// Spec: theme-spec.md §3.2 — #RGBA token should not emit W700.
    #[test]
    fn four_char_hex_token_no_w700() {
        // Use a registry-known color token
        let theme = json!({
            "tokens": { "color.ring": "#0008" }
        });
        let diags = lint_theme(&theme, None);
        assert!(
            with_code(&diags, "W700").is_empty(),
            "#RGBA hex should not emit W700"
        );
    }

    // ── Finding 59: Negative CSS lengths ─────────────────────────

    /// Spec: theme-spec.md §3.2 — CSS allows negative lengths (e.g. margins).
    #[test]
    fn negative_css_length_accepted() {
        assert!(is_css_length("-8px"), "Negative px length should be valid");
        assert!(
            is_css_length("-1.5rem"),
            "Negative rem length should be valid"
        );
        assert!(is_css_length("-50%"), "Negative percentage should be valid");
    }

    // ── Finding 60: Whitespace between number and unit ───────────

    /// Spec: theme-spec.md §3.2 — CSS forbids whitespace between the number and unit.
    #[test]
    fn whitespace_between_number_and_unit_rejected() {
        assert!(
            !is_css_length("8 px"),
            "Whitespace before unit should be rejected"
        );
        assert!(
            !is_css_length("1 rem"),
            "Whitespace before rem should be rejected"
        );
    }

    // ── Finding 61: Region without key in W706 check ─────────────

    /// Spec: theme-spec.md §6.2, schemas/theme.schema.json — a region without
    /// a `key` field is skipped in the W706 check (no panic, no diagnostic).
    #[test]
    fn region_without_key_skipped_in_w706() {
        let theme = json!({
            "pages": [{
                "id": "p1",
                "regions": [
                    { "span": 12 },
                    { "key": "missing_field", "span": 6 }
                ]
            }]
        });
        let def = json!({
            "$formspec": "1.0",
            "items": [{ "key": "name" }]
        });
        let diags = lint_theme(&theme, Some(&def));
        // Only the region WITH a key should be checked — "missing_field" not in definition → W706
        let w706 = with_code(&diags, "W706");
        assert_eq!(
            w706.len(),
            1,
            "Only the region with key should produce W706"
        );
        assert!(w706[0].message.contains("missing_field"));
    }

    // ── Number-typed token values (validator-level) ──────────────
    // No fontWeight-typed tokens in current registry; test validators directly.

    #[test]
    fn font_weight_number_400_valid() {
        assert!(is_font_weight("400"));
    }

    #[test]
    fn font_weight_number_350_invalid() {
        assert!(!is_font_weight("350"));
    }

    // ── Empty pages array ────────────────────────────────────────

    /// Spec: theme-spec.md §5 — empty pages array is valid (no pages defined)
    #[test]
    fn empty_pages_array_no_diagnostics() {
        let theme = json!({ "pages": [] });
        let diags = lint_theme(&theme, None);
        assert!(with_code(&diags, "E710").is_empty());
        assert!(with_code(&diags, "W711").is_empty());
    }

    // ── Pages without id fields ─────────────────────────────────

    /// Spec: theme-spec.md §5 — pages without an id field do not trigger E710
    /// (they simply don't participate in duplicate checking)
    #[test]
    fn pages_without_id_skip_duplicate_check() {
        let theme = json!({
            "pages": [
                { "title": "Step 1" },
                { "title": "Step 2" },
                { "id": "review", "title": "Review" }
            ]
        });
        let diags = lint_theme(&theme, None);
        assert!(
            with_code(&diags, "E710").is_empty(),
            "Pages without id should be silently skipped"
        );
    }

    // ── $token. in non-string contexts ──────────────────────────

    /// Spec: theme-spec.md §3 — $token. references are only extracted from string values;
    /// numeric or boolean values do not trigger token reference checks.
    #[test]
    fn token_ref_in_numeric_value_not_checked() {
        let theme = json!({
            "tokens": {},
            "defaults": {
                "columns": 3,
                "visible": true
            }
        });
        let diags = lint_theme(&theme, None);
        assert!(
            with_code(&diags, "W704").is_empty(),
            "Non-string values should not be checked for token refs"
        );
    }

