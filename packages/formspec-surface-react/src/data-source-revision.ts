/** @filedesc Host scheduling hints for qualified Surface data consumers. */
import type { DataSourceLoadRequest } from '@formspec-org/surface';

/**
 * Pure scheduling hint, evaluated on host renders. It grants no authority and
 * starts no subscription. Keep the loading/admission ports stable when using it.
 */
export type DataSourceRevisionSelector = (
  request: DataSourceLoadRequest,
) => string | number | undefined;

export function selectDataSourceRevisions(
  requests: readonly DataSourceLoadRequest[],
  select: DataSourceRevisionSelector | undefined,
): { key: string; failures: readonly DataSourceLoadRequest[] } {
  if (!select) return { key: '', failures: [] };
  const revisions: unknown[] = [];
  const failures: DataSourceLoadRequest[] = [];
  for (const request of requests) {
    try {
      const revision = select(request);
      if (revision !== undefined && typeof revision !== 'string'
        && !(typeof revision === 'number' && Number.isFinite(revision))) {
        throw new TypeError('Invalid data source revision');
      }
      revisions.push([typeof revision, revision]);
    } catch {
      revisions.push(['invalid', request.descriptor.catalogRef, request.descriptor.sourceRef]);
      failures.push(request);
    }
  }
  return { key: JSON.stringify(revisions), failures };
}
