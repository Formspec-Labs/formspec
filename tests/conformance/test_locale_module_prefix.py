"""Conformance tests for ADR 0150 §4.10: Locale `$module.<modId>.<nodeId>.<prop>`
key prefix admission.

Pre-change: `locale.strings` admitted five prefixes via `propertyNames.pattern`:
`$form.` / `$shape.` / `$page.` / `$optionSet.` / `$component.` (plus
identifier-leading bare keys for item paths).

Post-change: a sixth prefix `$module.<modId>.<nodeId>.<prop>` is admitted, where
`<modId>` follows the §4.8 `^x-` module-ID regex. Module-contributed Locale
strings address node properties on documents declared via `modules[]`
(carried by Task 4's top-level `modules[]` slot).
"""

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import (
    build_schema_registry,
    load_schema,
)

LOCALE_SCHEMA = load_schema("locale.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")
COMPONENT_SCHEMA = load_schema("component.schema.json")

_REGISTRY = build_schema_registry(LOCALE_SCHEMA, COMMON_SCHEMA, COMPONENT_SCHEMA)


def _validate(doc: dict) -> None:
    Draft202012Validator(LOCALE_SCHEMA, registry=_REGISTRY).validate(doc)


def _minimal_locale(strings: dict) -> dict:
    return {
        "$formspecLocale": "1.0",
        "version": "1.0.0",
        "locale": "en-US",
        "targetDefinition": {"url": "https://example.org/forms/test"},
        "strings": strings,
    }


# ─── Existing five prefixes still validate ───────────────────────────────────


@pytest.mark.parametrize("key,value", [
    ("$form.title", "Test Form"),
    ("$shape.budget-balance.message", "Must balance"),
    ("$page.intro.title", "Welcome"),
    ("$optionSet.yesNo.yes.label", "Yes"),
    ("$component.submitBtn.label", "Submit"),
    ("plainItemKey.label", "Plain"),  # identifier-leading bare key
])
def test_existing_prefixes_still_validate(key, value):
    _validate(_minimal_locale({key: value}))


# ─── $module prefix admitted ────────────────────────────────────────────────


def test_module_prefix_validates():
    """The new sixth prefix: $module.<modId>.<nodeId>.<prop>."""
    _validate(_minimal_locale({
        "$module.x-formspec-conversation.chatThread.label": "Threads",
    }))


def test_module_prefix_with_complex_mod_id_validates():
    _validate(_minimal_locale({
        "$module.x-formspec-core-task.taskRow.title": "Task",
    }))


def test_module_prefix_with_context_suffix_validates():
    """Context-label @suffix syntax also applies to module-prefixed keys."""
    _validate(_minimal_locale({
        "$module.x-formspec-conversation.chatThread.label@short": "Thr",
    }))


def test_module_prefix_with_bracket_index_validates():
    """Array property addressing carries through."""
    _validate(_minimal_locale({
        "$module.x-tabs.mainTabs.labels[0]": "First",
    }))


# ─── Unknown prefixes still rejected ─────────────────────────────────────────


def test_bogus_prefix_still_rejects():
    with pytest.raises(ValidationError):
        _validate(_minimal_locale({"$bogus.foo.bar": "x"}))


def test_dollar_prefix_without_known_keyword_rejects():
    with pytest.raises(ValidationError):
        _validate(_minimal_locale({"$random.foo": "x"}))


def test_empty_key_rejects():
    with pytest.raises(ValidationError):
        _validate(_minimal_locale({"": "x"}))
