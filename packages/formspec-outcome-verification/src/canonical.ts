/** @filedesc RFC 8785 canonical JSON and SHA-256 helpers. */

import canonicalize from "canonicalize";

import type { FiniteJson } from "./types.js";

function assertFiniteJson(
  value: unknown,
  path = "$"
): asserts value is FiniteJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertFiniteJson(entry, `${path}[${index}]`)
    );
    return;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} contains a host object`);
    }
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        throw new TypeError(`${path}.${key} is undefined`);
      }
      assertFiniteJson(entry, `${path}.${key}`);
    }
    return;
  }
  throw new TypeError(`${path} is not finite JSON`);
}

export function canonicalJson(value: unknown): string {
  assertFiniteJson(value);
  const result = canonicalize(value);
  if (result === undefined) {
    throw new TypeError("value cannot be represented as canonical JSON");
  }
  return result;
}

export function canonicalJsonEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

export async function sha256Digest(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `sha256:${hex}`;
}
