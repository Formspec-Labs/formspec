//! Formspec-side harness for the cross-stack fixture corpus.
//!
//! Two responsibilities:
//!
//! 1. [`canonicalization_vectors`] pins lowercase-hex SHA-256 digests for the
//!    Formspec response-handoff and response-signed-payload preimages owned by
//!    `integrity-canonical`. These vectors are consumed by `formspec-server`
//!    integration tests and any future cross-stack verifier that needs
//!    byte-stable expected values. The pinned hex is asserted to match
//!    `integrity-canonical` recomputation by this crate's own unit test
//!    (`pinned_hex_matches_integrity_canonical_recomputation`).
//!
//! 2. Re-exports the shared D4 fixture bundle walker from
//!    [`integrity_bundle_fixtures`] so downstream callers see one harness
//!    surface (manifest discovery + schema validation + canonicalization
//!    vectors) instead of pulling the integrity-stack crate directly.
//!
//! # Re-exports
//!
//! The glob below forwards the bundle walker's public surface:
//! [`integrity_bundle_fixtures::FixtureBundle`],
//! [`integrity_bundle_fixtures::Manifest`] (+ nested
//! [`integrity_bundle_fixtures::BundleMeta`],
//! [`integrity_bundle_fixtures::ExpectedOutcomes`],
//! [`integrity_bundle_fixtures::RequiredFiles`],
//! [`integrity_bundle_fixtures::CrossLayerByteEquality`], etc.) and the
//! functions [`integrity_bundle_fixtures::discover_bundles`],
//! [`integrity_bundle_fixtures::validate_manifest_schema`],
//! [`integrity_bundle_fixtures::all_manifest_schema_paths`],
//! [`integrity_bundle_fixtures::raw_manifest_paths`]. Kept as a glob because
//! the underlying surface is small, intentionally co-evolving, and the harness
//! has no reason to gate which items participate.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod canonicalization_vectors;

pub use integrity_bundle_fixtures::*;
