/** @filedesc Canonical Need-anchor extraction shared by Surface planners and bindings. */
import { isPlainJsonArray, isPlainJsonObject } from '@formspec-org/engine/render';

const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@[1-9][0-9]*$/;

export function isCanonicalNeedAnchor(value: unknown): value is string {
  return typeof value === 'string' && NEED_ANCHOR.test(value);
}

function ownEnumerableDataProperty(value: unknown, key: string): { present: boolean; value: unknown } {
  if (!isPlainJsonObject(value)) return { present: false, value: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) {
    return { present: false, value: undefined };
  }
  return { present: true, value: descriptor.value };
}

export function generationNeedAnchors(value: unknown): string[] {
  const genProp = ownEnumerableDataProperty(value, 'x-generation');
  if (!genProp.present) return [];
  const anchorsProp = ownEnumerableDataProperty(genProp.value, 'anchors');
  if (!anchorsProp.present || !isPlainJsonArray(anchorsProp.value)) return [];
  const anchors: string[] = [];
  for (let index = 0; index < anchorsProp.value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(anchorsProp.value, String(index));
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !descriptor.enumerable) {
      return [];
    }
    if (isCanonicalNeedAnchor(descriptor.value)) {
      anchors.push(descriptor.value);
    }
  }
  return anchors;
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
