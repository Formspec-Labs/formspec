//! Exact-text rewriting using locations from the FEL parser.
//!
//! [`target`] is the one place that decides what a rename can reach: rewriting edits those
//! sites, and [`collect_fel_rewrite_targets`] reports exactly the names the rewrite callbacks
//! will be asked about (the WASM bridge turns JavaScript callbacks into a map over them).
#![allow(clippy::missing_docs_in_private_items)]

use crate::fel_analysis::{
    FelRewriteTargets, NavigationTarget, RESERVED_CONTEXT_NAMES, RewriteOptions,
};
use fel_core::parser::{SiteKind, parse_with_sites};

/// The name a [`RewriteOptions`] callback receives for one located site.
enum Target {
    FieldPath(String),
    CurrentPath(String),
    Variable(String),
    InstanceName(String),
    Navigation { function: String, name: String },
}

fn target(kind: &SiteKind) -> Option<Target> {
    Some(match kind {
        SiteKind::Field { path, .. } => Target::FieldPath(path.clone()),
        SiteKind::RowKey { rows, key, .. } => Target::FieldPath(format!("{rows}.{key}")),
        SiteKind::RowTail { rows, tail, .. } => Target::FieldPath(format!("{rows}{tail}")),
        SiteKind::ContextTail { context, path, .. } if context == "current" => {
            Target::CurrentPath(path.clone())
        }
        SiteKind::ContextName { name, .. } if !RESERVED_CONTEXT_NAMES.contains(&name.as_str()) => {
            Target::Variable(name.clone())
        }
        // `@instance('name')` and the function form `instance('name', path)` name one instance.
        SiteKind::ContextArgument {
            context: name,
            value,
            ..
        }
        | SiteKind::FirstStringArgument {
            function: name,
            value,
            ..
        } if name == "instance" => Target::InstanceName(value.clone()),
        SiteKind::FirstStringArgument {
            function, value, ..
        } if matches!(function.as_str(), "prev" | "next" | "parent") => Target::Navigation {
            function: function.clone(),
            name: value.clone(),
        },
        _ => return None,
    })
}

/// Collect every rewriteable target referenced by a FEL expression (empty when it does not parse).
pub fn collect_fel_rewrite_targets(expression: &str) -> FelRewriteTargets {
    let mut targets = FelRewriteTargets::default();
    let Ok((_, sites)) = parse_with_sites(expression) else {
        return targets;
    };
    for site in &sites {
        match target(&site.kind) {
            Some(Target::FieldPath(path)) => {
                targets.field_paths.insert(path);
            }
            Some(Target::CurrentPath(path)) => {
                targets.current_paths.insert(path);
            }
            Some(Target::Variable(name)) => {
                targets.variables.insert(name);
            }
            Some(Target::InstanceName(name)) => {
                targets.instance_names.insert(name);
            }
            Some(Target::Navigation { function, name }) => {
                let nav = NavigationTarget {
                    function_name: function,
                    name,
                };
                if !targets.navigation_targets.contains(&nav) {
                    targets.navigation_targets.push(nav);
                }
            }
            None => {}
        }
    }
    targets
}

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
        if let Some(text) = replacement(&site.kind, &expression[site.bytes.clone()], options) {
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

fn replacement(kind: &SiteKind, original: &str, options: &RewriteOptions) -> Option<String> {
    let changed = |old: String, new: Option<String>| new.filter(|new| *new != old);
    let quote = || char::from(original.as_bytes()[0]);
    match target(kind)? {
        Target::FieldPath(path) => {
            let new = changed(path.clone(), options.rewrite_field_path.as_ref()?(&path))?;
            match kind {
                SiteKind::RowKey { rows, key, .. } => row_suffix(rows, &format!(".{key}"), &new)?
                    .strip_prefix('.')
                    .map(str::to_owned),
                SiteKind::RowTail { rows, tail, .. } => row_suffix(rows, tail, &new),
                _ => Some(format!("${new}")),
            }
        }
        Target::CurrentPath(path) => {
            changed(path.clone(), options.rewrite_current_path.as_ref()?(&path))
        }
        Target::Variable(name) => changed(name.clone(), options.rewrite_variable.as_ref()?(&name)),
        Target::InstanceName(name) => {
            changed(name.clone(), options.rewrite_instance_name.as_ref()?(&name))
                .map(|new| quote_string_literal(&new, quote()))
        }
        Target::Navigation { function, name } => changed(
            name.clone(),
            options.rewrite_navigation_target.as_ref()?(&name, &function),
        )
        .map(|new| quote_string_literal(&new, quote())),
    }
}

/// The part of a renamed row path after the selected row's own wildcard, when it changed.
fn row_suffix(row_path: &str, tail: &str, updated: &str) -> Option<String> {
    // The last wildcard of row_path represents this lookup, even when its source
    // is itself within another repeat or keyed lookup.
    let lookup_index = row_path.matches("[*]").count().checked_sub(1)?;
    let (boundary, marker) = updated.match_indices("[*]").nth(lookup_index)?;
    let updated_tail = &updated[boundary + marker.len()..];
    (updated_tail != tail && !updated_tail.is_empty()).then(|| updated_tail.to_owned())
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
    fn collect_rewrite_targets_captures_all_categories() {
        let targets = collect_fel_rewrite_targets(
            "$total + @current.line.amount + prev('amount') + @instance('lookup') + @var",
        );
        assert!(targets.field_paths.contains("total"));
        assert!(targets.current_paths.contains("line.amount"));
        assert!(targets.instance_names.contains("lookup"));
        assert!(targets.variables.contains("var"));
        assert!(targets.navigation_targets.contains(&NavigationTarget {
            function_name: "prev".to_string(),
            name: "amount".to_string(),
        }));
    }

    #[test]
    fn instance_rename_covers_the_context_and_function_forms() {
        let expression = "@instance('census').total + instance(\"census\", 'count')";
        assert_eq!(
            crate::collect_fel_rewrite_targets("instance('census', 'count')").instance_names,
            ["census".to_string()].into()
        );
        let options = RewriteOptions {
            rewrite_instance_name: Some(Box::new(|name| {
                (name == "census").then(|| "survey".into())
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            rewrite_fel_source_references(expression, &options),
            "@instance('survey').total + instance(\"survey\", 'count')"
        );
    }

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
        for local in [
            "let rows = $other in rows[id = $sel].name",
            "let rows = $other in $rows[id = $sel].name",
        ] {
            assert_eq!(rewrite_fel_source_references(local, &options), local);
        }
        let key_rename = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| {
                (path == "rows[*].id").then(|| "rows[*].rowId".into())
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            rewrite_fel_source_references(expression, &key_rename),
            "$rows[rowId = $sel].name"
        );
    }

    #[test]
    fn nested_lookups_rename_the_segment_after_their_own_wildcard() {
        let rename = |from: &'static str, to: &'static str| RewriteOptions {
            rewrite_field_path: Some(Box::new(move |path| (path == from).then(|| to.into()))),
            ..NO_REWRITES
        };
        let source = "$a[k = 1].b[j = 2].c";
        for (from, to, expected) in [
            ("a[*].b", "a[*].items", "$a[k = 1].items[j = 2].c"),
            ("a[*].b[*].j", "a[*].b[*].id", "$a[k = 1].b[id = 2].c"),
            ("a[*].b[*].c", "a[*].b[*].d", "$a[k = 1].b[j = 2].d"),
        ] {
            assert_eq!(
                rewrite_fel_source_references(source, &rename(from, to)),
                expected
            );
        }
    }

    #[test]
    fn a_let_bound_dollar_name_is_not_the_field_it_shadows() {
        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| match path {
                "lines" => Some("rows".into()),
                "lines[*].amt" => Some("rows[*].amount".into()),
                _ => None,
            })),
            ..NO_REWRITES
        };
        assert_eq!(
            rewrite_fel_source_references(
                "sum($lines[*].amt) + (let lines = [{amt: 1}] in sum($lines[*].amt))",
                &options
            ),
            "sum($rows[*].amount) + (let lines = [{amt: 1}] in sum($lines[*].amt))"
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
    fn leaves_bound_names_computed_targets_and_declined_renames_alone() {
        let options = RewriteOptions {
            rewrite_field_path: Some(Box::new(|path| Some(format!("p.{path}")))),
            rewrite_instance_name: Some(Box::new(|_| None)),
            rewrite_navigation_target: Some(Box::new(|name, _| {
                (name == "amount").then(|| "total".into())
            })),
            ..NO_REWRITES
        };
        for (source, expected) in [
            ("let x = $a in $b + x", "let x = $p.a in $p.b + x"),
            (
                "prev('amount') + next(concat('amount', @suffix))",
                "prev('total') + next(concat('amount', @suffix))",
            ),
            ("@instance('keep').v", "@instance('keep').v"),
        ] {
            assert_eq!(rewrite_fel_source_references(source, &options), expected);
        }
    }

    /// Dependency analysis walks the syntax tree; discovery and the rewriter use parser sites.
    /// Renaming each `$` path the former finds, through the discovered-target map the WASM
    /// export builds, must leave no stale spelling of it.
    #[test]
    fn every_corpus_field_reference_is_renamed() {
        fn mentions(text: &str, path: &str) -> bool {
            let needle = format!("${path}");
            text.match_indices(&needle).any(|(at, _)| {
                !text[at + needle.len()..]
                    .starts_with(|c: char| c.is_alphanumeric() || matches!(c, '_' | '.' | '['))
            })
        }
        let fel_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../fel-core");
        let mut failures = Vec::new();
        for corpus in [
            "tests/corpus/fuzz_regression.jsonl",
            "conformance/fel-conformance.jsonl",
        ] {
            let text = std::fs::read_to_string(fel_root.join(corpus)).unwrap();
            for (index, line) in text.lines().enumerate() {
                let row: serde_json::Value = serde_json::from_str(line).unwrap();
                let expression = row["expression"].as_str().unwrap();
                let Ok(expr) = parse(expression) else {
                    continue;
                };
                // The appended reference gives every expression at least one edit, so the
                // unchanged-source fallback for invalid input cannot pass for valid input.
                let source = format!("{expression}\n + $probe");
                let paths = fel_core::extract_dependencies(&expr).fields.into_iter();
                for path in paths.chain(["probe".to_owned()]) {
                    // Paths with `[n]` or `[*]` (indexed and keyed) are covered by the tests
                    // above. A bare name is not a field reference in the normative grammar.
                    if path.contains('[') || !mentions(&source, &path) {
                        continue;
                    }
                    let renamed = format!("{path}Z");
                    // Rename the way the WASM export does: a map over the discovered targets.
                    let mut field_paths = serde_json::Map::new();
                    if collect_fel_rewrite_targets(&source)
                        .field_paths
                        .contains(&path)
                    {
                        field_paths.insert(path.clone(), renamed.clone().into());
                    }
                    let options = crate::rewrite_options_from_camel_case_json(
                        &serde_json::json!({ "fieldPaths": field_paths }),
                    );
                    let output = rewrite_fel_source_references(&source, &options);
                    if parse(&output).is_err()
                        || mentions(&output, &path)
                        || !mentions(&output, &renamed)
                    {
                        failures.push(format!("{corpus}:{}: {path:?} in {output:?}", index + 1));
                    }
                }
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
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
