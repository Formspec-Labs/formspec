//! Host-resident FEL context for ad-hoc reads: `compileExpression`, Locale `{{}}`, derivation traces.
//!
//! A host keeps one [`HostFelContext`] per engine, [`HostFelContext::load`]s the form-scope
//! state after each evaluation, and evaluates expressions against it by Item path. Each read
//! costs O(scope): [`ScopedEnv`] resolves names lazily from a path-ordered value map instead
//! of the host serializing the whole form per call. Scope rules match the engine's JSON
//! context (Core §3.2.1 lexical scopes, §4.3 repeat context, Locale §3.3.2 binding scope).

use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};

use fel_core::{
    Date, Environment, EvalResult, EvaluatorOptions, ExtensionFunctions, MipState,
    MissingTimezoneContextError, RepeatAliases, Trace, Value, evaluate_with, parse,
    parse_datetime_literal, prepare_with_aliases, resolve_value_path,
};
use formspec_core::path_utils::{Path, PathSegment};
use rust_decimal::Decimal;
use serde_json::{Map, Value as JsonValue};

use crate::fel_eval::Fel;
use crate::fel_json::{json_to_runtime_fel, json_to_runtime_fel_typed, typed_json_leaf};
use crate::interpolation::{Interpolated, interpolate_fel};
use crate::rebuild::is_repeat_group_array;
use crate::recalculate::repeats::set_nested_json_path;

/// Form-scope FEL state a host loads once per evaluation and reads many times.
#[derive(Debug, Default)]
pub struct HostFelContext {
    /// Field `dataType` by un-indexed path (Core §2.1.3 typing of leaves).
    data_types: HashMap<String, String>,
    /// Un-indexed paths bound with `excludedValue: "null"`: a non-relevant read by full path is `null`.
    excluded_null: HashSet<String>,
    /// Values by instance path, ordered so one prefix scan reads a group or a row.
    values: BTreeMap<String, JsonValue>,
    /// MIP state by instance path; absent paths hold [`MipState::default`].
    mips: HashMap<String, MipState>,
    /// Variable values by scope (`#` for form scope) and name.
    variables: HashMap<String, HashMap<String, Value>>,
    /// Row counts by repeat group instance path (`orders[0].items`).
    repeat_counts: HashMap<String, u32>,
    /// Named instances behind `@instance('name')`.
    instances: HashMap<String, Value>,
    /// Active locale (BCP 47) behind `locale()`.
    locale: Option<String>,
    /// The active Locale document's `formats.date` patterns by `formatDate` style (Locale §2.4).
    date_formats: HashMap<String, String>,
    /// Runtime metadata behind `runtimeMeta(key)`.
    meta: HashMap<String, Value>,
    /// Repeat aliases (`rows.score`) inferred from the value paths, rebuilt per load.
    aliases: RepeatAliases,
    /// Nested values built from prefix scans (`rows`, `rows[3]`), cleared per load.
    nested: RefCell<HashMap<String, Value>>,
}

/// One enclosing repeat instance along an Item path.
#[derive(Debug, Clone)]
struct RepeatAncestor {
    /// Group instance path (`orders[0].items`).
    group: String,
    /// 0-based row index.
    index: usize,
    /// Row count.
    count: usize,
}

impl HostFelContext {
    /// Context for a Definition: leaf typing and `excludedValue: "null"` binds, both by un-indexed path.
    pub fn new(data_types: HashMap<String, String>, excluded_null: HashSet<String>) -> Self {
        Self {
            data_types,
            excluded_null,
            ..Self::default()
        }
    }

    /// [`HostFelContext::new`] from `{ dataTypes: { path: dataType }, excludedValueNull: [path] }`.
    pub fn from_schema_json(schema: &Map<String, JsonValue>) -> Self {
        let data_types = schema
            .get("dataTypes")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .filter_map(|(path, data_type)| Some((path.clone(), data_type.as_str()?.to_string())))
            .collect();
        let excluded_null = string_list(schema.get("excludedValueNull"));
        Self::new(data_types, excluded_null.into_iter().collect())
    }

    /// Replaces the form-scope state from one evaluation.
    ///
    /// `snapshot` keys: `values` (instance path → value; repeat group arrays are skipped, rows
    /// come from their flat paths), `mips` (`{ invalid, nonRelevant, readonly, required }`
    /// path lists; unlisted paths are default), `repeatCounts`, `variables` (scope → name →
    /// value), `locale`, `meta`, and `instances`, which is replaced only when present.
    pub fn load(&mut self, snapshot: &Map<String, JsonValue>) -> Result<(), String> {
        self.values = snapshot
            .get("values")
            .map(|values| values.as_object().ok_or("values must be a JSON object"))
            .transpose()?
            .into_iter()
            .flatten()
            .filter(|(_, value)| !is_repeat_group_array(value))
            .map(|(path, value)| (path.clone(), value.clone()))
            .collect();
        self.aliases = RepeatAliases::from_field_paths(self.values.keys().map(String::as_str));

        self.mips.clear();
        if let Some(mips) = snapshot.get("mips") {
            let mips = mips.as_object().ok_or("mips must be a JSON object")?;
            for path in string_list(mips.get("invalid")) {
                self.mips.entry(path).or_default().valid = false;
            }
            for path in string_list(mips.get("nonRelevant")) {
                self.mips.entry(path).or_default().relevant = false;
            }
            for path in string_list(mips.get("readonly")) {
                self.mips.entry(path).or_default().readonly = true;
            }
            for path in string_list(mips.get("required")) {
                self.mips.entry(path).or_default().required = true;
            }
        }

        self.repeat_counts = snapshot
            .get("repeatCounts")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .filter_map(|(path, count)| Some((path.clone(), u32::try_from(count.as_u64()?).ok()?)))
            .collect();

        self.variables = snapshot
            .get("variables")
            .and_then(JsonValue::as_object)
            .into_iter()
            .flatten()
            .map(|(scope, names)| (scope.clone(), fel_map(names.as_object())))
            .collect();

        if let Some(instances) = snapshot.get("instances") {
            self.instances = fel_map(instances.as_object());
        }
        self.locale = snapshot
            .get("locale")
            .and_then(JsonValue::as_str)
            .map(str::to_string);
        self.date_formats = snapshot
            .get("dateFormats")
            .and_then(JsonValue::as_object)
            .map(|formats| {
                formats
                    .iter()
                    .filter_map(|(style, pattern)| {
                        pattern.as_str().map(|p| (style.clone(), p.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default();
        self.meta = fel_map(snapshot.get("meta").and_then(JsonValue::as_object));
        self.nested.borrow_mut().clear();
        Ok(())
    }

    /// Normalizes `expression` for `current_item_path` (bare `$`, `$group.field`, repeat aliases).
    pub fn prepare(
        &self,
        expression: &str,
        current_item_path: &str,
        replace_self_ref: bool,
    ) -> String {
        prepare_with_aliases(
            expression,
            current_item_path,
            replace_self_ref,
            &self.repeat_counts,
            &self.aliases,
        )
    }

    /// Evaluates `expression` in the binding scope of `current_item_path`.
    ///
    /// `now_iso` backs `now()` / `today()` for this call. Errors are parse errors; evaluation
    /// problems are diagnostics on the result.
    pub fn evaluate(
        &self,
        expression: &str,
        current_item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Result<EvalResult, String> {
        let expr = parse(&self.prepare(expression, current_item_path, replace_self_ref))
            .map_err(|e| e.to_string())?;
        let env = ScopedEnv::new(self, current_item_path, now_iso);
        Ok(Fel::new(extensions).evaluate(&expr, &env))
    }

    /// [`HostFelContext::evaluate`] recording every evaluation step.
    pub fn evaluate_traced(
        &self,
        expression: &str,
        current_item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Result<(EvalResult, Trace), String> {
        let expr = parse(&self.prepare(expression, current_item_path, replace_self_ref))
            .map_err(|e| e.to_string())?;
        let env = ScopedEnv::new(self, current_item_path, now_iso);
        let mut trace = Trace::new();
        let result = evaluate_with(
            &expr,
            &env,
            EvaluatorOptions {
                trace: Some(&mut trace),
                extensions,
                ..EvaluatorOptions::default()
            },
        );
        Ok((result, trace))
    }

    /// Resolves every `{{expression}}` in `template` in the scope of `current_item_path` (Locale §3.3.1).
    ///
    /// `replace_self_ref` binds bare `$` to the item, as in its Bind: a validation message says `{{$}}` for
    /// the value that failed (Core Bind `constraintMessage`), as [`HostFelContext::evaluate`] does.
    pub fn interpolate(
        &self,
        template: &str,
        current_item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Interpolated {
        let env = ScopedEnv::new(self, current_item_path, now_iso);
        interpolate_fel(template, &env, Fel::new(extensions), |expression| {
            self.prepare(expression, current_item_path, replace_self_ref)
        })
    }

    /// Field `dataType` for an instance path.
    fn data_type(&self, path: &str) -> Option<&str> {
        self.data_types
            .get(&Path::parse(path).strip_indices())
            .map(String::as_str)
    }

    /// The typed leaf at exactly `path`, if it holds a value.
    fn leaf(&self, path: &str) -> Option<Value> {
        self.values
            .get(path)
            .map(|value| json_to_runtime_fel_typed(value, self.data_type(path)))
    }

    /// Whether any value lies under `prefix` (`prefix.x` or `prefix[n]...`).
    fn has_children(&self, prefix: &str) -> bool {
        self.first_under(&format!("{prefix}.")) || self.first_under(&format!("{prefix}["))
    }

    /// Whether the ordered value map holds any path starting with `prefix`.
    fn first_under(&self, prefix: &str) -> bool {
        self.values
            .range(prefix.to_string()..)
            .next()
            .is_some_and(|(path, _)| path.starts_with(prefix))
    }

    /// Values under `prefix` (`prefix.` and `prefix[` forms), each with its path relative to `prefix`.
    fn children<'a>(&'a self, prefix: &'a str) -> impl Iterator<Item = (&'a str, &'a JsonValue)> {
        let dotted = format!("{prefix}.");
        let indexed = format!("{prefix}[");
        let under = move |start: String| {
            self.values
                .range(start.clone()..)
                .take_while(move |(path, _)| path.starts_with(&start))
        };
        under(dotted)
            .chain(under(indexed))
            .map(move |(path, value)| (&path[prefix.len()..], value))
    }

    /// The object or row array under `prefix`, built from its flat values; `None` when empty.
    ///
    /// Memoized until the next load: a row's fields are built once per evaluation, not per read.
    fn nested(&self, prefix: &str) -> Option<Value> {
        if let Some(value) = self.nested.borrow().get(prefix) {
            return Some(value.clone());
        }
        if !self.has_children(prefix) {
            return None;
        }
        let mut tree = JsonValue::Null;
        for (relative, value) in self.children(prefix) {
            let path = format!("{prefix}{relative}");
            set_nested_json_path(
                &mut tree,
                relative,
                typed_json_leaf(value, self.data_type(&path)),
            );
        }
        let built = json_to_runtime_fel(&tree);
        self.nested
            .borrow_mut()
            .insert(prefix.to_string(), built.clone());
        Some(built)
    }

    /// Non-repeat fields directly under group `prefix`: what `parent()` sees from its outermost repeat.
    fn group_snapshot(&self, prefix: &str) -> Value {
        let mut tree = JsonValue::Object(Map::new());
        for (relative, value) in self.children(prefix) {
            let Some(relative) = relative.strip_prefix('.') else {
                continue;
            };
            if relative.contains('[') {
                continue;
            }
            let path = format!("{prefix}.{relative}");
            set_nested_json_path(
                &mut tree,
                relative,
                typed_json_leaf(value, self.data_type(&path)),
            );
        }
        json_to_runtime_fel(&tree)
    }

    /// `group.field` across every row of a repeat: the projection `FormspecEnvironment` applies to flat rows.
    fn project_repeat(&self, segments: &[String]) -> Option<Value> {
        for split in 1..segments.len() {
            let prefix = format!("{}[", segments[..split].join("."));
            let suffix = format!(".{}", segments[split..].join("."));
            let mut rows: Vec<(usize, Value)> = self
                .values
                .range(prefix.clone()..)
                .take_while(|(path, _)| path.starts_with(&prefix))
                .filter_map(|(path, value)| {
                    let (index, tail) = path[prefix.len()..].split_once(']')?;
                    (tail == suffix).then(|| {
                        (
                            index.parse::<usize>().ok()?,
                            json_to_runtime_fel_typed(value, self.data_type(path)),
                        )
                            .into()
                    })?
                })
                .collect();
            if !rows.is_empty() {
                rows.sort_by_key(|(index, _)| *index);
                return Some(Value::Array(rows.into_iter().map(|(_, v)| v).collect()));
            }
        }
        None
    }

    /// MIP state at exactly `path`; unlisted paths are [`MipState::default`].
    fn mip(&self, path: &str) -> MipState {
        self.mips.get(path).cloned().unwrap_or_default()
    }
}

/// `Value`s from a JSON object, money-normalized like every other runtime input.
fn fel_map(object: Option<&Map<String, JsonValue>>) -> HashMap<String, Value> {
    object
        .into_iter()
        .flatten()
        .map(|(key, value)| (key.clone(), json_to_runtime_fel(value)))
        .collect()
}

/// The string entries of a JSON array, ignoring anything else.
fn string_list(value: Option<&JsonValue>) -> Vec<String> {
    value
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.as_str().map(str::to_string))
        .collect()
}

/// FEL `[n]` (1-based, Core §4.3.3) to the instance path's `[n-1]`.
fn to_instance_path(fel_path: &str) -> String {
    let mut out = String::with_capacity(fel_path.len());
    let mut rest = fel_path;
    while let Some(open) = rest.find('[') {
        out.push_str(&rest[..=open]);
        rest = &rest[open + 1..];
        match rest.find(']') {
            Some(close) => {
                match rest[..close].parse::<usize>() {
                    Ok(n) => out.push_str(&n.saturating_sub(1).to_string()),
                    Err(_) => out.push_str(&rest[..close]),
                }
                rest = &rest[close..];
            }
            None => break,
        }
    }
    out.push_str(rest);
    out
}

/// The binding scope of one Item path over a [`HostFelContext`].
struct ScopedEnv<'a> {
    /// The form-scope state every name resolves against.
    ctx: &'a HostFelContext,
    /// Enclosing lexical scopes, innermost first (`rows[0].address`, `rows[0]`, `rows`).
    scopes: Vec<String>,
    /// Un-indexed scope prefixes for variable visibility, innermost first (`rows.address`, `rows`).
    variable_scopes: Vec<String>,
    /// Repeat instances enclosing the Item, outermost first.
    repeats: Vec<RepeatAncestor>,
    /// Clock backing `now()` / `today()` for this evaluation.
    now: Option<Date>,
}

impl<'a> ScopedEnv<'a> {
    /// Scope chain, variable visibility, and repeat ancestry for `current_item_path`.
    fn new(ctx: &'a HostFelContext, current_item_path: &str, now_iso: Option<&str>) -> Self {
        let path = Path::parse(current_item_path);
        let is_field = ctx.data_types.contains_key(&path.strip_indices());
        let innermost = if is_field {
            path.parent_string()
        } else {
            path.to_string()
        };
        let mut scopes = Vec::new();
        let mut current = String::new();
        for segment in Path::parse(&innermost).segments {
            match segment {
                PathSegment::Exact(name) => {
                    if !current.is_empty() {
                        current.push('.');
                    }
                    current.push_str(&name);
                }
                PathSegment::Indexed(index) => current.push_str(&format!("[{index}]")),
                PathSegment::Wildcard | PathSegment::Special(_) => continue,
            }
            scopes.push(current.clone());
        }
        scopes.reverse();

        let base = path.strip_indices();
        let mut variable_scopes: Vec<String> = base
            .match_indices('.')
            .map(|(dot, _)| base[..dot].to_string())
            .collect();
        if !base.is_empty() {
            variable_scopes.push(base);
        }
        variable_scopes.reverse();

        Self {
            ctx,
            scopes,
            variable_scopes,
            repeats: repeat_ancestors(&path, &ctx.repeat_counts),
            now: now_iso.and_then(|iso| {
                parse_datetime_literal(&if iso.starts_with('@') {
                    iso.to_string()
                } else {
                    format!("@{iso}")
                })
            }),
        }
    }

    /// The nearest enclosing repeat instance, if the Item sits inside one.
    fn innermost_repeat(&self) -> Option<&RepeatAncestor> {
        self.repeats.last()
    }

    /// Row `index` of `ancestor` as an object; an empty object when the row holds no values.
    fn row(&self, ancestor: &RepeatAncestor, index: usize) -> Value {
        self.ctx
            .nested(&format!("{}[{index}]", ancestor.group))
            .unwrap_or_else(|| Value::Object(fel_core::IndexMap::new()))
    }

    /// `key` under one scope: a leaf, or the object or rows under it.
    fn scoped(&self, scope: &str, key: &str) -> Option<Value> {
        let full = format!("{scope}.{key}");
        self.ctx.leaf(&full).or_else(|| self.ctx.nested(&full))
    }

    /// MIP state for a FEL-indexed path, nearest enclosing scope first.
    fn mip_state(&self, fel_path: &[String]) -> MipState {
        let key = to_instance_path(&fel_path.join("."));
        for scope in &self.scopes {
            let full = format!("{scope}.{key}");
            if let Some(state) = self.ctx.mips.get(&full) {
                return state.clone();
            }
        }
        self.ctx.mip(&key)
    }

    /// `value` walked by `tail`, or `value` itself when the tail is empty.
    fn tail(value: Value, tail: &[String]) -> Value {
        if tail.is_empty() {
            value
        } else {
            resolve_value_path(&value, tail)
        }
    }
}

/// Repeat instances along `path`, outermost first, for groups the host reports counts for.
fn repeat_ancestors(path: &Path, counts: &HashMap<String, u32>) -> Vec<RepeatAncestor> {
    let mut ancestors = Vec::new();
    let mut current = String::new();
    let mut segments = path.segments.iter().peekable();
    while let Some(segment) = segments.next() {
        match segment {
            PathSegment::Exact(name) => {
                if !current.is_empty() {
                    current.push('.');
                }
                current.push_str(name);
                if let Some(PathSegment::Indexed(index)) = segments.peek() {
                    if let Some(count) = counts.get(&current) {
                        ancestors.push(RepeatAncestor {
                            group: current.clone(),
                            index: *index,
                            count: *count as usize,
                        });
                    }
                    current.push_str(&format!("[{index}]"));
                    segments.next();
                }
            }
            PathSegment::Indexed(index) => current.push_str(&format!("[{index}]")),
            PathSegment::Wildcard | PathSegment::Special(_) => {}
        }
    }
    ancestors
}

impl Environment for ScopedEnv<'_> {
    fn resolve_field(&self, segments: &[String]) -> Value {
        if segments.is_empty() {
            return self
                .innermost_repeat()
                .map(|ancestor| self.row(ancestor, ancestor.index))
                .unwrap_or(Value::Null);
        }
        let key = segments.join(".");
        for scope in &self.scopes {
            if let Some(value) = self.scoped(scope, &key) {
                return value;
            }
        }
        if let Some(value) = self.ctx.leaf(&key) {
            let excluded = self
                .ctx
                .excluded_null
                .contains(&Path::parse(&key).strip_indices());
            return if excluded && !self.ctx.mip(&key).relevant {
                Value::Null
            } else {
                value
            };
        }
        self.ctx
            .nested(&key)
            .or_else(|| self.ctx.project_repeat(segments))
            .unwrap_or(Value::Null)
    }

    fn resolve_context(&self, name: &str, arg: Option<&str>, tail: &[String]) -> Value {
        match name {
            "current" => self
                .innermost_repeat()
                .map(|ancestor| Self::tail(self.row(ancestor, ancestor.index), tail))
                .unwrap_or(Value::Null),
            "index" => self
                .innermost_repeat()
                .map(|ancestor| Value::Number(Decimal::from(ancestor.index as u64 + 1)))
                .unwrap_or(Value::Null),
            "count" => self
                .innermost_repeat()
                .map(|ancestor| Value::Number(Decimal::from(ancestor.count as u64)))
                .unwrap_or(Value::Null),
            "instance" => arg
                .and_then(|name| self.ctx.instances.get(name))
                .map(|value| Self::tail(value.clone(), tail))
                .unwrap_or(Value::Null),
            _ => self
                .variable_scopes
                .iter()
                .map(String::as_str)
                .chain(std::iter::once("#"))
                .find_map(|scope| self.ctx.variables.get(scope)?.get(name))
                .map(|value| Self::tail(value.clone(), tail))
                .unwrap_or(Value::Null),
        }
    }

    fn mip_valid(&self, path: &[String]) -> Value {
        Value::Boolean(self.mip_state(path).valid)
    }

    fn mip_relevant(&self, path: &[String]) -> Value {
        Value::Boolean(self.mip_state(path).relevant)
    }

    fn mip_readonly(&self, path: &[String]) -> Value {
        Value::Boolean(self.mip_state(path).readonly)
    }

    fn mip_required(&self, path: &[String]) -> Value {
        Value::Boolean(self.mip_state(path).required)
    }

    fn repeat_prev(&self) -> Value {
        match self.innermost_repeat() {
            Some(ancestor) if ancestor.index >= 1 => self.row(ancestor, ancestor.index - 1),
            _ => Value::Null,
        }
    }

    fn repeat_next(&self) -> Value {
        match self.innermost_repeat() {
            Some(ancestor) if ancestor.index + 1 < ancestor.count => {
                self.row(ancestor, ancestor.index + 1)
            }
            _ => Value::Null,
        }
    }

    fn repeat_parent(&self) -> Value {
        match self.repeats.as_slice() {
            [.., parent, _] => self.row(parent, parent.index),
            [outermost] => {
                let parent = Path::parse(&outermost.group).parent_string();
                if parent.is_empty() {
                    Value::Null
                } else {
                    self.ctx.group_snapshot(&parent)
                }
            }
            [] => Value::Null,
        }
    }

    fn current_date(&self) -> Result<Date, MissingTimezoneContextError> {
        self.current_datetime().map(|dt| Date::Date {
            year: dt.year(),
            month: dt.month(),
            day: dt.day(),
        })
    }

    fn current_datetime(&self) -> Result<Date, MissingTimezoneContextError> {
        self.now
            .clone()
            .ok_or_else(MissingTimezoneContextError::not_configured)
    }

    fn locale(&self) -> Option<&str> {
        self.ctx.locale.as_deref()
    }

    fn date_format(&self, style: &str) -> Option<&str> {
        self.ctx.date_formats.get(style).map(String::as_str)
    }

    fn runtime_meta(&self, key: &str) -> Value {
        self.ctx.meta.get(key).cloned().unwrap_or(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use fel_core::fel_to_ui_json;
    use serde_json::json;

    fn context() -> HostFelContext {
        let schema = json!({
            "dataTypes": {
                "name": "string",
                "rows.name": "string",
                "rows.qty": "integer",
                "rows.due": "date",
                "rows.address.city": "string",
                "rows.tasks.mins": "integer",
                "secret": "string",
                "section.title": "string",
                "section.jobs.employer": "string"
            },
            "excludedValueNull": ["secret"]
        });
        let mut ctx = HostFelContext::from_schema_json(schema.as_object().unwrap());
        let snapshot = json!({
            "values": {
                "name": "Form",
                "secret": "hidden",
                "rows[0].name": "Alpha",
                "rows[0].qty": 2,
                "rows[0].due": "2025-03-01",
                "rows[0].address.city": "Oslo",
                "rows[0].tasks[0].mins": 5,
                "rows[0].tasks[1].mins": 7,
                "rows[1].name": "Beta",
                "rows[1].qty": 3,
                "rows[1].address.city": "Rome",
                "section.title": "Work",
                "section.jobs[0].employer": "Acme",
                "rows": [{ "name": "stale" }]
            },
            "mips": {
                "invalid": ["rows[1].qty"],
                "nonRelevant": ["secret", "rows[0].name"],
                "readonly": ["name"],
                "required": ["rows[0].qty"]
            },
            "repeatCounts": { "rows": 2, "rows[0].tasks": 2, "section.jobs": 1 },
            "variables": { "#": { "limit": 10 }, "rows": { "limit": 99 } },
            "instances": { "config": { "max": 3 } },
            "locale": "fr-CA",
            "meta": { "channel": "kiosk" }
        });
        ctx.load(snapshot.as_object().unwrap()).unwrap();
        ctx
    }

    fn eval(ctx: &HostFelContext, expression: &str, path: &str) -> JsonValue {
        let result = ctx
            .evaluate(expression, path, false, Some("2026-01-02T03:04:05Z"), None)
            .unwrap();
        assert!(
            !fel_core::has_error_diagnostics(&result.diagnostics),
            "{expression} @ {path:?}: {:?}",
            result.diagnostics
        );
        fel_to_ui_json(&result.value)
    }

    #[test]
    fn row_scope_shadows_form_scope_and_types_leaves() {
        let ctx = context();
        assert_eq!(eval(&ctx, "$name", ""), json!("Form"));
        assert_eq!(eval(&ctx, "$name", "rows[1]"), json!("Beta"));
        assert_eq!(eval(&ctx, "$name", "rows[1].qty"), json!("Beta"));
        assert_eq!(eval(&ctx, "$qty * 2", "rows[1].name"), json!(6));
        assert_eq!(eval(&ctx, "year($due)", "rows[0]"), json!(2025));
        assert_eq!(eval(&ctx, "$address.city", "rows[0]"), json!("Oslo"));
        assert_eq!(eval(&ctx, "$city", "rows[1].address"), json!("Rome"));
    }

    #[test]
    fn group_arrays_come_from_flat_rows_with_fel_indexes() {
        let ctx = context();
        assert_eq!(eval(&ctx, "$rows[2].name", ""), json!("Beta"));
        assert_eq!(eval(&ctx, "count($rows)", ""), json!(2));
        assert_eq!(eval(&ctx, "sum($rows[*].qty)", ""), json!(5));
        assert_eq!(eval(&ctx, "sum(rows.qty)", ""), json!(5));
        assert_eq!(eval(&ctx, "$tasks[2].mins", "rows[0]"), json!(7));
        assert_eq!(eval(&ctx, "$rows.qty", "rows[1].name"), json!(3));
        assert_eq!(eval(&ctx, "$rows.qty", "rows[0].tasks[1].mins"), json!(2));
        assert_eq!(eval(&ctx, "$section.title", ""), json!("Work"));
    }

    #[test]
    fn repeat_context_navigation() {
        let ctx = context();
        assert_eq!(eval(&ctx, "@index", "rows[1].name"), json!(2));
        assert_eq!(eval(&ctx, "@count", "rows[1].name"), json!(2));
        assert_eq!(eval(&ctx, "@current.name", "rows[1].name"), json!("Beta"));
        assert_eq!(eval(&ctx, "prev().name", "rows[1].name"), json!("Alpha"));
        assert_eq!(eval(&ctx, "next().name", "rows[0].name"), json!("Beta"));
        assert_eq!(eval(&ctx, "next()", "rows[1].name"), json!(null));
        assert_eq!(eval(&ctx, "@index", "rows[0].tasks[1].mins"), json!(2));
        assert_eq!(
            eval(&ctx, "parent().name", "rows[0].tasks[1].mins"),
            json!("Alpha")
        );
        assert_eq!(
            eval(&ctx, "parent().title", "section.jobs[0].employer"),
            json!("Work")
        );
        assert_eq!(eval(&ctx, "@index", "name"), json!(null));
    }

    #[test]
    fn mip_queries_use_fel_indexes_and_scope() {
        let ctx = context();
        assert_eq!(eval(&ctx, "valid($rows[2].qty)", ""), json!(false));
        assert_eq!(eval(&ctx, "valid($rows[1].qty)", ""), json!(true));
        assert_eq!(eval(&ctx, "valid($qty)", "rows[1].name"), json!(false));
        assert_eq!(eval(&ctx, "required($qty)", "rows[0].name"), json!(true));
        assert_eq!(eval(&ctx, "readonly($name)", ""), json!(true));
        assert_eq!(eval(&ctx, "relevant($name)", "rows[0].qty"), json!(false));
        assert_eq!(eval(&ctx, "relevant($name)", ""), json!(true));
    }

    #[test]
    fn excluded_value_null_applies_to_non_relevant_full_path_reads() {
        let ctx = context();
        assert_eq!(eval(&ctx, "$secret", ""), json!(null));
        assert_eq!(eval(&ctx, "$name", "rows[0]"), json!("Alpha"));
    }

    #[test]
    fn variables_instances_locale_meta_and_clock() {
        let ctx = context();
        assert_eq!(eval(&ctx, "@limit", ""), json!(10));
        assert_eq!(eval(&ctx, "@limit", "rows[0].qty"), json!(99));
        assert_eq!(eval(&ctx, "@instance('config').max", ""), json!(3));
        assert_eq!(eval(&ctx, "locale()", ""), json!("fr-CA"));
        assert_eq!(eval(&ctx, "runtimeMeta('channel')", ""), json!("kiosk"));
        assert_eq!(eval(&ctx, "year(today())", ""), json!(2026));
        let unset = ctx.evaluate("today()", "", false, None, None).unwrap();
        assert!(fel_core::has_error_diagnostics(&unset.diagnostics));
    }

    #[test]
    fn self_reference_and_qualified_group_refs_prepare_per_item() {
        let ctx = context();
        let result = ctx
            .evaluate("$ * 10", "rows[1].qty", true, None, None)
            .unwrap();
        assert_eq!(fel_to_ui_json(&result.value), json!(30));
        assert_eq!(eval(&ctx, "$rows.name", "rows[0].qty"), json!("Alpha"));
    }

    #[test]
    fn interpolation_resolves_in_item_scope() {
        let ctx = context();
        let out = ctx.interpolate(
            "Row {{@index}} of {{@count}}: {{$name}}",
            "rows[1].name",
            false,
            None,
            None,
        );
        assert_eq!(out.text, "Row 2 of 2: Beta");
        assert!(out.warnings.is_empty());
        let message = ctx.interpolate(
            "Qty {{$}} in row {{@index}}",
            "rows[1].qty",
            true,
            None,
            None,
        );
        assert_eq!(message.text, "Qty 3 in row 2");
        let failed = ctx.interpolate("{{nope(}} {{$name}}", "", false, None, None);
        assert_eq!(failed.text, "{{nope(}} Form");
        assert_eq!(failed.warnings.len(), 1);
    }

    #[test]
    fn trace_records_field_resolution() {
        let ctx = context();
        let (result, trace) = ctx
            .evaluate_traced("$qty + 1", "rows[0].name", false, None, None)
            .unwrap();
        assert_eq!(fel_to_ui_json(&result.value), json!(3));
        assert!(!trace.steps.is_empty());
    }

    #[test]
    fn reload_replaces_values_and_keeps_instances_unless_given() {
        let mut ctx = context();
        ctx.load(
            json!({ "values": { "name": "Next" }, "repeatCounts": {} })
                .as_object()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(eval(&ctx, "$name", ""), json!("Next"));
        assert_eq!(eval(&ctx, "$rows", ""), json!(null));
        assert_eq!(eval(&ctx, "@instance('config').max", ""), json!(3));
        assert_eq!(eval(&ctx, "locale()", ""), json!(null));
        assert!(
            ctx.load(json!({ "values": 1 }).as_object().unwrap())
                .is_err()
        );
    }

    #[test]
    fn fel_index_to_instance_path() {
        assert_eq!(to_instance_path("rows[2].tasks[1].x"), "rows[1].tasks[0].x");
        assert_eq!(to_instance_path("plain.path"), "plain.path");
        assert_eq!(to_instance_path("rows[*].x"), "rows[*].x");
    }
}
