/** @filedesc Dynamic property set/delete on JSON-shaped records. */

/** Typed schema object as a mutable string-keyed record (one assertion at the seam). */
export function asMutableRecord(target: object): Record<string, unknown> {
  return target as Record<string, unknown>;
}

export function setRecordProperty(
  target: Record<string, unknown>,
  property: string,
  value: unknown,
): void {
  if (value === null || value === undefined) {
    delete target[property];
  } else {
    target[property] = value;
  }
}
