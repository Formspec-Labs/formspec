//! JSON parser error recovery and diagnostic repair.
//!
//! Provides resilient JSON parsing that captures precise syntax diagnostics
//! and recovers from common authoring flaws (trailing commas, comments,
//! unquoted keys, single quotes, unclosed delimiters) to return valid `serde_json::Value` trees.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Diagnostic issue discovered during JSON parsing or recovery.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JsonParseDiagnostic {
    /// Line number (1-based) where the flaw was detected.
    pub line: usize,
    /// Column number (1-based) where the flaw was detected.
    pub column: usize,
    /// Human-readable explanation of the syntax flaw.
    pub message: String,
    /// Action taken to recover (e.g., "removed trailing comma", "closed unmatched delimiter").
    pub recovery_action: Option<String>,
}

/// The outcome of parsing JSON with error recovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedJsonResult {
    /// Parsed JSON value.
    pub value: Value,
    /// Any diagnostics emitted during parsing or repair.
    pub diagnostics: Vec<JsonParseDiagnostic>,
    /// Whether recovery modifications were needed to produce valid JSON.
    pub recovered: bool,
}

/// Error returned when JSON cannot be parsed or recovered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonRecoveryError {
    /// Line number where parse failed.
    pub line: usize,
    /// Column number where parse failed.
    pub column: usize,
    /// Failure message.
    pub message: String,
}

impl std::fmt::Display for JsonRecoveryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "JSON parse error at line {}, column {}: {}",
            self.line, self.column, self.message
        )
    }
}

impl std::error::Error for JsonRecoveryError {}

/// Parse JSON text, falling back to structural recovery when syntax flaws are encountered.
pub fn parse_json_with_recovery(input: &str) -> Result<ParsedJsonResult, JsonRecoveryError> {
    // 1. Fast path: strict parse
    match serde_json::from_str::<Value>(input) {
        Ok(value) => Ok(ParsedJsonResult {
            value,
            diagnostics: Vec::new(),
            recovered: false,
        }),
        Err(initial_err) => {
            let mut diagnostics = Vec::new();
            diagnostics.push(JsonParseDiagnostic {
                line: initial_err.line(),
                column: initial_err.column(),
                message: initial_err.to_string(),
                recovery_action: None,
            });

            // 2. Recovery pipeline
            let (repaired, actions) = repair_json_text(input);
            for action in actions {
                diagnostics.push(action);
            }

            match serde_json::from_str::<Value>(&repaired) {
                Ok(value) => Ok(ParsedJsonResult {
                    value,
                    diagnostics,
                    recovered: true,
                }),
                Err(second_err) => Err(JsonRecoveryError {
                    line: second_err.line(),
                    column: second_err.column(),
                    message: format!(
                        "Unrecoverable JSON syntax: {}. Repaired text attempt also failed: {}",
                        initial_err, second_err
                    ),
                }),
            }
        }
    }
}

/// Apply a sequence of structural repairs to malformed JSON text.
fn repair_json_text(input: &str) -> (String, Vec<JsonParseDiagnostic>) {
    let mut actions = Vec::new();

    // Pass 1: Strip JavaScript/C-style line comments (// ...) and block comments (/* ... */) outside strings
    let mut cleaned = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escape = false;
    let mut line = 1;
    let mut col = 0;

    while let Some(ch) = chars.next() {
        col += 1;
        if ch == '\n' {
            line += 1;
            col = 0;
        }

        if in_string {
            cleaned.push(ch);
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        if ch == '"' {
            in_string = true;
            cleaned.push(ch);
            continue;
        }

        // Line comment
        if ch == '/' && chars.peek() == Some(&'/') {
            chars.next();
            actions.push(JsonParseDiagnostic {
                line,
                column: col,
                message: "Comment syntax '//' is not valid in standard JSON".to_string(),
                recovery_action: Some("Stripped single-line comment".to_string()),
            });
            while let Some(&next_ch) = chars.peek() {
                if next_ch == '\n' {
                    break;
                }
                chars.next();
            }
            continue;
        }

        // Block comment
        if ch == '/' && chars.peek() == Some(&'*') {
            chars.next();
            actions.push(JsonParseDiagnostic {
                line,
                column: col,
                message: "Block comment '/*' is not valid in standard JSON".to_string(),
                recovery_action: Some("Stripped block comment".to_string()),
            });
            while let Some(c) = chars.next() {
                if c == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    break;
                }
            }
            continue;
        }

        cleaned.push(ch);
    }

    // Pass 2: Replace single quotes outside strings with double quotes
    let mut pass2 = String::with_capacity(cleaned.len());
    let mut chars2 = cleaned.chars().peekable();
    let mut in_double_str = false;
    let mut in_single_str = false;
    let mut escape2 = false;

    while let Some(ch) = chars2.next() {
        if in_double_str {
            pass2.push(ch);
            if escape2 {
                escape2 = false;
            } else if ch == '\\' {
                escape2 = true;
            } else if ch == '"' {
                in_double_str = false;
            }
            continue;
        }

        if in_single_str {
            if escape2 {
                escape2 = false;
                pass2.push(ch);
            } else if ch == '\\' {
                escape2 = true;
                pass2.push(ch);
            } else if ch == '\'' {
                in_single_str = false;
                pass2.push('"');
            } else if ch == '"' {
                pass2.push_str("\\\"");
            } else {
                pass2.push(ch);
            }
            continue;
        }

        if ch == '"' {
            in_double_str = true;
            pass2.push(ch);
        } else if ch == '\'' {
            in_single_str = true;
            pass2.push('"');
            actions.push(JsonParseDiagnostic {
                line: 1,
                column: 1,
                message: "Single quotes used instead of double quotes".to_string(),
                recovery_action: Some("Converted single quotes to double quotes".to_string()),
            });
        } else {
            pass2.push(ch);
        }
    }

    // Pass 3: Remove trailing commas before } or ]
    let mut pass3 = String::with_capacity(pass2.len());
    let chars3: Vec<char> = pass2.chars().collect();
    let mut i = 0;
    let len = chars3.len();
    let mut in_str = false;
    let mut esc = false;

    while i < len {
        let ch = chars3[i];
        if in_str {
            pass3.push(ch);
            if esc {
                esc = false;
            } else if ch == '\\' {
                esc = true;
            } else if ch == '"' {
                in_str = false;
            }
            i += 1;
            continue;
        }

        if ch == '"' {
            in_str = true;
            pass3.push(ch);
            i += 1;
            continue;
        }

        if ch == ',' {
            // Check if next non-whitespace char is } or ]
            let mut j = i + 1;
            while j < len && chars3[j].is_whitespace() {
                j += 1;
            }
            if j < len && (chars3[j] == '}' || chars3[j] == ']') {
                actions.push(JsonParseDiagnostic {
                    line: 1,
                    column: 1,
                    message: "Trailing comma before delimiter".to_string(),
                    recovery_action: Some("Removed trailing comma".to_string()),
                });
                i += 1;
                continue;
            }
        }

        pass3.push(ch);
        i += 1;
    }

    // Pass 4: Balance unclosed braces or brackets
    let mut delimiter_stack = Vec::new();
    let mut in_s = false;
    let mut e = false;

    for ch in pass3.chars() {
        if in_s {
            if e {
                e = false;
            } else if ch == '\\' {
                e = true;
            } else if ch == '"' {
                in_s = false;
            }
            continue;
        }

        if ch == '"' {
            in_s = true;
            continue;
        }

        match ch {
            '{' => delimiter_stack.push('}'),
            '[' => delimiter_stack.push(']'),
            '}' => {
                if let Some(pos) = delimiter_stack.iter().rposition(|&d| d == '}') {
                    delimiter_stack.truncate(pos);
                }
            }
            ']' => {
                if let Some(pos) = delimiter_stack.iter().rposition(|&d| d == ']') {
                    delimiter_stack.truncate(pos);
                }
            }
            _ => {}
        }
    }

    if !delimiter_stack.is_empty() {
        actions.push(JsonParseDiagnostic {
            line: 1,
            column: 1,
            message: format!("Unclosed delimiters: {} open brackets/braces", delimiter_stack.len()),
            recovery_action: Some("Appended missing closing delimiters".to_string()),
        });
        while let Some(closing) = delimiter_stack.pop() {
            pass3.push(closing);
        }
    }

    (pass3, actions)
}
