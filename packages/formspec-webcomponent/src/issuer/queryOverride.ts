/** @filedesc Parse `?_issuer=` query-parameter override with origin allowlist. */
import type { IssuerSource } from '@formspec-org/engine/render';

export function parseQueryIssuerOverride(
    pageUrl: URL,
    allowedOrigins: readonly string[],
): IssuerSource | undefined {
    const raw = pageUrl.searchParams.get('_issuer');
    if (!raw || allowedOrigins.length === 0) {
        return undefined;
    }

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return undefined;
    }

    if (!allowedOrigins.includes(url.origin)) {
        return undefined;
    }
    return { kind: 'url', url: url.toString(), source: 'host-query' };
}
