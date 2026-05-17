/** @filedesc Dynamic property set/delete on JSON-shaped records. */

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
