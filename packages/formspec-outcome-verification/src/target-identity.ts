/** @filedesc Canonical validation and hashing for environment-owned targets. */

import { canonicalJsonEqual, sha256Digest } from "./canonical.js";
import type { OutcomeTargetRequest, ResolvedTargetIdentity } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const admitted = new Set(keys);
  return Object.keys(value).every((key) => admitted.has(key));
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function implementationIsClosed(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "version", "digest"]) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.version === "string" &&
    value.version.length > 0 &&
    isDigest(value.digest)
  );
}

export function digestOutcomeImplementationSet(
  implementations: ResolvedTargetIdentity["implementations"]
): Promise<string> {
  return sha256Digest(implementations);
}

export function digestResolvedTargetIdentity(input: {
  class: ResolvedTargetIdentity["class"];
  ref: string;
  buildRef: string;
  buildDigest: string;
  implementationSetDigest: string;
}): Promise<string> {
  return sha256Digest(input);
}

export async function resolvedTargetIdentityIsValid(
  identity: ResolvedTargetIdentity,
  request?: OutcomeTargetRequest
): Promise<boolean> {
  if (
    !isRecord(identity) ||
    !hasOnlyKeys(identity, [
      "class",
      "ref",
      "buildRef",
      "buildDigest",
      "implementations",
      "implementationSetDigest",
      "targetIdentityDigest",
    ]) ||
    (identity.class !== "preview" && identity.class !== "test") ||
    typeof identity.ref !== "string" ||
    identity.ref.length === 0 ||
    typeof identity.buildRef !== "string" ||
    identity.buildRef.length === 0 ||
    !isDigest(identity.buildDigest) ||
    !isRecord(identity.implementations) ||
    !hasOnlyKeys(identity.implementations, [
      "host",
      "renderer",
      "runner",
      "runtime",
      "verifier",
      "adapter",
    ]) ||
    !Object.values(identity.implementations).every(implementationIsClosed) ||
    !isDigest(identity.implementationSetDigest) ||
    !isDigest(identity.targetIdentityDigest)
  ) {
    return false;
  }
  if (
    request !== undefined &&
    !canonicalJsonEqual({ class: identity.class, ref: identity.ref }, request)
  ) {
    return false;
  }
  const implementationSetDigest = await digestOutcomeImplementationSet(
    identity.implementations
  );
  const targetIdentityDigest = await digestResolvedTargetIdentity({
    class: identity.class,
    ref: identity.ref,
    buildRef: identity.buildRef,
    buildDigest: identity.buildDigest,
    implementationSetDigest,
  });
  return (
    identity.implementationSetDigest === implementationSetDigest &&
    identity.targetIdentityDigest === targetIdentityDigest
  );
}
