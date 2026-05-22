/** @filedesc Parse `?_issuer=` query-parameter override with origin allowlist. */
import type { IssuerSource } from '@formspec-org/engine/render';

export function parseQueryIssuerOverride(
    pageUrl: URL,
    allowedOrigins: readonly string[],
): IssuerSource | undefined {
    const raw = pageUrl.searchParams.get('_issuer');
    if (!raw) {
        return undefined;
    }
    if (allowedOrigins.length === 0) {
        warnIgnored('no issuer allowlist configured');
        return undefined;
    }

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        warnIgnored('issuer URL is malformed');
        return undefined;
    }

    if (!allowedOrigins.includes(url.origin)) {
        warnIgnored(`origin not allowlisted: ${url.origin}`);
        return undefined;
    }
    return { kind: 'url', url: url.toString(), source: 'host-query' };
}

function warnIgnored(reason: string): void {
    globalThis.console?.warn?.(`Formspec Issuer query override ignored: ${reason}`);
}
