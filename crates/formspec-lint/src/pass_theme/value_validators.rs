//! CSS value validators for theme token declarations (W700–W703).

/// Check if a string is a valid CSS color: hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA),
/// CSS Color functions, or CSS named colors.
pub(crate) fn is_css_color(s: &str) -> bool {
    let s = s.trim();
    let looks_like_bare_hex = matches!(s.len(), 3 | 4 | 6 | 8)
        && s.chars().all(|character| character.is_ascii_hexdigit());
    !looks_like_bare_hex && csscolorparser::parse(s).is_ok()
}

const CSS_LENGTH_UNITS: &[&str] = &[
    "px", "rem", "em", "vw", "vh", "%", "ch", "ex", "cm", "mm", "in", "pt", "pc",
];

/// Check if a string is a valid CSS length (e.g., "8px", "1rem", "50%", "0").
pub(crate) fn is_css_length(s: &str) -> bool {
    let s = s.trim();
    if s == "0" {
        return true;
    }
    for unit in CSS_LENGTH_UNITS {
        if let Some(num_part) = s.strip_suffix(unit) {
            return !num_part.is_empty() && num_part.parse::<f64>().is_ok();
        }
    }
    false
}

/// Check if a string is a valid font weight (100-900 in steps of 100, or "normal"/"bold").
pub(crate) fn is_font_weight(s: &str) -> bool {
    let s = s.trim();
    if s == "normal" || s == "bold" {
        return true;
    }
    if let Ok(n) = s.parse::<u32>() {
        return (100..=900).contains(&n) && n % 100 == 0;
    }
    false
}

/// Check if a string is a valid line height (unitless positive number).
pub(crate) fn is_line_height(s: &str) -> bool {
    let s = s.trim();
    match s.parse::<f64>() {
        Ok(n) => n > 0.0,
        Err(_) => false,
    }
}
