/** @filedesc ADR 0150 §4.4/§5.4 posture admission matchers shared by app-graph and lint parity. */

export interface PostureModuleRef {
  id: string;
  version: string;
  publisher?: string;
  lockHash?: string;
}

export type PostureModuleField = 'version' | 'publisher' | 'lockHash';

export type ModulePostureAdmissionResult =
  | { admitted: true }
  | { admitted: false; reason: 'not-listed' }
  | { admitted: false; reason: 'field-mismatch'; field: PostureModuleField };

/**
 * Evaluate whether a document `modules[]` entry is admitted by posture `allowedModules[]`.
 * When `allowedModules` is absent or empty, admission is permissive (no posture constraint).
 */
export function evaluateModulePostureAdmission(
  documentRef: PostureModuleRef,
  allowedModules: readonly PostureModuleRef[] | undefined,
): ModulePostureAdmissionResult {
  if (!allowedModules || allowedModules.length === 0) {
    return { admitted: true };
  }

  for (const postureEntry of allowedModules) {
    const fieldMismatch = postureEntryFieldMismatch(postureEntry, documentRef);
    if (fieldMismatch === 'id-mismatch') {
      continue;
    }
    if (fieldMismatch === null) {
      return { admitted: true };
    }
    return { admitted: false, reason: 'field-mismatch', field: fieldMismatch };
  }

  return { admitted: false, reason: 'not-listed' };
}

function postureEntryFieldMismatch(
  postureEntry: PostureModuleRef,
  documentRef: PostureModuleRef,
): PostureModuleField | 'id-mismatch' | null {
  if (postureEntry.id !== documentRef.id) {
    return 'id-mismatch';
  }
  if (postureEntry.version !== documentRef.version) {
    return 'version';
  }
  if (
    postureEntry.publisher !== undefined
    && postureEntry.publisher !== documentRef.publisher
  ) {
    return 'publisher';
  }
  if (
    postureEntry.lockHash !== undefined
    && postureEntry.lockHash !== documentRef.lockHash
  ) {
    return 'lockHash';
  }
  return null;
}

/** Binary actor URN admission per ADR 0150 §5.4. Empty/absent allowlist is permissive. */
export function evaluateActorPostureAdmission(
  actorUrn: string,
  allowedActors: readonly string[] | undefined,
): boolean {
  if (!allowedActors || allowedActors.length === 0) {
    return true;
  }
  return allowedActors.includes(actorUrn);
}
