use serde_json::Value;
use sha2::{Digest, Sha256, Sha384, Sha512};

pub const CANONICALIZATION_PROFILE: &str = "formspec-response-signing-v1";
pub const DOMAIN_SEPARATION: &str = "formspec.response.signed-payload.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DigestAlgorithm {
    Sha256,
    Sha384,
    Sha512,
}

impl DigestAlgorithm {
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "sha-256" => Ok(Self::Sha256),
            "sha-384" => Ok(Self::Sha384),
            "sha-512" => Ok(Self::Sha512),
            _ => Err(format!("unknown digest algorithm: {s}")),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Sha256 => "sha-256",
            Self::Sha384 => "sha-384",
            Self::Sha512 => "sha-512",
        }
    }
}

#[derive(Debug)]
pub struct SignedPayload {
    pub canonical_bytes: Vec<u8>,
    pub digest_algorithm: DigestAlgorithm,
    pub digest: String,
}

pub fn canonicalize_response(response: &Value) -> Result<Value, String> {
    match response {
        Value::Object(map) => {
            let mut m = map.clone();
            m.remove("authoredSignatures");
            Ok(sort_json_keys(Value::Object(m)))
        }
        _ => Err("response must be a JSON object".to_string()),
    }
}

/// Recursively sort all JSON object keys for deterministic serialization (JCS-lite).
fn sort_json_keys(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sorted: Vec<_> = map.into_iter().collect();
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            let sorted_map: serde_json::Map<String, Value> = sorted
                .into_iter()
                .map(|(k, v)| (k, sort_json_keys(v)))
                .collect();
            Value::Object(sorted_map)
        }
        Value::Array(arr) => Value::Array(arr.into_iter().map(sort_json_keys).collect()),
        other => other,
    }
}

pub fn build_signed_payload(
    response: &Value,
    algorithm: DigestAlgorithm,
) -> Result<SignedPayload, String> {
    let canonical = canonicalize_response(response)?;
    let canonical_bytes =
        serde_json::to_vec(&canonical).map_err(|e| format!("canonicalization failed: {e}"))?;

    let mut domain_separated = DOMAIN_SEPARATION.as_bytes().to_vec();
    domain_separated.extend_from_slice(&canonical_bytes);

    let digest = compute_digest(&domain_separated, algorithm);

    Ok(SignedPayload {
        canonical_bytes: domain_separated,
        digest_algorithm: algorithm,
        digest,
    })
}

pub fn compute_digest(bytes: &[u8], algorithm: DigestAlgorithm) -> String {
    match algorithm {
        DigestAlgorithm::Sha256 => {
            let hash = Sha256::digest(bytes);
            hex::encode(hash)
        }
        DigestAlgorithm::Sha384 => {
            let hash = Sha384::digest(bytes);
            hex::encode(hash)
        }
        DigestAlgorithm::Sha512 => {
            let hash = Sha512::digest(bytes);
            hex::encode(hash)
        }
    }
}

pub fn verify_signed_payload_digest(
    response: &Value,
    expected_digest: &str,
    algorithm_str: &str,
) -> Result<bool, String> {
    let algorithm = DigestAlgorithm::from_str(algorithm_str)?;
    let payload = build_signed_payload(response, algorithm)?;
    Ok(payload.digest.eq_ignore_ascii_case(expected_digest))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_canonicalize_omits_authored_signatures() {
        let response = json!({
            "$formspecResponse": "1.0",
            "id": "resp-001",
            "definitionUrl": "https://example.org/forms/test",
            "definitionVersion": "1.0.0",
            "status": "completed",
            "data": { "name": "Ada" },
            "authored": "2026-05-08T12:00:00Z",
            "authoredSignatures": [{ "signatureId": "sig-001" }]
        });

        let canonical = canonicalize_response(&response).unwrap();
        assert!(canonical.get("authoredSignatures").is_none());
        assert_eq!(canonical["id"], "resp-001");
        assert_eq!(canonical["data"]["name"], "Ada");
    }

    #[test]
    fn test_build_signed_payload_produces_stable_digest() {
        let response = json!({
            "$formspecResponse": "1.0",
            "id": "resp-001",
            "definitionUrl": "https://example.org/forms/test",
            "definitionVersion": "1.0.0",
            "status": "completed",
            "data": { "name": "Ada" },
            "authored": "2026-05-08T12:00:00Z"
        });

        let payload1 = build_signed_payload(&response, DigestAlgorithm::Sha256).unwrap();
        let payload2 = build_signed_payload(&response, DigestAlgorithm::Sha256).unwrap();

        assert_eq!(payload1.digest, payload2.digest, "digest must be stable");
        assert_eq!(payload1.digest.len(), 64, "sha-256 produces 64 hex chars");
    }

    #[test]
    fn test_digest_changes_when_payload_changes() {
        let response1 = json!({
            "$formspecResponse": "1.0",
            "id": "resp-001",
            "data": { "name": "Ada" },
            "definitionUrl": "https://example.org/forms/test",
            "definitionVersion": "1.0.0",
            "status": "completed",
            "authored": "2026-05-08T12:00:00Z"
        });

        let mut response2 = response1.clone();
        response2["data"]["name"] = json!("Bob");

        let p1 = build_signed_payload(&response1, DigestAlgorithm::Sha256).unwrap();
        let p2 = build_signed_payload(&response2, DigestAlgorithm::Sha256).unwrap();

        assert_ne!(
            p1.digest, p2.digest,
            "different data yields different digest"
        );
    }

    #[test]
    fn test_co_signature_stability() {
        let base = json!({
            "$formspecResponse": "1.0",
            "id": "resp-001",
            "definitionUrl": "https://example.org/forms/test",
            "definitionVersion": "1.0.0",
            "status": "completed",
            "data": { "name": "Ada" },
            "authored": "2026-05-08T12:00:00Z"
        });

        let digest_base = build_signed_payload(&base, DigestAlgorithm::Sha256).unwrap();

        let mut with_one_sig = base.clone();
        with_one_sig["authoredSignatures"] = json!([{ "signatureId": "sig-001" }]);
        let digest_one = build_signed_payload(&with_one_sig, DigestAlgorithm::Sha256).unwrap();

        let mut with_two_sigs = base.clone();
        with_two_sigs["authoredSignatures"] = json!([
            { "signatureId": "sig-001" },
            { "signatureId": "sig-002" }
        ]);
        let digest_two = build_signed_payload(&with_two_sigs, DigestAlgorithm::Sha256).unwrap();

        assert_eq!(digest_base.digest, digest_one.digest);
        assert_eq!(digest_base.digest, digest_two.digest);
    }

    #[test]
    fn test_verify_signed_payload_digest() {
        let response = json!({
            "$formspecResponse": "1.0",
            "id": "resp-001",
            "definitionUrl": "https://example.org/forms/test",
            "definitionVersion": "1.0.0",
            "status": "completed",
            "data": { "name": "Ada" },
            "authored": "2026-05-08T12:00:00Z"
        });

        let payload = build_signed_payload(&response, DigestAlgorithm::Sha256).unwrap();
        assert!(verify_signed_payload_digest(&response, &payload.digest, "sha-256").unwrap());

        let wrong = payload
            .digest
            .chars()
            .map(|c| if c == 'a' { 'b' } else { c })
            .collect::<String>();
        assert!(!verify_signed_payload_digest(&response, &wrong, "sha-256").unwrap());
    }

    #[test]
    fn test_key_order_does_not_affect_digest() {
        let ordered = json!({
            "$formspecResponse": "1.0",
            "id": "resp-001",
            "data": { "z": 1, "a": 2 },
            "authored": "2026-05-08T12:00:00Z"
        });
        let reversed = json!({
            "authored": "2026-05-08T12:00:00Z",
            "data": { "a": 2, "z": 1 },
            "id": "resp-001",
            "$formspecResponse": "1.0"
        });
        let d1 = build_signed_payload(&ordered, DigestAlgorithm::Sha256).unwrap();
        let d2 = build_signed_payload(&reversed, DigestAlgorithm::Sha256).unwrap();
        assert_eq!(
            d1.digest, d2.digest,
            "digests must be identical regardless of JSON key insertion order"
        );
    }
}
