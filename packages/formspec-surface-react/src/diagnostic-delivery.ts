/**
 * @filedesc Semantic diagnostic comparison and the React subscription boundary.
 */
import { useEffect, useRef } from 'react';
import type { SurfaceDiagnostic } from '@formspec-org/surface';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Compare JSON-compatible values without making object insertion order
 * observable. Arrays remain ordered because diagnostic order and evidence
 * sequences carry meaning.
 */
function diagnosticValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => diagnosticValueEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      diagnosticValueEqual(left[key], right[key]),
  );
}

export function diagnosticListsEqual(
  left: readonly SurfaceDiagnostic[],
  right: readonly SurfaceDiagnostic[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((diagnostic, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      diagnostic.code === other.code &&
      diagnostic.severity === other.severity &&
      diagnostic.message === other.message &&
      diagnosticValueEqual(diagnostic.site, other.site) &&
      diagnosticValueEqual(diagnostic.details, other.details)
    );
  });
}

/**
 * Deliver one complete diagnostic list per subscription and semantic change.
 *
 * React replays effects in development StrictMode. The ref intentionally
 * survives that replay, so it represents one logical mounted subscription
 * rather than one effect setup.
 */
export function useDiagnosticDelivery(
  diagnostics: readonly SurfaceDiagnostic[],
  callback: ((diagnostics: readonly SurfaceDiagnostic[]) => void) | undefined,
): void {
  const subscription = useRef<{
    subscribed: boolean;
    delivered: readonly SurfaceDiagnostic[] | undefined;
  }>({ subscribed: false, delivered: undefined });

  useEffect(() => {
    const previous = subscription.current;
    const subscribed = callback !== undefined;
    const newSubscription = subscribed && !previous.subscribed;
    previous.subscribed = subscribed;
    if (!subscribed) return;

    const changed =
      previous.delivered === undefined ||
      !diagnosticListsEqual(previous.delivered, diagnostics);
    if (!newSubscription && !changed) return;

    previous.delivered = diagnostics;
    callback(diagnostics);
  }, [callback, diagnostics]);
}
