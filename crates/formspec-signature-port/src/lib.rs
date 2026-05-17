// Rust guideline compliant 2026-02-21
//! Formspec signature facade over generic integrity signing ports.
//!
//! Generic verifier, key-resolution, method-registry, and receipt-signing
//! machinery lives in `integrity-signature`. This crate remains as the
//! Formspec-owned facade for existing consumers and for Formspec method URI
//! semantics.

#![forbid(unsafe_code)]

#[doc(inline)]
pub use integrity_signature::{
    AdapterInfo, ClockHandle, ClockPort, FixedClock, KeyInfo, KeyRef, KeyResolver,
    KeyResolverError, KeyResolverHandle, KidOrThumbprint, MethodRegistry, MethodRegistryEntry,
    ReceiptSigner, ReceiptSignerError, ReceiptSignerHandle, RegistryEntry, RevocationContext,
    SemVer, SignatureMethodRegistry, StaticKeyResolver, SystemClock, TimestampingContext,
    TrellisAnchorRef, Uri, VerificationContext, VerificationReceipt, VerificationResult, Verifier,
    VerifierError, VerifyRequest, WitnessContext, utc_to_rfc3339_millis, utc_to_rfc3339_seconds,
};
