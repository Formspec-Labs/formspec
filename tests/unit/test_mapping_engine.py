"""Tests for the Mapping DSL execution engine (Phase 10).

Tests cover: all 10 transform types, condition guards, bidirectional mapping,
priority ordering, array descriptors, path resolution, autoMap, defaults,
and custom adapter registration.
"""

import pytest
from formspec._rust import execute_mapping
from formspec.adapters import get_adapter, register_adapter, Adapter, _custom_adapters


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_doc(rules, **kwargs):
    """Build a minimal mapping document."""
    doc = {
        'version': '1.0.0',
        'definitionRef': 'https://example.com/form',
        'definitionVersion': '>=1.0.0',
        'targetSchema': {'format': 'json'},
        'rules': rules,
    }
    doc.update(kwargs)
    return doc


# ===========================================================================
# Transform: preserve
# ===========================================================================

class TestPreserve:
    def test_basic_copy(self):
        doc = _make_doc([
            {'sourcePath': 'name', 'targetPath': 'fullName', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'name': 'Alice'}, "forward").output
        assert result['fullName'] == 'Alice'

    def test_nested_paths(self):
        doc = _make_doc([
            {'sourcePath': 'address.city', 'targetPath': 'location.city', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'address': {'city': 'Portland'}}, "forward").output
        assert result['location']['city'] == 'Portland'

    def test_missing_source_omits_target(self):
        # Mapping spec §7.3: absent source, no default -> omit the target (explicit null writes null).
        doc = _make_doc([
            {'sourcePath': 'missing', 'targetPath': 'out', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'other': 'val'}, "forward").output
        assert 'out' not in result

    def test_default_on_missing(self):
        doc = _make_doc([
            {'sourcePath': 'missing', 'targetPath': 'out', 'transform': 'preserve', 'default': 'fallback'},
        ])
        result = execute_mapping(doc, {}, "forward").output
        assert result['out'] == 'fallback'


# ===========================================================================
# Transform: drop
# ===========================================================================

class TestDrop:
    def test_field_not_in_output(self):
        doc = _make_doc([
            {'sourcePath': 'secret', 'targetPath': 'secret', 'transform': 'drop'},
            {'sourcePath': 'name', 'targetPath': 'name', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'secret': 'hunter2', 'name': 'Bob'}, "forward").output
        assert 'secret' not in result
        assert result['name'] == 'Bob'


# ===========================================================================
# Transform: expression
# ===========================================================================

class TestExpression:
    def test_simple_expression(self):
        doc = _make_doc([
            {
                'sourcePath': 'price',
                'targetPath': 'priceWithTax',
                'transform': 'expression',
                'expression': '$ * 1.1',
            },
        ])
        result = execute_mapping(doc, {'price': 100}, "forward").output
        assert abs(result['priceWithTax'] - 110) < 0.01

    def test_expression_with_source_ref(self):
        doc = _make_doc([
            {
                'sourcePath': 'first',
                'targetPath': 'full',
                'transform': 'expression',
                'expression': 'source.first & " " & source.last',
            },
        ])
        result = execute_mapping(doc, {'first': 'John', 'last': 'Doe'}, "forward").output
        assert result['full'] == 'John Doe'


# ===========================================================================
# Transform: constant
# ===========================================================================

class TestConstant:
    def test_static_value(self):
        doc = _make_doc([
            {
                'targetPath': 'type',
                'transform': 'constant',
                'expression': '"patient"',
            },
        ])
        result = execute_mapping(doc, {}, "forward").output
        assert result['type'] == 'patient'

    def test_computed_constant(self):
        doc = _make_doc([
            {
                'targetPath': 'version',
                'transform': 'constant',
                'expression': '1 + 2',
            },
        ])
        result = execute_mapping(doc, {}, "forward").output
        # FEL returns Decimal, to_python converts to Decimal
        assert float(result['version']) == 3


# ===========================================================================
# Transform: coerce
# ===========================================================================

class TestCoerce:
    def test_string_to_integer(self):
        doc = _make_doc([
            {
                'sourcePath': 'age',
                'targetPath': 'age',
                'transform': 'coerce',
                'coerce': 'integer',
            },
        ])
        result = execute_mapping(doc, {'age': '25'}, "forward").output
        assert result['age'] == 25

    def test_number_to_string(self):
        doc = _make_doc([
            {
                'sourcePath': 'code',
                'targetPath': 'code',
                'transform': 'coerce',
                'coerce': {'from': 'number', 'to': 'string'},
            },
        ])
        result = execute_mapping(doc, {'code': 42}, "forward").output
        assert result['code'] == '42'

    def test_string_to_boolean(self):
        doc = _make_doc([
            {
                'sourcePath': 'active',
                'targetPath': 'active',
                'transform': 'coerce',
                'coerce': 'boolean',
            },
        ])
        assert execute_mapping(doc, {'active': 'true'}, "forward").output['active'] is True
        assert execute_mapping(doc, {'active': 'false'}, "forward").output['active'] is False

    def test_value_to_array(self):
        doc = _make_doc([
            {
                'sourcePath': 'tag',
                'targetPath': 'tags',
                'transform': 'coerce',
                'coerce': 'array',
            },
        ])
        result = execute_mapping(doc, {'tag': 'urgent'}, "forward").output
        assert result['tags'] == ['urgent']

    def test_none_uses_default(self):
        doc = _make_doc([
            {
                'sourcePath': 'missing',
                'targetPath': 'val',
                'transform': 'coerce',
                'coerce': 'string',
                'default': 'N/A',
            },
        ])
        result = execute_mapping(doc, {}, "forward").output
        assert result['val'] == 'N/A'


# ===========================================================================
# Transform: valueMap
# ===========================================================================

class TestValueMap:
    def test_forward_only_map(self):
        doc = _make_doc([
            {
                'sourcePath': 'status',
                'targetPath': 'state',
                'transform': 'valueMap',
                'valueMap': {'forward': {'active': 'A', 'inactive': 'I'}},
            },
        ])
        assert execute_mapping(doc, {'status': 'active'}, "forward").output['state'] == 'A'
        assert execute_mapping(doc, {'status': 'inactive'}, "forward").output['state'] == 'I'

    def test_full_form_map(self):
        doc = _make_doc([
            {
                'sourcePath': 'gender',
                'targetPath': 'sex',
                'transform': 'valueMap',
                'valueMap': {
                    'forward': {'male': 'M', 'female': 'F'},
                    'unmapped': 'passthrough',
                },
            },
        ])
        assert execute_mapping(doc, {'gender': 'male'}, "forward").output['sex'] == 'M'
        assert execute_mapping(doc, {'gender': 'other'}, "forward").output['sex'] == 'other'

    def test_unmapped_error(self):
        doc = _make_doc([
            {
                'sourcePath': 'val',
                'targetPath': 'out',
                'transform': 'valueMap',
                'valueMap': {'forward': {'a': '1'}, 'unmapped': 'error'},
            },
        ])
        with pytest.raises((ValueError, Exception)):
            execute_mapping(doc, {'val': 'unknown'}, "forward")

    def test_unmapped_default(self):
        doc = _make_doc([
            {
                'sourcePath': 'val',
                'targetPath': 'out',
                'transform': 'valueMap',
                'valueMap': {'forward': {'a': '1'}, 'unmapped': 'default', 'default': 'X'},
            },
        ])
        assert execute_mapping(doc, {'val': 'unknown'}, "forward").output['out'] == 'X'


# ===========================================================================
# Transform: flatten
# ===========================================================================

class TestFlatten:
    def test_dict_to_string(self):
        doc = _make_doc([
            {
                'sourcePath': 'addr',
                'targetPath': 'addr_flat',
                'transform': 'flatten',
                'separator': '|',
            },
        ])
        result = execute_mapping(doc, {'addr': {'city': 'NYC', 'state': 'NY'}}, "forward").output
        # Object flatten emits dotted target keys in the output container.
        assert result['addr_flat.city'] == 'NYC'
        assert result['addr_flat.state'] == 'NY'

    def test_list_to_string(self):
        doc = _make_doc([
            {
                'sourcePath': 'tags',
                'targetPath': 'tags_str',
                'transform': 'flatten',
                'separator': ',',
            },
        ])
        result = execute_mapping(doc, {'tags': ['a', 'b', 'c']}, "forward").output
        assert result['tags_str'] == 'a,b,c'


# ===========================================================================
# Transform: nest
# ===========================================================================

class TestNest:
    def test_string_to_nested(self):
        doc = _make_doc([
            {
                'sourcePath': 'path',
                'targetPath': 'nested',
                'transform': 'nest',
                'separator': '.',
            },
        ])
        result = execute_mapping(doc, {'path': 'a.b.c'}, "forward").output
        assert result['nested'] == ['a', 'b', 'c']


# ===========================================================================
# Transform: concat
# ===========================================================================

class TestConcat:
    def test_concat_expression(self):
        doc = _make_doc([
            {
                'sourcePath': 'first',
                'targetPath': 'display',
                'transform': 'concat',
                'expression': 'source.first & " " & source.last',
            },
        ])
        result = execute_mapping(doc, {'first': 'Jane', 'last': 'Smith'}, "forward").output
        assert result['display'] == 'Jane Smith'


# ===========================================================================
# Transform: split
# ===========================================================================

class TestSplit:
    def test_split_expression(self):
        """Split transform evaluates FEL expression on the source value."""
        doc = _make_doc([
            {
                'sourcePath': 'fullName',
                'targetPath': 'upper_name',
                'transform': 'split',
                'expression': 'upper($)',
            },
        ])
        result = execute_mapping(doc, {'fullName': 'Jane Smith'}, "forward").output
        assert result['upper_name'] == 'JANE SMITH'


# ===========================================================================
# Condition guards (§4.13)
# ===========================================================================

class TestConditionGuards:
    def test_condition_true_executes(self):
        doc = _make_doc([
            {
                'sourcePath': 'premium',
                'targetPath': 'tier',
                'transform': 'constant',
                'expression': '"gold"',
                'condition': 'source.premium = true',
            },
        ])
        result = execute_mapping(doc, {'premium': True}, "forward").output
        assert result['tier'] == 'gold'

    def test_condition_false_skips(self):
        doc = _make_doc([
            {
                'sourcePath': 'premium',
                'targetPath': 'tier',
                'transform': 'constant',
                'expression': '"gold"',
                'condition': 'source.premium = true',
            },
        ])
        result = execute_mapping(doc, {'premium': False}, "forward").output
        assert 'tier' not in result

    def test_multiple_conditional_rules(self):
        doc = _make_doc([
            {
                'targetPath': 'category',
                'transform': 'constant',
                'expression': '"child"',
                'condition': 'source.age < 18',
            },
            {
                'targetPath': 'category',
                'transform': 'constant',
                'expression': '"adult"',
                'condition': 'source.age >= 18',
            },
        ])
        assert execute_mapping(doc, {'age': 10}, "forward").output['category'] == 'child'
        assert execute_mapping(doc, {'age': 25}, "forward").output['category'] == 'adult'


# ===========================================================================
# Priority ordering (§3.4)
# ===========================================================================

class TestPriority:
    def test_higher_priority_executes_first(self):
        """Higher priority rules execute first; last write wins for same path."""
        doc = _make_doc([
            {
                'targetPath': 'val',
                'transform': 'constant',
                'expression': '"low"',
                'priority': 1,
            },
            {
                'targetPath': 'val',
                'transform': 'constant',
                'expression': '"high"',
                'priority': 10,
            },
        ])
        # Priority 10 executes first, then priority 1 overwrites
        result = execute_mapping(doc, {}, "forward").output
        assert result['val'] == 'low'

    def test_default_priority_zero(self):
        doc = _make_doc([
            {
                'targetPath': 'a',
                'transform': 'constant',
                'expression': '"first"',
            },
            {
                'targetPath': 'b',
                'transform': 'constant',
                'expression': '"second"',
                'priority': 5,
            },
        ])
        result = execute_mapping(doc, {}, "forward").output
        assert result['a'] == 'first'
        assert result['b'] == 'second'


# ===========================================================================
# Bidirectional / Reverse (§5)
# ===========================================================================

class TestReverse:
    def test_basic_reverse(self):
        doc = _make_doc([
            {'sourcePath': 'name', 'targetPath': 'fullName', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'fullName': 'Alice'}, "reverse").output
        assert result['name'] == 'Alice'

    def test_bidirectional_false_skips_reverse(self):
        doc = _make_doc([
            {'sourcePath': 'name', 'targetPath': 'fullName', 'transform': 'preserve'},
            {
                'sourcePath': 'internal',
                'targetPath': 'computed',
                'transform': 'preserve',
                'bidirectional': False,
            },
        ])
        result = execute_mapping(doc, {'fullName': 'Bob', 'computed': 'skip'}, "reverse").output
        assert result['name'] == 'Bob'
        assert 'internal' not in result

    def test_reverse_value_map_auto_invert(self):
        doc = _make_doc([
            {
                'sourcePath': 'status',
                'targetPath': 'state',
                'transform': 'valueMap',
                'valueMap': {
                    'forward': {'active': 'A', 'inactive': 'I'},
                    'unmapped': 'passthrough',
                },
            },
        ])
        result = execute_mapping(doc, {'state': 'A'}, "reverse").output
        assert result['status'] == 'active'

    def test_reverse_override(self):
        doc = _make_doc([
            {
                'sourcePath': 'name',
                'targetPath': 'display',
                'transform': 'expression',
                'expression': 'upper($)',
                'reverse': {
                    'transform': 'expression',
                    'expression': 'lower($)',
                },
            },
        ])
        result = execute_mapping(doc, {'display': 'ALICE'}, "reverse").output
        assert result['name'] == 'alice'


# ===========================================================================
# Array descriptors (§4.12)
# ===========================================================================

class TestArrayDescriptor:
    def test_each_mode(self):
        doc = _make_doc([
            {
                'sourcePath': 'items',
                'targetPath': 'entries',
                'transform': 'preserve',
                'array': {'mode': 'each'},
            },
        ])
        result = execute_mapping(doc, {'items': [1, 2, 3]}, "forward").output
        assert result['entries'] == [1, 2, 3]

    def test_each_with_inner_rules(self):
        doc = _make_doc([
            {
                'sourcePath': 'people',
                'targetPath': 'contacts',
                'transform': 'preserve',
                'array': {
                    'mode': 'each',
                    'innerRules': [
                        {'sourcePath': 'name', 'targetPath': 'fullName', 'transform': 'preserve'},
                        {'sourcePath': 'age', 'targetPath': 'years', 'transform': 'preserve'},
                    ],
                },
            },
        ])
        result = execute_mapping(doc, {
            'people': [
                {'name': 'Alice', 'age': 30},
                {'name': 'Bob', 'age': 25},
            ]
        }, "forward").output
        assert result['contacts'] == [
            {'fullName': 'Alice', 'years': 30},
            {'fullName': 'Bob', 'years': 25},
        ]

    def test_whole_mode(self):
        doc = _make_doc([
            {
                'sourcePath': 'tags',
                'targetPath': 'tagStr',
                'transform': 'flatten',
                'separator': ',',
                'array': {'mode': 'whole'},
            },
        ])
        result = execute_mapping(doc, {'tags': ['a', 'b', 'c']}, "forward").output
        assert result['tagStr'] == 'a,b,c'

    def test_indexed_mode(self):
        doc = _make_doc([
            {
                'sourcePath': 'parts',
                'targetPath': 'name',
                'transform': 'preserve',
                'array': {
                    'mode': 'indexed',
                    'innerRules': [
                        {'index': 0, 'targetPath': 'first', 'transform': 'preserve'},
                        {'index': 1, 'targetPath': 'last', 'transform': 'preserve'},
                    ],
                },
            },
        ])
        result = execute_mapping(doc, {'parts': ['John', 'Doe']}, "forward").output
        assert result['name']['first'] == 'John'
        assert result['name']['last'] == 'Doe'


# ===========================================================================
# Path resolution
# ===========================================================================

class TestPathResolution:
    def test_simple_path(self):
        doc = _make_doc([
            {'sourcePath': 'x', 'targetPath': 'y', 'transform': 'preserve'},
        ])
        assert execute_mapping(doc, {'x': 42}, "forward").output['y'] == 42

    def test_nested_path(self):
        doc = _make_doc([
            {'sourcePath': 'a.b.c', 'targetPath': 'd.e', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'a': {'b': {'c': 'deep'}}}, "forward").output
        assert result['d']['e'] == 'deep'

    def test_bracket_index_path(self):
        doc = _make_doc([
            {'sourcePath': 'items[0].name', 'targetPath': 'first', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'items': [{'name': 'Alpha'}, {'name': 'Beta'}]}, "forward").output
        assert result['first'] == 'Alpha'

    def test_target_creates_intermediate_dicts(self):
        doc = _make_doc([
            {'sourcePath': 'val', 'targetPath': 'deep.nested.path', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'val': 'hello'}, "forward").output
        assert result['deep']['nested']['path'] == 'hello'


# ===========================================================================
# Defaults and autoMap
# ===========================================================================

class TestDefaultsAndAutoMap:
    def test_document_defaults(self):
        doc = _make_doc(
            [{'sourcePath': 'name', 'targetPath': 'name', 'transform': 'preserve'}],
            defaults={'type': 'patient', 'version': 1},
        )
        result = execute_mapping(doc, {'name': 'Alice'}, "forward").output
        assert result['type'] == 'patient'
        assert result['version'] == 1
        assert result['name'] == 'Alice'

    def test_auto_map_copies_unmentioned(self):
        doc = _make_doc(
            [{'sourcePath': 'name', 'targetPath': 'fullName', 'transform': 'preserve'}],
            autoMap=True,
        )
        result = execute_mapping(doc, {'name': 'Alice', 'age': 30, 'email': 'a@b.com'}, "forward").output
        assert result['fullName'] == 'Alice'
        assert result['age'] == 30
        assert result['email'] == 'a@b.com'

    def test_auto_map_does_not_duplicate(self):
        doc = _make_doc(
            [{'sourcePath': 'name', 'targetPath': 'name', 'transform': 'preserve'}],
            autoMap=True,
        )
        result = execute_mapping(doc, {'name': 'Alice', 'extra': 'val'}, "forward").output
        assert result['name'] == 'Alice'
        assert result['extra'] == 'val'


# ===========================================================================
# Custom adapter registration
# ===========================================================================

class TestCustomAdapterRegistration:
    def setup_method(self):
        # Clean up any registered adapters between tests
        _custom_adapters.clear()

    def test_register_and_use_custom_adapter(self):
        class YamlAdapter(Adapter):
            def __init__(self, config=None):
                pass
            def serialize(self, value):
                return b'yaml-output'
            def deserialize(self, data):
                return {'yaml': True}

        register_adapter('x-yaml', YamlAdapter)
        adapter = get_adapter('x-yaml')
        assert adapter.serialize({}) == b'yaml-output'
        assert adapter.deserialize(b'') == {'yaml': True}

    def test_unregistered_custom_adapter_raises(self):
        with pytest.raises(ValueError, match="not registered"):
            get_adapter('x-unknown')

    def test_non_x_prefix_raises(self):
        with pytest.raises(ValueError, match="must start with 'x-'"):
            register_adapter('custom', type)


# ===========================================================================
# Integration: full pipeline
# ===========================================================================

class TestFullPipeline:

    def test_complex_mapping_with_conditions_and_valuemap(self):
        doc = _make_doc([
            {'sourcePath': 'name', 'targetPath': 'patientName', 'transform': 'preserve'},
            {
                'sourcePath': 'gender',
                'targetPath': 'sex',
                'transform': 'valueMap',
                'valueMap': {
                    'forward': {'male': 'M', 'female': 'F', 'other': 'O'},
                    'unmapped': 'passthrough',
                },
            },
            {
                'targetPath': 'isMinor',
                'transform': 'constant',
                'expression': 'true',
                'condition': 'source.age < 18',
            },
            {
                'targetPath': 'isMinor',
                'transform': 'constant',
                'expression': 'false',
                'condition': 'source.age >= 18',
            },
        ])

        result = execute_mapping(doc, {'name': 'Alex', 'gender': 'male', 'age': 15}, "forward").output
        assert result['patientName'] == 'Alex'
        assert result['sex'] == 'M'
        assert result['isMinor'] is True

        result = execute_mapping(doc, {'name': 'Sam', 'gender': 'female', 'age': 25}, "forward").output
        assert result['isMinor'] is False

    def test_forward_with_adapter_serialize(self):
        doc = _make_doc([
            {'sourcePath': 'name', 'targetPath': 'name', 'transform': 'preserve'},
        ])
        result = execute_mapping(doc, {'name': 'Test'}, "forward").output

        adapter = get_adapter('json', {'pretty': False})
        output = adapter.serialize(result)
        assert b'"name": "Test"' in output or b'"name":"Test"' in output

    def test_multiple_rules_same_target(self):
        """When multiple rules write to the same target, last writer wins."""
        doc = _make_doc([
            {
                'targetPath': 'label',
                'transform': 'constant',
                'expression': '"default"',
                'priority': 0,
            },
            {
                'targetPath': 'label',
                'transform': 'constant',
                'expression': '"override"',
                'condition': 'source.override = true',
                'priority': 0,
            },
        ])

        # Without override: only first rule fires
        result = execute_mapping(doc, {'override': False}, "forward").output
        assert result['label'] == 'default'

        # With override: both fire, second overwrites
        result = execute_mapping(doc, {'override': True}, "forward").output
        assert result['label'] == 'override'
