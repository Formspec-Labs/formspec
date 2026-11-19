//! Resolve Core §2.1.6 explanation references at the same site as Shape evaluation.

use std::collections::{BTreeMap, HashMap, HashSet};

use fel_core::ast::PathSegment;
use fel_core::exact_json::{self, Value};
use fel_core::{Expr, Value as FelValue, parse};
use formspec_core::dependency_reads::{ExternalRead, LexicalScope, Read, Reads, Root};

use crate::explanations::reference_digest;
use crate::fel_eval::Fel;
use crate::scope::{LocalBinding, Site};

/// Cached FEL reference extractions per expression string within a validation pass.
#[derive(Default)]
pub(super) struct ShapeReadsCache {
    parsed: HashMap<String, Reads>,
}

/// Extract the ordered reference digests of one concrete warning firing.
pub(super) fn inputs_for_shape(
    shape: &Value,
    shapes_by_id: &HashMap<String, &Value>,
    site: &Site<'_>,
    fel: Fel<'_>,
    cache: &mut HashMap<(String, String), String>,
    reads_cache: &mut ShapeReadsCache,
) -> Result<BTreeMap<String, String>, String> {
    let mut resolver = Resolver {
        site,
        fel,
        cache,
        reads_cache,
        inputs: BTreeMap::new(),
    };
    resolver.shape(shape, shapes_by_id, &mut HashSet::new())?;
    Ok(resolver.inputs)
}

struct Resolver<'a, 's> {
    site: &'a Site<'s>,
    fel: Fel<'a>,
    cache: &'a mut HashMap<(String, String), String>,
    reads_cache: &'a mut ShapeReadsCache,
    inputs: BTreeMap<String, String>,
}

impl Resolver<'_, '_> {
    fn shape(
        &mut self,
        shape: &Value,
        shapes: &HashMap<String, &Value>,
        seen: &mut HashSet<String>,
    ) -> Result<(), String> {
        if let Some(id) = shape.get("id").and_then(Value::as_str)
            && !seen.insert(id.to_owned())
        {
            return Ok(());
        }
        for key in ["activeWhen", "constraint"] {
            if let Some(text) = shape.get(key).and_then(Value::as_str) {
                self.resolve_expr(text)?;
            }
        }
        let elements = ["and", "or", "xone"]
            .into_iter()
            .filter_map(|key| shape.get(key).and_then(Value::as_array))
            .flatten()
            .filter_map(Value::as_str)
            .chain(shape.get("not").and_then(Value::as_str));
        for element in elements {
            match shapes.get(element) {
                Some(child) => self.shape(child, shapes, seen)?,
                None => self.resolve_expr(element)?,
            }
        }
        Ok(())
    }

    fn resolve_expr(&mut self, text: &str) -> Result<(), String> {
        let reads = match self.reads_cache.parsed.get(text) {
            Some(reads) => reads.clone(),
            None => {
                let expr = parse(text).map_err(|e| e.to_string())?;
                let extracted = Reads::new(&expr);
                self.reads_cache
                    .parsed
                    .insert(text.to_owned(), extracted.clone());
                extracted
            }
        };
        for read in &reads.basis_values {
            self.record_data(read)?;
        }
        for (name, segments) in &reads.variable_paths {
            let scope = self
                .site
                .variable_scope(name)
                .ok_or_else(|| format!("unresolved variable @{name}"))?;
            let Some(key) = path_key(format!("variable:{name}"), segments) else {
                continue;
            };
            let site = self.site;
            self.insert_cached(key, scope.to_owned(), || {
                site.read_variable(scope, name, segments)
            })?;
        }
        for ext in &reads.external_reads {
            self.record_external(ext)?;
        }
        Ok(())
    }

    fn record_data(&mut self, read: &Read) -> Result<(), String> {
        let base = match &read.root {
            Root::Field(name) => Some(self.site.head(name)),
            Root::Target => Some(self.site.self_path().to_owned()),
            Root::Current => self.site.current_row_path(),
            Root::Previous => self.site.relative_row(-1),
            Root::Next => self.site.relative_row(1),
            Root::Parent => self.site.parent_path(),
        };
        let Some(base) = base else {
            return Ok(());
        };
        let base_key = if base.is_empty() {
            "$".to_owned()
        } else {
            format!("${base}")
        };
        let Some(mut key) = path_key(base_key, &read.path) else {
            return Ok(());
        };
        if key.len() > 1 && self.site.is_repeat(&key[1..]) {
            key.push_str("[*]");
        }
        let site = self.site;
        self.insert_cached(key, String::new(), || site.read_data(&base, &read.path))
    }

    fn record_external(&mut self, ext: &ExternalRead) -> Result<(), String> {
        match ext {
            ExternalRead::StaticInstance { name, path } => {
                let name = name.as_deref().ok_or("missing instance name")?;
                let Some(key) = path_key(instance_key(name)?, path) else {
                    return Ok(());
                };
                let site = self.site;
                self.insert_cached(key, String::new(), || site.read_instance(name, path))
            }
            ExternalRead::Instance {
                name,
                member,
                suffix,
                scopes,
            } => {
                let Some(name_expr) = name else {
                    return Err("missing explanation reference name".into());
                };
                if let (Expr::String(inst_name), None | Some(Expr::String(_))) = (name_expr, member)
                {
                    let combined = combine_member_segments(
                        member.as_ref().and_then(|m| match m {
                            Expr::String(s) => Some(s.as_str()),
                            _ => None,
                        }),
                        suffix,
                    );
                    let Some(key) = path_key(instance_key(inst_name)?, &combined) else {
                        return Ok(());
                    };
                    let site = self.site;
                    return self.insert_cached(key, String::new(), || {
                        site.read_instance(inst_name, &combined)
                    });
                }
                let fel = self.fel;
                let root_site = self.site;
                let mut resolved = Vec::new();
                step_scopes(scopes, root_site, fel, &mut |scoped| {
                    let FelValue::String(inst_name) = fel.evaluate(name_expr, scoped).value else {
                        return Ok(());
                    };
                    let member_text = match member {
                        Some(m) => match fel.evaluate(m, scoped).value {
                            FelValue::String(path) => Some(path),
                            _ => return Ok(()),
                        },
                        None => None,
                    };
                    resolved.push((inst_name, member_text));
                    Ok(())
                })?;
                for (inst_name, member_text) in resolved {
                    let combined = combine_member_segments(member_text.as_deref(), suffix);
                    let Some(key) = path_key(instance_key(&inst_name)?, &combined) else {
                        continue;
                    };
                    let site = self.site;
                    self.insert_cached(key, String::new(), || {
                        site.read_instance(&inst_name, &combined)
                    })?;
                }
                Ok(())
            }
            ExternalRead::Subject {
                key: key_expr,
                suffix,
                scopes,
            } => {
                let Some(key_expr) = key_expr else {
                    return Err("missing explanation reference name".into());
                };
                if let Expr::String(subj_key) = key_expr {
                    let Some(key) = path_key(subject_key(subj_key)?, suffix) else {
                        return Ok(());
                    };
                    let site = self.site;
                    return self
                        .insert_cached(key, String::new(), || site.read_subject(subj_key, suffix));
                }
                let fel = self.fel;
                let root_site = self.site;
                let mut resolved = Vec::new();
                step_scopes(scopes, root_site, fel, &mut |scoped| {
                    if let FelValue::String(subj_key) = fel.evaluate(key_expr, scoped).value {
                        resolved.push(subj_key);
                    }
                    Ok(())
                })?;
                for subj_key in resolved {
                    let Some(key) = path_key(subject_key(&subj_key)?, suffix) else {
                        continue;
                    };
                    let site = self.site;
                    self.insert_cached(key, String::new(), || {
                        site.read_subject(&subj_key, suffix)
                    })?;
                }
                Ok(())
            }
        }
    }

    fn insert_cached(
        &mut self,
        key: String,
        scope: String,
        compute: impl FnOnce() -> FelValue,
    ) -> Result<(), String> {
        let cache_key = (key.clone(), scope);
        let digest = match self.cache.get(&cache_key) {
            Some(digest) => digest.clone(),
            None => {
                let value = compute();
                let digest = reference_digest(&exact_json::from_fel(&value))?;
                self.cache.insert(cache_key, digest.clone());
                digest
            }
        };
        self.inputs.insert(key, digest);
        Ok(())
    }
}

fn step_scopes(
    scopes: &[LexicalScope],
    site: &Site<'_>,
    fel: Fel<'_>,
    visit: &mut impl FnMut(&Site<'_>) -> Result<(), String>,
) -> Result<(), String> {
    let Some((first, rest)) = scopes.split_first() else {
        return visit(site);
    };
    match first {
        LexicalScope::Let { name, value } => {
            let bound = fel.evaluate(value, site).value;
            let binding = LocalBinding {
                name,
                value: bound,
                parent: site.locals,
            };
            let next_site = site.with_local(&binding);
            step_scopes(rest, &next_site, fel, visit)
        }
        LexicalScope::Predicate {
            source,
            reads_element,
        } => {
            if !reads_element {
                return step_scopes(rest, site, fel, visit);
            }
            let FelValue::Array(rows) = fel.evaluate(source, site).value else {
                return Ok(());
            };
            for element in rows {
                let binding = LocalBinding {
                    name: "$",
                    value: element,
                    parent: site.locals,
                };
                let next_site = site.with_local(&binding);
                step_scopes(rest, &next_site, fel, visit)?;
            }
            Ok(())
        }
    }
}

fn combine_member_segments(member: Option<&str>, suffix: &[PathSegment]) -> Vec<PathSegment> {
    let mut out = Vec::new();
    if let Some(path) = member
        && !path.is_empty()
    {
        out.extend(
            path.split('.')
                .map(|part| PathSegment::Dot(part.to_owned())),
        );
    }
    out.extend_from_slice(suffix);
    out
}

fn instance_key(name: &str) -> Result<String, String> {
    Ok(format!(
        "@instance({})",
        serde_json::to_string(name).map_err(|e| e.to_string())?
    ))
}

fn subject_key(name: &str) -> Result<String, String> {
    Ok(format!(
        "subject({})",
        serde_json::to_string(name).map_err(|e| e.to_string())?
    ))
}

fn path_key<'a>(
    mut key: String,
    path: impl IntoIterator<Item = &'a PathSegment>,
) -> Option<String> {
    for part in path {
        match part {
            PathSegment::Dot(field) => {
                if key != "$" {
                    key.push('.');
                }
                key.push_str(field);
            }
            PathSegment::Index(index) => {
                let zero_based = index.checked_sub(1)?;
                key.push_str(&format!("[{zero_based}]"));
            }
            PathSegment::Wildcard => key.push_str("[*]"),
        }
    }
    Some(key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        EvalOptions,
        scope::{ScopeData, ScopeIndex},
    };
    use fel_core::exact_json::native_json as json;

    fn digests(expected: &[(&str, &str)]) -> BTreeMap<String, String> {
        expected
            .iter()
            .map(|(key, json)| {
                (
                    key.to_string(),
                    reference_digest(&serde_json::from_str(json).unwrap()).unwrap(),
                )
            })
            .collect()
    }

    #[test]
    fn row_navigation_uses_concrete_paths_and_drops_missing_neighbors() {
        let values: HashMap<String, Value> = serde_json::from_str(
            r#"{
            "rows[0].amount":1234567890.123456789,
            "rows[1].amount":10,
            "rows[1].parts[0].cost":{"amount":"11.5","currency":"USD"}
        }"#,
        )
        .unwrap();
        let index = ScopeIndex::for_flat(&[], values.keys());
        let state = ScopeData::for_values(&index, &values, &EvalOptions::default());
        let reads = |path, expr| {
            inputs_for_shape(
                &json!({"constraint":expr}),
                &HashMap::new(),
                &state.site(&index, path),
                Fel::default(),
                &mut HashMap::new(),
                &mut ShapeReadsCache::default(),
            )
            .unwrap()
        };
        assert_eq!(
            reads("rows[0].amount", "[prev().amount, next().amount, valid($)]"),
            digests(&[
                ("$rows[0].amount", "1234567890.123456789"),
                ("$rows[1].amount", "10"),
            ])
        );
        assert_eq!(
            reads("rows[1].amount", "[next(), prev(), @current.amount]"),
            digests(&[
                ("$rows[0]", r#"{"amount":1234567890.123456789}"#),
                ("$rows[1].amount", "10"),
            ])
        );
        assert_eq!(
            reads("rows[1].parts[0].cost", "[parent().amount, $]"),
            digests(&[
                ("$rows[1].amount", "10"),
                (
                    "$rows[1].parts[0].cost",
                    r#"{"amount":"11.5","currency":"USD"}"#
                ),
            ])
        );
        assert_eq!(
            reads("#", "$rows[9].amount"),
            digests(&[("$rows[8].amount", "null")])
        );
        let root = reads("rows[0].amount", "parent()");
        assert_eq!(root, reads("#", "$"));
        let root_value = Fel::default()
            .evaluate(&parse("$").unwrap(), &state.site(&index, "#"))
            .value;
        assert!(matches!(root_value, FelValue::Object(_)));
        assert_eq!(
            root,
            digests(&[(
                "$",
                r#"{"rows":[{"amount":1234567890.123456789},{"amount":10,"parts":[{"cost":{"amount":"11.5","currency":"USD"}}]}]}"#
            )])
        );
    }

    #[test]
    fn only_data_reads_contribute_across_composition_and_lexical_scopes() {
        let values: HashMap<String, Value> =
            serde_json::from_str(r#"{"rows[0].id":"a","rows[1].id":"b","source":"prior"}"#)
                .unwrap();
        let index = ScopeIndex::for_flat(&[], values.keys());
        let options =
            EvalOptions::new().instances(HashMap::from([("prior".into(), json!({"cost":20}))]));
        let mut state = ScopeData::for_values(&index, &values, &options);
        state.variables.insert(
            "rows[0]".into(),
            HashMap::from([("limit".into(), FelValue::String("low".into()))]),
        );
        state.variables.insert(
            "rows[1]".into(),
            HashMap::from([("limit".into(), FelValue::String("high".into()))]),
        );
        let shape = json!({"and":["related", "every($rows, present($))"],"activeWhen":"present(@limit)","message":"$ignored"});
        let related = json!({"constraint":"let name = $source in instance(name).cost","context":{"ignored":"$ignored"}});
        let shapes = HashMap::from([("related".into(), &related)]);
        let mut cache = HashMap::new();
        let mut reads_cache = ShapeReadsCache::default();
        for (row, limit) in [("rows[0].id", r#""low""#), ("rows[1].id", r#""high""#)] {
            let found = inputs_for_shape(
                &shape,
                &shapes,
                &state.site(&index, row),
                Fel::default(),
                &mut cache,
                &mut reads_cache,
            )
            .unwrap();
            assert_eq!(
                found,
                digests(&[
                    ("variable:limit", limit),
                    ("$source", r#""prior""#),
                    ("@instance(\"prior\").cost", "20"),
                    ("$rows[*]", r#"[{"id":"a"},{"id":"b"}]"#),
                ])
            );
        }
    }

    #[test]
    fn dynamic_predicate_instances_skip_blank_rows_and_evaluate_source_once() {
        let values: HashMap<String, Value> =
            serde_json::from_str(r#"{"rows[0].src":"a","rows[1].src":null,"rows[2].src":"b"}"#)
                .unwrap();
        let index = ScopeIndex::for_flat(&[], values.keys());
        let options = EvalOptions::new().instances(HashMap::from([
            ("a".into(), json!({"v":1})),
            ("b".into(), json!({"v":2})),
        ]));
        let state = ScopeData::for_values(&index, &values, &options);
        let found = inputs_for_shape(
            &json!({"constraint":"every($rows, present(instance($.src).v))"}),
            &HashMap::new(),
            &state.site(&index, "#"),
            Fel::default(),
            &mut HashMap::new(),
            &mut ShapeReadsCache::default(),
        )
        .unwrap();
        assert_eq!(
            found,
            digests(&[
                ("$rows[*]", r#"[{"src":"a"},{"src":null},{"src":"b"}]"#),
                ("@instance(\"a\").v", "1"),
                ("@instance(\"b\").v", "2"),
            ])
        );
    }
}
