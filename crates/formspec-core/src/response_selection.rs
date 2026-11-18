//! Subject-keyed Response selection and exact delivered-value commitments (Core §2.1.6).

mod candidates;
mod delivery;
mod wire;

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;

use crate::compatible_versions::parse_compatible_range;
use crate::subject_key::SubjectKey;
use candidates::{Candidate, compare_rank, resolve_predicates};
use delivery::{deliver, value_digest};

#[doc(inline)]
pub use crate::instance_resolution::{
    DeliveredSelection, MappingReference, SelectedRecord, Sha256Digest,
};
#[doc(inline)]
pub use candidates::valid_authored_instant;
#[doc(inline)]
pub use wire::{select_json, subject_id, subject_id_json};

/// The declared type of an upstream subject key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SubjectKeyType {
    /// Text.
    String,
    /// Signed integer.
    Integer,
}

/// The upstream Definition's subject type and key declarations.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectDeclaration {
    /// The Definition's subject type.
    pub r#type: String,
    /// Types of its declared keys.
    pub keys: BTreeMap<String, SubjectKeyDeclaration>,
}

/// The key type in a Definition's subject declaration.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubjectKeyDeclaration {
    /// Scalar type declared by the Definition.
    pub data_type: SubjectKeyType,
}

/// The storage record that supplied a selection candidate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SelectionRecordKind {
    /// An editable draft, including an unsigned or signed candidate prepared for filing.
    OpenDraft,
    /// An immutable filed Response.
    Filing,
}

/// A Response candidate with its storage scope and original JSON.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionRecord {
    /// Storage scope supplied by the caller.
    pub scope: String,
    /// The store supplies the record kind independently of the Response document.
    pub kind: SelectionRecordKind,
    /// Original Response JSON, including authored signatures.
    pub response: Box<RawValue>,
    /// Server-only respondent identity when the Definition has no subject.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub implicit_subject_id: Option<String>,
}

/// A declared Response read (Core §2.1.6).
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResponseSelection {
    /// Upstream Definition identity and compatible versions.
    pub definition: TargetDefinition,
    /// All predicates must match.
    pub subject: Vec<SubjectPredicate>,
    /// Which lifecycle state to read.
    pub status: SelectionStatus,
    /// Required outcome reported by the disposition authority.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disposition: Option<String>,
    /// How to deliver a successful empty match.
    #[serde(default)]
    pub when_none: WhenNone,
    /// Number of records to deliver.
    pub cardinality: Cardinality,
    /// Retention policy for the delivered value.
    pub pin: Pin,
    /// Forward Mapping URL, resolved by the caller.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping: Option<String>,
}

/// The upstream Definition reference.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TargetDefinition {
    /// Canonical upstream Definition URL.
    pub url: String,
    /// Semantic version range.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compatible_versions: Option<String>,
}

/// A typed comparison against a key on the upstream Response.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SubjectPredicate {
    /// Upstream subject key.
    pub key: String,
    /// Comparison relative to the resolved reference.
    pub op: PredicateOp,
    /// Consumer subject or catalog route input.
    pub from: PredicateSource,
    /// Integer addition before the comparison.
    #[serde(
        default,
        deserialize_with = "wire::deserialize_offset",
        skip_serializing_if = "Option::is_none"
    )]
    pub offset: Option<i64>,
}

/// The comparison applied to the upstream key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PredicateOp {
    /// Equality of identically typed values.
    Eq,
    /// Integer less than or equal.
    Le,
    /// Integer greater than or equal.
    Ge,
}

/// The source of a subject predicate's reference value.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PredicateSource {
    /// Key of the consumer's subject.
    Subject(String),
    /// Name of a catalog route parameter.
    RouteParam(String),
}

/// The lifecycle policy for candidate selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SelectionStatus {
    /// Only immutable completed filings.
    Completed,
    /// Each subject's open draft or its latest completed filing.
    Current,
}

/// The result of a successful match with no eligible records.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WhenNone {
    /// Return unavailable.
    #[default]
    Unavailable,
    /// Deliver a fallback, or JSON null.
    Empty,
}

/// How many of the ordered records are delivered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Cardinality {
    /// One record overall.
    Latest,
    /// One record for each distinct subject, in selection order.
    LatestPerSubject,
}

/// When to retain the selected value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Pin {
    /// Select from the current inputs each time.
    None,
    /// Use the value captured at open after checking availability.
    AtOpen,
}

/// Where the Response selection was declared.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SelectionSource {
    /// A Definition response instance.
    Definition,
    /// An app catalog data source.
    Catalog,
}

/// Caller-supplied facts and delivery options for one read.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionContext {
    /// Storage scope being read.
    pub scope: String,
    /// Whether the caller authorized the query and checked access to all supplied candidates.
    pub authorized: bool,
    /// Where the selection was declared.
    pub source: SelectionSource,
    /// Required upstream subject declaration. JSON null means the Definition has no subject.
    #[serde(deserialize_with = "Deserialize::deserialize")]
    pub upstream_subject: Option<SubjectDeclaration>,
    /// Keys of the consuming Response, when available.
    pub consumer_subject: Option<BTreeMap<String, SubjectKey>>,
    /// Route parameters for a catalog source.
    pub route_params: Option<BTreeMap<String, String>>,
    /// FieldRef paths for a Definition instance or a catalog field projection.
    pub projection: Option<Vec<String>>,
    /// Instance fallback for a successful empty match.
    pub fallback: Option<Box<RawValue>>,
    /// Completed record outcomes. An empty list means the authority answered with no outcomes.
    pub dispositions: Option<Vec<Disposition>>,
    /// Resolved forward Mapping with its caller-verified identity.
    pub mapping: Option<SelectionMapping>,
    /// Retained records, value and digest for a later at-open read.
    pub pin: Option<DeliveredSelection>,
    /// Include original input positions for hosts tracking concrete deliveries.
    #[serde(default)]
    pub include_input_positions: bool,
}

/// One outcome from the caller's disposition authority.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Disposition {
    /// Filed Response id.
    pub response_id: String,
    /// Handoff digest of those exact filed bytes.
    pub response_hash: Sha256Digest,
    /// Outcome URI.
    pub value: String,
}

/// The Mapping material resolved by the caller for an available read.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionMapping {
    /// Identity of the resolved Mapping.
    pub reference: MappingReference,
    /// The resolved Mapping document.
    pub document: serde_json::Value,
}

/// Identity of a different completed record that a fresh read would select.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewerRecord {
    /// Response id.
    pub response_id: String,
    /// Completed Response handoff hash.
    pub response_hash: Sha256Digest,
}

/// An available value or an undifferentiated refusal.
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum SelectionOutcome {
    /// Successful delivery, which may be an empty match.
    Available {
        /// Delivered JSON and receipt fields.
        #[serde(flatten)]
        delivered: DeliveredSelection,
        /// First different completed record in current selection order.
        #[serde(skip_serializing_if = "Option::is_none")]
        newer: Option<NewerRecord>,
        /// Input record positions in selection order for a fresh read, when requested.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "inputPositions")]
        input_positions: Option<Vec<usize>>,
    },
    /// Refusal, unusable input or missing required record.
    Unavailable,
}

/// Selects and commits to the value delivered by an authorized Response read.
///
/// For a fixed predicate set, the fallback scans the supplied records in expected O(m)
/// time. Latest-per-subject sorts only the k winning records in O(k log k) additional
/// time. Timestamp, JSON, digest and projection costs depend on input byte size.
/// The caller authorizes before querying, supplies record-level authorization and
/// looks up disposition and Mapping facts. This function performs no I/O.
pub fn select(
    records: &[SelectionRecord],
    selection: &ResponseSelection,
    context: &SelectionContext,
) -> SelectionOutcome {
    select_available(records, selection, context).unwrap_or(SelectionOutcome::Unavailable)
}

/// Resolve inputs, match candidates, then deliver either a live read or a retained pin.
fn select_available(
    records: &[SelectionRecord],
    selection: &ResponseSelection,
    context: &SelectionContext,
) -> Option<SelectionOutcome> {
    if !context.authorized
        || (context.source == SelectionSource::Definition && context.projection.is_none())
    {
        return None;
    }
    let predicates = resolve_predicates(selection, context)?;
    let range = match selection.definition.compatible_versions.as_deref() {
        Some(range) => Some(parse_compatible_range(range)?),
        None => None,
    };
    let dispositions = match selection.disposition.as_deref() {
        Some(required) => Some(
            context
                .dispositions
                .as_ref()?
                .iter()
                .filter(|answer| answer.value == required)
                .map(|answer| (answer.response_id.as_str(), &answer.response_hash))
                .collect::<HashSet<_>>(),
        ),
        None => None,
    };
    let mut matching = Vec::new();
    let mut ranks = HashSet::new();
    for (position, record) in records.iter().enumerate() {
        if record.scope != context.scope {
            continue;
        }
        let Some(candidate) = Candidate::matching(
            position,
            record,
            selection,
            context,
            &predicates,
            range.as_ref(),
        )?
        else {
            continue;
        };
        if selection.status == SelectionStatus::Completed
            && !candidate.has_disposition(dispositions.as_ref())?
        {
            continue;
        }
        if !ranks.insert((candidate.authored.clone(), candidate.response.id.clone())) {
            return None;
        }
        matching.push(candidate);
    }

    let mut winners: Vec<_> = if selection.status == SelectionStatus::Current
        || selection.cardinality == Cardinality::LatestPerSubject
    {
        let mut per_subject = HashMap::new();
        for candidate in &matching {
            let current = selection.status == SelectionStatus::Current;
            per_subject
                .entry(candidate.subject_id()?)
                .and_modify(|winner: &mut &Candidate| {
                    if (current && candidate.draft().cmp(&winner.draft()).is_gt())
                        || ((!current || candidate.draft() == winner.draft())
                            && compare_rank(candidate, winner).is_lt())
                    {
                        *winner = candidate;
                    }
                })
                .or_insert(candidate);
        }
        let mut winners = Vec::with_capacity(per_subject.len());
        for candidate in per_subject.into_values() {
            if selection.status == SelectionStatus::Completed
                || candidate.has_disposition(dispositions.as_ref())?
            {
                winners.push(candidate);
            }
        }
        winners
    } else {
        matching
            .iter()
            .min_by(|a, b| compare_rank(a, b))
            .into_iter()
            .collect()
    };
    if selection.cardinality == Cardinality::Latest {
        winners = winners
            .into_iter()
            .min_by(|a, b| compare_rank(a, b))
            .into_iter()
            .collect();
    } else {
        winners.sort_unstable_by(|a, b| compare_rank(a, b));
    }

    if let (Pin::AtOpen, Some(pin)) = (selection.pin, &context.pin) {
        return retained(
            pin,
            &matching,
            &winners,
            selection,
            context.mapping.as_ref().map(|resolved| &resolved.reference),
        );
    }
    let delivered = deliver(&winners, selection, context)?;
    Some(SelectionOutcome::Available {
        delivered,
        newer: None,
        input_positions: context
            .include_input_positions
            .then(|| winners.iter().map(|candidate| candidate.position).collect()),
    })
}

/// Reuse the captured value only while each retained record is still available.
fn retained(
    pin: &DeliveredSelection,
    matching: &[Candidate],
    winners: &[&Candidate],
    selection: &ResponseSelection,
    current_mapping: Option<&MappingReference>,
) -> Option<SelectionOutcome> {
    if !pin.pinned
        || pin.none != pin.records.is_empty()
        || (selection.cardinality == Cardinality::Latest && pin.records.len() > 1)
        || (pin.none && pin.mapping.is_some())
        || (!pin.none
            && pin.mapping.as_ref().map(|mapping| &mapping.url) != selection.mapping.as_ref())
        || pin
            .mapping
            .as_ref()
            .is_some_and(|used| Some(used) != current_mapping)
        || value_digest(&pin.value)? != pin.value_digest
    {
        return None;
    }
    let mut expected = HashMap::new();
    let mut pinned_records = HashSet::new();
    for record in &pin.records {
        if (record.response_hash.is_none() && selection.status == SelectionStatus::Completed)
            || expected
                .insert(
                    (
                        record.response_id.as_str(),
                        record.definition_version.as_str(),
                    ),
                    record.response_hash.as_ref(),
                )
                .is_some()
        {
            return None;
        }
        pinned_records.insert((record.response_id.as_str(), record.response_hash.as_ref()));
    }
    for candidate in matching {
        let key = (
            candidate.response.id.as_str(),
            candidate.response.definition_version.as_str(),
        );
        if let Some(hash) = expected.get(&key)
            && (hash.is_none()
                || candidate
                    .evidence()
                    .and_then(|record| record.response_hash)
                    .as_ref()
                    == *hash)
        {
            expected.remove(&key);
        }
    }
    if !expected.is_empty() {
        return None;
    }
    let mut newer = None;
    for winner in winners.iter().filter(|winner| !winner.draft()) {
        let record = winner.evidence()?;
        if !pinned_records.contains(&(record.response_id.as_str(), record.response_hash.as_ref())) {
            newer = Some(NewerRecord {
                response_id: record.response_id,
                response_hash: record.response_hash?,
            });
            break;
        }
    }
    Some(SelectionOutcome::Available {
        delivered: pin.clone(),
        newer,
        input_positions: None,
    })
}
