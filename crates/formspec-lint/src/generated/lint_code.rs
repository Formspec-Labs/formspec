//! AUTO-GENERATED from specs/lint-codes.json — DO NOT EDIT.
//! Regenerate: `npm run docs:generate` or `node scripts/generate-lint-codes.mjs`.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// Canonical lint diagnostic code (registry-driven).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LintCode {
    /// Registry code `E100`.
    E100,
    /// Registry code `E101`.
    E101,
    /// Registry code `E200`.
    E200,
    /// Registry code `E201`.
    E201,
    /// Registry code `E300`.
    E300,
    /// Registry code `E301`.
    E301,
    /// Registry code `E302`.
    E302,
    /// Registry code `W300`.
    W300,
    /// Registry code `E400`.
    E400,
    /// Registry code `E500`.
    E500,
    /// Registry code `E600`.
    E600,
    /// Registry code `E601`.
    E601,
    /// Registry code `E602`.
    E602,
    /// Registry code `W700`.
    W700,
    /// Registry code `W701`.
    W701,
    /// Registry code `W702`.
    W702,
    /// Registry code `W703`.
    W703,
    /// Registry code `W704`.
    W704,
    /// Registry code `W705`.
    W705,
    /// Registry code `W706`.
    W706,
    /// Registry code `W707`.
    W707,
    /// Registry code `W708`.
    W708,
    /// Registry code `W709`.
    W709,
    /// Registry code `E710`.
    E710,
    /// Registry code `W711`.
    W711,
    /// Registry code `E800`.
    E800,
    /// Registry code `E801`.
    E801,
    /// Registry code `E802`.
    E802,
    /// Registry code `E803`.
    E803,
    /// Registry code `E804`.
    E804,
    /// Registry code `E806`.
    E806,
    /// Registry code `E807`.
    E807,
    /// Registry code `W800`.
    W800,
    /// Registry code `W801`.
    W801,
    /// Registry code `W802`.
    W802,
    /// Registry code `W803`.
    W803,
    /// Registry code `W804`.
    W804,
    /// Registry code `E900`.
    E900,
    /// Registry code `E901`.
    E901,
    /// Registry code `E902`.
    E902,
}

impl LintCode {
    /// JSON / diagnostic wire string (e.g. `"E300"`).
    pub const fn as_wire_str(self) -> &'static str {
        match self {
            LintCode::E100 => "E100",
            LintCode::E101 => "E101",
            LintCode::E200 => "E200",
            LintCode::E201 => "E201",
            LintCode::E300 => "E300",
            LintCode::E301 => "E301",
            LintCode::E302 => "E302",
            LintCode::W300 => "W300",
            LintCode::E400 => "E400",
            LintCode::E500 => "E500",
            LintCode::E600 => "E600",
            LintCode::E601 => "E601",
            LintCode::E602 => "E602",
            LintCode::W700 => "W700",
            LintCode::W701 => "W701",
            LintCode::W702 => "W702",
            LintCode::W703 => "W703",
            LintCode::W704 => "W704",
            LintCode::W705 => "W705",
            LintCode::W706 => "W706",
            LintCode::W707 => "W707",
            LintCode::W708 => "W708",
            LintCode::W709 => "W709",
            LintCode::E710 => "E710",
            LintCode::W711 => "W711",
            LintCode::E800 => "E800",
            LintCode::E801 => "E801",
            LintCode::E802 => "E802",
            LintCode::E803 => "E803",
            LintCode::E804 => "E804",
            LintCode::E806 => "E806",
            LintCode::E807 => "E807",
            LintCode::W800 => "W800",
            LintCode::W801 => "W801",
            LintCode::W802 => "W802",
            LintCode::W803 => "W803",
            LintCode::W804 => "W804",
            LintCode::E900 => "E900",
            LintCode::E901 => "E901",
            LintCode::E902 => "E902",
        }
    }

    /// Lint pass number from the registry.
    pub const fn pass(self) -> u8 {
        match self {
            LintCode::E100 => 1,
            LintCode::E101 => 1,
            LintCode::E200 => 2,
            LintCode::E201 => 2,
            LintCode::E300 => 3,
            LintCode::E301 => 3,
            LintCode::E302 => 3,
            LintCode::W300 => 3,
            LintCode::E400 => 4,
            LintCode::E500 => 5,
            LintCode::E600 => 3,
            LintCode::E601 => 3,
            LintCode::E602 => 3,
            LintCode::W700 => 6,
            LintCode::W701 => 6,
            LintCode::W702 => 6,
            LintCode::W703 => 6,
            LintCode::W704 => 6,
            LintCode::W705 => 6,
            LintCode::W706 => 6,
            LintCode::W707 => 6,
            LintCode::W708 => 6,
            LintCode::W709 => 6,
            LintCode::E710 => 6,
            LintCode::W711 => 6,
            LintCode::E800 => 7,
            LintCode::E801 => 7,
            LintCode::E802 => 7,
            LintCode::E803 => 7,
            LintCode::E804 => 7,
            LintCode::E806 => 7,
            LintCode::E807 => 7,
            LintCode::W800 => 7,
            LintCode::W801 => 7,
            LintCode::W802 => 7,
            LintCode::W803 => 7,
            LintCode::W804 => 7,
            LintCode::E900 => 8,
            LintCode::E901 => 8,
            LintCode::E902 => 8,
        }
    }

    /// Parse a wire code; returns `None` for unknown values.
    pub fn parse_wire(s: &str) -> Option<Self> {
        match s {
            "E100" => Some(LintCode::E100),
            "E101" => Some(LintCode::E101),
            "E200" => Some(LintCode::E200),
            "E201" => Some(LintCode::E201),
            "E300" => Some(LintCode::E300),
            "E301" => Some(LintCode::E301),
            "E302" => Some(LintCode::E302),
            "W300" => Some(LintCode::W300),
            "E400" => Some(LintCode::E400),
            "E500" => Some(LintCode::E500),
            "E600" => Some(LintCode::E600),
            "E601" => Some(LintCode::E601),
            "E602" => Some(LintCode::E602),
            "W700" => Some(LintCode::W700),
            "W701" => Some(LintCode::W701),
            "W702" => Some(LintCode::W702),
            "W703" => Some(LintCode::W703),
            "W704" => Some(LintCode::W704),
            "W705" => Some(LintCode::W705),
            "W706" => Some(LintCode::W706),
            "W707" => Some(LintCode::W707),
            "W708" => Some(LintCode::W708),
            "W709" => Some(LintCode::W709),
            "E710" => Some(LintCode::E710),
            "W711" => Some(LintCode::W711),
            "E800" => Some(LintCode::E800),
            "E801" => Some(LintCode::E801),
            "E802" => Some(LintCode::E802),
            "E803" => Some(LintCode::E803),
            "E804" => Some(LintCode::E804),
            "E806" => Some(LintCode::E806),
            "E807" => Some(LintCode::E807),
            "W800" => Some(LintCode::W800),
            "W801" => Some(LintCode::W801),
            "W802" => Some(LintCode::W802),
            "W803" => Some(LintCode::W803),
            "W804" => Some(LintCode::W804),
            "E900" => Some(LintCode::E900),
            "E901" => Some(LintCode::E901),
            "E902" => Some(LintCode::E902),
            _ => None,
        }
    }

    /// Every registered code (for registry consistency checks).
    pub const ALL: &'static [Self] = &[LintCode::E100, LintCode::E101, LintCode::E200, LintCode::E201, LintCode::E300, LintCode::E301, LintCode::E302, LintCode::W300, LintCode::E400, LintCode::E500, LintCode::E600, LintCode::E601, LintCode::E602, LintCode::W700, LintCode::W701, LintCode::W702, LintCode::W703, LintCode::W704, LintCode::W705, LintCode::W706, LintCode::W707, LintCode::W708, LintCode::W709, LintCode::E710, LintCode::W711, LintCode::E800, LintCode::E801, LintCode::E802, LintCode::E803, LintCode::E804, LintCode::E806, LintCode::E807, LintCode::W800, LintCode::W801, LintCode::W802, LintCode::W803, LintCode::W804, LintCode::E900, LintCode::E901, LintCode::E902];
}

impl fmt::Display for LintCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_wire_str())
    }
}

impl Serialize for LintCode {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_wire_str())
    }
}

impl<'de> Deserialize<'de> for LintCode {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse_wire(&s)
            .ok_or_else(|| serde::de::Error::custom(format!("unknown lint code: {s}")))
    }
}

impl FromStr for LintCode {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::parse_wire(s).ok_or(())
    }
}

impl PartialEq<str> for LintCode {
    fn eq(&self, other: &str) -> bool {
        self.as_wire_str() == other
    }
}

impl PartialEq<&str> for LintCode {
    fn eq(&self, other: &&str) -> bool {
        self.as_wire_str() == *other
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn lint_code_serde_round_trip() {
        let code = LintCode::E300;
        let wire = serde_json::to_value(code).unwrap();
        assert_eq!(wire, json!("E300"));
        let back: LintCode = serde_json::from_value(wire).unwrap();
        assert_eq!(back, code);
    }

    #[test]
    fn registry_variant_count_matches_json() {
        assert_eq!(LintCode::ALL.len(), 40);
    }
}
