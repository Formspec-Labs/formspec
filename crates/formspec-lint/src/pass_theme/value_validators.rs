//! CSS value validators for theme token declarations (W700–W703).

/// Check if a string is a valid CSS color: hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA),
/// rgb(), rgba(), hsl(), hsla(), or CSS named colors.
pub(crate) fn is_css_color(s: &str) -> bool {
    let s = s.trim();
    if let Some(hex) = s.strip_prefix('#') {
        let len = hex.len();
        return (len == 3 || len == 4 || len == 6 || len == 8)
            && hex.chars().all(|c| c.is_ascii_hexdigit());
    }
    for prefix in &["rgba(", "rgb(", "hsla(", "hsl("] {
        if s.starts_with(prefix) && s.ends_with(')') {
            return true;
        }
    }
    is_css_named_color(s)
}

/// CSS named colors from CSS Color Level 4.
fn is_css_named_color(s: &str) -> bool {
    const NAMED_COLORS: &[&str] = &[
        "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
        "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue",
        "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan",
        "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey",
        "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred",
        "darksalmon", "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey",
        "darkturquoise", "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey",
        "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
        "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
        "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
        "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
        "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
        "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
        "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen", "linen",
        "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid",
        "mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen",
        "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream", "mistyrose",
        "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
        "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise",
        "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue",
        "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon",
        "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue",
        "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal",
        "thistle", "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke",
        "yellow", "yellowgreen", "transparent",
    ];
    NAMED_COLORS.contains(&s.to_ascii_lowercase().as_str())
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
