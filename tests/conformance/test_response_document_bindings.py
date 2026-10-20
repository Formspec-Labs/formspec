"""Fresh Python binding exercises the same paired native Response owner as tools WASM."""
import json
from pathlib import Path
from formspec._rust import lint

ROOT = Path(__file__).resolve().parents[2]

def fixture(name):
    return json.loads((ROOT / 'tests/fixtures/document-attestations' / name).read_text())

def test_python_accepts_exact_prepared_declarations_without_claiming_crypto():
    diagnostics = lint(fixture('prepared-response.json'), component_definition=fixture('definition.json'))
    assert not [d for d in diagnostics if d.severity == 'error'], diagnostics

def test_python_refuses_unqualified_definition_context_and_changed_definition_pin():
    response = fixture('prepared-response.json')
    assert any(d.code == 'E903' and d.path == '$.definitionUrl' for d in lint(response))
    definition = fixture('definition.json')
    definition['version'] = '2.0.0'
    assert any(d.code == 'E903' and d.path == '$.definitionVersion' for d in lint(response, component_definition=definition))

def test_python_refuses_field_scope_and_raw_source_digest_changes_at_owned_paths():
    response = fixture('prepared-response.json')
    definition = fixture('definition.json')
    response['extensions']['x-formspec-document-attestations']['fieldPath'] = 'confirm'
    assert any(d.code == 'E904' and d.path.endswith('.attestations') for d in lint(response, component_definition=definition))
    response = fixture('prepared-response.json')
    response['resolvedDocuments'][0]['documentHash'] = '0' * 64
    assert any(d.code == 'E903' and d.path.endswith('.documentHash') for d in lint(response, component_definition=definition))
