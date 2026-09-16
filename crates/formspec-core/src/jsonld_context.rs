//! JSON-LD `@context` derivation from a Definition and an Ontology document's concept bindings.
//!
//! Ontology spec §6.2: tooling generates the context from bindings; an authored `context` overrides
//! term by term (the lint pass diffs the two). The derivation is total — it never fails; what it
//! cannot honor it reports as a [`JsonLdDiagnostic`]. Rules, in Definition item order:
//!
//! - The context opens with `"@version": 1.1` and the `xsd` prefix.
//! - A bound **field** becomes `key: { "@id": <concept>, "@type": <xsd> }` typed by `dataType`:
//!   `integer`, `boolean`, `date`, `dateTime`, `time`, `uri` → the matching `xsd:` type;
//!   `decimal` (a JSON number: an `xsd:decimal` coercion would yield an invalid lexical form) and
//!   `string`, `text`, `choice`, `multiChoice` → plain; `money` → a scoped node whose `amount` and
//!   `currency` map to `schema:value` (`xsd:decimal`) and `schema:currency`; `attachment` → omitted
//!   with an `unsupported-type` diagnostic. Unbound fields, display items, and unknown item types
//!   are omitted.
//! - A bound **repeatable group** becomes `key: { "@id", "@container": "@set", "@context": … }`. An
//!   unbound repeatable group is skipped with its children; each bound descendant is reported as
//!   `unbound-repeatable`.
//! - A bound **structural group** becomes `key: { "@id", "@context": … }`; an unbound one becomes
//!   `key: "@nest"` and its children hoist into the enclosing scope.
//! - Scoped contexts (repeatable groups, bound structural groups, money) are property-scoped, so a
//!   key reused across them cannot collide.
//! - Bindings are looked up by the `[*]` path (`items[*].amount`) first, then by the dotted path
//!   (`items.amount`) for documents written before the wildcard syntax.
//! - Within one scope a key holds one term. Same key, same definition: deduplicated. Different
//!   definition: the earlier term stays, the later one is omitted, and a `collision` diagnostic is
//!   recorded — never silently. An unbound leaf never wins a key; inside a scoped context an unbound
//!   child whose key is bound in an enclosing scope is set to `null`, so the leaf is not lifted
//!   under a term it was never bound to.
//!
//! Key order relies on `serde_json`'s `preserve_order` feature (enabled workspace-wide).

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::{Map, Value, json};

/// XSD namespace bound to the `xsd` prefix in every derived context.
pub const XSD_NAMESPACE: &str = "http://www.w3.org/2001/XMLSchema#";

/// A derived JSON-LD context plus everything the derivation could not honor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonLdDerivation {
    /// The `@context` object (not wrapped in `{ "@context": … }`).
    pub context: Value,
    /// Diagnostics in Definition order; empty when every binding produced its term.
    pub diagnostics: Vec<JsonLdDiagnostic>,
}

/// Why a binding did not produce the term it named.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum JsonLdDiagnosticKind {
    /// Two items need different definitions for one key in one scope; the later is omitted.
    Collision,
    /// A bound item under an unbound repeatable group: nothing names the group's instances.
    UnboundRepeatable,
    /// A bound field whose `dataType` has no JSON-LD representation (`attachment`).
    UnsupportedType,
}

/// One thing the derivation could not honor.
///
/// For a `Collision`, `existing_id` describes the term that stays in the context and `new_id` the
/// definition the item at `path` needed. Either is the concept IRI, `"@nest"` for an unbound
/// structural group, or `None` for an unbound leaf that would be lifted under the existing term.
/// For the other kinds `new_id` carries the lost binding's concept.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonLdDiagnostic {
    /// What went wrong.
    pub kind: JsonLdDiagnosticKind,
    /// Dotted Definition path of the item that could not be honored.
    pub path: String,
    /// The item's JSON key.
    pub key: String,
    /// Term definition that stays in the context (collisions only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub existing_id: Option<String>,
    /// Term definition the item needed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_id: Option<String>,
}

/// Derive the JSON-LD `@context` for `definition` from `ontology["concepts"]`.
///
/// Missing or malformed `items` / `concepts` yield a header-only context and no diagnostics.
///
/// # Examples
/// ```
/// use serde_json::json;
/// use formspec_core::jsonld_context::derive_json_ld_context;
///
/// let definition = json!({ "items": [
///     { "key": "dob", "type": "field", "dataType": "date" }
/// ]});
/// let ontology = json!({ "concepts": {
///     "dob": { "concept": "https://schema.org/birthDate" }
/// }});
/// let derived = derive_json_ld_context(&definition, &ontology);
/// assert_eq!(derived.context["dob"]["@type"], "xsd:date");
/// assert!(derived.diagnostics.is_empty());
/// ```
pub fn derive_json_ld_context(definition: &Value, ontology: &Value) -> JsonLdDerivation {
    let empty_concepts = Map::new();
    let concepts = ontology
        .get("concepts")
        .and_then(Value::as_object)
        .unwrap_or(&empty_concepts);
    let empty_items = Vec::new();
    let items = definition
        .get("items")
        .and_then(Value::as_array)
        .unwrap_or(&empty_items);

    let mut diagnostics = Vec::new();
    let terms = build_scope(
        items,
        None,
        false,
        concepts,
        &HashSet::new(),
        &mut diagnostics,
    );

    let mut context = Map::new();
    context.insert("@version".into(), json!(1.1));
    context.insert("xsd".into(), Value::String(XSD_NAMESPACE.into()));
    // The header keys are reserved: an item keyed `xsd` would otherwise replace the prefix and break every
    // `xsd:` compact IRI. (`@version` cannot collide — item keys never start with `@`.)
    for (key, term) in terms {
        if key == "xsd" {
            diagnostics.push(JsonLdDiagnostic {
                kind: JsonLdDiagnosticKind::Collision,
                path: key.clone(),
                key,
                existing_id: Some(XSD_NAMESPACE.into()),
                new_id: term.get("@id").and_then(Value::as_str).map(str::to_string),
            });
            continue;
        }
        context.insert(key, term);
    }
    JsonLdDerivation {
        context: Value::Object(context),
        diagnostics,
    }
}

/// Wire shape for hosts: `{ "context": …, "diagnostics": [{ kind, path, key, existingId?, newId? }] }`.
pub fn json_ld_derivation_to_json_value(derivation: &JsonLdDerivation) -> Value {
    serde_json::to_value(derivation).expect("derivation serializes: plain strings and JSON values")
}

/// How a bound field's value is represented in JSON-LD, by `dataType`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FieldShape {
    /// `{ "@id" }` — string literal or native JSON typing.
    Plain,
    /// `{ "@id", "@type": <xsd> }`.
    Typed(&'static str),
    /// `{ "@id", "@context": { amount, currency } }` — Core §3.4 money object.
    Money,
    /// No JSON-LD representation; the binding is reported.
    Unsupported,
}

/// Map a `dataType` (schemas/definition.schema.json enum) to its JSON-LD shape.
fn field_shape(data_type: Option<&str>) -> FieldShape {
    match data_type {
        Some("integer") => FieldShape::Typed("xsd:integer"),
        Some("boolean") => FieldShape::Typed("xsd:boolean"),
        Some("date") => FieldShape::Typed("xsd:date"),
        Some("dateTime") => FieldShape::Typed("xsd:dateTime"),
        Some("time") => FieldShape::Typed("xsd:time"),
        Some("uri") => FieldShape::Typed("xsd:anyURI"),
        Some("money") => FieldShape::Money,
        Some("attachment") => FieldShape::Unsupported,
        // decimal (JSON number), string, text, choice, multiChoice, and absent.
        _ => FieldShape::Plain,
    }
}

/// The scoped context of a money term: Core §3.4 `{ amount: string, currency: string }`.
fn money_context() -> Value {
    json!({
        "amount": { "@id": "https://schema.org/value", "@type": "xsd:decimal" },
        "currency": { "@id": "https://schema.org/currency" }
    })
}

/// Dotted and `[*]` forms of one item's path, as the walk descends.
#[derive(Debug, Clone)]
struct ItemPath {
    /// `jobs.hours` — the form a pre-wildcard Ontology document keyed bindings by.
    dotted: String,
    /// `jobs[*].hours` — Ontology §3 path syntax.
    wildcard: String,
}

impl ItemPath {
    /// Path of `key` under `parent`; `parent_repeatable` appends `[*]` to the wildcard form.
    fn child(parent: Option<&ItemPath>, key: &str, parent_repeatable: bool) -> Self {
        match parent {
            None => Self {
                dotted: key.to_string(),
                wildcard: key.to_string(),
            },
            Some(parent) => Self {
                dotted: format!("{}.{key}", parent.dotted),
                wildcard: if parent_repeatable {
                    format!("{}[*].{key}", parent.wildcard)
                } else {
                    format!("{}.{key}", parent.wildcard)
                },
            },
        }
    }
}

/// The concept IRI bound to `path`, preferring the `[*]` key over the dotted key.
fn concept_for<'a>(concepts: &'a Map<String, Value>, path: &ItemPath) -> Option<&'a str> {
    concepts
        .get(&path.wildcard)
        .or_else(|| concepts.get(&path.dotted))
        .and_then(|binding| binding.get("concept"))
        .and_then(Value::as_str)
}

/// The definition one key needs inside a scope.
#[derive(Debug, Clone, PartialEq, Eq)]
enum TermDef {
    /// A bound item: the term object (`@context` filled in later for groups).
    Bound(Value),
    /// An unbound structural group: `"@nest"`.
    Nest,
    /// A leaf with no binding; never wins a key, becomes `null` when an enclosing scope binds the key.
    Unbound,
}

impl TermDef {
    /// The identity reported in a [`JsonLdDiagnostic`].
    fn diagnostic_id(&self) -> Option<String> {
        match self {
            TermDef::Bound(term) => term.get("@id").and_then(Value::as_str).map(str::to_string),
            TermDef::Nest => Some("@nest".to_string()),
            TermDef::Unbound => None,
        }
    }
}

/// One key's slot in a scope: its definition and the item that claimed it.
#[derive(Debug)]
struct Slot {
    /// JSON key within the scope.
    key: String,
    /// Winning definition so far.
    def: TermDef,
    /// Dotted path of the item holding the slot.
    path: String,
}

/// A bound group whose scoped context is derived once the enclosing scope has settled.
#[derive(Debug)]
struct DeferredGroup<'a> {
    /// Slot in the enclosing scope that receives the `@context`.
    slot_index: usize,
    /// The group's `children` array.
    children: &'a [Value],
    /// The group's own path.
    path: ItemPath,
    /// Whether children extend the wildcard path with `[*]`.
    repeatable: bool,
}

/// One JSON-LD context object under construction, in Definition order.
#[derive(Debug, Default)]
struct Scope {
    /// Slots in claim order.
    slots: Vec<Slot>,
    /// Key → position in `slots`.
    index: HashMap<String, usize>,
}

impl Scope {
    /// Claim `key` for `def`; on a collision keep the earlier bound term and report the loser.
    ///
    /// Returns the slot index when `def` now occupies the key, `None` when it lost or was a
    /// duplicate of the same definition.
    fn claim(
        &mut self,
        key: &str,
        def: TermDef,
        path: &str,
        diagnostics: &mut Vec<JsonLdDiagnostic>,
    ) -> Option<usize> {
        let Some(&index) = self.index.get(key) else {
            let index = self.slots.len();
            self.slots.push(Slot {
                key: key.to_string(),
                def,
                path: path.to_string(),
            });
            self.index.insert(key.to_string(), index);
            return Some(index);
        };
        let slot = &mut self.slots[index];
        if slot.def == def {
            return None;
        }
        let incoming_wins = slot.def == TermDef::Unbound && def != TermDef::Unbound;
        if incoming_wins {
            let loser_path = std::mem::replace(&mut slot.path, path.to_string());
            let loser = std::mem::replace(&mut slot.def, def);
            diagnostics.push(collision(&loser_path, key, &slot.def, &loser));
            return Some(index);
        }
        diagnostics.push(collision(path, key, &slot.def, &def));
        None
    }

    /// Keys this scope binds (fields, groups, nests) — what a nested scope must shadow.
    fn bound_keys(&self) -> impl Iterator<Item = &str> {
        self.slots
            .iter()
            .filter(|slot| slot.def != TermDef::Unbound)
            .map(|slot| slot.key.as_str())
    }

    /// Emit the context terms; unbound keys become `null` only when an enclosing scope binds them.
    fn finish(self, visible_outer: &HashSet<String>) -> Map<String, Value> {
        let mut terms = Map::new();
        for slot in self.slots {
            let value = match slot.def {
                TermDef::Bound(term) => term,
                TermDef::Nest => Value::String("@nest".into()),
                TermDef::Unbound => {
                    if !visible_outer.contains(&slot.key) {
                        continue;
                    }
                    Value::Null
                }
            };
            terms.insert(slot.key, value);
        }
        terms
    }
}

/// A `collision` diagnostic: the item at `path` needed `losing` where the scope keeps `staying`.
fn collision(path: &str, key: &str, staying: &TermDef, losing: &TermDef) -> JsonLdDiagnostic {
    JsonLdDiagnostic {
        kind: JsonLdDiagnosticKind::Collision,
        path: path.to_string(),
        key: key.to_string(),
        existing_id: staying.diagnostic_id(),
        new_id: losing.diagnostic_id(),
    }
}

/// Derive one scope: the top-level context or a bound group's `@context`.
///
/// `parent_repeatable` says whether the first level of `items` sits under a `[*]` segment.
fn build_scope(
    items: &[Value],
    parent: Option<&ItemPath>,
    parent_repeatable: bool,
    concepts: &Map<String, Value>,
    visible_outer: &HashSet<String>,
    diagnostics: &mut Vec<JsonLdDiagnostic>,
) -> Map<String, Value> {
    let mut scope = Scope::default();
    let mut deferred = Vec::new();
    collect_terms(
        items,
        parent,
        parent_repeatable,
        concepts,
        &mut scope,
        &mut deferred,
        diagnostics,
    );

    // Every bound key of this scope is active inside a child scope regardless of definition
    // order, so child scopes are derived only after this one has settled.
    let mut visible_here = visible_outer.clone();
    visible_here.extend(scope.bound_keys().map(str::to_string));
    for group in deferred {
        let child_terms = build_scope(
            group.children,
            Some(&group.path),
            group.repeatable,
            concepts,
            &visible_here,
            diagnostics,
        );
        if let TermDef::Bound(Value::Object(term)) = &mut scope.slots[group.slot_index].def
            && !child_terms.is_empty()
        {
            term.insert("@context".into(), Value::Object(child_terms));
        }
    }
    scope.finish(visible_outer)
}

/// Walk `items`, claiming a slot per item; unbound structural groups recurse into the same scope.
fn collect_terms<'a>(
    items: &'a [Value],
    parent: Option<&ItemPath>,
    parent_repeatable: bool,
    concepts: &Map<String, Value>,
    scope: &mut Scope,
    deferred: &mut Vec<DeferredGroup<'a>>,
    diagnostics: &mut Vec<JsonLdDiagnostic>,
) {
    for item in items {
        let Some(key) = item.get("key").and_then(Value::as_str) else {
            continue;
        };
        let path = ItemPath::child(parent, key, parent_repeatable);
        let concept = concept_for(concepts, &path);
        let children = item
            .get("children")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let repeatable = item.get("repeatable").and_then(Value::as_bool) == Some(true);

        match item.get("type").and_then(Value::as_str) {
            Some("group") => match concept {
                Some(concept) => {
                    let term = if repeatable {
                        json!({ "@id": concept, "@container": "@set" })
                    } else {
                        json!({ "@id": concept })
                    };
                    if let Some(slot_index) =
                        scope.claim(key, TermDef::Bound(term), &path.dotted, diagnostics)
                    {
                        deferred.push(DeferredGroup {
                            slot_index,
                            children,
                            path: path.clone(),
                            repeatable,
                        });
                    }
                }
                None if repeatable => {
                    // Claim the key so an enclosing scope's same-named term is shadowed with `null`:
                    // the instances must not lift under a term they were never bound to.
                    scope.claim(key, TermDef::Unbound, &path.dotted, diagnostics);
                    report_lost_bindings(children, &path, true, concepts, diagnostics);
                }
                None => {
                    scope.claim(key, TermDef::Nest, &path.dotted, diagnostics);
                    collect_terms(
                        children,
                        Some(&path),
                        false,
                        concepts,
                        scope,
                        deferred,
                        diagnostics,
                    );
                }
            },
            Some("field") => {
                let Some(concept) = concept else {
                    scope.claim(key, TermDef::Unbound, &path.dotted, diagnostics);
                    continue;
                };
                let data_type = item.get("dataType").and_then(Value::as_str);
                let term = match field_shape(data_type) {
                    FieldShape::Plain => json!({ "@id": concept }),
                    FieldShape::Typed(xsd) => json!({ "@id": concept, "@type": xsd }),
                    FieldShape::Money => json!({ "@id": concept, "@context": money_context() }),
                    FieldShape::Unsupported => {
                        diagnostics.push(JsonLdDiagnostic {
                            kind: JsonLdDiagnosticKind::UnsupportedType,
                            path: path.dotted.clone(),
                            key: key.to_string(),
                            existing_id: None,
                            new_id: Some(concept.to_string()),
                        });
                        continue;
                    }
                };
                scope.claim(key, TermDef::Bound(term), &path.dotted, diagnostics);
            }
            _ => {}
        }
    }
}

/// Report every bound descendant of an unbound repeatable group as `unbound-repeatable`.
fn report_lost_bindings(
    items: &[Value],
    parent: &ItemPath,
    parent_repeatable: bool,
    concepts: &Map<String, Value>,
    diagnostics: &mut Vec<JsonLdDiagnostic>,
) {
    for item in items {
        let Some(key) = item.get("key").and_then(Value::as_str) else {
            continue;
        };
        let path = ItemPath::child(Some(parent), key, parent_repeatable);
        if let Some(concept) = concept_for(concepts, &path) {
            diagnostics.push(JsonLdDiagnostic {
                kind: JsonLdDiagnosticKind::UnboundRepeatable,
                path: path.dotted.clone(),
                key: key.to_string(),
                existing_id: None,
                new_id: Some(concept.to_string()),
            });
        }
        if let Some(children) = item.get("children").and_then(Value::as_array) {
            let repeatable = item.get("repeatable").and_then(Value::as_bool) == Some(true);
            report_lost_bindings(children, &path, repeatable, concepts, diagnostics);
        }
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    fn field(key: &str, data_type: &str) -> Value {
        json!({ "key": key, "type": "field", "dataType": data_type })
    }

    fn group(key: &str, repeatable: bool, children: Vec<Value>) -> Value {
        json!({ "key": key, "type": "group", "repeatable": repeatable, "children": children })
    }

    fn concept(iri: &str) -> Value {
        json!({ "concept": iri })
    }

    fn keys(context: &Value) -> Vec<&str> {
        context
            .as_object()
            .expect("context is an object")
            .keys()
            .map(String::as_str)
            .collect()
    }

    fn collision_diag(
        path: &str,
        key: &str,
        existing: Option<&str>,
        new: Option<&str>,
    ) -> JsonLdDiagnostic {
        JsonLdDiagnostic {
            kind: JsonLdDiagnosticKind::Collision,
            path: path.into(),
            key: key.into(),
            existing_id: existing.map(str::to_string),
            new_id: new.map(str::to_string),
        }
    }

    #[test]
    fn header_opens_every_context_even_without_items_or_concepts() {
        let derived = derive_json_ld_context(&json!({}), &json!({}));
        assert_eq!(
            derived.context,
            json!({ "@version": 1.1, "xsd": XSD_NAMESPACE })
        );
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn bound_fields_carry_concept_and_xsd_type() {
        let definition = json!({ "items": [field("dob", "date"), field("name", "string")] });
        let ontology = json!({ "concepts": {
            "dob": concept("https://schema.org/birthDate"),
            "name": concept("https://schema.org/name")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(keys(&derived.context), ["@version", "xsd", "dob", "name"]);
        assert_eq!(
            derived.context["dob"],
            json!({ "@id": "https://schema.org/birthDate", "@type": "xsd:date" })
        );
        assert_eq!(
            derived.context["name"],
            json!({ "@id": "https://schema.org/name" })
        );
    }

    #[test]
    fn every_data_type_in_the_definition_schema_maps() {
        // Mirrors the `dataType` enum in schemas/definition.schema.json.
        let typed: [(&str, Option<&str>); 11] = [
            ("string", None),
            ("text", None),
            ("integer", Some("xsd:integer")),
            ("decimal", None),
            ("boolean", Some("xsd:boolean")),
            ("date", Some("xsd:date")),
            ("dateTime", Some("xsd:dateTime")),
            ("time", Some("xsd:time")),
            ("uri", Some("xsd:anyURI")),
            ("choice", None),
            ("multiChoice", None),
        ];
        for (data_type, xsd) in typed {
            let definition = json!({ "items": [field("f", data_type)] });
            let ontology = json!({ "concepts": { "f": concept("urn:c:f") } });
            let derived = derive_json_ld_context(&definition, &ontology);
            let expected = match xsd {
                Some(xsd) => json!({ "@id": "urn:c:f", "@type": xsd }),
                None => json!({ "@id": "urn:c:f" }),
            };
            assert_eq!(derived.context["f"], expected, "dataType {data_type}");
            assert!(derived.diagnostics.is_empty(), "dataType {data_type}");
        }

        let definition = json!({ "items": [field("price", "money")] });
        let ontology = json!({ "concepts": { "price": concept("urn:c:price") } });
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(
            derived.context["price"],
            json!({
                "@id": "urn:c:price",
                "@context": {
                    "amount": { "@id": "https://schema.org/value", "@type": "xsd:decimal" },
                    "currency": { "@id": "https://schema.org/currency" }
                }
            })
        );
        assert!(derived.diagnostics.is_empty());

        let definition =
            json!({ "items": [field("scan", "attachment"), field("after", "string")] });
        let ontology = json!({ "concepts": {
            "scan": concept("urn:c:scan"),
            "after": concept("urn:c:after")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(keys(&derived.context), ["@version", "xsd", "after"]);
        assert_eq!(
            derived.diagnostics,
            vec![JsonLdDiagnostic {
                kind: JsonLdDiagnosticKind::UnsupportedType,
                path: "scan".into(),
                key: "scan".into(),
                existing_id: None,
                new_id: Some("urn:c:scan".into()),
            }]
        );
    }

    #[test]
    fn unbound_structural_group_nests_and_hoists_children() {
        let definition = json!({ "items": [
            group("eligibility", false, vec![field("able", "boolean"), field("notes", "text")])
        ]});
        let ontology = json!({ "concepts": {
            "eligibility.able": concept("urn:c:able")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(
            keys(&derived.context),
            ["@version", "xsd", "eligibility", "able"]
        );
        assert_eq!(derived.context["eligibility"], "@nest");
        assert_eq!(
            derived.context["able"],
            json!({ "@id": "urn:c:able", "@type": "xsd:boolean" })
        );
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn bound_structural_group_is_a_scoped_node() {
        let definition = json!({ "items": [
            group("home", false, vec![field("city", "string"), field("zip", "string")])
        ]});
        let ontology = json!({ "concepts": {
            "home": concept("urn:c:home-address"),
            "home.city": concept("urn:c:city")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(keys(&derived.context), ["@version", "xsd", "home"]);
        assert_eq!(
            derived.context["home"],
            json!({
                "@id": "urn:c:home-address",
                "@context": { "city": { "@id": "urn:c:city" } }
            })
        );
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn bound_repeatable_group_is_a_scoped_set_with_nested_structural_groups() {
        let definition = json!({ "items": [
            group("jobs", true, vec![
                field("employer", "string"),
                group("hoursWorked", false, vec![field("hours", "integer")]),
                field("unbound", "string"),
            ])
        ]});
        let ontology = json!({ "concepts": {
            "jobs": concept("urn:c:job"),
            "jobs[*].employer": concept("urn:c:employer"),
            "jobs[*].hoursWorked.hours": concept("urn:c:hours")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(
            derived.context["jobs"],
            json!({
                "@id": "urn:c:job",
                "@container": "@set",
                "@context": {
                    "employer": { "@id": "urn:c:employer" },
                    "hoursWorked": "@nest",
                    "hours": { "@id": "urn:c:hours", "@type": "xsd:integer" }
                }
            })
        );
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn unbound_repeatable_group_is_skipped_and_its_bound_descendants_reported() {
        let definition = json!({ "items": [
            group("jobs", true, vec![
                field("employer", "string"),
                group("hoursWorked", false, vec![field("hours", "integer")]),
                field("free", "string"),
            ]),
            field("after", "string"),
        ]});
        let ontology = json!({ "concepts": {
            "jobs[*].employer": concept("urn:c:employer"),
            "jobs[*].hoursWorked.hours": concept("urn:c:hours"),
            "after": concept("urn:c:after")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(keys(&derived.context), ["@version", "xsd", "after"]);
        let lost = |path: &str, key: &str, id: &str| JsonLdDiagnostic {
            kind: JsonLdDiagnosticKind::UnboundRepeatable,
            path: path.into(),
            key: key.into(),
            existing_id: None,
            new_id: Some(id.into()),
        };
        assert_eq!(
            derived.diagnostics,
            vec![
                lost("jobs.employer", "employer", "urn:c:employer"),
                lost("jobs.hoursWorked.hours", "hours", "urn:c:hours"),
            ]
        );
    }

    #[test]
    fn same_key_in_two_scoped_groups_does_not_collide() {
        let definition = json!({ "items": [
            group("jobs", true, vec![field("name", "string")]),
            group("payer", false, vec![field("name", "string")]),
        ]});
        let ontology = json!({ "concepts": {
            "jobs": concept("urn:c:job"),
            "jobs[*].name": concept("urn:c:employer-name"),
            "payer": concept("urn:c:payer"),
            "payer.name": concept("urn:c:payer-name")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(
            derived.context["jobs"]["@context"]["name"]["@id"],
            "urn:c:employer-name"
        );
        assert_eq!(
            derived.context["payer"]["@context"]["name"]["@id"],
            "urn:c:payer-name"
        );
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn unbound_repeatable_group_inside_a_scoped_context_shadows_the_outer_term() {
        // Top-level `jobs` is bound; inside bound group `home` an UNBOUND repeatable `jobs` must not let its
        // instances lift under the outer term — the scoped context shadows it with `null`.
        let definition = json!({ "items": [
            field("jobs", "string"),
            group("home", false, vec![
                group("jobs", true, vec![field("title", "string")]),
            ]),
        ]});
        let ontology = json!({ "concepts": {
            "jobs": concept("urn:c:job"),
            "home": concept("urn:c:home")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        let home_scope = derived.context["home"]["@context"].as_object().expect("scoped context");
        assert!(home_scope.contains_key("jobs"), "{}", derived.context);
        assert_eq!(home_scope["jobs"], Value::Null);
        assert!(derived.diagnostics.is_empty(), "{:?}", derived.diagnostics);
    }

    #[test]
    fn an_item_keyed_xsd_reports_a_collision_and_keeps_the_prefix() {
        let definition = json!({ "items": [field("xsd", "string"), field("dob", "date")] });
        let ontology = json!({ "concepts": {
            "xsd": concept("urn:c:xsd"),
            "dob": concept("urn:c:dob")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(derived.context["xsd"], Value::String(XSD_NAMESPACE.into()));
        assert_eq!(derived.context["dob"]["@type"], "xsd:date");
        assert_eq!(derived.diagnostics.len(), 1);
        assert_eq!(derived.diagnostics[0].kind, JsonLdDiagnosticKind::Collision);
        assert_eq!(derived.diagnostics[0].key, "xsd");
        assert_eq!(derived.diagnostics[0].new_id.as_deref(), Some("urn:c:xsd"));
    }

    #[test]
    fn hoisting_collision_omits_the_later_term_and_reports_it() {
        let definition = json!({ "items": [
            group("home", false, vec![field("city", "string")]),
            group("work", false, vec![field("city", "string")]),
        ]});
        let ontology = json!({ "concepts": {
            "home.city": concept("urn:c:home-city"),
            "work.city": concept("urn:c:work-city")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(
            keys(&derived.context),
            ["@version", "xsd", "home", "city", "work"]
        );
        assert_eq!(derived.context["city"]["@id"], "urn:c:home-city");
        assert_eq!(
            derived.diagnostics,
            vec![collision_diag(
                "work.city",
                "city",
                Some("urn:c:home-city"),
                Some("urn:c:work-city")
            )]
        );
    }

    #[test]
    fn same_key_with_the_same_definition_in_two_structural_groups_is_deduplicated() {
        let definition = json!({ "items": [
            group("home", false, vec![field("notes", "text")]),
            group("work", false, vec![field("notes", "text")]),
        ]});
        let ontology = json!({ "concepts": {
            "home.notes": concept("urn:c:notes"),
            "work.notes": concept("urn:c:notes")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(
            keys(&derived.context),
            ["@version", "xsd", "home", "notes", "work"]
        );
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn structural_group_key_colliding_with_a_field_reports_a_collision() {
        let definition = json!({ "items": [
            field("work", "string"),
            group("outer", false, vec![group("work", false, vec![field("hours", "integer")])]),
        ]});
        let ontology = json!({ "concepts": {
            "work": concept("urn:c:work"),
            "outer.work.hours": concept("urn:c:hours")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(derived.context["work"]["@id"], "urn:c:work");
        assert_eq!(derived.context["hours"]["@id"], "urn:c:hours");
        assert_eq!(
            derived.diagnostics,
            vec![collision_diag(
                "outer.work",
                "work",
                Some("urn:c:work"),
                Some("@nest")
            )]
        );
    }

    #[test]
    fn binding_keyed_without_wildcard_resolves_and_wildcard_is_preferred() {
        let definition = json!({ "items": [
            group("items", true, vec![field("amount", "decimal"), field("note", "text")]),
        ]});
        let ontology = json!({ "concepts": {
            "items": concept("urn:c:line"),
            "items.amount": concept("urn:c:amount-dotted"),
            "items[*].amount": concept("urn:c:amount-wildcard"),
            "items.note": concept("urn:c:note-dotted")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        let scoped = &derived.context["items"]["@context"];
        assert_eq!(scoped["amount"], json!({ "@id": "urn:c:amount-wildcard" }));
        assert_eq!(scoped["note"]["@id"], "urn:c:note-dotted");
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn unbound_child_in_a_scoped_context_shadows_the_enclosing_term_with_null() {
        let definition = json!({ "items": [
            field("city", "string"),
            group("jobs", true, vec![field("city", "string"), field("zip", "string")]),
        ]});
        let ontology = json!({ "concepts": {
            "city": concept("urn:c:home-city"),
            "jobs": concept("urn:c:job")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(derived.context["jobs"]["@context"], json!({ "city": null }));
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn unbound_leaf_sharing_a_key_with_a_bound_term_in_the_same_scope_is_reported_in_either_order()
    {
        let ontology = json!({ "concepts": { "notes": concept("urn:c:notes") } });

        let bound_first = json!({ "items": [
            field("notes", "text"),
            group("g", false, vec![field("notes", "text")]),
        ]});
        let derived = derive_json_ld_context(&bound_first, &ontology);
        assert_eq!(derived.context["notes"]["@id"], "urn:c:notes");
        assert_eq!(
            derived.diagnostics,
            vec![collision_diag(
                "g.notes",
                "notes",
                Some("urn:c:notes"),
                None
            )]
        );

        let unbound_first = json!({ "items": [
            group("g", false, vec![field("notes", "text")]),
            field("notes", "text"),
        ]});
        let derived = derive_json_ld_context(&unbound_first, &ontology);
        assert_eq!(derived.context["notes"]["@id"], "urn:c:notes");
        assert_eq!(
            derived.diagnostics,
            vec![collision_diag(
                "g.notes",
                "notes",
                Some("urn:c:notes"),
                None
            )]
        );
    }

    #[test]
    fn unbound_fields_display_items_and_unknown_types_are_omitted() {
        let definition = json!({ "items": [
            field("unbound", "string"),
            { "key": "banner", "type": "display" },
            { "key": "mystery", "type": "widget" },
            { "type": "field", "dataType": "string" },
            field("bound", "string"),
        ]});
        let ontology = json!({ "concepts": {
            "banner": concept("urn:c:banner"),
            "mystery": concept("urn:c:mystery"),
            "bound": concept("urn:c:bound")
        }});
        let derived = derive_json_ld_context(&definition, &ontology);
        assert_eq!(keys(&derived.context), ["@version", "xsd", "bound"]);
        assert!(derived.diagnostics.is_empty());
    }

    #[test]
    fn wire_value_uses_camel_case_keys_and_kebab_case_kinds() {
        let derivation = JsonLdDerivation {
            context: json!({ "@version": 1.1 }),
            diagnostics: vec![
                collision_diag("g.notes", "notes", Some("urn:c:notes"), None),
                JsonLdDiagnostic {
                    kind: JsonLdDiagnosticKind::UnboundRepeatable,
                    path: "jobs.employer".into(),
                    key: "employer".into(),
                    existing_id: None,
                    new_id: Some("urn:c:employer".into()),
                },
            ],
        };
        assert_eq!(
            json_ld_derivation_to_json_value(&derivation),
            json!({
                "context": { "@version": 1.1 },
                "diagnostics": [
                    { "kind": "collision", "path": "g.notes", "key": "notes", "existingId": "urn:c:notes" },
                    { "kind": "unbound-repeatable", "path": "jobs.employer", "key": "employer", "newId": "urn:c:employer" }
                ]
            })
        );
    }
}
