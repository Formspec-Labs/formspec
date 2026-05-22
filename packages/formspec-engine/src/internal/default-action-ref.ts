/**
 * @filedesc Internal-only Response Actions intent-fallback helper.
 *
 * Response Actions §10 + §13.6 prohibit implicit default Actions and
 * free-string fallbacks. This helper exists ONLY as a private bridge for
 * the reference renderers (formspec-react, formspec-webcomponent) that
 * historically synthesized a SubmitButton-driven flow. It MUST NOT appear
 * on the engine's public contract surface; callers that import it
 * acknowledge they are crossing into renderer-internal territory.
 *
 * Renderers using this helper MUST treat an empty return value as the
 * absence of a submit-intent Action — they MUST NOT inject an ActionButton
 * referencing the empty string (that would render an inert button forever
 * and violate §10's no-free-string-fallback rule). The canonical guard is:
 *
 *     const actionRef = defaultActionRefForIntent(doc, 'submit');
 *     if (actionRef) {
 *         ensureActionButton(plan, nextId, { actionRef });
 *     }
 */
import type { ResponseActionsDocumentInput, StandardResponseActionIntent } from '../response-actions.js';
import { findResponseActionByIntent } from '../response-actions.js';

export function defaultActionRefForIntent(
    document: ResponseActionsDocumentInput | null | undefined,
    intent: StandardResponseActionIntent = 'submit',
    fallback = '',
): string {
    return findResponseActionByIntent(document, intent)?.id ?? fallback;
}
