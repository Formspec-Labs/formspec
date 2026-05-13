use std::{fs, path::PathBuf};

pub mod canonicalization_vectors;

pub struct FixtureBundle {
    pub dir: PathBuf,
    pub id: String,
    pub name: String,
    pub description: String,
    pub manifest: Manifest,
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "kebab-case")]
pub struct Manifest {
    pub bundle: BundleMeta,
    #[serde(rename = "required-adapters")]
    #[serde(default)]
    pub required_adapters: Adapters,
    #[serde(rename = "required-files")]
    #[serde(default)]
    pub required_files: RequiredFiles,
    #[serde(rename = "expected-outcomes")]
    pub expected_outcomes: ExpectedOutcomes,
    #[serde(rename = "cross-layer-byte-equality")]
    #[serde(default)]
    pub cross_layer_byte_equality: CrossLayerByteEquality,
}

#[derive(serde::Deserialize, Clone)]
pub struct BundleMeta {
    pub id: String,
    pub name: String,
    pub description: String,
}

#[derive(serde::Deserialize, Clone, Default)]
pub struct Adapters {
    #[serde(default)]
    pub adapters: Vec<String>,
}

#[derive(serde::Deserialize, Clone, Default)]
#[serde(rename_all = "snake_case")]
pub struct RequiredFiles {
    #[serde(default)]
    pub formspec_response: bool,
    #[serde(default)]
    pub wos_provenance: bool,
    #[serde(default)]
    pub trellis_events: bool,
    #[serde(default)]
    pub trellis_export: bool,
    #[serde(default)]
    pub verification_receipt: bool,
    #[serde(default)]
    pub posture_declaration: bool,
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "kebab-case")]
pub struct ExpectedOutcomes {
    pub formspec: FormspecOutcome,
    #[serde(default)]
    pub wos: Option<WosOutcome>,
    #[serde(default)]
    pub trellis: Option<TrellisOutcome>,
}

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct FormspecOutcome {
    pub schema_valid: bool,
    #[serde(default)]
    pub semantic_valid: Option<bool>,
    #[serde(default)]
    pub expected_errors: Vec<String>,
    #[serde(default)]
    pub source_of_truth_invariants: SourceOfTruthInvariants,
}

#[derive(serde::Deserialize, Clone, Default)]
#[serde(rename_all = "snake_case")]
pub struct SourceOfTruthInvariants {
    #[serde(default)]
    pub response_id_matches_signed_payload: Option<bool>,
    #[serde(default)]
    pub definition_url_matches: Option<bool>,
    #[serde(default)]
    pub definition_version_matches: Option<bool>,
    #[serde(default)]
    pub signed_at_in_signed_payload: Option<bool>,
}

#[derive(serde::Deserialize, Clone)]
pub struct WosOutcome {
    #[serde(default)]
    pub present: Option<bool>,
    #[serde(default)]
    pub record_kind: Option<String>,
    #[serde(default)]
    pub primitive_verification_status: Option<String>,
    #[serde(default)]
    pub admission_failed_reason: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
pub struct TrellisOutcome {
    #[serde(default)]
    pub present: Option<bool>,
    #[serde(default)]
    pub custody_hook_present: Option<bool>,
    #[serde(default)]
    pub uca_corroborated: Option<bool>,
    #[serde(default)]
    pub export_present: Option<bool>,
}

#[derive(serde::Deserialize, Clone, Default)]
#[serde(rename_all = "snake_case")]
pub struct CrossLayerByteEquality {
    #[serde(default)]
    pub formspec_signed_payload_digest_equals_wos: Option<bool>,
    #[serde(default)]
    pub signature_value_bytes_equals_trellis_uca: Option<bool>,
    #[serde(default)]
    pub verification_receipt_bytes_identical: Option<bool>,
    #[serde(default)]
    pub response_hash_equals_export: Option<bool>,
}

pub fn discover_bundles(root: &str) -> Result<Vec<FixtureBundle>, String> {
    let cross_stack_dir = PathBuf::from(root);
    let mut bundles = Vec::new();

    let entries = fs::read_dir(&cross_stack_dir)
        .map_err(|e| format!("failed to read cross-stack dir {cross_stack_dir:?}: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.toml");
        if !manifest_path.exists() {
            continue;
        }

        let toml_str = fs::read_to_string(&manifest_path)
            .map_err(|e| format!("failed to read manifest at {manifest_path:?}: {e}"))?;
        let manifest = toml::from_str::<Manifest>(&toml_str)
            .map_err(|e| format!("failed to parse manifest at {manifest_path:?}: {e}"))?;

        bundles.push(FixtureBundle {
            id: manifest.bundle.id.clone(),
            name: manifest.bundle.name.clone(),
            description: manifest.bundle.description.clone(),
            dir: path.clone(),
            manifest,
        });
    }

    bundles.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(bundles)
}

pub fn validate_manifest_schema(manifest_path: &std::path::Path) -> Result<(), String> {
    let schema_path = manifest_path
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("manifest.schema.json"))
        .ok_or("cannot locate manifest.schema.json")?;

    let schema_str =
        fs::read_to_string(&schema_path).map_err(|e| format!("cannot read schema: {e}"))?;
    let schema: serde_json::Value =
        serde_json::from_str(&schema_str).map_err(|e| format!("invalid schema json: {e}"))?;

    let toml_str = fs::read_to_string(manifest_path).map_err(|e| format!("cannot read: {e}"))?;
    let manifest_json =
        toml::from_str::<toml::Value>(&toml_str).map_err(|e| format!("toml parse error: {e}"))?;
    let manifest_value =
        serde_json::to_value(&manifest_json).map_err(|e| format!("conversion error: {e}"))?;

    let validator =
        jsonschema::validator_for(&schema).map_err(|e| format!("schema compile error: {e}"))?;

    validator
        .validate(&manifest_value)
        .map_err(|e| format!("schema validation failed for {manifest_path:?}: {e}"))
}

pub fn raw_manifest_paths(cross_stack_root: &str) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    let entries = fs::read_dir(cross_stack_root)
        .map_err(|e| format!("failed to read cross-stack dir {cross_stack_root:?}: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.toml");
        if manifest_path.exists() {
            paths.push(manifest_path);
        }
    }
    paths.sort();
    Ok(paths)
}

pub fn all_manifest_schema_paths(cross_stack_root: &str) -> Result<Vec<PathBuf>, String> {
    raw_manifest_paths(cross_stack_root)
}
