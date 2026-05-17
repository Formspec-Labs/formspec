"""Method-URI fail-closed fixture classification for ADR 0109."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from hypothesis import given
from hypothesis import strategies as st

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "signature-method-uri-fail-closed"
REGISTRY_PATH = ROOT / "registries" / "signature-method-registry.json"
SIG_PREFIX = "urn:formspec:sig-method:"
METHOD_URI_LABEL = -65540


class CborReader:
    """Small strict CBOR reader for the committed COSE fixture shape."""

    def __init__(self, data: bytes) -> None:
        self._data = data
        self._offset = 0

    def read_fully(self) -> Any:
        value = self.read()
        if self._offset != len(self._data):
            raise ValueError("trailing CBOR bytes")
        return value

    def read(self) -> Any:
        if self._offset >= len(self._data):
            raise ValueError("unexpected end of CBOR")
        first = self._data[self._offset]
        self._offset += 1
        major = first >> 5
        additional = first & 0x1F
        if major == 0:
            return self._read_len(additional)
        if major == 1:
            return -1 - self._read_len(additional)
        if major == 2:
            size = self._read_len(additional)
            return self._read_exact(size)
        if major == 3:
            size = self._read_len(additional)
            return self._read_exact(size).decode("utf-8")
        if major == 4:
            return [self.read() for _ in range(self._read_len(additional))]
        if major == 5:
            return {self.read(): self.read() for _ in range(self._read_len(additional))}
        if major == 6:
            return {"tag": self._read_len(additional), "value": self.read()}
        if major == 7 and additional == 22:
            return None
        raise ValueError(f"unsupported CBOR major/additional: {major}/{additional}")

    def _read_len(self, additional: int) -> int:
        if additional < 24:
            return additional
        if additional == 24:
            return int.from_bytes(self._read_exact(1), "big")
        if additional == 25:
            return int.from_bytes(self._read_exact(2), "big")
        if additional == 26:
            return int.from_bytes(self._read_exact(4), "big")
        if additional == 27:
            return int.from_bytes(self._read_exact(8), "big")
        raise ValueError(f"unsupported CBOR length additional: {additional}")

    def _read_exact(self, size: int) -> bytes:
        end = self._offset + size
        if end > len(self._data):
            raise ValueError("truncated CBOR byte string")
        value = self._data[self._offset:end]
        self._offset = end
        return value


def _registered_methods() -> set[str]:
    raw = json.loads(REGISTRY_PATH.read_text())
    return {entry["id"] for entry in raw["entries"] if entry["status"] == "registered"}


def _method_uri_from_cose(cose_hex: str) -> str:
    root = CborReader(bytes.fromhex(cose_hex)).read_fully()
    if root.get("tag") != 18:
        raise ValueError("fixture is not COSE_Sign1")
    protected_bytes = root["value"][0]
    protected = CborReader(protected_bytes).read_fully()
    method_uri = protected.get(METHOD_URI_LABEL)
    if not isinstance(method_uri, str):
        raise ValueError("method_uri missing from protected header")
    return method_uri


def _classify_method(method_uri: str, expected_prefix: str, registered: set[str]) -> str:
    if not method_uri.startswith(expected_prefix):
        return "wrong_method_uri_prefix"
    if method_uri not in registered:
        return "method_unsupported"
    return "accepted"


def test_python_fixture_classifier_reads_committed_method_uri_rejections() -> None:
    registered = _registered_methods()
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        fixture = json.loads(path.read_text())
        decoded_method_uri = _method_uri_from_cose(fixture["signatureBytesCoseSign1Hex"])
        assert decoded_method_uri == fixture["methodUri"]
        assert (
            _classify_method(decoded_method_uri, fixture["expectedPrefix"], registered)
            == fixture["expectedReason"]
        )


@given(st.from_regex(r"[a-z0-9][a-z0-9._@-]{0,48}", fullmatch=True))
def test_python_property_unknown_exact_sig_methods_do_not_resolve(suffix: str) -> None:
    registered = _registered_methods()
    candidate = f"{SIG_PREFIX}unknown-{suffix}"
    assert _classify_method(candidate, SIG_PREFIX, registered) == "method_unsupported"


@given(st.from_regex(r"[a-z0-9][a-z0-9._@-]{0,48}", fullmatch=True))
def test_python_property_unknown_prefix_rejects_distinctly(suffix: str) -> None:
    registered = _registered_methods()
    candidate = f"urn:example:sig-method:{suffix}"
    assert _classify_method(candidate, SIG_PREFIX, registered) == "wrong_method_uri_prefix"
