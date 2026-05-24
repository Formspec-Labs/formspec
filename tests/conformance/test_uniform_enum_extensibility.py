"""Conformance tests for ADR 0150 §4.5/§10: uniform `oneOf [closed-core, x-pattern]`
enum convention across 9 substrate enums, plus Response Actions root drift fix
(§10 row 5: add `patternProperties: {"^x-": {}}` at root).

Each target enum admits a closed-core value OR an `x-foo-bar` extension value
following the regex `^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$`. Pre-existing
closed-core values continue to validate identically (default-module-set proof
per ADR §4.9 — regression-proof).

Parametrized across 9 enums to keep the convention reviewable as a unit;
test data is the only per-enum surface.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SCHEMAS_DIR = Path(__file__).parents[2] / "schemas"
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())

# All schemas touched by Task 5 enum refactors.
TOUCHED_SCHEMAS = {
    "experience": "experience.schema.json",
    "component": "component.schema.json",
    "trace-index": "trace-index.schema.json",
    "respondent-ledger-event": "respondent-ledger-event.schema.json",
    "mapping": "mapping.schema.json",
    "screener": "screener.schema.json",
    "changelog": "changelog.schema.json",
    "response-actions": "response-actions.schema.json",
    # validation-mapping is $ref'd from response-actions.ActionIntent — load so the registry resolves
    "validation-mapping": "validation-mapping.schema.json",
}

LOADED_SCHEMAS = {
    name: json.loads((SCHEMAS_DIR / fname).read_text())
    for name, fname in TOUCHED_SCHEMAS.items()
}


def _build_registry() -> Registry:
    resources = [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
    ]
    for schema in LOADED_SCHEMAS.values():
        if "$id" in schema:
            resources.append((schema["$id"], Resource.from_contents(schema, default_specification=DRAFT202012)))
    return Registry().with_resources(resources)


REGISTRY = _build_registry()


def _validator(schema_name: str) -> Draft202012Validator:
    return Draft202012Validator(LOADED_SCHEMAS[schema_name], registry=REGISTRY)


def _validate(schema_name: str, doc: dict) -> None:
    _validator(schema_name).validate(doc)


def _is_valid(schema_name: str, doc: dict) -> bool:
    try:
        _validate(schema_name, doc)
        return True
    except ValidationError:
        return False


# ─── Per-enum case table ─────────────────────────────────────────────────────
#
# Each case provides:
#   schema_name       — key into LOADED_SCHEMAS
#   make_doc(value)   — builds a minimal valid doc with the target field set to `value`
#   closed_core       — a representative closed-core enum value (must validate)
#   bare_unknown      — a bare unknown value (must REJECT — outside closed enum, no x- prefix)
#   x_extension       — a well-formed extension value (must validate after refactor)
#
# Test parametrization runs all three assertions per case.


def _ra_doc_with_intent(value):
    return {
        "$formspecResponseActions": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "actions": [
            {
                "id": "doIt",
                "intent": value,
                # x-intents require validation per existing Action allOf gate
                "validation": {"strategy": "full"},
                "effects": [],
            }
        ],
    }


def _experience_doc_with_unit_kind(value):
    return {
        "$formspecExperience": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "units": [
            {"id": "u1", "kind": value}
        ],
        "tasks": [],
    }


def _component_doc_with_widget(value):
    return {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "tree": {"component": value},
    }


def _trace_index_minimal():
    """Build a minimal trace-index doc; tests override sources[]/edges[] etc per enum.

    Required at root: $formspecTrace + sources + edges (per trace-index.schema.json).
    """
    return {
        "$formspecTrace": "1.0",
        "sources": [],
        "edges": [],
    }


def _trace_index_doc_with_source_kind(value):
    # SourceEntry per trace-index.schema.json:67
    doc = _trace_index_minimal()
    # Definition identity requires {url, version}; SidecarSourceIdentity requires {sourceRef}.
    # Use a definition kind whenever value validates as such; otherwise route to ontology.
    if value == "definition":
        identity = {"url": "https://example.org/forms/test", "version": "1.0.0"}
    else:
        # For x-* and bogus, the if/then identity gate falls through; minimal {} works for unknown kinds.
        identity = {"sourceRef": "x-foo:bar"}
    doc["sources"] = [
        {
            "kind": value,
            "identity": identity,
            "digest": "sha256:" + ("a" * 64),
        }
    ]
    return doc


def _trace_index_doc_with_edge_kind(value):
    doc = _trace_index_minimal()
    doc["edges"] = [
        {
            "kind": value,
            "endpoints": ["item:foo", "item:bar"],
        }
    ]
    return doc


def _trace_index_doc_with_typed_endpoint(value):
    # TypedEndpoint shows up only inside EndpointPair → EdgeEntry.endpoints.
    # Every closed-core EdgeEntry.kind has a kind-specific endpoint gate (e.g.
    # item-depends-on-item requires both ^item:.+ endpoints). To probe TypedEndpoint
    # in isolation, ride an `x-`-kind EdgeEntry (admitted after Task 5 refactor):
    # no if/then matches an x- kind, so only the base TypedEndpoint pattern applies.
    doc = _trace_index_minimal()
    doc["edges"] = [
        {
            "kind": "x-test-isolated-kind",
            "endpoints": [value, value],
        }
    ]
    return doc


def _ledger_event_base():
    """Required envelope fields for respondent-ledger-event (per its root.required)."""
    return {
        "eventId": "evt-001",
        "sequence": 1,
        "occurredAt": "2026-01-01T00:00:00Z",
        "recordedAt": "2026-01-01T00:00:01Z",
        "responseId": "resp-001",
        "definitionUrl": "https://example.org/forms/test",
        "definitionVersion": "1.0.0",
        "actor": {"kind": "respondent"},
        "source": {"kind": "web"},
    }


def _ledger_event_with_event_type(value):
    """session.started has no allOf gate; x-foo-bar and bogus.event also fall through."""
    doc = _ledger_event_base()
    doc["eventType"] = value
    return doc


def _ledger_event_with_value_class(value):
    """calculation.material-change has no allOf gate that would constrain `changes`
    other than what's already on ChangeSetEntry. valueClass is the probe."""
    doc = _ledger_event_base()
    doc["eventType"] = "calculation.material-change"
    doc["changes"] = [
        {
            "op": "set",
            "path": "foo.bar",
            "valueClass": value,
        }
    ]
    return doc


def _mapping_doc_with_transform(value):
    # FieldRule.transform is the canonical site (mapping.schema.json:259-265).
    # Note: `transform` is repeated INLINE at 3 sites (FieldRule, InnerRule under
    # ArrayDescriptor, ReverseOverride) — no central MappingTransform $def exists today.
    # Task 5 must refactor all 3 occurrences.
    return {
        "$formspecMapping": "1.0",
        "version": "1.0.0",
        "definitionRef": "https://example.org/forms/test",
        "definitionVersion": "1.0.0",
        "targetSchema": {"format": "json"},
        "rules": [
            {
                "sourcePath": "src",
                "targetPath": "tgt",
                "transform": value,
            }
        ],
    }


def _screener_doc_with_strategy(value):
    """Screener root requires $formspecScreener/url/version/title/items/evaluation."""
    return {
        "$formspecScreener": "1.0",
        "url": "https://example.org/screeners/test",
        "version": "1.0.0",
        "title": "Test screener",
        "items": [],
        "evaluation": [
            {
                "id": "p1",
                "strategy": value,
                "routes": [],
            }
        ],
    }


def _changelog_doc_with_target(value):
    """Changelog root requires $formspecChangelog/definitionUrl/fromVersion/toVersion/semverImpact/changes."""
    return {
        "$formspecChangelog": "1.0",
        "definitionUrl": "https://example.org/forms/test",
        "fromVersion": "1.0.0",
        "toVersion": "1.1.0",
        "semverImpact": "minor",
        "changes": [
            {
                "type": "added",
                "target": value,
                "path": "items.foo",
                "impact": "compatible",
            }
        ],
    }


# Per-enum cases. Format:
#   (case_id, schema_name, doc_factory, closed_core_value, bare_unknown_value)
ENUM_CASES = [
    # 1. Experience.UnitKind
    ("experience.UnitKind",
     "experience", _experience_doc_with_unit_kind,
     "data-entry", "totally-bogus-kind"),

    # 2. Component built-in widget catalog enum — DEFERRED. See Deviations in the plan.
    # The `component` property is NOT a flat enum today; AnyComponent dispatches on
    # 33 const-pinned sub-defs (32 built-ins + CustomComponentRef). A mechanical
    # `oneOf [closed, x-pattern]` wrap on the property would conflict with the
    # AnyComponent.oneOf structure. The ADR §4.5 row's target ("closed-core +
    # module-`widget`") needs the widget contribution category's payload-shape gate
    # (Task 2's `widget` category) — not a mechanical enum refactor.

    # 3. trace-index SourceEntry.kind
    ("trace-index.SourceEntry.kind",
     "trace-index", _trace_index_doc_with_source_kind,
     "definition", "bogus-source-kind"),

    # 4. trace-index EdgeEntry.kind
    ("trace-index.EdgeEntry.kind",
     "trace-index", _trace_index_doc_with_edge_kind,
     "item-depends-on-item", "bogus-edge-kind"),

    # 5. trace-index TypedEndpoint regex (pattern-extended, not enum)
    # closed-core uses one of (item|unit|task|actor|action|concept|effect|precondition|componentNodePath):suffix
    ("trace-index.TypedEndpoint",
     "trace-index", _trace_index_doc_with_typed_endpoint,
     "concept:foo", "bogus:foo"),

    # 6. respondent-ledger-event EventType
    ("respondent-ledger-event.EventType",
     "respondent-ledger-event", _ledger_event_with_event_type,
     "session.started", "bogus.event"),

    # 7. respondent-ledger-event ChangeSetEntry.valueClass
    ("respondent-ledger-event.ChangeSetEntry.valueClass",
     "respondent-ledger-event", _ledger_event_with_value_class,
     "user-input", "bogus-class"),

    # 8. mapping FieldRule.transform (MappingTransform inline enum)
    ("mapping.FieldRule.transform",
     "mapping", _mapping_doc_with_transform,
     "preserve", "bogus-transform"),

    # 9. screener Phase.strategy (ScreenerStrategy — pattern-extended via regex today)
    ("screener.Phase.strategy",
     "screener", _screener_doc_with_strategy,
     "first-match", "bogus-strategy"),

    # 10. changelog Change.target
    ("changelog.Change.target",
     "changelog", _changelog_doc_with_target,
     "item", "bogus-target"),
]


CASE_IDS = [c[0] for c in ENUM_CASES]


# ─── Closed-core values continue to validate (regression-proof) ──────────────


@pytest.mark.parametrize(
    "case_id,schema_name,make_doc,closed_core,bare_unknown",
    ENUM_CASES, ids=CASE_IDS,
)
def test_closed_core_value_validates(case_id, schema_name, make_doc, closed_core, bare_unknown):
    """ADR §4.9 default-module-set: every existing closed-core enum value
    continues to validate after the oneOf [closed-core, x-pattern] wrap."""
    doc = make_doc(closed_core)
    _validate(schema_name, doc)  # raises on failure


# ─── x-extension values validate after refactor ──────────────────────────────


@pytest.mark.parametrize(
    "case_id,schema_name,make_doc,closed_core,bare_unknown",
    ENUM_CASES, ids=CASE_IDS,
)
def test_x_extension_value_validates(case_id, schema_name, make_doc, closed_core, bare_unknown):
    """ADR §4.5: an `x-foo-bar` value following the canonical regex MUST validate."""
    if case_id == "trace-index.TypedEndpoint":
        # TypedEndpoint regex extension — the x- segment is the prefix BEFORE the colon.
        x_value = "x-foo-bar:something"
    else:
        x_value = "x-foo-bar"
    doc = make_doc(x_value)
    _validate(schema_name, doc)


# ─── Bare unknown values reject ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "case_id,schema_name,make_doc,closed_core,bare_unknown",
    ENUM_CASES, ids=CASE_IDS,
)
def test_bare_unknown_value_rejects(case_id, schema_name, make_doc, closed_core, bare_unknown):
    """A bare unknown value (not in closed-core, no x- prefix) MUST reject."""
    doc = make_doc(bare_unknown)
    with pytest.raises(ValidationError):
        _validate(schema_name, doc)


# ─── Canonical x- regex tightness — Task 5 narrows looser patterns ──────────


def test_screener_strategy_rejects_loose_x_form():
    """ScreenerStrategy today: `^(first-match|fan-out|score-threshold|x-.+)$` —
    accepts `x-Foo_Bar` and `x-foo.bar`. After Task 5, the uniform canonical
    regex `^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$` rejects uppercase + underscore +
    dot. Tightening proof."""
    doc = _screener_doc_with_strategy("x-Foo_Bar")
    with pytest.raises(ValidationError):
        _validate("screener", doc)


# ─── Response Actions root drift fix (§10 row 5) ─────────────────────────────


def _ra_minimal_valid_doc():
    return {
        "$formspecResponseActions": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "actions": [
            {
                "id": "doIt",
                "intent": "submit",
                "effects": [
                    {"type": "hostEvent", "eventName": "test"}
                ],
            }
        ],
    }


def test_response_actions_root_accepts_x_extension_property():
    """ADR §10 row 5: response-actions root admits ^x-* properties via
    `patternProperties` (was `additionalProperties: false` only — drift fix)."""
    doc = _ra_minimal_valid_doc()
    doc["x-publisher-custom"] = {"any": "shape"}
    _validate("response-actions", doc)


def test_response_actions_root_still_rejects_non_x_unknown_property():
    """Non-x unknown root properties STILL reject — drift fix is scoped to ^x-*."""
    doc = _ra_minimal_valid_doc()
    doc["bogusRootKey"] = True
    with pytest.raises(ValidationError):
        _validate("response-actions", doc)
