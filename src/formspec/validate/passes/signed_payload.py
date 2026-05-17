"""Signed payload cross-field invariant validation pass."""
from __future__ import annotations

import re

from formspec.validate.models import (
    SIGNED_PAYLOAD_VALIDATION_TITLE,
    DiscoveredArtifacts,
    PassItemResult,
    PassResult,
)

_RFC3339_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$"
)


def pass_signed_payload_validation(arts: DiscoveredArtifacts) -> PassResult:
    signed = [r for r in arts.responses if r.doc.get("authoredSignatures")]
    if not signed:
        return PassResult(title=SIGNED_PAYLOAD_VALIDATION_TITLE, empty=True)

    pr = PassResult(title=SIGNED_PAYLOAD_VALIDATION_TITLE)
    for resp in signed:
        top_id = resp.doc.get("id", "")
        top_def_url = resp.doc.get("definitionUrl", "")
        top_def_ver = resp.doc.get("definitionVersion", "")
        issues: list[dict] = []

        for i, sig in enumerate(resp.doc["authoredSignatures"]):
            sp = sig.get("signedPayload", {})
            prefix = f"authoredSignatures[{i}]"

            if top_id and sp.get("responseId") and sp["responseId"] != top_id:
                issues.append(
                    {
                        "severity": "error",
                        "code": "SIGNED_PAYLOAD_RESPONSE_ID_MISMATCH",
                        "message": (
                            f"{prefix}.signedPayload.responseId "
                            f"({sp['responseId']!r}) != top-level id ({top_id!r})"
                        ),
                        "path": "",
                    }
                )

            if sp.get("definitionUrl") and sp["definitionUrl"] != top_def_url:
                issues.append(
                    {
                        "severity": "error",
                        "code": "SIGNED_PAYLOAD_DEFINITION_URL_MISMATCH",
                        "message": (
                            f"{prefix}.signedPayload.definitionUrl "
                            f"({sp['definitionUrl']!r}) != top-level definitionUrl ({top_def_url!r})"
                        ),
                        "path": "",
                    }
                )

            if sp.get("definitionVersion") and sp["definitionVersion"] != top_def_ver:
                issues.append(
                    {
                        "severity": "error",
                        "code": "SIGNED_PAYLOAD_DEFINITION_VERSION_MISMATCH",
                        "message": (
                            f"{prefix}.signedPayload.definitionVersion "
                            f"({sp['definitionVersion']!r}) != top-level definitionVersion ({top_def_ver!r})"
                        ),
                        "path": "",
                    }
                )

            signed_at = sp.get("signedAt")
            if signed_at is not None and not _RFC3339_RE.match(str(signed_at)):
                issues.append(
                    {
                        "severity": "error",
                        "code": "SIGNED_PAYLOAD_SIGNED_AT_INVALID",
                        "message": (
                            f"{prefix}.signedPayload.signedAt "
                            f"({signed_at!r}) is not a valid RFC 3339 timestamp"
                        ),
                        "path": "",
                    }
                )

            if not sp.get("signingIntent"):
                issues.append(
                    {
                        "severity": "error",
                        "code": "SIGNED_PAYLOAD_SIGNING_INTENT_MISSING",
                        "message": f"{prefix}.signedPayload.signingIntent is missing",
                        "path": "",
                    }
                )

            if (
                sp.get("signingIntent")
                and sig.get("signingIntent")
                and sp["signingIntent"] != sig["signingIntent"]
            ):
                issues.append(
                    {
                        "severity": "error",
                        "code": "SIGNED_PAYLOAD_SIGNING_INTENT_DIVERGENCE",
                        "message": (
                            f"{prefix}.signedPayload.signingIntent "
                            f"({sp['signingIntent']!r}) != top-level signingIntent ({sig['signingIntent']!r})"
                        ),
                        "path": "",
                    }
                )

        errors = [i for i in issues if i["severity"] == "error"]
        if issues:
            pr.items.append(
                PassItemResult(
                    label=resp.path.name,
                    error_count=len(errors),
                    runtime_results=issues,
                )
            )
        else:
            pr.items.append(
                PassItemResult(
                    label=resp.path.name,
                    runtime_results=[
                        {
                            "severity": "info",
                            "message": "signed payload cross-field invariants satisfied",
                            "path": "",
                        }
                    ],
                )
            )

    return pr
