"""Tests for the Formspec Extension Registry (Phase 12).

Tests cover: registry parsing, entry lookup by name/version,
lifecycle transition validation, well-known URL construction, and validation.

Updated to use the Rust-backed _rust.py bridge module.
"""

import pytest
from formspec._rust import (
    parse_registry,
    find_registry_entry,
    validate_lifecycle_transition,
    well_known_registry_url,
    RegistryInfo,
)
from formspec.registry import Registry


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _registry_doc():
    """Build a sample registry document."""
    return {
        '$formspecRegistry': '1.0',
        'publisher': {
            'name': 'Test Org',
            'url': 'https://test.org',
        },
        'published': '2025-07-10T14:30:00Z',
        'entries': [
            {
                'name': 'x-currency',
                'category': 'dataType',
                'version': '1.0.0',
                'status': 'stable',
                'description': 'Custom currency type',
                'compatibility': {'formspecVersion': '>=1.0.0 <2.0.0'},
                'baseType': 'decimal',
            },
            {
                'name': 'x-currency',
                'category': 'dataType',
                'version': '2.0.0',
                'status': 'stable',
                'description': 'Custom currency type v2',
                'compatibility': {'formspecVersion': '>=2.0.0 <3.0.0'},
                'baseType': 'decimal',
            },
            {
                'name': 'x-currency',
                'category': 'dataType',
                'version': '0.9.0',
                'status': 'deprecated',
                'description': 'Old currency type',
                'compatibility': {'formspecVersion': '>=0.5.0 <1.0.0'},
                'baseType': 'decimal',
                'deprecationNotice': 'Use version 1.0.0+',
            },
            {
                'name': 'x-custom-validate',
                'category': 'function',
                'version': '1.0.0',
                'status': 'stable',
                'description': 'Custom validation function',
                'compatibility': {'formspecVersion': '>=1.0.0'},
                'parameters': [
                    {'name': 'value', 'type': 'string'},
                    {'name': 'pattern', 'type': 'string'},
                ],
                'returns': 'boolean',
            },
            {
                'name': 'x-luhn-check',
                'category': 'constraint',
                'version': '1.0.0',
                'status': 'draft',
                'description': 'Luhn algorithm constraint',
                'compatibility': {'formspecVersion': '>=1.0.0'},
                'parameters': [
                    {'name': 'value', 'type': 'string'},
                ],
            },
        ],
    }


# ===========================================================================
# Registry parsing
# ===========================================================================

class TestRegistryFacade:
    def test_load_and_find_one(self):
        reg = Registry.load(_registry_doc())
        entry = reg.find_one("x-currency", version="1.0.0")
        assert entry is not None
        assert entry["version"] == "1.0.0"

    def test_validate_delegates_to_rust(self):
        reg = Registry(_registry_doc())
        assert isinstance(reg.validate(), list)

    def test_find_sorts_by_semver_descending(self):
        reg = Registry(_registry_doc())
        versions = [e["version"] for e in reg.find("x-currency")]
        assert versions == ["2.0.0", "1.0.0", "0.9.0"]


class TestRegistryParsing:
    def test_parses_entry_count(self):
        info = parse_registry(_registry_doc())
        assert info.entry_count == 5

    def test_publisher_info(self):
        info = parse_registry(_registry_doc())
        assert info.publisher['name'] == 'Test Org'
        assert info.published == '2025-07-10T14:30:00Z'

    def test_returns_registry_info(self):
        info = parse_registry(_registry_doc())
        assert isinstance(info, RegistryInfo)


# ===========================================================================
# Lookup
# ===========================================================================

class TestLookup:
    def test_find_by_name(self):
        entry = find_registry_entry(_registry_doc(), 'x-currency')
        assert entry is not None
        assert entry['name'] == 'x-currency'

    def test_find_by_name_and_version(self):
        entry = find_registry_entry(_registry_doc(), 'x-currency', '1.0.0')
        assert entry is not None
        assert entry['version'] == '1.0.0'

    def test_find_no_match(self):
        entry = find_registry_entry(_registry_doc(), 'x-nonexistent')
        assert entry is None

    def test_find_one_returns_entry(self):
        entry = find_registry_entry(_registry_doc(), 'x-currency')
        assert entry is not None
        assert entry['name'] == 'x-currency'

    def test_find_one_no_match(self):
        entry = find_registry_entry(_registry_doc(), 'x-nonexistent')
        assert entry is None

    def test_find_function_entry(self):
        entry = find_registry_entry(_registry_doc(), 'x-custom-validate')
        assert entry is not None
        assert entry['name'] == 'x-custom-validate'
        assert entry['category'] == 'function'

    def test_find_constraint_entry(self):
        entry = find_registry_entry(_registry_doc(), 'x-luhn-check')
        assert entry is not None
        assert entry['category'] == 'constraint'


# ===========================================================================
# Lifecycle transitions
# ===========================================================================

class TestLifecycleTransitions:
    def test_draft_to_stable(self):
        assert validate_lifecycle_transition('draft', 'stable') is True

    def test_draft_to_deprecated(self):
        # Rust lifecycle: draft cannot skip directly to deprecated
        assert validate_lifecycle_transition('draft', 'deprecated') is False

    def test_draft_to_retired(self):
        # Rust lifecycle: draft cannot skip directly to retired
        assert validate_lifecycle_transition('draft', 'retired') is False

    def test_stable_to_deprecated(self):
        assert validate_lifecycle_transition('stable', 'deprecated') is True

    def test_stable_to_retired(self):
        # Rust lifecycle: stable must deprecate before retiring
        assert validate_lifecycle_transition('stable', 'retired') is False

    def test_deprecated_to_retired(self):
        assert validate_lifecycle_transition('deprecated', 'retired') is True

    def test_deprecated_to_stable(self):
        """Un-deprecation is allowed."""
        assert validate_lifecycle_transition('deprecated', 'stable') is True

    def test_retired_is_terminal(self):
        assert validate_lifecycle_transition('retired', 'draft') is False
        assert validate_lifecycle_transition('retired', 'stable') is False
        assert validate_lifecycle_transition('retired', 'deprecated') is False

    def test_invalid_from_status(self):
        # Rust raises ValueError for unknown status
        with pytest.raises(ValueError):
            validate_lifecycle_transition('invalid', 'stable')

    def test_same_status_transitions(self):
        assert validate_lifecycle_transition('draft', 'draft') is True
        assert validate_lifecycle_transition('stable', 'stable') is True
        assert validate_lifecycle_transition('deprecated', 'deprecated') is True


# ===========================================================================
# Well-known URL
# ===========================================================================

class TestWellKnownUrl:
    def test_construct_url(self):
        url = well_known_registry_url('https://example.org')
        assert url == 'https://example.org/.well-known/formspec-extensions.json'

    def test_trailing_slash_stripped(self):
        url = well_known_registry_url('https://example.org/')
        assert url == 'https://example.org/.well-known/formspec-extensions.json'


# ===========================================================================
# Validation
# ===========================================================================

class TestValidation:
    def test_valid_registry_no_errors(self):
        info = parse_registry(_registry_doc())
        assert info.validation_issues == []

    def test_invalid_name_detected(self):
        doc = _registry_doc()
        doc['entries'].append({
            'name': 'bad-name',  # missing x- prefix
            'category': 'function',
            'version': '1.0.0',
            'status': 'stable',
            'description': 'Invalid',
            'compatibility': {'formspecVersion': '>=1.0.0'},
            'parameters': [{'name': 'x', 'type': 'string'}],
            'returns': 'string',
        })
        info = parse_registry(doc)
        assert any('bad-name' in e for e in info.validation_issues)

    def test_deprecated_without_notice_detected(self):
        doc = _registry_doc()
        doc['entries'].append({
            'name': 'x-missing-notice',
            'category': 'function',
            'version': '1.0.0',
            'status': 'deprecated',
            'description': 'Missing notice',
            'compatibility': {'formspecVersion': '>=1.0.0'},
            'parameters': [{'name': 'x', 'type': 'string'}],
            'returns': 'string',
        })
        info = parse_registry(doc)
        assert any('deprecationNotice' in e for e in info.validation_issues)

    def test_datatype_without_basetype_detected(self):
        doc = _registry_doc()
        doc['entries'].append({
            'name': 'x-no-base',
            'category': 'dataType',
            'version': '1.0.0',
            'status': 'stable',
            'description': 'Missing baseType',
            'compatibility': {'formspecVersion': '>=1.0.0'},
        })
        info = parse_registry(doc)
        assert any('baseType' in e for e in info.validation_issues)

    def test_function_without_params_detected(self):
        doc = _registry_doc()
        doc['entries'].append({
            'name': 'x-no-params',
            'category': 'function',
            'version': '1.0.0',
            'status': 'stable',
            'description': 'Missing params',
            'compatibility': {'formspecVersion': '>=1.0.0'},
        })
        info = parse_registry(doc)
        assert any('parameters' in e for e in info.validation_issues)
        assert any('returns' in e for e in info.validation_issues)
