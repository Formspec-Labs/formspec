/** @filedesc Canonical Need-anchor extraction shared by Surface planners and bindings. */

const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@[1-9][0-9]*$/;

export function isCanonicalNeedAnchor(value: unknown): value is string {
  return typeof value === 'string' && NEED_ANCHOR.test(value);
}

export function generationNeedAnchors(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const generation = (value as Record<string, unknown>)['x-generation'];
  if (!generation || typeof generation !== 'object' || Array.isArray(generation)) {
    return [];
  }
  const anchors = (generation as Record<string, unknown>).anchors;
  return Array.isArray(anchors)
    ? anchors.filter(isCanonicalNeedAnchor)
    : [];
}

export function mergeNeedAnchors(
  ...groups: readonly (readonly string[] | undefined)[]
): string[] {
  const merged: string[] = [];
  for (const group of groups) {
    for (const anchor of group ?? []) {
      if (isCanonicalNeedAnchor(anchor) && !merged.includes(anchor)) {
        merged.push(anchor);
      }
    }
  }
  return merged;
}
