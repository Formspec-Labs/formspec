/** @filedesc Per-item help link — the "Help me answer this question" affordance for human References. */
import { admitFieldHelpUri, type FieldHelpReference } from '@formspec-org/layout';

/** Default affordance label when the Locale has no `<key>.helpLabel` (References spec §7). */
export const DEFAULT_FIELD_HELP_LABEL = 'Help me answer this question';

/**
 * The link for an item's human References, or `null` when none of them has an admissible destination.
 *
 * References arrive already filtered and ordered by `resolveFieldHelp`; this picks the first one the URI
 * policy admits — HTTPS or same-app relative, the same rule the React renderer applies (References spec §7).
 * A reference the policy refuses never becomes a dead link.
 *
 * `usa-link` sits beside the Formspec class so the USWDS and default adapters both style it without a seam.
 */
export function createFieldHelpLink(references: readonly FieldHelpReference[]): HTMLAnchorElement | null {
    for (const reference of references) {
        const href = reference.uri ? admitFieldHelpUri(reference.uri) : undefined;
        if (!href) continue;
        const link = document.createElement('a');
        link.className = 'formspec-field-help-link usa-link';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener';
        if (reference.id) link.dataset.referenceId = reference.id;
        if (reference.needAnchors.length > 0) link.dataset.needAnchors = reference.needAnchors.join(' ');
        return link;
    }
    return null;
}
