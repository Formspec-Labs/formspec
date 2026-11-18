//! Resolves FEL names, repeat navigation, and variables at a concrete Item path.

use std::cell::RefCell;
use std::collections::{BTreeSet, HashMap, HashSet};

use fel_core::ast::PathSegment;
use fel_core::error::MissingTimezoneContextError;
use fel_core::{
    Date, Environment, Expr, FieldError, FormspecEnvironment, MipState, Value,
    parse_datetime_literal, resolve_value_path, resolve_value_segments,
};
use rust_decimal::Decimal;

use crate::eval_options::EvalOptions;
use crate::fel_eval::Fel;
use crate::fel_json::{json_to_runtime_fel, json_to_runtime_fel_typed};
use crate::types::{ItemInfo, strip_indices};

pub(crate) type RowCounts = HashMap<String, u64>;
pub(crate) type ScopedVariables = HashMap<String, HashMap<String, Value>>;

/// Structure and declarations shared by all expression sites in one response.
#[derive(Debug, Default)]
pub(crate) struct ScopeIndex {
    pub(crate) counts: RowCounts,
    children: HashMap<String, BTreeSet<String>>,
    declarations: HashSet<String>,
    instances: HashMap<String, Vec<String>>,
    paths_by_key: HashMap<String, String>,
    data_types: HashMap<String, String>,
}

fn qualify(parent: &str, key: &str) -> String {
    if parent.is_empty() {
        key.to_owned()
    } else {
        format!("{parent}.{key}")
    }
}

/// Record 0-based flat row indices without scanning all values per repeat.
pub(crate) fn count_flat_rows<'a>(paths: impl Iterator<Item = &'a String>, counts: &mut RowCounts) {
    for path in paths {
        for (open, _) in path.match_indices('[') {
            let Some((index, _)) = path[open + 1..].split_once(']') else {
                continue;
            };
            let Some(count) = index
                .parse::<u64>()
                .ok()
                .and_then(|index| index.checked_add(1))
            else {
                continue;
            };
            let entry = counts.entry(path[..open].to_owned()).or_default();
            *entry = (*entry).max(count);
        }
    }
}

impl ScopeIndex {
    pub(crate) fn for_flat<'a>(
        items: &[ItemInfo],
        paths: impl Iterator<Item = &'a String> + Clone,
    ) -> Self {
        let mut counts = RowCounts::new();
        count_flat_rows(paths.clone(), &mut counts);
        let mut index = Self::new(items, counts);
        for path in paths {
            index.add_value_path(path);
        }
        index
    }

    pub(crate) fn new(items: &[ItemInfo], counts: RowCounts) -> Self {
        let mut index = Self {
            counts,
            ..Self::default()
        };
        index.add_items(items);
        for group in index.counts.keys() {
            Self::add_path(&mut index.children, group);
        }
        index
    }

    pub(crate) fn snapshot(
        counts: RowCounts,
        data_types: &HashMap<String, String>,
        declarations: impl Iterator<Item = String>,
        paths: impl Iterator<Item = String>,
    ) -> Self {
        let mut index = Self::new(&[], counts);
        for path in declarations {
            index.declare(&path);
        }
        for path in data_types.keys() {
            index.declare(path);
        }
        index.data_types.clone_from(data_types);
        for path in paths {
            index.add_value_path(&path);
        }
        index
    }

    pub(crate) fn add_value_path(&mut self, path: &str) {
        Self::add_path(&mut self.children, path);
    }

    fn add_path(children: &mut HashMap<String, BTreeSet<String>>, mut path: &str) {
        while !path.is_empty() {
            let (parent, key) = path.rsplit_once('.').unwrap_or(("", path));
            if let Some((group, _)) = key.split_once('[') {
                children
                    .entry(parent.to_owned())
                    .or_default()
                    .insert(group.to_owned());
            } else {
                children
                    .entry(parent.to_owned())
                    .or_default()
                    .insert(key.to_owned());
            }
            path = parent;
        }
    }

    fn declare(&mut self, mut path: &str) {
        while !path.is_empty() {
            self.declarations.insert(path.to_owned());
            path = path.rsplit_once('.').map_or("", |(parent, _)| parent);
        }
    }

    fn add_items(&mut self, items: &[ItemInfo]) {
        for item in items {
            let template = strip_indices(&item.path);
            self.declare(&template);
            self.paths_by_key
                .entry(item.key.clone())
                .or_insert_with(|| template.clone());
            if let Some(data_type) = &item.data_type {
                self.data_types.insert(template.clone(), data_type.clone());
            }
            if item.repeatable {
                let count = self.count(&item.path);
                self.instances
                    .entry(template)
                    .or_default()
                    .extend((0..count).map(|row| format!("{}[{row}]", item.path)));
            } else {
                self.instances
                    .entry(template)
                    .or_default()
                    .push(item.path.clone());
            }
            Self::add_path(&mut self.children, &item.path);
            self.add_items(&item.children);
        }
    }

    pub(crate) fn data_type(&self, path: &str) -> Option<&str> {
        if path.contains('[') {
            self.data_types.get(strip_indices(path).as_str())
        } else {
            self.data_types.get(path)
        }
        .map(String::as_str)
    }

    pub(crate) fn count(&self, path: &str) -> usize {
        self.counts.get(path).copied().unwrap_or(0) as usize
    }

    pub(crate) fn variable_sites(&self, scope: &str) -> impl Iterator<Item = &str> {
        let path = self.paths_by_key.get(scope).map_or(scope, String::as_str);
        self.instances
            .get(path)
            .into_iter()
            .flatten()
            .map(String::as_str)
    }

    /// Expand authored wildcard targets using each concrete collection's count.
    pub(crate) fn targets(&self, target: &str) -> Vec<String> {
        fn expand(index: &ScopeIndex, prefix: &str, rest: &str, out: &mut Vec<String>) {
            if let Some((head, tail)) = rest.split_once("[*]") {
                let group = format!("{prefix}{head}");
                for row in 0..index.count(&group) {
                    expand(index, &format!("{group}[{row}]"), tail, out);
                }
            } else {
                out.push(format!("{prefix}{rest}"));
            }
        }
        let mut paths = Vec::new();
        expand(self, "", target, &mut paths);
        paths
    }

    fn declares(&self, path: &str) -> bool {
        if path.contains('[') {
            self.declarations.contains(strip_indices(path).as_str())
        } else {
            self.declarations.contains(path)
        }
    }

    fn contains(&self, path: &str) -> bool {
        self.children.contains_key(path) || self.counts.contains_key(path) || self.declares(path)
    }

    fn repeat_rows<'a>(&self, path: &'a str) -> impl DoubleEndedIterator<Item = Row<'a>> {
        path.match_indices('[').filter_map(|(open, _)| {
            let tail = &path[open + 1..];
            let (index, _) = tail.split_once(']')?;
            let group = &path[..open];
            Some(Row {
                group,
                index: index.parse().ok()?,
                count: *self.counts.get(group)? as usize,
            })
        })
    }
}

#[derive(Debug)]
struct Row<'a> {
    group: &'a str,
    index: usize,
    count: usize,
}

#[derive(Debug)]
struct Aggregate {
    function: String,
    /// Starts at the first wildcard in this concrete collection.
    path: Vec<PathSegment>,
    value: Value,
}

impl Aggregate {
    fn reads_write(&self, relative: &str) -> bool {
        let mut rest = relative;
        for part in &self.path {
            if rest.is_empty() {
                return true;
            }
            match part {
                PathSegment::Dot(name) => {
                    let Some(tail) = rest.strip_prefix('.').and_then(|s| s.strip_prefix(name))
                    else {
                        return false;
                    };
                    if !tail.is_empty() && !tail.starts_with(['.', '[']) {
                        return false;
                    }
                    rest = tail;
                }
                PathSegment::Index(wanted) => {
                    let Some((index, tail)) =
                        rest.strip_prefix('[').and_then(|s| s.split_once(']'))
                    else {
                        return false;
                    };
                    if index.parse::<usize>().ok().and_then(|i| i.checked_add(1)) != Some(*wanted) {
                        return false;
                    }
                    rest = tail;
                }
                PathSegment::Wildcard => {
                    let Some((_, tail)) = rest.strip_prefix('[').and_then(|s| s.split_once(']'))
                    else {
                        return false;
                    };
                    rest = tail;
                }
            }
        }
        true
    }
}

/// Pure aggregate results and their backing values at the end of a phase.
#[derive(Default)]
pub(crate) struct AggregateMemo {
    entries: HashMap<String, Vec<Aggregate>>,
    values: HashMap<String, Value>,
    #[cfg(test)]
    pub(crate) scans: usize,
}

impl AggregateMemo {
    pub(crate) fn has_results(&self) -> bool {
        !self.entries.is_empty()
    }

    /// The typed field value behind the memo saved by the previous phase.
    pub(crate) fn previous_value(&self, path: &str) -> Option<&Value> {
        self.values.get(path)
    }
}

fn invalidate_aggregates(entries: &mut HashMap<String, Vec<Aggregate>>, path: &str) {
    entries.remove(path);
    for (offset, _) in path.match_indices(['.', '[']) {
        if let Some(calls) = entries.get_mut(&path[..offset]) {
            calls.retain(|call| !call.reads_write(&path[offset..]));
        }
    }
}

/// Borrowed site reads share typed values and memoized collections within one evaluation.
#[derive(Default)]
pub(crate) struct ScopeData {
    pub(crate) env: FormspecEnvironment,
    pub(crate) variables: ScopedVariables,
    objects: RefCell<HashMap<String, Value>>,
    aggregates: RefCell<HashMap<String, Vec<Aggregate>>>,
    #[cfg(test)]
    aggregate_scans: std::cell::Cell<usize>,
}

impl ScopeData {
    pub(crate) fn for_values(
        index: &ScopeIndex,
        values: &HashMap<String, fel_core::exact_json::Value>,
        options: &EvalOptions<'_>,
    ) -> Self {
        let mut state = Self::default();
        if let Some(keys) = options.context.subject_keys() {
            state.env.subject_keys.clone_from(keys);
        }
        if let Some(now_iso) = options.context.now_iso.as_deref() {
            state.env.set_now_from_iso(now_iso);
        }
        state.env.instances = options
            .instances
            .iter()
            .map(|(key, value)| (key.clone(), json_to_runtime_fel(value)))
            .collect();
        state.env.data = values
            .iter()
            .map(|(path, value)| {
                (
                    path.clone(),
                    json_to_runtime_fel_typed(value, index.data_type(path)),
                )
            })
            .collect();
        state
    }

    /// Retain results across phases when their inputs have the same FEL values.
    pub(crate) fn restore_aggregates(&mut self, memo: &mut AggregateMemo) {
        let entries = self.aggregates.get_mut();
        *entries = std::mem::take(&mut memo.entries);
        if entries.is_empty() {
            return;
        }
        let previous = std::mem::take(&mut memo.values);
        for (path, value) in &self.env.data {
            if previous.get(path) != Some(value) {
                invalidate_aggregates(entries, path);
            }
        }
        for path in previous.keys() {
            if !self.env.data.contains_key(path) {
                invalidate_aggregates(entries, path);
            }
        }
    }

    /// Hand the memo and its typed inputs to the next phase.
    pub(crate) fn save_aggregates(self, memo: &mut AggregateMemo) {
        #[cfg(test)]
        {
            memo.scans += self.aggregate_scans.get();
        }
        memo.entries = self.aggregates.into_inner();
        // Empty buckets can remain after invalidation.
        memo.entries.retain(|_, calls| !calls.is_empty());
        if !memo.entries.is_empty() {
            memo.values = self.env.data;
        }
    }

    /// Write a typed field and report whether its FEL value changed.
    pub(crate) fn set_field(&mut self, path: &str, value: Value) -> bool {
        if self.env.data.get(path) == Some(&value) {
            return false;
        }
        self.env.set_field(path, value);
        let objects = self.objects.get_mut();
        objects.remove(path);
        for (offset, _) in path.match_indices(['.', '[']) {
            objects.remove(&path[..offset]);
        }
        invalidate_aggregates(self.aggregates.get_mut(), path);
        true
    }

    pub(crate) fn site<'a>(&'a self, index: &'a ScopeIndex, path: &'a str) -> Site<'a> {
        Site {
            data: self,
            index,
            path,
            bind_self: true,
            hoist: true,
            now: None,
        }
    }
}

/// FEL's view of one site. The underlying data stays borrowed during evaluation.
#[derive(Clone)]
pub(crate) struct Site<'a> {
    data: &'a ScopeData,
    index: &'a ScopeIndex,
    path: &'a str,
    pub(crate) bind_self: bool,
    hoist: bool,
    now: Option<Date>,
}

/// A concrete site's scope chain, innermost first.
pub(crate) fn lexical_scopes(site: &str) -> impl Iterator<Item = &str> {
    std::iter::once(site)
        .chain(site.rmatch_indices('.').map(|(dot, _)| &site[..dot]))
        .filter(|scope| !scope.is_empty() && *scope != "#")
}

impl Site<'_> {
    pub(crate) fn set_now(&mut self, iso: &str) {
        self.now = if iso.starts_with('@') {
            parse_datetime_literal(iso)
        } else {
            parse_datetime_literal(&format!("@{iso}"))
        };
    }

    pub(crate) fn head(&self, name: &str) -> String {
        lexical_scopes(self.path)
            .filter(|scope| {
                !scope.is_empty() && *scope != "#" && !self.index.counts.contains_key(*scope)
            })
            .map(|scope| qualify(scope, name))
            .find(|candidate| {
                self.index.declares(candidate)
                    || self.index.declarations.is_empty() && self.index.contains(candidate)
            })
            .unwrap_or_else(|| name.to_owned())
    }

    fn row_path(row: &Row<'_>, index: usize) -> String {
        format!("{}[{index}]", row.group)
    }

    pub(crate) fn current_row_path(&self) -> Option<String> {
        let row = self.index.repeat_rows(self.path).next_back()?;
        Some(Self::row_path(&row, row.index))
    }

    fn object(&self, path: &str) -> Value {
        if let Some(value) = self.data.objects.borrow().get(path) {
            return value.clone();
        }
        let value = if let Some(&count) = self.index.counts.get(path) {
            Value::Array(
                (0..count)
                    .map(|row| self.object(&format!("{path}[{row}]")))
                    .collect(),
            )
        } else {
            Value::Object(
                self.index
                    .children
                    .get(path)
                    .into_iter()
                    .flatten()
                    .filter_map(|key| {
                        let child = qualify(path, key);
                        self.data
                            .env
                            .data
                            .get(&child)
                            .cloned()
                            .or_else(|| {
                                (self.index.children.contains_key(&child)
                                    || self.index.counts.contains_key(&child))
                                .then(|| self.object(&child))
                            })
                            .map(|value| (key.clone(), value))
                    })
                    .collect(),
            )
        };
        self.data
            .objects
            .borrow_mut()
            .insert(path.to_owned(), value.clone());
        value
    }

    fn read(&self, mut path: String, segments: &[PathSegment]) -> Result<Value, FieldError> {
        for (position, part) in segments.iter().enumerate() {
            let group_count = self.index.counts.get(&path).copied();
            match (group_count, part) {
                (Some(count), PathSegment::Index(index)) => {
                    if *index == 0 || *index as u64 > count {
                        return Err(FieldError::new(format!(
                            "index {index} out of bounds (len {count})"
                        )));
                    }
                    path.push_str(&format!("[{}]", index - 1));
                }
                (Some(count), PathSegment::Wildcard) => {
                    return (0..count)
                        .map(|row| self.read(format!("{path}[{row}]"), &segments[position + 1..]))
                        .collect::<Result<Vec<_>, _>>()
                        .map(Value::Array);
                }
                (Some(_), PathSegment::Dot(key)) => {
                    return Err(FieldError::new(format!(
                        "repeat '{path}' requires a subscript before '{key}'"
                    )));
                }
                (None, PathSegment::Dot(key)) => {
                    let child = qualify(&path, key);
                    if let Some(value) = self.data.env.data.get(&path)
                        && !self.index.contains(&child)
                        && !self.data.env.data.contains_key(&child)
                    {
                        return resolve_value_segments(value, &segments[position..]);
                    }
                    path = child;
                }
                (None, _) => {
                    let value = self.data.env.data.get(&path).unwrap_or(&Value::Null);
                    return resolve_value_segments(value, &segments[position..]);
                }
            }
        }
        if self.index.counts.contains_key(&path) {
            return Ok(self.object(&path));
        }
        if let Some(value) = self.data.env.data.get(&path) {
            return Ok(value.clone());
        }
        if self.index.children.contains_key(&path) || path.ends_with(']') {
            return Ok(self.object(&path));
        }
        Ok(Value::Null)
    }

    fn mip(&self, path: &[String], select: impl FnOnce(&MipState) -> bool) -> Value {
        let concrete;
        let target = if let Some((head, tail)) = path.split_first() {
            // The resolved head already contains 0-based lexical indices. Only
            // translate subscripts from the authored path.
            let (head_key, indices) = head.split_at(head.find('[').unwrap_or(head.len()));
            let mut resolved = self.head(head_key);
            if self.append_mip_indices(&mut resolved, indices).is_none() {
                return Value::Null;
            }
            for part in tail {
                let (key, indices) = part.split_at(part.find('[').unwrap_or(part.len()));
                resolved = qualify(&resolved, key);
                if self.append_mip_indices(&mut resolved, indices).is_none() {
                    return Value::Null;
                }
            }
            concrete = resolved;
            concrete.as_str()
        } else {
            self.path
        };
        Value::Boolean(select(
            self.data
                .env
                .mip_states
                .get(target)
                .unwrap_or(&MipState::default()),
        ))
    }

    fn append_mip_indices(&self, path: &mut String, mut indices: &str) -> Option<()> {
        while !indices.is_empty() {
            let (index, tail) = indices.strip_prefix('[')?.split_once(']')?;
            // A model-item property describes one item, so a wildcard has no
            // scalar value. Zero and out-of-range indices also have no target.
            let index = index.parse::<usize>().ok()?.checked_sub(1)?;
            if index >= self.index.count(path) {
                return None;
            }
            path.push_str(&format!("[{index}]"));
            indices = tail;
        }
        Some(())
    }

    fn relative_row(&self, offset: isize) -> Option<String> {
        let row = self.index.repeat_rows(self.path).next_back()?;
        let index = row.index.checked_add_signed(offset)?;
        (index < row.count).then(|| Self::row_path(&row, index))
    }

    fn parent_path(&self) -> Option<String> {
        let mut rows = self.index.repeat_rows(self.path).rev();
        let row = rows.next()?;
        if let Some(parent) = rows.next() {
            Some(Self::row_path(&parent, parent.index))
        } else {
            Some(
                row.group
                    .rsplit_once('.')
                    .map_or("", |(parent, _)| parent)
                    .to_owned(),
            )
        }
    }
}

impl Environment for Site<'_> {
    fn resolve_field(&self, root: Option<&str>, path: &[PathSegment]) -> Result<Value, FieldError> {
        match root {
            Some(name) => self.read(self.head(name), path),
            None if self.bind_self && !self.path.is_empty() && self.path != "#" => {
                self.read(self.path.to_owned(), path)
            }
            None => Ok(Value::Null),
        }
    }

    fn precomputed(&self, expr: &Expr) -> Option<Value> {
        // Only pure scalar builtins whose dependency is a field projection. FEL
        // bypasses this hook under let bindings and while tracing.
        if !self.hoist || !self.path.contains('[') {
            return None;
        }
        let Expr::FunctionCall { name, args } = expr else {
            return None;
        };
        if !matches!(name.as_str(), "sum" | "count" | "avg" | "min" | "max") {
            return None;
        }
        let [
            Expr::FieldRef {
                name: Some(root),
                path,
            },
        ] = args.as_slice()
        else {
            return None;
        };
        let mut group = self.head(root);
        let mut segments = path.as_slice();
        while let Some((part, tail)) = segments.split_first() {
            match part {
                PathSegment::Dot(key) if !self.index.counts.contains_key(&group) => {
                    group = qualify(&group, key);
                }
                PathSegment::Index(index) if *index > 0 && *index <= self.index.count(&group) => {
                    group.push_str(&format!("[{}]", index - 1));
                }
                PathSegment::Wildcard if self.index.counts.contains_key(&group) => break,
                _ => return None,
            }
            segments = tail;
        }
        if name == "count"
            && (segments.is_empty() || matches!(segments, [PathSegment::Wildcard]))
            && let Some(&count) = self.index.counts.get(&group)
        {
            return Some(Value::Number(Decimal::from(count)));
        }
        if !matches!(segments.first(), Some(PathSegment::Wildcard)) {
            return None;
        }
        if let Some(value) = self.data.aggregates.borrow().get(&group).and_then(|calls| {
            calls
                .iter()
                .find(|cached| cached.function == *name && cached.path == segments)
                .map(|cached| cached.value.clone())
        }) {
            return Some(value);
        }
        #[cfg(test)]
        self.data
            .aggregate_scans
            .set(self.data.aggregate_scans.get() + 1);
        let result = Fel::default().evaluate(
            expr,
            &Self {
                hoist: false,
                ..self.clone()
            },
        );
        if !result.diagnostics.is_empty()
            || matches!(result.value, Value::Array(_) | Value::Object(_))
        {
            return None;
        }
        self.data
            .aggregates
            .borrow_mut()
            .entry(group)
            .or_default()
            .push(Aggregate {
                function: name.clone(),
                path: segments.to_vec(),
                value: result.value.clone(),
            });
        Some(result.value)
    }

    fn resolve_context_path(
        &self,
        name: &str,
        _arg: Option<&str>,
        path: &[PathSegment],
    ) -> Option<Result<Value, FieldError>> {
        if name != "current" {
            return None;
        }
        Some(
            self.current_row_path()
                .map_or(Ok(Value::Null), |row| self.read(row, path)),
        )
    }

    fn resolve_context(&self, name: &str, arg: Option<&str>, tail: &[String]) -> Value {
        match name {
            "current" => self
                .index
                .repeat_rows(self.path)
                .next_back()
                .map_or(Value::Null, |row| {
                    let path = Self::row_path(&row, row.index);
                    let segments: Vec<_> = tail.iter().cloned().map(PathSegment::Dot).collect();
                    self.read(path, &segments).unwrap_or(Value::Null)
                }),
            "index" => self
                .index
                .repeat_rows(self.path)
                .next_back()
                .map_or(Value::Null, |row| {
                    Value::Number(Decimal::from(row.index as u64 + 1))
                }),
            "count" => self
                .index
                .repeat_rows(self.path)
                .next_back()
                .map_or(Value::Null, |row| {
                    Value::Number(Decimal::from(row.count as u64))
                }),
            "instance" => arg
                .and_then(|name| self.data.env.instances.get(name))
                .map_or(Value::Null, |value| resolve_value_path(value, tail)),
            _ => lexical_scopes(self.path)
                .chain(std::iter::once("#"))
                .find_map(|scope| self.data.variables.get(scope)?.get(name))
                .map_or(Value::Null, |value| resolve_value_path(value, tail)),
        }
    }

    fn mip_valid(&self, path: &[String]) -> Value {
        self.mip(path, |state| state.valid)
    }
    fn mip_relevant(&self, path: &[String]) -> Value {
        self.mip(path, |state| state.relevant)
    }
    fn mip_readonly(&self, path: &[String]) -> Value {
        self.mip(path, |state| state.readonly)
    }
    fn mip_required(&self, path: &[String]) -> Value {
        self.mip(path, |state| state.required)
    }

    fn repeat_prev(&self) -> Value {
        self.relative_row(-1)
            .map_or(Value::Null, |path| self.object(&path))
    }

    fn repeat_next(&self) -> Value {
        self.relative_row(1)
            .map_or(Value::Null, |path| self.object(&path))
    }

    fn repeat_parent(&self) -> Value {
        self.parent_path()
            .map_or(Value::Null, |path| self.object(&path))
    }

    fn resolve_repeat_path(
        &self,
        name: &str,
        path: &[PathSegment],
    ) -> Option<Result<Value, FieldError>> {
        let row = match name {
            "prev" => self.relative_row(-1),
            "next" => self.relative_row(1),
            "parent" => self.parent_path(),
            _ => return None,
        };
        Some(row.map_or(Ok(Value::Null), |row| self.read(row, path)))
    }

    fn current_date(&self) -> Result<Date, MissingTimezoneContextError> {
        if let Some(dt) = &self.now {
            return Ok(Date::Date {
                year: dt.year(),
                month: dt.month(),
                day: dt.day(),
            });
        }
        self.data.env.current_date()
    }
    fn current_datetime(&self) -> Result<Date, MissingTimezoneContextError> {
        self.now
            .clone()
            .map_or_else(|| self.data.env.current_datetime(), Ok)
    }
    fn locale(&self) -> Option<&str> {
        self.data.env.locale()
    }
    fn date_format(&self, style: &str) -> Option<&str> {
        self.data.env.date_format(style)
    }
    fn runtime_meta(&self, key: &str) -> Value {
        self.data.env.runtime_meta(key)
    }
    fn subject_key(&self, key: &str) -> Value {
        self.data.env.subject_key(key)
    }
}
