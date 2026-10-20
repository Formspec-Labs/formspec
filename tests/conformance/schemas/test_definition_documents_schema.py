"""Declared document wire shapes; native lint owns reference/locale/byte equality."""
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from tests.unit.support.schema_fixtures import load_schema, build_schema_registry

SCHEMA = load_schema('definition.schema.json')
VALIDATOR = Draft202012Validator(SCHEMA, registry=build_schema_registry(load_schema('common.schema.json'), SCHEMA), format_checker=FormatChecker())
FIXTURE = Path(__file__).parents[2] / 'fixtures/definition-documents/valid.definition.json'


def document():
    return json.loads(FIXTURE.read_text())


def test_url_inline_locales_and_many_to_many_scope_are_valid():
    VALIDATOR.validate(document())


@pytest.mark.parametrize('value', ['', '1start', 'has/slash', 'has.dot', '_start'])
def test_document_ids_use_the_existing_simple_identifier_convention(value):
    d = document(); d['documents'][value] = d['documents'].pop('terms-v2')
    with pytest.raises(ValidationError): VALIDATOR.validate(d)


@pytest.mark.parametrize('field,value', [('mediaType', ''), ('mediaType', 1), ('documentHash', 'a' * 63), ('documentHash', 'a' * 65), ('documentHash', 'A' * 64), ('documentHash', 'sha256:' + 'a' * 64)])
def test_variant_metadata_and_raw_sha256_spelling_are_exact(field, value):
    d = document(); d['documents']['terms-v2']['variants']['en-US'][field] = value
    with pytest.raises(ValidationError): VALIDATOR.validate(d)


@pytest.mark.parametrize('source', [
    {'kind': 'url', 'href': '/relative'}, {'kind': 'url', 'href': 'https://example.org', 'data': 'YQ=='},
    {'kind': 'inline', 'data': ''}, {'kind': 'inline', 'data': 'YQ'},
    {'kind': 'inline', 'data': '-_=='}, {'kind': 'inline', 'data': 'YQ==', 'href': 'https://example.org'},
    {'kind': 'unknown', 'data': 'YQ=='},
])
def test_source_branches_are_closed_and_use_current_base64_spelling(source):
    d = document(); d['documents']['terms-v2']['variants']['en-US']['source'] = source
    with pytest.raises(ValidationError): VALIDATOR.validate(d)


@pytest.mark.parametrize('value', [[], ['terms-v2', 'terms-v2'], [1], ['has/slash']])
def test_attests_is_nonempty_unique_document_identifiers(value):
    d = document(); d['items'][0]['attests'] = value
    with pytest.raises(ValidationError): VALIDATOR.validate(d)


@pytest.mark.parametrize('kind', ['group', 'display'])
def test_attests_belongs_to_fields_not_containers_or_display(kind):
    d = document(); d['items'][0] = {'key': 'invalid', 'type': kind, 'label': 'Invalid', 'attests': ['terms-v2']}
    with pytest.raises(ValidationError): VALIDATOR.validate(d)


def test_declarations_are_optional_and_empty_maps_are_not_declarations():
    d = document(); del d['documents']
    for item in d['items']: del item['attests']
    VALIDATOR.validate(d)
    d['documents'] = {}
    with pytest.raises(ValidationError): VALIDATOR.validate(d)


def test_schema_does_not_pretend_to_resolve_references_or_inline_hashes():
    d = document(); d['items'][0]['attests'] = ['foreign']
    d['documents']['terms-v2']['defaultLocale'] = 'fr'
    d['documents']['terms-v2']['variants']['en-US']['documentHash'] = '0' * 64
    VALIDATOR.validate(d)  # Actual native controls refuse all three semantic defects.
