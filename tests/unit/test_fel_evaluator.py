"""Tests for the FEL evaluator — operators, types, null handling."""

import decimal
import pytest
from decimal import Decimal
from datetime import date

import formspec.fel as fel
from formspec.fel import (
    evaluate, FelNull, FelNumber, FelString, FelBoolean, FelDate,
    FelArray, FelMoney, FelTrue, FelFalse, is_null,
)


def val(expr, data=None):
    """Evaluate and return the raw FelValue."""
    return evaluate(expr, data).value


def pyval(expr, data=None):
    """Evaluate and return Python-native value."""
    v = val(expr, data)
    if isinstance(v, FelNumber): return v.value
    if isinstance(v, FelString): return v.value
    if isinstance(v, FelBoolean): return v.value
    if isinstance(v, FelDate): return v.value
    if is_null(v): return None
    if isinstance(v, FelArray): return [pyval_inner(e) for e in v.elements]
    return v


def pyval_inner(v):
    if isinstance(v, FelNumber): return v.value
    if isinstance(v, FelString): return v.value
    if isinstance(v, FelBoolean): return v.value
    if is_null(v): return None
    return v


def diags(expr, data=None):
    """Evaluate and return diagnostic count."""
    return len(evaluate(expr, data).diagnostics)


class TestArithmetic:
    def test_add(self):
        assert pyval('1 + 2') == Decimal('3')

    def test_subtract(self):
        assert pyval('10 - 3') == Decimal('7')

    def test_multiply(self):
        assert pyval('4 * 5') == Decimal('20')

    def test_divide(self):
        assert pyval('10 / 4') == Decimal('2.5')

    def test_modulo(self):
        assert pyval('10 % 3') == Decimal('1')

    def test_decimal_precision(self):
        """0.1 + 0.2 must equal 0.3 (decimal, not float)."""
        assert pyval('0.1 + 0.2') == Decimal('0.3')

    def test_unary_minus(self):
        assert pyval('-5') == Decimal('-5')

    def test_unary_minus_field(self):
        assert pyval('-$x', {'x': 10}) == Decimal('-10')

    def test_division_by_zero(self):
        assert is_null(val('1 / 0'))
        assert diags('1 / 0') == 1

    def test_modulo_by_zero(self):
        assert is_null(val('1 % 0'))
        assert diags('1 % 0') == 1

    def test_modulo_sign_of_dividend(self):
        """Modulo follows sign of dividend, not divisor."""
        assert pyval('7 % 3') == Decimal('1')
        # -7 % 3 needs parenthesization: -(7) % 3 or (-7) not unary minus eating it
        # Actually unary minus binds tighter than %, so -7 % 3 = (-7) % 3
        assert pyval('(0 - 7) % 3') == Decimal('-1')

    def test_type_error_arithmetic(self):
        assert is_null(val("'hello' + 5"))
        assert diags("'hello' + 5") == 1


class TestMixedOperators:
    """Regression tests for mixed arithmetic operators evaluated left-to-right."""

    def test_multiply_then_divide(self):
        """2 * 3 / 4 must equal 1.5, not 6 (dropping the /4 is the bug)."""
        assert pyval('2 * 3 / 4') == Decimal('1.5')

    def test_divide_then_multiply(self):
        """10 / 2 * 3 must equal 15.0, not 1.666… (premature stopping)."""
        assert pyval('10 / 2 * 3') == Decimal('15.0')

    def test_add_then_subtract(self):
        """5 + 3 - 2 must equal 6."""
        assert pyval('5 + 3 - 2') == Decimal('6')

    def test_subtract_then_add(self):
        """10 - 3 + 1 must equal 8."""
        assert pyval('10 - 3 + 1') == Decimal('8')

    def test_field_multiply_divide(self):
        """100 * $rate / 100 with rate=10 must equal 10.0.

        This is the real-world case from the grant application indirect-costs
        calculation bug where the /100 step was silently dropped.
        """
        assert pyval('100 * $rate / 100', {'rate': 10}) == Decimal('10.0')


class TestComparison:
    def test_less_than(self):
        assert pyval('1 < 2') is True

    def test_greater_than(self):
        assert pyval('2 > 1') is True

    def test_less_equal(self):
        assert pyval('2 <= 2') is True

    def test_greater_equal(self):
        assert pyval('3 >= 2') is True

    def test_string_comparison(self):
        assert pyval("'abc' < 'abd'") is True

    def test_date_comparison(self):
        assert pyval('@2025-01-01 < @2025-12-31') is True

    def test_cross_type_error(self):
        assert is_null(val("1 < 'hello'"))
        assert diags("1 < 'hello'") == 1


class TestEquality:
    def test_number_equal(self):
        assert pyval('5 = 5') is True

    def test_number_not_equal(self):
        assert pyval('5 != 3') is True

    def test_string_equal(self):
        assert pyval("'abc' = 'abc'") is True

    def test_null_equals_null(self):
        """null = null → true (special case, not propagation)."""
        assert pyval('null = null') is True

    def test_null_not_equals_value(self):
        assert pyval('null = 5') is False
        assert pyval('5 = null') is False

    def test_null_not_equal(self):
        assert pyval('null != null') is False
        assert pyval('null != 5') is True

    def test_cross_type_equality_error(self):
        assert is_null(val("1 = 'hello'"))


class TestLogical:
    def test_and_true(self):
        assert pyval('true and true') is True

    def test_and_short_circuit(self):
        """false and X → false without evaluating X."""
        assert pyval('false and true') is False

    def test_or_short_circuit(self):
        assert pyval('true or false') is True

    def test_not(self):
        assert pyval('not true') is False
        assert pyval('not false') is True

    def test_and_type_error(self):
        assert is_null(val('1 and true'))

    def test_or_type_error(self):
        assert is_null(val("'x' or false"))


class TestNullPropagation:
    """Tests for §3.8 null propagation rules."""

    def test_arithmetic_null(self):
        assert is_null(val('null + 5'))
        assert is_null(val('10 * null'))

    def test_concat_null(self):
        assert is_null(val("'hello' & null"))

    def test_comparison_null(self):
        assert is_null(val('null < 5'))
        assert is_null(val('5 > null'))

    def test_not_null(self):
        assert is_null(val('not null'))

    def test_and_null_left(self):
        """null and X → null (null propagation from left)."""
        assert is_null(val('null and true'))

    def test_and_false_short_circuits_over_null(self):
        """false and null → false (short-circuit wins)."""
        assert pyval('false and null') is False

    def test_or_null_left(self):
        assert is_null(val('null or false'))

    def test_or_true_short_circuits_over_null(self):
        assert pyval('true or null') is True

    def test_null_coalesce(self):
        assert pyval('null ?? 42') == Decimal('42')
        assert pyval('5 ?? 42') == Decimal('5')


class TestStringConcat:
    def test_basic(self):
        assert pyval("'a' & 'b'") == 'ab'

    def test_with_fields(self):
        assert pyval("$f & ' ' & $l", {'f': 'A', 'l': 'B'}) == 'A B'

    def test_type_error(self):
        assert is_null(val("'x' & 5"))


class TestMembership:
    def test_in(self):
        assert pyval("'a' in ['a', 'b', 'c']") is True

    def test_not_in(self):
        assert pyval("'x' not in ['a', 'b']") is True

    def test_in_false(self):
        assert pyval("5 in [1, 2, 3]") is False

    def test_in_null(self):
        assert val('null in [1, 2]') is FelFalse


class TestTernary:
    def test_true_branch(self):
        assert pyval("true ? 'yes' : 'no'") == 'yes'

    def test_false_branch(self):
        assert pyval("false ? 'yes' : 'no'") == 'no'

    def test_null_condition(self):
        assert is_null(val("null ? 1 : 2"))


class TestIfThenElse:
    def test_keyword_form(self):
        assert pyval("if true then 'yes' else 'no'") == 'yes'

    def test_function_form(self):
        assert pyval("if(true, 'yes', 'no')") == 'yes'

    def test_if_function_null_condition_error(self):
        """if() with null condition signals error (§3.8.1)."""
        r = evaluate('if(null, 1, 2)')
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1


class TestLetBinding:
    def test_basic(self):
        assert pyval('let x = 5 in x + 1') == Decimal('6')

    def test_nested(self):
        assert pyval('let x = 1 in let y = 2 in x + y') == Decimal('3')

    def test_shadowing(self):
        assert pyval('let x = 1 in let x = 2 in x') == Decimal('2')


class TestFieldRefs:
    def test_simple(self):
        assert pyval('$name', {'name': 'Ada'}) == 'Ada'

    def test_nested(self):
        assert pyval('$address.city', {'address': {'city': 'London'}}) == 'London'

    def test_missing_field(self):
        assert is_null(val('$missing', {}))

    def test_bare_dollar_resolves_to_data(self):
        """Bare $ outside repeat context resolves to null in the Rust runtime."""
        r = val('$', {'x': 1})
        assert is_null(r)

    def test_wildcard(self):
        data = {'items': [{'amount': 10}, {'amount': 20}]}
        result = val('$items[*].amount', data)
        assert isinstance(result, FelArray)
        assert len(result) == 2

    def test_index_access(self):
        data = {'items': [{'name': 'a'}, {'name': 'b'}]}
        assert pyval('$items[1].name', data) == 'a'

    def test_index_out_of_bounds(self):
        data = {'items': [{'name': 'a'}]}
        assert is_null(val('$items[5].name', data))


class TestElementWiseArrays:
    """Tests for §3.9 element-wise operations."""

    def test_equal_length(self):
        data = {'items': [
            {'qty': 2, 'price': 10},
            {'qty': 5, 'price': 3},
        ]}
        r = val('$items[*].qty * $items[*].price', data)
        assert isinstance(r, FelArray)
        assert r.elements[0].value == Decimal('20')
        assert r.elements[1].value == Decimal('15')

    def test_sum_of_elementwise(self):
        data = {'items': [
            {'qty': 2, 'price': 10},
            {'qty': 5, 'price': 3.5},
            {'qty': 1, 'price': 25},
        ]}
        r = pyval('sum($items[*].qty * $items[*].price)', data)
        assert r == Decimal('62.5')

    def test_mismatched_length(self):
        data = {'a': [1, 2], 'b': [1, 2, 3]}
        assert is_null(val('$a * $b', data))  # Can't do element-wise on raw arrays via field ref


class TestCountWhere:
    def test_basic(self):
        """countWhere rebinds $ to each element."""
        assert pyval('countWhere([1, 2, 3, 4, 5], $ > 3)') == Decimal('2')

    def test_all_match(self):
        assert pyval('countWhere([10, 20, 30], $ > 0)') == Decimal('3')

    def test_none_match(self):
        assert pyval('countWhere([1, 2, 3], $ > 100)') == Decimal('0')

    def test_empty_array(self):
        assert pyval('countWhere([], $ > 0)') == Decimal('0')

    def test_with_field_data(self):
        data = {'items': [{'amount': 10}, {'amount': 5000}, {'amount': 20000}]}
        assert pyval('countWhere($items[*].amount, $ > 10000)', data) == Decimal('1')


class TestReviewBugFixes:
    def test_avg_empty_diagnostic(self):
        """avg([]) must signal an error (division by zero)."""
        r = evaluate('avg([])')
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_string_of_100(self):
        """string(100) should be '100', not '1E+2'."""
        assert pyval('string(100)') == '100'

    def test_string_of_large_number(self):
        assert pyval('string(1000000)') == '1000000'

    def test_from_python_bad_money(self):
        """Dicts with amount/currency but bad amount should be objects."""
        from formspec.fel.types import from_python, FelObject
        r = from_python({'amount': 'not-a-number', 'currency': 'USD'})
        assert isinstance(r, FelObject)


# ===================================================================
# Stage 1C + 6B: Evaluator edge cases and error paths
# ===================================================================


class TestScalarBroadcast:
    """Element-wise and scalar broadcast operations on arrays."""

    def test_array_times_scalar(self):
        r = evaluate('[1, 2, 3] * 10')
        assert isinstance(r.value, FelArray)
        assert [e.value for e in r.value.elements] == [
            Decimal('10'), Decimal('20'), Decimal('30'),
        ]

    def test_scalar_times_array(self):
        r = evaluate('10 * [1, 2, 3]')
        assert isinstance(r.value, FelArray)
        assert [e.value for e in r.value.elements] == [
            Decimal('10'), Decimal('20'), Decimal('30'),
        ]

    def test_elementwise_null_propagation(self):
        r = evaluate('[1, null, 3] + [4, 5, 6]')
        elems = r.value.elements
        assert elems[0].value == Decimal('5')
        assert is_null(elems[1])
        assert elems[2].value == Decimal('9')

    def test_elementwise_comparison(self):
        r = evaluate('[1, 2, 3] > [0, 2, 4]')
        assert [e.value for e in r.value.elements] == [True, False, False]

    def test_elementwise_string_concat(self):
        r = evaluate('["a", "b"] & ["x", "y"]')
        assert [e.value for e in r.value.elements] == ['ax', 'by']

    def test_empty_array_add(self):
        r = evaluate('[] + []')
        assert isinstance(r.value, FelArray)
        assert len(r.value.elements) == 0


class TestEvaluatorEdgeCases:

    def test_ternary_untaken_branch_not_evaluated(self):
        """true ? 1 : (1/0) must yield 1 with no diagnostics."""
        r = evaluate('true ? 1 : (1/0)')
        assert r.value == FelNumber(Decimal('1'))
        assert len(r.diagnostics) == 0

    def test_deeply_nested_field_refs(self):
        data = {'a': {'b': {'c': {'d': {'e': 99}}}}}
        assert pyval('$a.b.c.d.e', data) == Decimal('99')

    def test_multiple_null_coalesce_chain(self):
        data = {'a': None, 'b': None, 'c': None}
        assert pyval('$a ?? $b ?? $c ?? 0', data) == Decimal('0')

    def test_date_comparison_gt(self):
        assert pyval('@2024-01-15 > @2024-01-01') is True

    def test_boolean_equality_true(self):
        assert pyval('true = true') is True

    def test_boolean_equality_false(self):
        assert pyval('true = false') is False

    def test_membership_null_propagation(self):
        r = evaluate('"x" in null')
        assert is_null(r.value)

    def test_unary_minus_null(self):
        assert is_null(val('-null'))

    def test_string_membership_in_array(self):
        assert pyval('"b" in ["a", "b", "c"]') is True


class TestObjectLiteralEval:

    def test_simple_field_access(self):
        assert pyval('{a: 1, b: 2}.a') == Decimal('1')

    def test_nested_object_access(self):
        assert pyval('{x: {y: 3}}.x.y') == Decimal('3')


class TestPostfixWildcard:

    def test_wildcard_via_let_binding(self):
        data = {'items': [{'val': 10}, {'val': 20}, {'val': 30}]}
        assert pyval('let arr = $items in sum(arr[*].val)', data) == Decimal('60')

    def test_nested_index_then_wildcard(self):
        data = {'items': [{'sub': [{'val': 1}, {'val': 2}]}, {'sub': [{'val': 3}]}]}
        r = val('$items[1].sub[*].val', data)
        assert isinstance(r, FelArray)
        assert [e.value for e in r.elements] == [Decimal('1'), Decimal('2')]


class TestCommentEval:

    def test_block_comment(self):
        assert pyval('1 + /* add */ 2') == Decimal('3')

    def test_line_comment(self):
        assert pyval('1 + 2 // trailing') == Decimal('3')


class TestEvaluatorErrors:
    """Stage 6B: diagnostic messages from runtime errors."""

    def test_unknown_function(self):
        r = evaluate('nonexistent(1)')
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_wrong_arity(self):
        r = evaluate('length("a", "b")')
        assert r.value == FelNumber(Decimal('1'))
        assert r.diagnostics == []

    def test_countWhere_non_array(self):
        r = evaluate('countWhere(42, $ > 0)')
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_countWhere_non_boolean_predicate(self):
        """Rust treats non-boolean predicate results using FEL truthiness."""
        r = evaluate('countWhere([1, 2], $ + 1)')
        assert r.value == FelNumber(Decimal('2'))
        assert len(r.diagnostics) == 0

    def test_division_by_zero_diagnostic_content(self):
        r = evaluate('1 / 0')
        assert is_null(r.value)
        msg = r.diagnostics[0].message.lower()
        assert 'division' in msg or 'zero' in msg

    def test_avg_empty_diagnostic_content(self):
        r = evaluate('avg([])')
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_moneyAdd_currency_mismatch_emits_diagnostic(self):
        r = evaluate("moneyAdd(money(10, 'USD'), money(20, 'EUR'))")
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_moneySum_currency_mismatch_emits_diagnostic(self):
        r = evaluate("moneySum([money(10, 'USD'), money(20, 'EUR')])")
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1


class TestMoneyArithmetic:
    """Money-aware arithmetic operators — must match TypeScript semantics exactly."""

    # --- money + money (same currency) ---
    def test_money_add_money_same_currency(self):
        r = val("money(10, 'USD') + money(20, 'USD')")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('30')
        assert r.currency == 'USD'

    # --- money - money (same currency) ---
    def test_money_sub_money_same_currency(self):
        r = val("money(50, 'EUR') - money(20, 'EUR')")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('30')
        assert r.currency == 'EUR'

    # --- money / money → number (unit cancellation) ---
    def test_money_div_money_unit_cancellation(self):
        r = val("money(100, 'USD') / money(25, 'USD')")
        assert isinstance(r, FelNumber)
        assert r.value == Decimal('4')

    # --- currency mismatch → null ---
    def test_money_add_money_currency_mismatch(self):
        assert is_null(val("money(10, 'USD') + money(20, 'EUR')"))

    def test_money_sub_money_currency_mismatch(self):
        assert is_null(val("money(10, 'USD') - money(20, 'EUR')"))

    def test_money_div_money_currency_mismatch(self):
        assert is_null(val("money(10, 'USD') / money(20, 'EUR')"))

    # --- money * money → null (not meaningful) ---
    def test_money_mul_money_is_null(self):
        assert is_null(val("money(10, 'USD') * money(20, 'USD')"))

    # --- money % money → null (not meaningful) ---
    def test_money_mod_money_is_null(self):
        assert is_null(val("money(10, 'USD') % money(20, 'USD')"))

    # --- money * number ---
    def test_money_mul_number(self):
        r = val("money(10, 'USD') * 3")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('30')
        assert r.currency == 'USD'

    # --- number * money ---
    def test_number_mul_money(self):
        r = val("3 * money(10, 'USD')")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('30')
        assert r.currency == 'USD'

    # --- money / number ---
    def test_money_div_number(self):
        r = val("money(100, 'USD') / 4")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('25')
        assert r.currency == 'USD'

    # --- money + number ---
    def test_money_add_number(self):
        r = val("money(10, 'USD') + 5")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('15')
        assert r.currency == 'USD'

    # --- money - number ---
    def test_money_sub_number(self):
        r = val("money(10, 'USD') - 3")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('7')
        assert r.currency == 'USD'

    # --- money % number ---
    def test_money_mod_number(self):
        r = val("money(10, 'USD') % 3")
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('1')
        assert r.currency == 'USD'

    # --- number +/- money → null (only money on left for non-commutative ops) ---
    def test_number_add_money_is_null(self):
        assert is_null(val("5 + money(10, 'USD')"))

    def test_number_sub_money_is_null(self):
        assert is_null(val("5 - money(10, 'USD')"))

    def test_number_div_money_is_null(self):
        assert is_null(val("5 / money(10, 'USD')"))

    def test_number_mod_money_is_null(self):
        assert is_null(val("5 % money(10, 'USD')"))

    # --- division / modulo by zero ---
    def test_money_div_zero(self):
        r = evaluate("money(10, 'USD') / 0")
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_money_mod_zero(self):
        r = evaluate("money(10, 'USD') % 0")
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_money_div_money_zero(self):
        r = evaluate("money(10, 'USD') / money(0, 'USD')")
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    # --- null propagation (handled before arithmetic, should still work) ---
    def test_money_add_null(self):
        assert is_null(val("money(10, 'USD') + null"))

    def test_null_add_money(self):
        assert is_null(val("null + money(10, 'USD')"))

    # --- decimal precision ---
    def test_money_div_precise(self):
        r = val("money(10, 'USD') / 3")
        assert isinstance(r, FelMoney)
        expected = Decimal('3.3333333333333333333333333333')
        assert r.amount == expected

    # --- field references with money ---
    def test_money_field_mul(self):
        r = val("$price * $qty", {'price': {'amount': '25', 'currency': 'USD'}, 'qty': 4})
        assert isinstance(r, FelMoney)
        assert r.amount == Decimal('100')
        assert r.currency == 'USD'

    # --- array broadcasting with money ---
    def test_money_array_broadcast_mul(self):
        """[money, money] * scalar → [money, money]"""
        r = val("[money(10, 'USD'), money(20, 'USD')] * 2")
        assert isinstance(r, FelArray)
        assert len(r.elements) == 2
        assert isinstance(r.elements[0], FelMoney)
        assert r.elements[0].amount == Decimal('20')
        assert r.elements[1].amount == Decimal('40')

    # --- no diagnostic on currency mismatch (silent null, not error) ---
    def test_money_add_currency_mismatch_emits_diagnostic(self):
        r = evaluate("money(10, 'USD') + money(20, 'EUR')")
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1

    def test_money_mul_money_emits_diagnostic(self):
        r = evaluate("money(10, 'USD') * money(20, 'USD')")
        assert is_null(r.value)
        assert len(r.diagnostics) >= 1
