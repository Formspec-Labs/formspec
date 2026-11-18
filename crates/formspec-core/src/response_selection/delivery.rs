//! Exact JSON delivery, schema-path projection and digesting.

use std::collections::BTreeMap;

use integrity_canonical::{DOMAIN_SEPARATOR_BYTE, canonical_json_from_bytes};
use serde::Serialize;
use serde_json::value::{RawValue, to_raw_value};

use crate::path_utils::{Path, PathSegment};
use crate::runtime_mapping::{
    MappingDirection, execute_mapping_doc, parse_mapping_document_from_value,
};

use super::{
    Cardinality, DeliveredSelection, Pin, ResponseSelection, SelectionContext, Sha256Digest,
    WhenNone, candidates::Candidate,
};

/// Hash the wire value with the Core instance-value domain tag.
pub(super) fn value_digest(value: &RawValue) -> Option<Sha256Digest> {
    let mut bytes = b"formspec.instance.value.v1".to_vec();
    bytes.push(DOMAIN_SEPARATOR_BYTE);
    bytes.extend(canonical_json_from_bytes(value.get().as_bytes()).ok()?);
    Some(Sha256Digest::hash(&bytes))
}

/// A compiled FieldRef projection. A leaf retains the complete field value.
#[derive(Default)]
enum Projection {
    #[default]
    Leaf,
    Object(BTreeMap<String, Projection>),
    Array(Box<Projection>),
}

impl Projection {
    /// Build a shared prefix tree so neighboring fields traverse the same rows together.
    fn compile(paths: &[String]) -> Option<Self> {
        let mut projection = Self::Object(BTreeMap::new());
        for text in paths {
            let path = Path::parse(text);
            if path.to_string() != *text
                || !matches!(path.segments.first(), Some(PathSegment::Exact(_)))
            {
                return None;
            }
            projection.insert(&path.segments)?;
        }
        Some(projection)
    }

    /// Add one FieldRef, refusing mixed object and array access to the same value.
    fn insert(&mut self, path: &[PathSegment]) -> Option<()> {
        match path.split_first() {
            None if matches!(self, Self::Leaf) => {}
            None => return None,
            Some((PathSegment::Exact(key), tail)) => {
                let Self::Object(children) = self else {
                    return None;
                };
                children
                    .entry(key.clone())
                    .or_insert_with(|| Self::for_path(tail))
                    .insert(tail)?;
            }
            Some((PathSegment::Wildcard, tail)) => {
                let Self::Array(rows) = self else { return None };
                rows.insert(tail)?;
            }
            _ => return None,
        }
        Some(())
    }

    /// Create a node for the next FieldRef segment.
    fn for_path(path: &[PathSegment]) -> Self {
        match path.first() {
            None => Self::Leaf,
            Some(PathSegment::Wildcard) => Self::Array(Box::new(Self::for_path(&path[1..]))),
            _ => Self::Object(BTreeMap::new()),
        }
    }

    /// Retain matched leaves without parsing their numeric text through floats.
    fn apply<'a>(&self, raw: &'a RawValue) -> Option<Projected<'a>> {
        match self {
            Self::Leaf => Some(Projected::Raw(raw)),
            Self::Object(fields) => {
                let source: BTreeMap<String, &RawValue> = serde_json::from_str(raw.get()).ok()?;
                let mut result = BTreeMap::new();
                for (name, projection) in fields {
                    if let Some(value) = source.get(name).and_then(|value| projection.apply(value))
                    {
                        result.insert(name.clone(), value);
                    }
                }
                Some(Projected::Object(result))
            }
            Self::Array(row) => {
                let source: Vec<&RawValue> = serde_json::from_str(raw.get()).ok()?;
                let rows = source.into_iter().map(|value| {
                    // The schema limits columns. Preserve even rows with no projected data.
                    row.apply(value)
                        .unwrap_or_else(|| Projected::Object(BTreeMap::new()))
                });
                Some(Projected::Array(rows.collect()))
            }
        }
    }
}

/// A projected JSON value with exact source text for field leaves.
#[derive(Serialize)]
#[serde(untagged)]
enum Projected<'a> {
    Raw(&'a RawValue),
    Object(BTreeMap<String, Projected<'a>>),
    Array(Vec<Projected<'a>>),
}

/// Produce exactly the value the consumer reads, and bind the result to a digest.
pub(super) fn deliver(
    winners: &[&Candidate<'_>],
    selection: &ResponseSelection,
    context: &SelectionContext,
) -> Option<DeliveredSelection> {
    let none = winners.is_empty();
    let mut mapping = None;
    let value = if none {
        if selection.when_none == WhenNone::Unavailable {
            return None;
        }
        // The fallback is already in the delivered shape.
        context.fallback.clone().unwrap_or(to_raw_value(&()).ok()?)
    } else {
        let projection = context.projection.as_deref().map(Projection::compile);
        let projection = match projection {
            Some(projection) => Some(projection?),
            None => None,
        };
        let values: Vec<_> = winners
            .iter()
            .map(|candidate| {
                let data = candidate.response.data;
                match &projection {
                    Some(projection) => projection.apply(data),
                    None => Some(Projected::Raw(data)),
                }
            })
            .collect::<Option<_>>()?;
        let mut value = match selection.cardinality {
            Cardinality::Latest => to_raw_value(values.first()?).ok()?,
            Cardinality::LatestPerSubject => to_raw_value(&values).ok()?,
        };
        if let Some(url) = &selection.mapping {
            let resolved = context
                .mapping
                .as_ref()
                .filter(|resolved| &resolved.reference.url == url)?;
            let document = parse_mapping_document_from_value(&resolved.document).ok()?;
            let source = serde_json::from_str(value.get()).ok()?;
            let result = execute_mapping_doc(&document, &source, MappingDirection::Forward);
            if !result.diagnostics.is_empty() {
                return None;
            }
            value = to_raw_value(&result.output).ok()?;
            mapping = Some(resolved.reference.clone());
        }
        value
    };
    let value_digest = value_digest(&value)?;
    let records = winners
        .iter()
        .map(|candidate| candidate.evidence())
        .collect::<Option<_>>()?;
    Some(DeliveredSelection {
        records,
        value,
        value_digest,
        none,
        pinned: selection.pin == Pin::AtOpen,
        mapping,
    })
}
