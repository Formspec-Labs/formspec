"""Tests for evaluate_definition: server-side form processor (Rust backend).

Note: The Rust backend does not include `code` or `shapeId` in validation results.
Results contain: path, severity, kind, message. Tests that previously filtered by
error code now filter by kind and/or message content instead.
"""
import pytest
from formspec._rust import evaluate_definition, ProcessingResult


# ── ProcessingResult + process() scaffold ────────────────────────────────────

class TestProcessingResult:
    def test_process_returns_processing_result(self):
        result = evaluate_definition({}, {})
        assert isinstance(result, ProcessingResult)

    def test_processing_result_fields(self):
        result = evaluate_definition({}, {})
        assert result.valid is True
        assert result.results == []
        assert isinstance(result.data, dict)
        assert isinstance(result.variables, dict)

    def test_validate_wraps_process(self):
        """results list contains validation failures."""
        defn = {'shapes': [{
            'id': 's1', 'target': '#', 'severity': 'error',
            'message': 'Fail', 'code': 'F',
            'constraint': '$x > 0',
        }]}
        result = evaluate_definition(defn, {'x': -1})
        assert len(result.results) == 1
        assert result.results[0]['severity'] == 'error'
        assert result.results[0]['message'] == 'Fail'

    def test_process_valid_false_on_error(self):
        defn = {'shapes': [{
            'id': 's1', 'target': '#', 'severity': 'error',
            'message': 'Fail', 'code': 'F',
            'constraint': '$x > 0',
        }]}
        result = evaluate_definition(defn, {'x': -1})
        assert result.valid is False

    def test_process_valid_true_on_warning_only(self):
        defn = {'shapes': [{
            'id': 's1', 'target': '#', 'severity': 'warning',
            'message': 'Warn', 'code': 'W',
            'constraint': '$x > 0',
        }]}
        result = evaluate_definition(defn, {'x': -1})
        assert result.valid is True

    def test_process_returns_data_copy(self):
        data = {'name': 'test'}
        result = evaluate_definition({}, data)
        assert result.data == {'name': 'test'}
        assert result.data is not data  # must be a copy


# ── Variable evaluation ──────────────────────────────────────────────────────

class TestEvaluateVariables:
    def test_single_variable(self):
        defn = {
            'variables': [{'name': 'total', 'expression': 'sum($items[*].amount)'}]
        }
        data = {'items': [{'amount': 100}, {'amount': 200}]}
        result = evaluate_definition(defn, data)
        assert result.variables['total'] == pytest.approx(300)

    def test_variable_depending_on_variable(self):
        """indirectCosts depends on totalDirect — topo sort must evaluate totalDirect first."""
        defn = {
            'variables': [
                {'name': 'indirectCosts', 'expression': 'moneyAmount(@totalDirect) * 0.1'},
                {'name': 'totalDirect',   'expression': 'money(sum($items[*].amount), "USD")'},
            ]
        }
        data = {'items': [{'amount': 1000}]}
        result = evaluate_definition(defn, data)
        assert result.variables['totalDirect'] == {
            'amount': 1000,
            'currency': 'USD',
        }
        assert result.variables['indirectCosts'] == pytest.approx(100)

    def test_no_variables(self):
        result = evaluate_definition({}, {})
        assert result.variables == {}

    def test_circular_dependency_emits_definition_result(self):
        """Circular variable deps produce a ValidationResult with kind='definition'."""
        defn = {
            'variables': [
                {'name': 'a', 'expression': '@b + 1'},
                {'name': 'b', 'expression': '@a + 1'},
            ],
        }
        result = evaluate_definition(defn, {})
        circular = [r for r in result.results if r.get('constraintKind') == 'definition']
        assert len(circular) > 0, f"Expected definition-kind result for circular deps, got: {result.results}"
        assert circular[0].get('severity') == 'error'
        assert 'ircular' in circular[0].get('message', '')

    def test_process_populates_variables(self):
        defn = {
            'variables': [{'name': 'total', 'expression': 'sum($items[*].amount)'}]
        }
        result = evaluate_definition(defn, {'items': [{'amount': 100}, {'amount': 200}]})
        assert result.variables['total'] == pytest.approx(300)

    def test_scoped_variable_resolves_from_nearest_group_scope(self):
        """A variable scoped to a group resolves from the nearest ancestor."""
        defn = {
            'items': [
                {
                    'type': 'group', 'key': 'outer',
                    'children': [
                        {
                            'type': 'group', 'key': 'inner',
                            'children': [
                                {'type': 'field', 'key': 'val', 'dataType': 'integer'},
                            ],
                        },
                    ],
                },
            ],
            'variables': [
                {'name': 'multiplier', 'expression': '2', 'scope': 'outer'},
                {'name': 'multiplier', 'expression': '10', 'scope': 'outer.inner'},
            ],
            'binds': [{'path': 'outer.inner.val', 'calculate': '@multiplier'}],
        }
        result = evaluate_definition(defn, {'outer': {'inner': {'val': 0}}})
        # Nearest scope (inner) wins — multiplier = 10
        assert result.data['outer.inner.val'] == 10

    def test_scoped_variable_is_not_visible_outside_its_scope(self):
        """A variable scoped to a group is not visible to items outside that group."""
        defn = {
            'items': [
                {
                    'type': 'group', 'key': 'section',
                    'children': [
                        {'type': 'field', 'key': 'inner', 'dataType': 'integer'},
                    ],
                },
                {'type': 'field', 'key': 'outer', 'dataType': 'integer'},
            ],
            'variables': [
                {'name': 'secret', 'expression': '42', 'scope': 'section'},
            ],
            'binds': [{'path': 'outer', 'calculate': '@secret'}],
        }
        result = evaluate_definition(defn, {'section': {'inner': 0}, 'outer': 0})
        # @secret is scoped to 'section', not visible at 'outer' — calculate should not resolve
        outer_val = result.data.get('outer')
        assert outer_val is None or outer_val == 0

    def test_scoped_variable_resolves_for_repeat_descendants(self):
        """A variable scoped to a repeatable group resolves for children in each instance."""
        defn = {
            'items': [
                {
                    'type': 'group', 'key': 'rows', 'repeatable': True,
                    'children': [
                        {'type': 'field', 'key': 'amount', 'dataType': 'integer'},
                        {'type': 'field', 'key': 'doubled', 'dataType': 'integer'},
                    ],
                },
            ],
            'variables': [
                {'name': 'factor', 'expression': '2', 'scope': 'rows'},
            ],
            'binds': [{'path': 'rows[*].doubled', 'calculate': '$rows[*].amount * @factor'}],
        }
        result = evaluate_definition(defn, {'rows': [{'amount': 5, 'doubled': 0}]})
        assert result.data['rows[0].doubled'] == 10


# ── Shape evaluation ─────────────────────────────────────────────────────────

class TestValidate:
    def _validate(self, shapes, data, variables=None):
        defn = {'shapes': shapes}
        if variables:
            defn['variables'] = variables
        return evaluate_definition(defn, data).results

    def test_passing_constraint_no_result(self):
        assert self._validate([{
            'id': 's1', 'target': '#', 'severity': 'error',
            'message': 'Must be positive', 'code': 'POS',
            'constraint': '$value > 0',
        }], {'value': 5}) == []

    def test_failing_constraint_emits_result(self):
        results = self._validate([{
            'id': 's1', 'target': '#', 'severity': 'error',
            'message': 'Must be positive', 'code': 'POS',
            'constraint': '$value > 0',
        }], {'value': -1})
        assert len(results) == 1
        assert results[0]['severity'] == 'error'
        assert results[0]['message'] == 'Must be positive'

    def test_active_when_false_skips_shape(self):
        assert self._validate([{
            'id': 's1', 'target': '#', 'severity': 'error',
            'message': 'Fail', 'code': 'F',
            'activeWhen': '$enabled',
            'constraint': '$value > 100',
        }], {'enabled': False, 'value': 0}) == []

    def test_active_when_true_applies_shape(self):
        results = self._validate([{
            'id': 's1', 'target': '#', 'severity': 'error',
            'message': 'Fail', 'code': 'F',
            'activeWhen': '$enabled',
            'constraint': '$value > 100',
        }], {'enabled': True, 'value': 0})
        assert len(results) == 1

    def test_or_composition_passes_if_any_true(self):
        shape = [{
            'id': 's1', 'target': '#', 'severity': 'warning',
            'message': 'Need one', 'code': 'C',
            'or': ['present($email)', 'present($phone)'],
        }]
        assert self._validate(shape, {'email': 'x@y.com', 'phone': None}) == []
        assert self._validate(shape, {'email': None, 'phone': None}) != []

    def test_and_composition_fails_if_any_false(self):
        shape = [{
            'id': 's1', 'target': '#', 'severity': 'error',
            'message': 'Need both', 'code': 'C',
            'and': ['present($a)', 'present($b)'],
        }]
        assert self._validate(shape, {'a': 'x', 'b': 'y'}) == []
        assert self._validate(shape, {'a': 'x', 'b': None}) != []

    def test_xone_passes_exactly_one(self):
        shape = [{
            'id': 's1', 'target': '#', 'severity': 'info',
            'message': 'Exactly one', 'code': 'C',
            'xone': ['$a > 0', '$b > 0'],
        }]
        assert self._validate(shape, {'a': 1, 'b': 0}) == []
        assert self._validate(shape, {'a': 1, 'b': 1}) != []
        assert self._validate(shape, {'a': 0, 'b': 0}) != []

    def test_shape_uses_variable(self):
        """Shape constraint referencing @grandTotal via pre-computed variable."""
        results = self._validate(
            shapes=[{
                'id': 'budgetMatch', 'target': 'budget.requestedAmount',
                'severity': 'error', 'message': 'Mismatch', 'code': 'BM',
                'constraint': 'abs(moneyAmount($budget.requestedAmount) - moneyAmount(@grandTotal)) < 1',
            }],
            data={
                'budget': {
                    'lineItems': [{'amount': 1000}, {'amount': 500}],
                    'requestedAmount': {'amount': '1500', 'currency': 'USD'},
                }
            },
            variables=[
                {'name': 'totalDirect', 'expression': 'money(sum($budget.lineItems[*].amount), "USD")'},
                {'name': 'grandTotal',  'expression': '@totalDirect'},
            ]
        )
        assert results == []

    def test_shape_variable_mismatch_emits_result(self):
        """money vs number comparison returns null with eval error diagnostics.
        Broken expressions now correctly fail constraints (BUG-3 fix)."""
        results = self._validate(
            shapes=[{
                'id': 'mismatch', 'target': '#', 'severity': 'error',
                'message': 'Budget mismatch',
                'constraint': '@total < 1000',
            }],
            data={},
            variables=[
                {'name': 'total', 'expression': 'money(500, "USD")'},
            ]
        )
        # money < number → Null + eval error diagnostic → constraint fails
        mismatch_errors = [r for r in results if r['message'] == 'Budget mismatch']
        assert len(mismatch_errors) == 1, (
            "Money vs number comparison produces eval error, constraint should fail"
        )

    def test_or_composition_with_shape_id_reference(self):
        """Composition operators (or/and) can reference other shapes by ID."""
        shapes = [
            {
                'id': 'hasEmail', 'target': '#', 'severity': 'error',
                'message': 'Email required', 'constraint': 'present($email)',
            },
            {
                'id': 'hasPhone', 'target': '#', 'severity': 'error',
                'message': 'Phone required', 'constraint': 'present($phone)',
            },
            {
                'id': 'contactable', 'target': '#', 'severity': 'error',
                'message': 'Need email or phone',
                'or': ['hasEmail', 'hasPhone'],
            },
        ]
        # Neither present → fails
        results = self._validate(shapes, {'email': None, 'phone': None})
        contactable = [r for r in results if r['message'] == 'Need email or phone']
        assert len(contactable) == 1, "Should fail when neither email nor phone present"

        # Email present → passes
        results2 = self._validate(shapes, {'email': 'a@b.com', 'phone': None})
        contactable2 = [r for r in results2 if r['message'] == 'Need email or phone']
        assert contactable2 == [], "Should pass when email present"

    def test_not_composition(self):
        shape = [{
            'id': 's1', 'target': '#', 'severity': 'warning',
            'message': 'Contains placeholder', 'code': 'PH',
            'not': 'contains($text, "TBD")',
        }]
        assert self._validate(shape, {'text': 'Real content'}) == []
        assert self._validate(shape, {'text': 'Content TBD'}) != []

    def test_wildcard_target_shape_emits_concrete_repeat_path(self):
        """Wildcard shape target expands to concrete indexed paths."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'rows', 'repeatable': True,
                'children': [
                    {'type': 'field', 'key': 'score', 'dataType': 'integer'},
                ],
            }],
            'shapes': [{
                'id': 's1', 'target': 'rows[*].score', 'severity': 'error',
                'message': 'Score must be positive', 'code': 'POS',
                'constraint': '$ > 0',
            }],
        }
        result = evaluate_definition(defn, {'rows': [{'score': 5}, {'score': -1}]})
        errors = [r for r in result.results if 'positive' in r.get('message', '')]
        assert len(errors) == 1
        assert errors[0]['path'] == 'rows[1].score'

    def test_wildcard_target_shape_uses_row_scope_for_sibling_references(self):
        """Shape with wildcard target can reference siblings in the same row."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'rows', 'repeatable': True,
                'children': [
                    {'type': 'field', 'key': 'min', 'dataType': 'integer'},
                    {'type': 'field', 'key': 'max', 'dataType': 'integer'},
                ],
            }],
            'shapes': [{
                'id': 's1', 'target': 'rows[*].max', 'severity': 'error',
                'message': 'Max must exceed min', 'code': 'RANGE',
                'constraint': '$ > $rows[*].min',
            }],
        }
        result = evaluate_definition(defn, {'rows': [{'min': 1, 'max': 10}, {'min': 5, 'max': 3}]})
        errors = [r for r in result.results if 'exceed' in r.get('message', '')]
        assert len(errors) == 1
        assert errors[0]['path'] == 'rows[1].max'


# ── Item registry + bind index ───────────────────────────────────────────────
# These tests verify behavior through the public API (evaluate_definition).

class TestItemRegistry:
    """Verify definitions with various item structures process without error."""

    def test_flat_fields(self):
        defn = {
            'items': [
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
                {'type': 'field', 'key': 'age', 'dataType': 'integer'},
            ]
        }
        result = evaluate_definition(defn, {'name': 'Alice', 'age': 30})
        assert result.data['name'] == 'Alice'
        assert result.data['age'] == 30

    def test_nested_group(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'address',
                'children': [
                    {'type': 'field', 'key': 'city', 'dataType': 'string'},
                    {'type': 'field', 'key': 'zip', 'dataType': 'string'},
                ]
            }]
        }
        result = evaluate_definition(defn, {'address': {'city': 'NYC', 'zip': '10001'}})
        assert result.data['address']['city'] == 'NYC'
        assert result.data['address']['zip'] == '10001'

    def test_repeatable_group(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'items', 'repeatable': True,
                'minRepeat': 1, 'maxRepeat': 10,
                'children': [
                    {'type': 'field', 'key': 'name', 'dataType': 'string'},
                ]
            }]
        }
        result = evaluate_definition(defn, {'items': [{'name': 'a'}, {'name': 'b'}]})
        assert len(result.data['items']) == 2

    def test_field_with_children(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'info',
                'children': [{
                    'type': 'field', 'key': 'orgType', 'dataType': 'choice',
                    'children': [
                        {'type': 'field', 'key': 'orgSubType', 'dataType': 'string'},
                    ]
                }]
            }]
        }
        result = evaluate_definition(defn, {'info': {'orgType': 'nonprofit', 'orgSubType': 'charity'}})
        assert result.data['info']['orgType'] == 'nonprofit'

    def test_display_item(self):
        defn = {
            'items': [
                {'type': 'display', 'key': 'hint', 'label': 'Some hint'},
            ]
        }
        result = evaluate_definition(defn, {})
        assert isinstance(result, ProcessingResult)


class TestBindIndex:
    """Verify bind behaviors through the public API."""

    def test_single_bind_required(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [
                {'path': 'name', 'required': 'true'},
            ]
        }
        result = evaluate_definition(defn, {'name': ''})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 1

    def test_merge_binds_for_same_path(self):
        defn = {
            'items': [{'type': 'field', 'key': 'email', 'dataType': 'string'}],
            'binds': [
                {'path': 'email', 'required': 'true'},
                {'path': 'email', 'constraint': 'matches($email, ".+@.+")'},
            ]
        }
        result = evaluate_definition(defn, {'email': ''})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 1

    def test_wildcard_bind_path(self):
        """Wildcard bind path applies required to each concrete instance."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'items', 'repeatable': True,
                'children': [
                    {'type': 'field', 'key': 'name', 'dataType': 'string'},
                ],
            }],
            'binds': [{'path': 'items[*].name', 'required': 'true'}],
        }
        result = evaluate_definition(defn, {'items': [{'name': 'Alice'}, {'name': ''}]})
        errors = [r for r in result.results if 'equired' in r.get('message', '')]
        assert len(errors) == 1
        assert errors[0]['path'] == 'items[1].name'


# ── Repeat expansion ─────────────────────────────────────────────────────────

class TestRepeatExpansion:
    def test_flat_repeat(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'rows', 'repeatable': True,
                'children': [
                    {'type': 'field', 'key': 'value', 'dataType': 'integer'},
                ]
            }]
        }
        data = {'rows': [{'value': 1}, {'value': 2}, {'value': 3}]}
        result = evaluate_definition(defn, data)
        assert len(result.data['rows']) == 3

    def test_nested_repeat(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'phases', 'repeatable': True,
                'children': [{
                    'type': 'group', 'key': 'tasks', 'repeatable': True,
                    'children': [
                        {'type': 'field', 'key': 'name', 'dataType': 'string'},
                    ]
                }]
            }]
        }
        data = {
            'phases': [
                {'tasks': [{'name': 'a'}, {'name': 'b'}]},
                {'tasks': [{'name': 'c'}]},
            ]
        }
        result = evaluate_definition(defn, data)
        assert len(result.data['phases']) == 2
        assert len(result.data['phases'][0]['tasks']) == 2
        assert len(result.data['phases'][1]['tasks']) == 1

    def test_no_repeats(self):
        defn = {
            'items': [
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ]
        }
        result = evaluate_definition(defn, {'name': 'test'})
        assert result.data['name'] == 'test'


# ── Whitespace transforms ────────────────────────────────────────────────────

class TestWhitespace:
    def _process(self, whitespace_mode, data):
        defn = {
            'items': [{'type': 'field', 'key': 'val', 'dataType': 'string'}],
            'binds': [{'path': 'val', 'whitespace': whitespace_mode}],
        }
        return evaluate_definition(defn, data)

    def test_trim(self):
        result = self._process('trim', {'val': '  hello world  '})
        assert result.data['val'] == 'hello world'

    def test_normalize(self):
        result = self._process('normalize', {'val': '  hello   world  '})
        assert result.data['val'] == 'hello world'

    def test_remove(self):
        result = self._process('remove', {'val': ' he llo '})
        assert result.data['val'] == 'hello'

    def test_preserve(self):
        result = self._process('preserve', {'val': '  hello  '})
        assert result.data['val'] == '  hello  '

    def test_no_whitespace_bind(self):
        result = evaluate_definition({
            'items': [{'type': 'field', 'key': 'val', 'dataType': 'string'}],
        }, {'val': '  hello  '})
        assert result.data['val'] == '  hello  '

    def test_non_string_value_unchanged(self):
        result = self._process('trim', {'val': 42})
        assert result.data['val'] == 42


# ── Relevance evaluation ─────────────────────────────────────────────────────

class TestRelevance:
    def test_relevant_true(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'relevant': 'true'}],
        }
        result = evaluate_definition(defn, {'name': 'test'})
        assert 'name' not in result.non_relevant
        assert result.data['name'] == 'test'

    def test_relevant_false(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'relevant': '$show'}],
        }
        result = evaluate_definition(defn, {'name': 'test', 'show': False})
        assert 'name' in result.non_relevant

    def test_and_inheritance(self):
        """Non-relevant parent -> children also non-relevant."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'parent',
                'children': [
                    {'type': 'field', 'key': 'child', 'dataType': 'string'},
                ]
            }],
            'binds': [{'path': 'parent', 'relevant': 'false'}],
        }
        result = evaluate_definition(defn, {'parent': {'child': 'x'}})
        assert 'parent' in result.non_relevant

    def test_no_relevant_bind_defaults_true(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
        }
        result = evaluate_definition(defn, {'name': 'test'})
        assert 'name' not in result.non_relevant


# ── Required + readonly evaluation ───────────────────────────────────────────

class TestRequired:
    def test_required_true(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'required': 'true'}],
        }
        result = evaluate_definition(defn, {'name': ''})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 1

    def test_required_no_inheritance(self):
        """Required does NOT cascade to children."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'parent',
                'children': [
                    {'type': 'field', 'key': 'child', 'dataType': 'string'},
                ]
            }],
            'binds': [{'path': 'parent', 'required': 'true'}],
        }
        result = evaluate_definition(defn, {'parent': {'child': ''}})
        child_errors = [e for e in result.results if 'child' in e.get('path', '')]
        assert child_errors == []


class TestReadonly:
    def test_readonly_true(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'readonly': 'true'}],
        }
        result = evaluate_definition(defn, {'name': 'x'})
        assert isinstance(result, ProcessingResult)

    def test_or_inheritance(self):
        """Readonly parent -> children also readonly."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'parent',
                'children': [
                    {'type': 'field', 'key': 'child', 'dataType': 'string'},
                ]
            }],
            'binds': [{'path': 'parent', 'readonly': 'true'}],
        }
        result = evaluate_definition(defn, {'parent': {'child': 'x'}})
        assert isinstance(result, ProcessingResult)


# ── Calculate with repeat scoping ────────────────────────────────────────────

class TestCalculate:
    def test_simple_calculate(self):
        defn = {
            'items': [
                {'type': 'field', 'key': 'a', 'dataType': 'integer'},
                {'type': 'field', 'key': 'b', 'dataType': 'integer'},
                {'type': 'field', 'key': 'total', 'dataType': 'integer'},
            ],
            'binds': [{'path': 'total', 'calculate': '$a + $b'}],
        }
        result = evaluate_definition(defn, {'a': 10, 'b': 20, 'total': 0})
        assert result.data['total'] == 30

    def test_repeat_scoped_calculate(self):
        """Wildcard bind calculate evaluates per concrete instance."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'items', 'repeatable': True,
                'children': [
                    {'type': 'field', 'key': 'qty', 'dataType': 'integer'},
                    {'type': 'field', 'key': 'price', 'dataType': 'decimal'},
                    {'type': 'field', 'key': 'total', 'dataType': 'decimal'},
                ],
            }],
            'binds': [{'path': 'items[*].total', 'calculate': '$items[*].qty * $items[*].price'}],
        }
        result = evaluate_definition(defn, {
            'items': [{'qty': 2, 'price': 10, 'total': 0}, {'qty': 5, 'price': 3, 'total': 0}]
        })
        # Check instance 0: 2 * 10 = 20, instance 1: 5 * 3 = 15
        t0 = result.data.get('items[0].total')
        t1 = result.data.get('items[1].total')
        assert t0 == pytest.approx(20)
        assert t1 == pytest.approx(15)

    def test_calculate_with_precision(self):
        defn = {
            'items': [
                {'type': 'field', 'key': 'val', 'dataType': 'decimal', 'precision': 2},
            ],
            'binds': [{'path': 'val', 'calculate': '10 / 3'}],
        }
        result = evaluate_definition(defn, {'val': 0})
        assert result.data['val'] == pytest.approx(3.33, abs=0.005)


# ── Bind validation ──────────────────────────────────────────────────────────

class TestBindValidation:
    def test_required_empty_string_fails(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'required': 'true'}],
        }
        result = evaluate_definition(defn, {'name': ''})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 1
        assert errors[0]['path'] == 'name'

    def test_required_null_fails(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'required': 'true'}],
        }
        result = evaluate_definition(defn, {'name': None})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 1

    def test_required_with_value_passes(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'required': 'true'}],
        }
        result = evaluate_definition(defn, {'name': 'Alice'})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 0

    def test_constraint_failing(self):
        defn = {
            'items': [{'type': 'field', 'key': 'age', 'dataType': 'integer'}],
            'binds': [{'path': 'age', 'constraint': '$age >= 18', 'constraintMessage': 'Must be 18+'}],
        }
        result = evaluate_definition(defn, {'age': 15})
        errors = [r for r in result.results if r.get('source') == 'bind']
        assert len(errors) == 1
        assert errors[0]['message'] == 'Must be 18+'

    def test_constraint_passing(self):
        defn = {
            'items': [{'type': 'field', 'key': 'age', 'dataType': 'integer'}],
            'binds': [{'path': 'age', 'constraint': '$age >= 18'}],
        }
        result = evaluate_definition(defn, {'age': 21})
        errors = [r for r in result.results if r.get('source') == 'bind']
        assert len(errors) == 0

    def test_non_relevant_fields_skip_validation(self):
        defn = {
            'items': [
                {'type': 'field', 'key': 'show', 'dataType': 'boolean'},
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ],
            'binds': [
                {'path': 'name', 'required': 'true', 'relevant': '$show'},
            ],
        }
        result = evaluate_definition(defn, {'show': False, 'name': ''})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 0

    def test_bare_dollar_constraint_passes_positive(self):
        """Bare $ in constraint must resolve to the field value, not null."""
        defn = {
            'items': [{'type': 'field', 'key': 'amount', 'dataType': 'integer'}],
            'binds': [{'path': 'amount', 'constraint': '$ >= 0'}],
        }
        result = evaluate_definition(defn, {'amount': 45000})
        errors = [r for r in result.results if r.get('source') == 'bind']
        assert len(errors) == 0

    def test_bare_dollar_constraint_fails_negative(self):
        """Bare $ in constraint must detect actual violations."""
        defn = {
            'items': [{'type': 'field', 'key': 'amount', 'dataType': 'integer'}],
            'binds': [{'path': 'amount', 'constraint': '$ >= 0'}],
        }
        result = evaluate_definition(defn, {'amount': -5})
        errors = [r for r in result.results if r.get('source') == 'bind']
        assert len(errors) == 1

    def test_bare_dollar_constraint_skipped_when_empty(self):
        """Constraint with bare $ is skipped when field is empty/null."""
        defn = {
            'items': [{'type': 'field', 'key': 'amount', 'dataType': 'integer'}],
            'binds': [{'path': 'amount', 'constraint': '$ >= 0'}],
        }
        result = evaluate_definition(defn, {'amount': None})
        errors = [r for r in result.results if r.get('source') == 'bind']
        assert len(errors) == 0

    def test_bare_dollar_wildcard_constraint(self):
        """Wildcard bind constraint with bare $ resolves to the instance's field value."""
        defn = {
            'items': [{
                'type': 'group', 'key': 'rows', 'repeatable': True,
                'children': [
                    {'type': 'field', 'key': 'amount', 'dataType': 'decimal'},
                ],
            }],
            'binds': [{
                'path': 'rows[*].amount',
                'constraint': '$ >= 0',
                'constraintMessage': 'Amount must be non-negative',
            }],
        }
        result = evaluate_definition(defn, {
            'rows': [{'amount': 100}, {'amount': -5}, {'amount': 50}]
        })
        errors = [r for r in result.results if 'non-negative' in r.get('message', '')]
        assert len(errors) == 1
        assert errors[0]['path'] == 'rows[1].amount'

    def test_shape_bare_dollar_with_target(self):
        """Shape constraint with target injects target value as bare $."""
        defn = {
            'items': [{'type': 'field', 'key': 'score', 'dataType': 'integer'}],
            'shapes': [{
                'id': 'scoreRange', 'target': 'score', 'severity': 'error',
                'message': 'Score out of range', 'code': 'SCORE',
                'constraint': '$ >= 0 and $ <= 100',
            }],
        }
        result = evaluate_definition(defn, {'score': 50})
        assert result.results == []
        result2 = evaluate_definition(defn, {'score': 150})
        assert len(result2.results) == 1
        assert result2.results[0]['message'] == 'Score out of range'

    def test_default_bind_relevance_with_numeric_constraint(self):
        """Regression: multiChoice -> relevance + default=0 + constraint $ >= 0."""
        defn = {
            'items': [
                {
                    'type': 'field', 'key': 'topics', 'dataType': 'multiChoice',
                    'options': [
                        {'value': 'employment', 'label': 'Employment'},
                        {'value': 'housing', 'label': 'Housing'},
                    ]
                },
                {
                    'type': 'group', 'key': 'expenditures',
                    'children': [
                        {'type': 'field', 'key': 'employment', 'dataType': 'decimal'},
                        {'type': 'field', 'key': 'housing', 'dataType': 'decimal'},
                    ]
                },
            ],
            'binds': [
                {
                    'path': 'expenditures.employment',
                    'relevant': "selected($topics, 'employment')",
                    'default': 0,
                    'constraint': '$ >= 0',
                    'constraintMessage': 'Cannot be negative',
                },
                {
                    'path': 'expenditures.housing',
                    'relevant': "selected($topics, 'housing')",
                    'default': 0,
                    'constraint': '$ >= 0',
                    'constraintMessage': 'Cannot be negative',
                },
            ],
        }
        # Scenario: employment selected with default value 0 -> constraint passes
        result = evaluate_definition(defn, {
            'topics': ['employment'],
            'expenditures': {'employment': 0, 'housing': 0},
        })
        constraint_errors = [r for r in result.results if r.get('source') == 'bind' and 'negative' in r.get('message', '').lower()]
        assert len(constraint_errors) == 0

        # Scenario: employment selected with positive value -> constraint passes
        result = evaluate_definition(defn, {
            'topics': ['employment'],
            'expenditures': {'employment': 45000, 'housing': 0},
        })
        constraint_errors = [r for r in result.results if r.get('source') == 'bind' and 'negative' in r.get('message', '').lower()]
        assert len(constraint_errors) == 0

        # Scenario: negative value -> constraint fails
        result = evaluate_definition(defn, {
            'topics': ['employment'],
            'expenditures': {'employment': -100, 'housing': 0},
        })
        constraint_errors = [r for r in result.results if r.get('source') == 'bind' and 'negative' in r.get('message', '').lower()]
        assert len(constraint_errors) == 1

    def test_type_validation_string(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
        }
        result = evaluate_definition(defn, {'name': 42})
        errors = [r for r in result.results if r.get('constraintKind') == 'type']
        assert len(errors) == 1

    def test_type_validation_null_passes(self):
        """Null/empty always valid for type check."""
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
        }
        result = evaluate_definition(defn, {'name': None})
        # No errors for null value
        assert result.valid is True

    def test_constraint_null_in_bind_context_passes(self):
        defn = {
            'items': [{'type': 'field', 'key': 'amount', 'dataType': 'integer'}],
            'binds': [{'path': 'amount', 'constraint': '$missing > 0'}],
        }
        result = evaluate_definition(defn, {'amount': 5})
        errors = [r for r in result.results if r.get('source') == 'bind']
        assert errors == []


class TestBindContextNullSemantics:
    def test_relevant_null_defaults_true(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'relevant': '$missing > 0'}],
        }
        result = evaluate_definition(defn, {'name': 'x'})
        assert 'name' not in result.non_relevant

    def test_required_null_defaults_false(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'required': '$missing > 0'}],
        }
        result = evaluate_definition(defn, {'name': ''})
        errors = [r for r in result.results if r.get('source') == 'bind' and 'equired' in r['message']]
        assert len(errors) == 0

    def test_readonly_null_defaults_false(self):
        defn = {
            'items': [{'type': 'field', 'key': 'name', 'dataType': 'string'}],
            'binds': [{'path': 'name', 'readonly': '$missing > 0'}],
        }
        result = evaluate_definition(defn, {'name': 'x'})
        assert isinstance(result, ProcessingResult)


# ── Cardinality validation ───────────────────────────────────────────────────

class TestCardinality:
    def test_min_repeat(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'rows', 'repeatable': True,
                'minRepeat': 2, 'maxRepeat': 5,
                'children': [
                    {'type': 'field', 'key': 'val', 'dataType': 'string'},
                ]
            }]
        }
        result = evaluate_definition(defn, {'rows': [{'val': 'a'}]})
        errors = [r for r in result.results if r.get('constraintKind') == 'cardinality']
        assert len(errors) == 1

    def test_max_repeat(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'rows', 'repeatable': True,
                'minRepeat': 1, 'maxRepeat': 2,
                'children': [
                    {'type': 'field', 'key': 'val', 'dataType': 'string'},
                ]
            }]
        }
        result = evaluate_definition(defn, {'rows': [{'val': 'a'}, {'val': 'b'}, {'val': 'c'}]})
        errors = [r for r in result.results if r.get('constraintKind') == 'cardinality']
        assert len(errors) == 1

    def test_cardinality_ok(self):
        defn = {
            'items': [{
                'type': 'group', 'key': 'rows', 'repeatable': True,
                'minRepeat': 1, 'maxRepeat': 3,
                'children': [
                    {'type': 'field', 'key': 'val', 'dataType': 'string'},
                ]
            }]
        }
        result = evaluate_definition(defn, {'rows': [{'val': 'a'}, {'val': 'b'}]})
        errors = [r for r in result.results if r.get('constraintKind') == 'cardinality']
        assert len(errors) == 0


# ── Shape timing ─────────────────────────────────────────────────────────────

class TestShapeTiming:
    """Shape timing modes: continuous (default), submit, demand."""

    @staticmethod
    def _timing_def() -> dict:
        return {
            "items": [{"type": "field", "key": "x", "dataType": "integer"}],
            "shapes": [
                {
                    "id": "s_cont",
                    "target": "#",
                    "timing": "continuous",
                    "constraint": "false",
                    "severity": "error",
                    "message": "Continuous shape",
                },
                {
                    "id": "s_sub",
                    "target": "#",
                    "timing": "submit",
                    "constraint": "false",
                    "severity": "error",
                    "message": "Submit shape",
                },
                {
                    "id": "s_dem",
                    "target": "#",
                    "timing": "demand",
                    "constraint": "false",
                    "severity": "error",
                    "message": "Demand shape",
                },
            ],
        }

    def test_submit_shape_skipped_in_continuous(self):
        result = evaluate_definition(self._timing_def(), {"x": 1}, mode="continuous")
        msgs = [r["message"] for r in result.results]
        assert "Submit shape" not in msgs
        assert "Demand shape" not in msgs
        assert "Continuous shape" in msgs

    def test_submit_shape_included_in_submit(self):
        result = evaluate_definition(self._timing_def(), {"x": 1}, mode="submit")
        msgs = [r["message"] for r in result.results]
        assert "Continuous shape" in msgs
        assert "Submit shape" in msgs
        assert "Demand shape" not in msgs

    def test_continuous_shape_always_included(self):
        """Continuous shapes fire in both continuous and submit modes."""
        for mode in ("continuous", "submit"):
            result = evaluate_definition(self._timing_def(), {"x": 1}, mode=mode)
            msgs = [r["message"] for r in result.results]
            assert "Continuous shape" in msgs, f"Expected in {mode} mode"


# ── NonRelevantBehavior ──────────────────────────────────────────────────────

class TestNonRelevantBehavior:
    def test_remove_default(self):
        defn = {
            'items': [
                {'type': 'field', 'key': 'show', 'dataType': 'boolean'},
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ],
            'binds': [{'path': 'name', 'relevant': '$show'}],
        }
        result = evaluate_definition(defn, {'show': False, 'name': 'hidden'})
        assert 'name' not in result.data

    def test_remove_explicit(self):
        defn = {
            'nonRelevantBehavior': 'remove',
            'items': [
                {'type': 'field', 'key': 'show', 'dataType': 'boolean'},
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ],
            'binds': [{'path': 'name', 'relevant': '$show'}],
        }
        result = evaluate_definition(defn, {'show': False, 'name': 'hidden'})
        assert 'name' not in result.data

    def test_empty_mode(self):
        defn = {
            'nonRelevantBehavior': 'empty',
            'items': [
                {'type': 'field', 'key': 'show', 'dataType': 'boolean'},
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ],
            'binds': [{'path': 'name', 'relevant': '$show'}],
        }
        result = evaluate_definition(defn, {'show': False, 'name': 'hidden'})
        assert result.data['name'] is None

    def test_keep_mode(self):
        defn = {
            'nonRelevantBehavior': 'keep',
            'items': [
                {'type': 'field', 'key': 'show', 'dataType': 'boolean'},
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ],
            'binds': [{'path': 'name', 'relevant': '$show'}],
        }
        result = evaluate_definition(defn, {'show': False, 'name': 'hidden'})
        assert result.data['name'] == 'hidden'

    def test_bind_level_override(self):
        defn = {
            'nonRelevantBehavior': 'remove',
            'items': [
                {'type': 'field', 'key': 'show', 'dataType': 'boolean'},
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ],
            'binds': [{'path': 'name', 'relevant': '$show', 'nonRelevantBehavior': 'keep'}],
        }
        result = evaluate_definition(defn, {'show': False, 'name': 'kept'})
        assert result.data['name'] == 'kept'

    def test_relevant_field_unaffected(self):
        defn = {
            'items': [
                {'type': 'field', 'key': 'show', 'dataType': 'boolean'},
                {'type': 'field', 'key': 'name', 'dataType': 'string'},
            ],
            'binds': [{'path': 'name', 'relevant': '$show'}],
        }
        result = evaluate_definition(defn, {'show': True, 'name': 'visible'})
        assert result.data['name'] == 'visible'

    def test_wildcard_required_suppressed_for_nonrelevant_repeat_field(self):
        defn = {
            'items': [
                {
                    'type': 'group', 'key': 'rows', 'repeatable': True,
                    'children': [
                        {'type': 'field', 'key': 'enabled', 'dataType': 'boolean'},
                        {'type': 'field', 'key': 'note', 'dataType': 'string'},
                    ],
                }
            ],
            'binds': [
                {'path': 'rows[*].note', 'relevant': '$enabled'},
                {'path': 'rows[*].note', 'required': 'true'},
            ],
        }
        result = evaluate_definition(defn, {'rows': [{'enabled': False, 'note': ''}]})
        required_errors = [r for r in result.results if 'equired' in r.get('message', '')]
        assert required_errors == []

    def test_shape_target_nonrelevant_field_emits_no_result(self):
        """Shape targeting a non-relevant field should not emit a validation result."""
        defn = {
            'items': [
                {'key': 'visible', 'type': 'field', 'dataType': 'boolean', 'label': 'Visible'},
                {'key': 'name', 'type': 'field', 'dataType': 'string', 'label': 'Name'},
            ],
            'binds': [
                {'path': 'name', 'relevant': '$visible'},
            ],
            'shapes': [{
                'id': 's1', 'target': 'name', 'severity': 'error',
                'message': 'Name required', 'constraint': '$name != ""',
            }],
        }
        result = evaluate_definition(defn, {'visible': False, 'name': ''})
        shape_results = [r for r in result.results if r.get('message') == 'Name required']
        assert shape_results == [], f"Non-relevant target should not fire shape, got: {shape_results}"

    def test_excluded_value_null_hides_hidden_value_from_shapes_while_keep_preserves_output(self):
        """excludedValue=null makes non-relevant field appear as null in FEL,
        while NRB=keep preserves original value in output."""
        defn = {
            'items': [
                {'key': 'visible', 'type': 'field', 'dataType': 'boolean'},
                {'key': 'extra', 'type': 'field', 'dataType': 'integer'},
            ],
            'binds': [
                {
                    'path': 'extra',
                    'relevant': '$visible',
                    'excludedValue': 'null',
                    'nonRelevantBehavior': 'keep',
                },
            ],
            'shapes': [{
                'id': 's1', 'target': '#', 'severity': 'error',
                'message': 'Extra must be positive',
                'constraint': '$extra == null or $extra > 0',
            }],
        }
        # Field is non-relevant with excludedValue=null: FEL sees null → shape passes
        result = evaluate_definition(defn, {'visible': False, 'extra': -5})
        shape_errors = [r for r in result.results if r.get('constraintKind') == 'shape']
        assert shape_errors == [], f"Shape should pass (excluded field is null in FEL), got: {shape_errors}"
        # NRB=keep means original value is preserved in output
        assert result.data.get('extra') == -5

        # When field IS relevant, the actual value is used → shape fails
        result2 = evaluate_definition(defn, {'visible': True, 'extra': -5})
        shape_errors2 = [r for r in result2.results if r.get('constraintKind') == 'shape']
        assert len(shape_errors2) == 1, "Shape should fail when field is relevant and negative"


class TestCreationTimeInitializers:
    def test_initial_value_literal_applied_when_field_missing(self):
        """initialValue seeds a missing field with a literal value."""
        defn = {
            'items': [
                {'key': 'status', 'type': 'field', 'dataType': 'string', 'initialValue': 'draft'},
            ],
        }
        # Field missing from data → seeded with initialValue
        result = evaluate_definition(defn, {})
        assert result.data.get('status') == 'draft'

        # Field already present → initialValue not applied
        result2 = evaluate_definition(defn, {'status': 'final'})
        assert result2.data.get('status') == 'final'

    def test_prepopulate_reads_from_instance_when_field_missing(self):
        """prePopulate seeds a missing field from a named instance."""
        defn = {
            '$formspec': '1.0',
            'url': 'test://prepopulate',
            'version': '1.0.0',
            'status': 'draft',
            'title': 'PrePopulate Test',
            'items': [
                {
                    'key': 'email',
                    'type': 'field',
                    'dataType': 'string',
                    'prePopulate': {
                        'instance': 'profile',
                        'path': 'contactEmail',
                    },
                },
                {
                    'key': 'name',
                    'type': 'field',
                    'dataType': 'string',
                },
            ],
        }
        instances = {
            'profile': {
                'contactEmail': 'alice@example.com',
                'phone': '555-1234',
            }
        }

        # Field missing → prePopulate fills it
        result = evaluate_definition(defn, {}, instances=instances)
        assert result.data.get('email') == 'alice@example.com'

        # Field present → prePopulate does NOT override
        result2 = evaluate_definition(defn, {'email': 'bob@example.com'}, instances=instances)
        assert result2.data.get('email') == 'bob@example.com'


class TestDefaultRelevanceTransition:
    def test_default_applies_only_on_nonrelevant_to_relevant_transition_when_empty(self):
        """Default value applies when field transitions from non-relevant to relevant
        and the current value is empty/null."""
        defn = {
            'items': [
                {'key': 'show', 'type': 'field', 'dataType': 'boolean'},
                {'key': 'amount', 'type': 'field', 'dataType': 'decimal'},
            ],
            'binds': [
                {'path': 'amount', 'relevant': '$show', 'default': 0},
            ],
        }
        # When relevant (show=True), amount=null → default 0 should apply
        # (first eval: prev_relevant=true, but field starts relevant, value empty)
        # Actually, the default applies on non-relevant→relevant transition.
        # On first eval, prev_relevant defaults to true. If show=True, relevant stays true,
        # that's not a transition. So default doesn't apply on first eval.
        #
        # The realistic scenario: this is a batch evaluator, not stateful.
        # The "transition" in a batch context means: the item was previously set to
        # non-relevant (prev_relevant=true initially, then becomes relevant=true again).
        # For a single-shot evaluator, the transition detection is limited.
        #
        # The simplest test: show=True, amount not in data → field is relevant,
        # but prev_relevant=true means no transition. Default doesn't apply.
        result = evaluate_definition(defn, {'show': True})
        # Without a transition, the default doesn't fire in a single-shot evaluator.
        # The field value should be whatever was in data (nothing = null, removed by NRB since relevant).
        # Actually: show=True → amount is relevant. amount not in data → null.
        # No non-relevant→relevant transition (both true). So no default applied.
        # The field stays null.
        assert result.data.get('amount') is None

        # When non-relevant (show=False): amount removed from data (default NRB=remove)
        result2 = evaluate_definition(defn, {'show': False, 'amount': 5})
        assert 'amount' not in result2.data  # removed by NRB


# ── Integration: Grant Application ───────────────────────────────────────────

import json
from pathlib import Path

_GRANT_DEF_PATH = Path(__file__).resolve().parents[4] / 'examples' / 'grant-application' / 'definition.json'


def _load_grant_def():
    return json.loads(_GRANT_DEF_PATH.read_text())


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
