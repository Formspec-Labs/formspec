"""Property-based tests for every entry in formspec-common.registry.json.

For each dataType entry, generates random valid values (matching the regex /
range constraints) and random invalid values, then verifies the Rust
evaluate_definition enforces the constraints correctly.

Uses Hypothesis for random value generation.
"""
from __future__ import annotations

import json
import string
from pathlib import Path

from hypothesis import given, settings, assume, HealthCheck
from hypothesis import strategies as st

from formspec._rust import evaluate_definition

# ── Load real registry ────────────────────────────────────────────────

REGISTRY_PATH = Path(__file__).resolve().parents[3] / "registries" / "formspec-common.registry.json"
REGISTRY_DOC = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))

SETTINGS = settings(max_examples=50, deadline=2000, suppress_health_check=[HealthCheck.too_slow])


# ── Helpers ───────────────────────────────────────────────────────────

class _EvaluatorProxy:
    """Wraps evaluate_definition for a fixed definition, providing validate()."""
    def __init__(self, definition: dict, registry_documents: list[dict] | None = None):
        self.definition = definition
        self.registry_documents = registry_documents

    def validate(self, data: dict) -> list[dict]:
        result = evaluate_definition(
            self.definition, data, registry_documents=self.registry_documents,
        )
        return result.results


def _make_evaluator(ext_name: str, data_type: str) -> _EvaluatorProxy:
    """Build an evaluator proxy with a single field using the given extension."""
    definition = {
        "$formspec": "1.0",
        "url": "http://example.org/registry-py-test",
        "version": "1.0.0",
        "title": f"Test {ext_name}",
        "items": [
            {
                "key": "v",
                "type": "field",
                "dataType": data_type,
                "label": "Value",
                "extensions": {ext_name: True},
            }
        ],
    }
    return _EvaluatorProxy(definition, registry_documents=[REGISTRY_DOC])


def _has_code(evaluator: _EvaluatorProxy, data: dict, code: str) -> bool:
    """Check if validation of data produces a result with the given code."""
    results = evaluator.validate(data)
    return any(r.get("code") == code for r in results)


def _has_no_constraint_codes(evaluator: _EvaluatorProxy, data: dict) -> bool:
    """Check that validation produces no constraint-related error codes."""
    codes = {"PATTERN_MISMATCH", "MAX_LENGTH_EXCEEDED", "RANGE_UNDERFLOW", "RANGE_OVERFLOW"}
    results = evaluator.validate(data)
    return not any(r.get("code") in codes for r in results)


# ── Strategies ────────────────────────────────────────────────────────

digit = st.sampled_from(string.digits)
digits_str = lambda n: st.tuples(*[digit] * n).map("".join)
hex_char = st.sampled_from("0123456789abcdefABCDEF")


# ── x-formspec-email ─────────────────────────────────────────────────

class TestEmail:
    EV = _make_evaluator("x-formspec-email", "string")

    @SETTINGS
    @given(data=st.emails())
    def test_valid_emails_pass(self, data: str):
        assert not _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from(["plaintext", "missing@", "@nodomain", "spaces in@x.com", "a@@b.com"]))
    def test_invalid_emails_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(length=st.integers(min_value=255, max_value=400))
    def test_max_length_enforced(self, length: int):
        assert _has_code(self.EV, {"v": "a" * length}, "MAX_LENGTH_EXCEEDED")


# ── x-formspec-phone (E.164) ─────────────────────────────────────────

class TestPhoneE164:
    EV = _make_evaluator("x-formspec-phone", "string")

    @SETTINGS
    @given(
        first=st.integers(min_value=1, max_value=9),
        rest=st.lists(digit, min_size=1, max_size=14),
    )
    def test_valid_e164_pass(self, first: int, rest: list[str]):
        phone = f"+{first}{''.join(rest)}"
        assert not _has_code(self.EV, {"v": phone}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from(["1234567890", "+0123456789", "+", "+ 1234", "abc", "+1234567890123456"]))
    def test_invalid_e164_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-phone-nanp ────────────────────────────────────────────

class TestPhoneNANP:
    EV = _make_evaluator("x-formspec-phone-nanp", "string")

    @SETTINGS
    @given(
        a1=st.integers(min_value=2, max_value=9),
        a2=st.integers(min_value=0, max_value=9),
        a3=st.integers(min_value=0, max_value=9),
        e1=st.integers(min_value=2, max_value=9),
        e2=st.integers(min_value=0, max_value=9),
        e3=st.integers(min_value=0, max_value=9),
        n1=st.integers(min_value=0, max_value=9),
        n2=st.integers(min_value=0, max_value=9),
        n3=st.integers(min_value=0, max_value=9),
        n4=st.integers(min_value=0, max_value=9),
    )
    def test_valid_nanp_pass(self, a1, a2, a3, e1, e2, e3, n1, n2, n3, n4):
        phone = f"({a1}{a2}{a3}) {e1}{e2}{e3}-{n1}{n2}{n3}{n4}"
        assert not _has_code(self.EV, {"v": phone}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from([
        "(012) 345-6789",   # area starts with 0
        "(123) 045-6789",   # exchange starts with 0
        "(123) 145-6789",   # exchange starts with 1
        "2125551234",        # no formatting
        "(212) 555 1234",    # wrong separator
    ]))
    def test_invalid_nanp_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-postal-code-us ────────────────────────────────────────

class TestPostalCodeUS:
    EV = _make_evaluator("x-formspec-postal-code-us", "string")

    @SETTINGS
    @given(
        use_plus4=st.booleans(),
        base=digits_str(5),
        plus4=digits_str(4),
    )
    def test_valid_zip_pass(self, use_plus4: bool, base: str, plus4: str):
        zip_code = f"{base}-{plus4}" if use_plus4 else base
        assert not _has_code(self.EV, {"v": zip_code}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from(["1234", "123456", "12345-", "12345-123", "abcde", "12345-12345"]))
    def test_invalid_zip_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-ssn ───────────────────────────────────────────────────

class TestSSN:
    EV = _make_evaluator("x-formspec-ssn", "string")

    @SETTINGS
    @given(
        area=st.integers(min_value=1, max_value=665),
        group=st.integers(min_value=1, max_value=99),
        serial=st.integers(min_value=1, max_value=9999),
    )
    def test_valid_ssn_pass(self, area: int, group: int, serial: int):
        ssn = f"{area:03d}-{group:02d}-{serial:04d}"
        assert not _has_code(self.EV, {"v": ssn}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from([
        "000-12-3456",  # area 000
        "666-12-3456",  # area 666
        "900-12-3456",  # area 9xx
        "123-00-3456",  # group 00
        "123-45-0000",  # serial 0000
        "12345-6789",   # wrong format
        "123456789",    # no hyphens
    ]))
    def test_invalid_ssn_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-ein ───────────────────────────────────────────────────

class TestEIN:
    EV = _make_evaluator("x-formspec-ein", "string")

    @SETTINGS
    @given(prefix=digits_str(2), suffix=digits_str(7))
    def test_valid_ein_pass(self, prefix: str, suffix: str):
        assert not _has_code(self.EV, {"v": f"{prefix}-{suffix}"}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from(["12-34567890", "1-2345678", "123456789", "AB-CDEFGHI"]))
    def test_invalid_ein_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-credit-card ───────────────────────────────────────────

class TestCreditCard:
    EV = _make_evaluator("x-formspec-credit-card", "string")

    @SETTINGS
    @given(length=st.integers(min_value=13, max_value=19))
    def test_valid_card_pattern_pass(self, length: int):
        card = "".join([str(i % 10) for i in range(length)])
        assert not _has_code(self.EV, {"v": card}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from([
        "1234",                      # too short
        "12345678901234567890",       # too long (20 digits)
        "1234-5678-9012",             # hyphens
        "1234 5678 9012",             # spaces
        "abcdefghijklm",              # letters
    ]))
    def test_invalid_card_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-color-hex ─────────────────────────────────────────────

class TestColorHex:
    EV = _make_evaluator("x-formspec-color-hex", "string")

    @SETTINGS
    @given(
        short=st.booleans(),
        hex3=st.tuples(hex_char, hex_char, hex_char).map("".join),
        hex6=st.tuples(hex_char, hex_char, hex_char, hex_char, hex_char, hex_char).map("".join),
    )
    def test_valid_color_pass(self, short: bool, hex3: str, hex6: str):
        color = f"#{hex3}" if short else f"#{hex6}"
        assert not _has_code(self.EV, {"v": color}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from(["FF0000", "#GG0000", "#12", "#12345", "#1234567", "red"]))
    def test_invalid_color_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-slug ──────────────────────────────────────────────────

class TestSlug:
    EV = _make_evaluator("x-formspec-slug", "string")

    ALNUM = string.ascii_lowercase + string.digits
    INNER = ALNUM + "-"

    @SETTINGS
    @given(
        first=st.sampled_from(list(ALNUM)),
        mid=st.lists(st.sampled_from(list(INNER)), min_size=0, max_size=30),
        last=st.sampled_from(list(ALNUM)),
    )
    def test_valid_slug_pass(self, first: str, mid: list[str], last: str):
        slug = first + "".join(mid) + last if mid else first
        assume(len(slug) <= 128)
        assert not _has_code(self.EV, {"v": slug}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from(["-start", "end-", "UPPER", "has spaces", "special!char"]))
    def test_invalid_slug_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")

    def test_max_length_enforced(self):
        assert _has_code(self.EV, {"v": "a" * 129}, "MAX_LENGTH_EXCEEDED")


# ── x-formspec-ipv4 ──────────────────────────────────────────────────

class TestIPv4:
    EV = _make_evaluator("x-formspec-ipv4", "string")

    @SETTINGS
    @given(
        a=st.integers(min_value=0, max_value=255),
        b=st.integers(min_value=0, max_value=255),
        c=st.integers(min_value=0, max_value=255),
        d=st.integers(min_value=0, max_value=255),
    )
    def test_valid_ipv4_pass(self, a: int, b: int, c: int, d: int):
        assert not _has_code(self.EV, {"v": f"{a}.{b}.{c}.{d}"}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from(["256.1.1.1", "1.2.3", "1.2.3.4.5", "abc.def.ghi.jkl"]))
    def test_invalid_ipv4_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")


# ── x-formspec-url ───────────────────────────────────────────────

class TestURL:
    EV = _make_evaluator("x-formspec-url", "string")

    ALNUM = string.ascii_lowercase + string.digits
    ALPHA = string.ascii_lowercase

    @SETTINGS
    @given(
        label=st.text(st.sampled_from(list(ALNUM)), min_size=1, max_size=10),
        tld=st.text(st.sampled_from(list(ALPHA)), min_size=2, max_size=6),
        port=st.one_of(st.none(), st.integers(min_value=1, max_value=65535)),
        path=st.one_of(st.none(), st.text(st.sampled_from(list(ALNUM + "/-_.")), min_size=1, max_size=20)),
    )
    def test_valid_https_urls_pass(self, label: str, tld: str, port, path):
        url = f"https://{label}.{tld}"
        if port is not None:
            url += f":{port}"
        if path is not None:
            url += f"/{path}"
        assert not _has_code(self.EV, {"v": url}, "PATTERN_MISMATCH")

    @SETTINGS
    @given(data=st.sampled_from([
        "http://example.com",            # http, not https
        "ftp://example.com",             # wrong scheme
        "example.com",                   # no scheme
        "https://",                      # no domain
        "https://-invalid.com",          # label starts with hyphen
        "https://example.com/path here", # space in path
        "not-a-url",                     # plain text
    ]))
    def test_invalid_urls_fail(self, data: str):
        assert _has_code(self.EV, {"v": data}, "PATTERN_MISMATCH")

    def test_max_length_enforced(self):
        long_url = "https://example.com/" + "a" * 2040
        assert _has_code(self.EV, {"v": long_url}, "MAX_LENGTH_EXCEEDED")


# ── x-formspec-percentage ────────────────────────────────────────────

class TestPercentage:
    EV = _make_evaluator("x-formspec-percentage", "decimal")

    @SETTINGS
    @given(val=st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False))
    def test_valid_range_pass(self, val: float):
        assert _has_no_constraint_codes(self.EV, {"v": val})

    @SETTINGS
    @given(val=st.floats(min_value=-1e6, max_value=-0.001, allow_nan=False, allow_infinity=False))
    def test_below_zero_fails(self, val: float):
        assert _has_code(self.EV, {"v": val}, "RANGE_UNDERFLOW")

    @SETTINGS
    @given(val=st.floats(min_value=100.001, max_value=1e6, allow_nan=False, allow_infinity=False))
    def test_above_100_fails(self, val: float):
        assert _has_code(self.EV, {"v": val}, "RANGE_OVERFLOW")


# ── x-formspec-currency-usd ──────────────────────────────────────────

class TestCurrencyUSD:
    EV = _make_evaluator("x-formspec-currency-usd", "decimal")

    @SETTINGS
    @given(val=st.floats(min_value=0.0, max_value=1e9, allow_nan=False, allow_infinity=False))
    def test_non_negative_pass(self, val: float):
        assert not _has_code(self.EV, {"v": val}, "RANGE_UNDERFLOW")

    @SETTINGS
    @given(val=st.floats(min_value=-1e9, max_value=-0.001, allow_nan=False, allow_infinity=False))
    def test_negative_fails(self, val: float):
        assert _has_code(self.EV, {"v": val}, "RANGE_UNDERFLOW")


# ── Non-dataType entries: graceful handling ───────────────────────────

class TestLuhnGraceful:
    """x-formspec-luhn is a constraint entry — no pattern/range to enforce."""

    def test_no_crash(self):
        ev = _make_evaluator("x-formspec-luhn", "string")
        assert not _has_code(ev, {"v": "4111111111111111"}, "PATTERN_MISMATCH")


class TestAgeGraceful:
    """x-formspec-age is a function entry — no constraints to enforce."""

    def test_no_crash(self):
        ev = _make_evaluator("x-formspec-age", "date")
        results = ev.validate({"v": "1990-01-15"})
        # Should produce no constraint errors
        codes = {r.get("code") for r in results}
        assert "PATTERN_MISMATCH" not in codes


class TestMaskGraceful:
    """x-formspec-mask is a function entry — no constraints to enforce."""

    def test_no_crash(self):
        ev = _make_evaluator("x-formspec-mask", "string")
        results = ev.validate({"v": "123456789"})
        codes = {r.get("code") for r in results}
        assert "PATTERN_MISMATCH" not in codes


# ── Unresolved extension detection ───────────────────────────────────

class TestUnresolvedExtension:
    """Evaluator must emit UNRESOLVED_EXTENSION when an extension has no registry entry."""

    def test_no_registry_produces_unresolved_error(self):
        """Field declares extension but no registry is loaded."""
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/unresolved-test",
            "version": "1.0.0",
            "title": "Unresolved Test",
            "items": [{
                "key": "v",
                "type": "field",
                "dataType": "string",
                "label": "Value",
                "extensions": {"x-formspec-email": True},
            }],
        })
        results = ev.validate({"v": "anything"})
        assert any(
            r.get("code") == "UNRESOLVED_EXTENSION" for r in results
        ), "Expected UNRESOLVED_EXTENSION when no registry loaded"

    def test_unknown_extension_produces_unresolved_error(self):
        """Field declares an extension not present in the loaded registry."""
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/unresolved-test",
            "version": "1.0.0",
            "title": "Unresolved Test",
            "items": [{
                "key": "v",
                "type": "field",
                "dataType": "string",
                "label": "Value",
                "extensions": {"x-acme-widget": True},
            }],
        })
        results = ev.validate({"v": "anything"})
        codes = [r for r in results if r.get("code") == "UNRESOLVED_EXTENSION"]
        assert len(codes) == 1
        assert "x-acme-widget" in codes[0].get("message", "")

    def test_message_names_extension(self):
        """The error message should include the unresolved extension name."""
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/unresolved-test",
            "version": "1.0.0",
            "title": "Unresolved Test",
            "items": [{
                "key": "v",
                "type": "field",
                "dataType": "string",
                "label": "Value",
                "extensions": {"x-acme-foobar": True},
            }],
        })
        results = ev.validate({"v": "test"})
        unresolved = [r for r in results if r.get("code") == "UNRESOLVED_EXTENSION"]
        assert len(unresolved) == 1
        assert "x-acme-foobar" in unresolved[0]["message"]

    def test_disabled_extension_no_error(self):
        """Extension set to false should not trigger UNRESOLVED_EXTENSION."""
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/unresolved-test",
            "version": "1.0.0",
            "title": "Unresolved Test",
            "items": [{
                "key": "v",
                "type": "field",
                "dataType": "string",
                "label": "Value",
                "extensions": {"x-acme-widget": False},
            }],
        })
        results = ev.validate({"v": "anything"})
        assert not any(r.get("code") == "UNRESOLVED_EXTENSION" for r in results)

    def test_resolved_extension_no_error(self):
        """Known extension with registry loaded should not produce UNRESOLVED_EXTENSION."""
        ev = _make_evaluator("x-formspec-email", "string")
        results = ev.validate({"v": "user@example.com"})
        assert not any(r.get("code") == "UNRESOLVED_EXTENSION" for r in results)


class TestPatternMismatchMessage:
    """PATTERN_MISMATCH should use displayName, not generic 'Pattern mismatch'."""

    def test_message_uses_display_name(self):
        ev = _make_evaluator("x-formspec-email", "string")
        results = ev.validate({"v": "bad"})
        err = [r for r in results if r.get("code") == "PATTERN_MISMATCH"]
        assert len(err) == 1
        assert "Email address" in err[0]["message"], f"Expected displayName in message, got: {err[0]['message']}"
        assert "Pattern mismatch" not in err[0]["message"]

    def test_url_message_uses_display_name(self):
        ev = _make_evaluator("x-formspec-url", "string")
        results = ev.validate({"v": "s"})
        err = [r for r in results if r.get("code") == "PATTERN_MISMATCH"]
        assert len(err) == 1
        assert "URL" in err[0]["message"], f"Expected displayName in message, got: {err[0]['message']}"


# ── Namespace integrity ──────────────────────────────────────────────

class TestModuleIntegrity:
    """x-formspec-common module must list every non-module entry under contributes[]
    (per ADR 0150 §4.1 — `namespace`/`members[]` renamed to `module`/`contributes[]`)."""

    def test_all_entries_listed(self):
        # Use raw JSON since find_registry_entry doesn't return 'contributes'
        mod_raw = next(
            (e for e in REGISTRY_DOC["entries"] if e["name"] == "x-formspec-common"),
            None,
        )
        assert mod_raw is not None
        non_mod = [e for e in REGISTRY_DOC["entries"] if e.get("category") != "module"]
        contributes = mod_raw.get("contributes", [])
        for entry in non_mod:
            assert entry["name"] in contributes, f"Module missing contribution '{entry['name']}'"
        assert len(contributes) == len(non_mod)


# ── §7.3 Compatibility check ─────────────────────────────────────────

def _make_registry_doc(entries_raw: list[dict]) -> dict:
    """Build a registry document from raw entry dicts."""
    return {
        "$formspecRegistry": "1.0",
        "publisher": REGISTRY_DOC["publisher"],
        "published": REGISTRY_DOC["published"],
        "entries": entries_raw,
    }


def _raw_email_entry(**overrides) -> dict:
    """Get the raw email entry dict from the registry with optional overrides."""
    base = next(e for e in REGISTRY_DOC["entries"] if e["name"] == "x-formspec-email")
    return {**base, **overrides}


class TestCompatibilityCheck:
    """§7.3: Evaluator must check compatibility.formspecVersion range."""

    def test_compatible_no_warning(self):
        """Compatible entry should not produce EXTENSION_COMPATIBILITY_MISMATCH."""
        ev = _make_evaluator("x-formspec-email", "string")
        results = ev.validate({"v": "user@example.com"})
        assert not any(r.get("code") == "EXTENSION_COMPATIBILITY_MISMATCH" for r in results)

    def test_incompatible_produces_warning(self):
        """Entry with incompatible formspecVersion range should produce warning."""
        entry = _raw_email_entry(compatibility={"formspecVersion": ">=2.0.0 <3.0.0"})
        reg = _make_registry_doc([entry])
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/compat-test",
            "version": "1.0.0",
            "title": "Compat Test",
            "items": [{
                "key": "v", "type": "field", "dataType": "string",
                "label": "Value", "extensions": {"x-formspec-email": True},
            }],
        }, registry_documents=[reg])
        results = ev.validate({"v": "user@example.com"})
        compat = [r for r in results if r.get("code") == "EXTENSION_COMPATIBILITY_MISMATCH"]
        assert len(compat) == 1
        assert compat[0]["severity"] == "warning"

    def test_incompatible_message_includes_info(self):
        """Warning message should include extension name and required version range."""
        entry = _raw_email_entry(compatibility={"formspecVersion": ">=2.0.0 <3.0.0"})
        reg = _make_registry_doc([entry])
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/compat-test",
            "version": "1.0.0",
            "title": "Compat Test",
            "items": [{
                "key": "v", "type": "field", "dataType": "string",
                "label": "Value", "extensions": {"x-formspec-email": True},
            }],
        }, registry_documents=[reg])
        results = ev.validate({"v": "user@example.com"})
        compat = [r for r in results if r.get("code") == "EXTENSION_COMPATIBILITY_MISMATCH"]
        assert len(compat) == 1
        assert "x-formspec-email" in compat[0]["message"]
        assert ">=2.0.0" in compat[0]["message"]


# ── §7.4 Status enforcement ──────────────────────────────────────────

class TestStatusEnforcement:
    """§7.4: Evaluator must emit warning for retired, info for deprecated."""

    def test_retired_produces_warning(self):
        """Retired extension should produce EXTENSION_RETIRED warning."""
        entry = _raw_email_entry(status="retired")
        reg = _make_registry_doc([entry])
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/status-test",
            "version": "1.0.0",
            "title": "Status Test",
            "items": [{
                "key": "v", "type": "field", "dataType": "string",
                "label": "Value", "extensions": {"x-formspec-email": True},
            }],
        }, registry_documents=[reg])
        results = ev.validate({"v": "user@example.com"})
        retired = [r for r in results if r.get("code") == "EXTENSION_RETIRED"]
        assert len(retired) == 1
        assert retired[0]["severity"] == "warning"

    def test_retired_message_includes_name(self):
        """Retired warning should name the extension."""
        entry = _raw_email_entry(status="retired")
        reg = _make_registry_doc([entry])
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/status-test",
            "version": "1.0.0",
            "title": "Status Test",
            "items": [{
                "key": "v", "type": "field", "dataType": "string",
                "label": "Value", "extensions": {"x-formspec-email": True},
            }],
        }, registry_documents=[reg])
        results = ev.validate({"v": "user@example.com"})
        retired = [r for r in results if r.get("code") == "EXTENSION_RETIRED"]
        assert "x-formspec-email" in retired[0]["message"]

    def test_deprecated_produces_info(self):
        """Deprecated extension should produce EXTENSION_DEPRECATED info."""
        entry = _raw_email_entry(
            status="deprecated",
            deprecationNotice="Use x-formspec-email-v2 instead",
        )
        reg = _make_registry_doc([entry])
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/status-test",
            "version": "1.0.0",
            "title": "Status Test",
            "items": [{
                "key": "v", "type": "field", "dataType": "string",
                "label": "Value", "extensions": {"x-formspec-email": True},
            }],
        }, registry_documents=[reg])
        results = ev.validate({"v": "user@example.com"})
        deprecated = [r for r in results if r.get("code") == "EXTENSION_DEPRECATED"]
        assert len(deprecated) == 1
        assert deprecated[0]["severity"] == "info"

    def test_deprecated_message_includes_notice(self):
        """Deprecation notice from entry should appear in message."""
        entry = _raw_email_entry(
            status="deprecated",
            deprecationNotice="Use x-formspec-email-v2 instead",
        )
        reg = _make_registry_doc([entry])
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/status-test",
            "version": "1.0.0",
            "title": "Status Test",
            "items": [{
                "key": "v", "type": "field", "dataType": "string",
                "label": "Value", "extensions": {"x-formspec-email": True},
            }],
        }, registry_documents=[reg])
        results = ev.validate({"v": "user@example.com"})
        deprecated = [r for r in results if r.get("code") == "EXTENSION_DEPRECATED"]
        assert "Use x-formspec-email-v2 instead" in deprecated[0]["message"]

    def test_stable_no_status_warnings(self):
        """Stable extension should not produce status warnings."""
        ev = _make_evaluator("x-formspec-email", "string")  # real registry, status=stable
        results = ev.validate({"v": "user@example.com"})
        status_codes = {"EXTENSION_RETIRED", "EXTENSION_DEPRECATED"}
        assert not any(r.get("code") in status_codes for r in results)

    def test_draft_no_status_warnings(self):
        """Draft extension should not produce status warnings."""
        entry = _raw_email_entry(status="draft")
        reg = _make_registry_doc([entry])
        ev = _EvaluatorProxy({
            "$formspec": "1.0",
            "url": "http://example.org/status-test",
            "version": "1.0.0",
            "title": "Status Test",
            "items": [{
                "key": "v", "type": "field", "dataType": "string",
                "label": "Value", "extensions": {"x-formspec-email": True},
            }],
        }, registry_documents=[reg])
        results = ev.validate({"v": "user@example.com"})
        status_codes = {"EXTENSION_RETIRED", "EXTENSION_DEPRECATED"}
        assert not any(r.get("code") in status_codes for r in results)
