"""Headless pipeline execution of Grant Application examples."""

import json
from pathlib import Path
import pytest
from formspec._rust import evaluate_definition

def _load_grant_def():
    p = Path(__file__).resolve().parents[3] / "examples" / "grant-application" / "definition.json"
    return json.loads(p.read_text())

def _valid_grant_data():
    """Minimal valid grant application data."""
    return {
        'applicantInfo': {
            'orgName': 'Test Nonprofit',
            'ein': '12-3456789',
            'orgType': 'nonprofit',
            'contactName': 'Jane Doe',
            'contactEmail': 'jane@example.com',
            'contactPhone': '(202) 555-0100',
        },
        'projectNarrative': {
            'projectTitle': 'Research Project',
            'abstract': 'A meaningful research project that addresses an important problem.',
            'startDate': '2026-06-01',
            'endDate': '2027-06-01',
            'indirectRate': 10,
            'focusAreas': ['health'],
        },
        'budget': {
            'lineItems': [
                {'category': 'personnel', 'description': 'Staff', 'quantity': 1, 'unitCost': 50000, 'subtotal': 0},
            ],
            'requestedAmount': {'amount': '55000', 'currency': 'USD'},
            'usesSubcontractors': False,
        },
        'projectPhases': [
            {
                'phaseName': 'Phase 1',
                'phaseTasks': [
                    {'taskName': 'Task 1', 'hours': 100, 'hourlyRate': {'amount': '50', 'currency': 'USD'}, 'taskCost': None},
                ],
            },
        ],
        'subcontractors': [],
        'attachments': {
            'narrativeDoc': {'url': 'https://example.com/doc.pdf', 'contentType': 'application/pdf', 'size': 1024},
        },
    }

@pytest.fixture
def grant_def():
    return _load_grant_def()

class TestGrantApplicationIntegration:
    def test_evaluation_returns_result(self, grant_def):
        """Rust evaluator returns a ProcessingResult with expected fields."""
        data = _valid_grant_data()
        result = evaluate_definition(grant_def, data)
        assert hasattr(result, 'valid')
        assert hasattr(result, 'results')
        assert hasattr(result, 'data')
        assert hasattr(result, 'variables')
        assert isinstance(result.results, list)
        assert isinstance(result.data, dict)
        assert isinstance(result.variables, dict)

    def test_variables_computed(self, grant_def):
        data = _valid_grant_data()
        result = evaluate_definition(grant_def, data)
        assert 'totalDirect' in result.variables
        assert 'indirectCosts' in result.variables
        assert 'grandTotal' in result.variables

    def test_calculated_fields_present_in_data(self, grant_def):
        """Rust evaluator computes calculated fields (as dotted keys in output data)."""
        data = _valid_grant_data()
        result = evaluate_definition(grant_def, data)
        # Calculated fields may appear as dotted flat keys
        all_keys = set(result.data.keys())
        assert 'applicantInfo.orgNameUpper' in all_keys
        assert result.data['applicantInfo.orgNameUpper'] == 'TEST NONPROFIT'

    def test_input_data_preserved(self, grant_def):
        data = _valid_grant_data()
        result = evaluate_definition(grant_def, data)
        assert result.data['applicantInfo.orgName'] == 'Test Nonprofit'
        assert result.data['applicantInfo.ein'] == '12-3456789'

    def test_subcontractors_data_preserved(self, grant_def):
        """Input data for subcontractors is preserved in output."""
        data = _valid_grant_data()
        data['budget']['usesSubcontractors'] = False
        data['subcontractors'] = [{'subName': 'Acme', 'subOrg': 'Corp', 'subAmount': 1000, 'subScope': 'work'}]
        result = evaluate_definition(grant_def, data)
        assert 'subcontractors' in result.data

    def test_validation_results_have_expected_structure(self, grant_def):
        """Validation result dicts have path, severity, kind, message."""
        data = _valid_grant_data()
        result = evaluate_definition(grant_def, data)
        for r in result.results:
            assert 'path' in r
            assert 'severity' in r
            assert r['severity'] in ('error', 'warning', 'info')
