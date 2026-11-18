//! Exact-text rewriting using locations from the FEL parser.
#![allow(clippy::missing_docs_in_private_items)]

use crate::fel_analysis::{RESERVED_CONTEXT_NAMES, RewriteOptions, rewrite_row_tail};
use fel_core::parser::{SiteKind, parse_with_sites};

/// Rewrite reference spans, preserving other source text and returning invalid input verbatim.
pub fn rewrite_fel_source_references(expression: &str, options: &RewriteOptions) -> String {
    try_rewrite_source(expression, options).unwrap_or_else(|_| expression.to_owned())
}

fn try_rewrite_source(
    expression: &str,
    options: &RewriteOptions,
) -> Result<String, fel_core::Error> {
    let (_, sites) = parse_with_sites(expression)?;
    let mut edits = Vec::new();
    for site in sites {
        if let Some(text) = replacement(site.kind, &expression[site.bytes.clone()], options) {
            edits.push((site.bytes, text));
        }
    }
    edits.sort_unstable_by_key(|(range, _)| range.start);
    let mut output = String::with_capacity(expression.len());
    let mut cursor = 0;
    for (range, text) in edits {
        output.push_str(&expression[cursor..range.start]);
        output.push_str(&text);
        cursor = range.end;
    }
    output.push_str(&expression[cursor..]);
    Ok(output)
}

fn replacement(kind: SiteKind, original: &str, options: &RewriteOptions) -> Option<String> {
    let quote = || char::from(original.as_bytes()[0]);
    match kind {
        SiteKind::Field(path) => options.rewrite_field_path.as_ref()?(&path)
            .filter(|new| *new != path)
            .map(|new| format!("${new}")),
        SiteKind::ContextName(name) if !RESERVED_CONTEXT_NAMES.contains(&name.as_str()) => {
            options.rewrite_variable.as_ref()?(&name).filter(|new| *new != name)
        }
        SiteKind::ContextArgument(name, value) if name == "instance" => {
            options.rewrite_instance_name.as_ref()?(&value)
                .filter(|new| *new != value)
                .map(|new| quote_string_literal(&new, quote()))
        }
        SiteKind::ContextTail(name, path) if name == "current" => {
            options.rewrite_current_path.as_ref()?(&path).filter(|new| *new != path)
        }
        SiteKind::FirstStringArgument(name, value)
            if matches!(name.as_str(), "prev" | "next" | "parent") =>
        {
            options.rewrite_navigation_target.as_ref()?(&value, &name)
                .filter(|new| *new != value)
                .map(|new| quote_string_literal(&new, quote()))
        }
        SiteKind::RowKey(row, key) => rewrite_row_tail(options, &row, &format!(".{key}"))?
            .strip_prefix('.')
            .map(str::to_owned),
        SiteKind::RowTail(row, tail) => rewrite_row_tail(options, &row, &tail),
        _ => None,
    }
}

/// Rewrite each `{{ ... }}` FEL substring in a message template via [`rewrite_fel_source_references`].
pub fn rewrite_message_template(message: &str, options: &RewriteOptions) -> String {
    let mut output = String::new();
    let mut cursor = 0usize;

    while let Some(start_offset) = message[cursor..].find("{{") {
        let start = cursor + start_offset;
        output.push_str(&message[cursor..start]);
        let expr_start = start + 2;
        if let Some(end_offset) = message[expr_start..].find("}}") {
            let end = expr_start + end_offset;
            output.push_str("{{");
            output.push_str(&rewrite_fel_source_references(
                &message[expr_start..end],
                options,
            ));
            output.push_str("}}");
            cursor = end + 2;
        } else {
            output.push_str(&message[start..]);
            cursor = message.len();
            break;
        }
    }

    if cursor < message.len() {
        output.push_str(&message[cursor..]);
    }

    output
}

fn quote_string_literal(value: &str, quote: char) -> String {
    let mut output = String::new();
    output.push(quote);
    for ch in value.chars() {
        match ch {
            '\\' => output.push_str("\\\\"),
            '\'' if quote == '\'' => output.push_str("\\'"),
            '"' if quote == '"' => output.push_str("\\\""),
            _ => output.push(ch),
        }
    }
    output.push(quote);
    output
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use fel_core::parse;

    #[test]
    fn rewrite_preserves_comments_spacing_and_quotes() {
        let result = rewrite_fel_source_references(
            "prev( /* keep */ \"members\" , $member.total ) + $foo /* tail */ + @instance('census').name + @current.total + @var_name",
            &RewriteOptions {
                rewrite_field_path: Some(Box::new(|path| match path {
                    "member.total" => Some("household.memberTotal".to_string()),
                    "foo" => Some("bar".to_string()),
                    _ => None,
                })),
                rewrite_current_path: Some(Box::new(|path| {
                    (path == "total").then(|| "summary.total".to_string())
                })),
                rewrite_variable: Some(Box::new(|name| {
                    (name == "var_name").then(|| "renamed_var".to_string())
                })),
                rewrite_instance_name: Some(Box::new(|name| {
                    (name == "census").then(|| "demographics".to_string())
                })),
                rewrite_navigation_target: Some(Box::new(|name, function_name| {
                    (function_name == "prev" && name == "members")
                        .then(|| "householdMembers".to_string())
                })),
            },
        );

        assert_eq!(
            result,
            "prev( /* keep */ \"householdMembers\" , $household.memberTotal ) + $bar /* tail */ + @instance('demographics').name + @current.summary.total + @renamed_var"
        );
    }

    const NO_REWRITES: RewriteOptions = RewriteOptions {
        rewrite_field_path: None,
        rewrite_current_path: None,
        rewrite_variable: None,
        rewrite_instance_name: None,
        rewrite_navigation_target: None,
    };

    #[test]
    fn grouped_navigation_literal_keeps_unicode_trivia_and_quote_style() {
        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|_| Some("item".into()))),
            rewrite_navigation_target: Some(Box::new(|name, _| {
                (name == "é").then(|| "a\"b".into())
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            rewrite_fel_source_references(r#"/*雪*/ prev(( "é" ), $row)"#, &options),
            r#"/*雪*/ prev(( "a\"b" ), $item)"#
        );
    }

    #[test]
    fn rewrites_keyed_lookup_source_and_key_in_expressions_and_templates() {
        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| match path {
                "k" => Some("key".to_string()),
                "rows" => Some("lines".to_string()),
                _ => None,
            })),
            ..NO_REWRITES
        };
        for (source, expected) in [
            ("$rows[id = $k].name", "$lines[id = $key].name"),
            ("$rows[id = 1] ?? $k", "$lines[id = 1] ?? $key"),
            (
                "@instance('list').rows[identity.id == $k].name",
                "@instance('list').rows[identity.id == $key].name",
            ),
            (
                "let match = $rows[id = $k in [1]] in match",
                "let match = $lines[id = $key in [1]] in match",
            ),
        ] {
            assert_eq!(rewrite_fel_source_references(source, &options), expected);
        }
        assert_eq!(
            rewrite_message_template("{{$rows[id = $k].name}}", &options),
            "{{$lines[id = $key].name}}"
        );
    }

    #[test]
    fn keyed_lookup_children_are_discoverable_and_renameable() {
        let expression = "$rows[id = $sel].name";
        let targets = crate::collect_fel_rewrite_targets(expression);
        let expected = ["rows", "rows[*].id", "rows[*].name", "sel"]
            .map(String::from)
            .into();
        assert_eq!(targets.field_paths, expected);
        assert_eq!(crate::get_fel_dependencies(expression), expected);

        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| match path {
                "rows[*].id" => Some("rows[*].rowId".into()),
                "rows[*].name" => Some("rows[*].label".into()),
                _ => None,
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            rewrite_fel_source_references(expression, &options),
            "$rows[rowId = $sel].label"
        );
        assert_eq!(
            rewrite_fel_source_references("($rows)[id = $sel].name", &options),
            "($rows)[rowId = $sel].label"
        );
        let local = "let rows = $other in rows[id = $sel].name";
        assert_eq!(rewrite_fel_source_references(local, &options), local);
        let key_rename = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| {
                (path == "rows[*].id").then(|| "rows[*].rowId".into())
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            crate::rewrite_fel_references(&parse(expression).unwrap(), &key_rename),
            parse("$rows[rowId = $sel].name").unwrap()
        );
    }

    #[test]
    fn assembly_prefixes_keyed_lookup_field_references() {
        let map = crate::AssemblyFelRewriteMap {
            fragment_root_key: String::new(),
            host_group_key: "host".into(),
            imported_keys: ["rows", "k"].map(String::from).into(),
            key_prefix: "p_".into(),
        };
        assert_eq!(
            crate::rewrite_fel_for_assembly("$rows[id = $k].name", &map),
            "$p_rows[id = $p_k].name"
        );
    }

    #[test]
    fn every_parsable_corpus_entry_round_trips_through_exact_rewriting() {
        let fel_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../fel-core");
        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|name| {
                (name == "__corpus_probe").then(|| "__renamed".into())
            })),
            ..NO_REWRITES
        };
        let mut rejected = Vec::new();
        for corpus in [
            "tests/corpus/fuzz_regression.jsonl",
            "conformance/fel-conformance.jsonl",
        ] {
            let text = std::fs::read_to_string(fel_root.join(corpus)).unwrap();
            for (index, line) in text.lines().enumerate() {
                let row: serde_json::Value = serde_json::from_str(line).unwrap();
                let expression = row["expression"].as_str().unwrap();
                if parse(expression).is_err() {
                    continue;
                }
                // Appending a real edit distinguishes successful rewriting from the
                // public API's unchanged-source fallback, including literal-only cases.
                let probe = format!("{expression}\n + $__corpus_probe");
                let expected = format!("{expression}\n + $__renamed");
                assert_eq!(
                    rewrite_fel_source_references(&probe, &options),
                    expected,
                    "{corpus}:{}",
                    index + 1
                );
                match try_rewrite_source(expression, &NO_REWRITES) {
                    Ok(text) if text == expression => {}
                    other => {
                        rejected.push(format!("{corpus}:{}: {expression:?}: {other:?}", index + 1))
                    }
                }
            }
        }
        assert!(rejected.is_empty(), "{}", rejected.join("\n"));
    }

    #[test]
    fn rewrite_message_template_leaves_invalid_segments_untouched() {
        let result = rewrite_message_template(
            "Total {{ $amount /* keep */ }}; invalid {{ $ + }}; current {{ @current.total }}.",
            &RewriteOptions {
                rewrite_field_path: Some(Box::new(|path| {
                    (path == "amount").then(|| "totals.amount".to_string())
                })),
                rewrite_current_path: Some(Box::new(|path| {
                    (path == "total").then(|| "summary.total".to_string())
                })),
                rewrite_variable: None,
                rewrite_instance_name: None,
                rewrite_navigation_target: None,
            },
        );

        assert_eq!(
            result,
            "Total {{ $totals.amount /* keep */ }}; invalid {{ $ + }}; current {{ @current.summary.total }}."
        );
    }
}
