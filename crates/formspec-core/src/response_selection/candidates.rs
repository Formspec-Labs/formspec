//! Typed predicate resolution, candidate admission and authored ordering.

use std::borrow::Cow;
use std::cell::OnceCell;
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashSet};

use chrono::{DateTime, Datelike, Timelike};
use integrity_canonical::ResponseJson;
use serde::Deserialize;
use serde_json::value::RawValue;

use super::{
    PredicateOp, PredicateSource, ResponseSelection, SelectedRecord, SelectionContext,
    SelectionRecord, SelectionRecordKind, SelectionSource, SelectionStatus, Sha256Digest,
    SubjectKeyType, subject_id,
};
use crate::compatible_versions::parse_definition_version;
use crate::subject_key::SubjectKey;

/// One resolved upstream-key comparison.
pub(super) struct Predicate<'a> {
    key: &'a str,
    op: PredicateOp,
    value: SubjectKey,
}

/// Resolve all inputs before scanning so a bad request cannot resemble an empty match.
pub(super) fn resolve_predicates<'a>(
    selection: &'a ResponseSelection,
    context: &SelectionContext,
) -> Option<Vec<Predicate<'a>>> {
    selection
        .subject
        .iter()
        .map(|predicate| {
            let key_type = context
                .upstream_subject
                .as_ref()?
                .keys
                .get(&predicate.key)?
                .data_type;
            let value = match &predicate.from {
                PredicateSource::Subject(key) => {
                    context.consumer_subject.as_ref()?.get(key)?.clone()
                }
                PredicateSource::RouteParam(name) => {
                    // A Definition-local read carries its own subject rather than route state.
                    if context.source == SelectionSource::Definition {
                        return None;
                    }
                    let param = context.route_params.as_ref()?.get(name)?;
                    match key_type {
                        SubjectKeyType::String => SubjectKey::String(param.clone()),
                        SubjectKeyType::Integer => SubjectKey::Integer(route_integer(param)?),
                    }
                }
            };
            let value = match (value, key_type) {
                (SubjectKey::String(text), SubjectKeyType::String)
                    if predicate.op == PredicateOp::Eq && predicate.offset.is_none() =>
                {
                    SubjectKey::String(text)
                }
                (SubjectKey::Integer(integer), SubjectKeyType::Integer)
                    if SubjectKey::is_integer_in_range(&integer) =>
                {
                    SubjectKey::Integer(integer.checked_add(predicate.offset.unwrap_or(0))?)
                }
                _ => return None,
            };
            Some(Predicate {
                key: &predicate.key,
                op: predicate.op,
                value,
            })
        })
        .collect()
}

/// Parse the spec's exact signed base-10 integer route syntax.
fn route_integer(text: &str) -> Option<i64> {
    let digits = text.strip_prefix('-').unwrap_or(text);
    if digits.is_empty() || !digits.bytes().all(|digit| digit.is_ascii_digit()) {
        return None;
    }
    text.parse().ok().filter(SubjectKey::is_integer_in_range)
}

/// Fields needed to exclude unrelated Responses before decoding their selection data.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResponseHeader<'a> {
    #[serde(borrow)]
    definition_url: Cow<'a, str>,
    #[serde(borrow)]
    status: Option<&'a RawValue>,
}

/// A matching Response's selection fields, with data still in its exact wire form.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ResponseFields<'a> {
    pub(super) id: String,
    pub(super) definition_version: String,
    authored: String,
    subject: Option<ResponseSubject>,
    #[serde(borrow)]
    pub(super) data: &'a RawValue,
}

/// A Response subject with optional keys for Definitions without a declaration.
#[derive(Deserialize)]
struct ResponseSubject {
    id: String,
    r#type: Option<String>,
    keys: Option<BTreeMap<String, SubjectKey>>,
}

/// Relevant lifecycle states of stored Responses.
#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum RecordStatus {
    InProgress,
    Amended,
    Completed,
    Stopped,
}

/// A group key cannot conflate declared filing units and implicit respondents.
#[derive(PartialEq, Eq, Hash)]
pub(super) enum FilingUnit<'a> {
    Explicit(Option<&'a str>, &'a str),
    Implicit(&'a str),
}

/// Candidate after scope, Definition, subject and timestamp checks.
pub(super) struct Candidate<'a> {
    input: &'a RawValue,
    pub(super) position: usize,
    implicit_subject_id: Option<&'a str>,
    kind: SelectionRecordKind,
    pub(super) response: ResponseFields<'a>,
    pub(super) authored: AuthoredInstant,
    response_hash: OnceCell<Option<Sha256Digest>>,
}

impl<'a> Candidate<'a> {
    /// Admit one record, ignoring unrelated Responses and refusing malformed matching data.
    pub(super) fn matching(
        position: usize,
        record: &'a SelectionRecord,
        selection: &ResponseSelection,
        context: &SelectionContext,
        predicates: &[Predicate<'_>],
        range: Option<&semver_rs::Range>,
    ) -> Option<Option<Self>> {
        if selection.status == SelectionStatus::Completed
            && record.kind == SelectionRecordKind::OpenDraft
        {
            return Some(None);
        }
        let json = record.response.get();
        let header: ResponseHeader = serde_json::from_str(json).ok()?;
        if header.definition_url != selection.definition.url {
            return Some(None);
        }
        let status: RecordStatus = serde_json::from_str(header.status?.get()).ok()?;
        if record.kind == SelectionRecordKind::OpenDraft && status == RecordStatus::Stopped {
            return Some(None);
        }
        let response: ResponseFields = serde_json::from_str(json).ok()?;
        if range.is_some_and(|range| {
            !parse_definition_version(&response.definition_version)
                .is_some_and(|version| range.test(&version))
        }) {
            return Some(None);
        }
        match (&context.upstream_subject, &response.subject) {
            (None, None) => {}
            (Some(declared), Some(actual))
                if Some(declared.r#type.as_str()) == actual.r#type.as_deref() =>
            {
                let keys = actual.keys.as_ref()?;
                if keys.len() != declared.keys.len()
                    || !keys.iter().all(|(name, value)| {
                        matches!(
                            (declared.keys.get(name).map(|key| key.data_type), value),
                            (Some(SubjectKeyType::Integer), SubjectKey::Integer(_))
                                | (Some(SubjectKeyType::String), SubjectKey::String(_))
                        )
                    })
                    || !predicates.iter().all(|predicate| predicate.matches(keys))
                {
                    return Some(None);
                }
                if subject_id(&declared.r#type, keys).ok()? != actual.id {
                    return None;
                }
            }
            (None, Some(actual)) if actual.keys.is_none() => {}
            _ => return Some(None),
        }
        if record.kind == SelectionRecordKind::Filing && status != RecordStatus::Completed {
            return None;
        }
        if response.id.is_empty() || !response.data.get().starts_with('{') {
            return None;
        }
        let authored = AuthoredInstant::parse(&response.authored)?;
        Some(Some(Self {
            input: &record.response,
            position,
            implicit_subject_id: record
                .implicit_subject_id
                .as_deref()
                .filter(|id| !id.is_empty()),
            kind: record.kind,
            response,
            authored,
            response_hash: OnceCell::new(),
        }))
    }

    /// Identity used for grouping current records and per-subject results.
    pub(super) fn subject_id(&self) -> Option<FilingUnit<'_>> {
        match &self.response.subject {
            Some(subject) if subject.keys.is_some() => {
                Some(FilingUnit::Explicit(subject.r#type.as_deref(), &subject.id))
            }
            _ => self.implicit_subject_id.map(FilingUnit::Implicit),
        }
    }

    /// Whether this record is an open draft.
    pub(super) fn draft(&self) -> bool {
        self.kind == SelectionRecordKind::OpenDraft
    }

    /// Obtain the handoff hash from original Response text, including authored signatures.
    fn hash(&self) -> Option<&Sha256Digest> {
        self.response_hash
            .get_or_init(|| {
                let response = ResponseJson::parse(self.input.get()).ok()?;
                Sha256Digest::try_from(response.handoff_hash().ok()?).ok()
            })
            .as_ref()
    }

    /// Compare disposition using both immutable record identity fields.
    pub(super) fn has_disposition(
        &self,
        dispositions: Option<&HashSet<(&str, &Sha256Digest)>>,
    ) -> Option<bool> {
        match dispositions {
            None => Some(true),
            Some(_) if self.draft() => Some(false),
            Some(dispositions) => {
                Some(dispositions.contains(&(self.response.id.as_str(), self.hash()?)))
            }
        }
    }

    /// Record the upstream id, version and immutable proof when supplied.
    pub(super) fn evidence(&self) -> Option<SelectedRecord> {
        Some(SelectedRecord {
            response_id: self.response.id.clone(),
            definition_version: self.response.definition_version.clone(),
            response_hash: if self.draft() {
                None
            } else {
                Some(self.hash()?.clone())
            },
        })
    }
}

impl Predicate<'_> {
    /// Compare the upstream value with the typed, already offset reference.
    fn matches(&self, keys: &BTreeMap<String, SubjectKey>) -> bool {
        match (keys.get(self.key), self.op, &self.value) {
            (Some(actual), PredicateOp::Eq, expected) => actual == expected,
            (Some(SubjectKey::Integer(actual)), PredicateOp::Le, SubjectKey::Integer(expected)) => {
                actual <= expected
            }
            (Some(SubjectKey::Integer(actual)), PredicateOp::Ge, SubjectKey::Integer(expected)) => {
                actual >= expected
            }
            _ => false,
        }
    }
}

/// A comparable instant with the full RFC 3339 fractional precision.
#[derive(Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(super) struct AuthoredInstant {
    second: i64,
    leap_second: bool,
    fraction: String,
}

impl AuthoredInstant {
    /// Validate the calendar and offset with chrono and retain the unrounded fraction.
    fn parse(text: &str) -> Option<Self> {
        // Require the RFC 3339 T separator. Chrono reads -00:00 as a zero UTC offset.
        if !matches!(text.as_bytes().get(10), Some(b'T' | b't')) {
            return None;
        }
        let timestamp = DateTime::parse_from_rfc3339(text).ok()?;
        let utc = timestamp.to_utc();
        let leap_second = utc.nanosecond() >= 1_000_000_000;
        if leap_second
            && (utc.hour() != 23
                || utc.minute() != 59
                || utc.second() != 59
                || !matches!((utc.month(), utc.day()), (6, 30) | (12, 31)))
        {
            return None;
        }
        // Trailing zeros don't change the instant. Ordinary lexicographic order then
        // compares decimal fractions correctly, even when one is a prefix of the other.
        let fraction = text.get(19..)?.strip_prefix('.').map_or("", |rest| {
            rest.split(|character: char| !character.is_ascii_digit())
                .next()
                .unwrap_or_default()
                .trim_end_matches('0')
        });
        Some(Self {
            second: utc.timestamp(),
            leap_second,
            fraction: fraction.into(),
        })
    }
}

/// Checks an authored timestamp before admitting a preview delivery.
pub fn valid_authored_instant(text: &str) -> bool {
    AuthoredInstant::parse(text).is_some()
}

/// Compare by authored instant descending, then unsigned UTF-8 Response id ascending.
pub(super) fn compare_rank(left: &Candidate<'_>, right: &Candidate<'_>) -> Ordering {
    right
        .authored
        .cmp(&left.authored)
        .then_with(|| left.response.id.cmp(&right.response.id))
}
