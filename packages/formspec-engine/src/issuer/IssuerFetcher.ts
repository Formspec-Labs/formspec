/** @filedesc Issuer document HTTP fetcher port and default fetch-backed adapter. */

import type { Issuer } from './types';

export interface IssuerFetchOptions {
    ifNoneMatch?: string;
}

export interface IssuerFetchedResult {
    issuer: Issuer;
    rawBytes: Uint8Array;
    etag?: string;
    cacheControl?: string;
    notModified?: false;
}

export interface IssuerNotModifiedResult {
    notModified: true;
    etag?: string;
    cacheControl?: string;
}

export type IssuerFetchResult = IssuerFetchedResult | IssuerNotModifiedResult;

export interface IssuerFetcher {
    fetch(url: string, options?: IssuerFetchOptions): Promise<IssuerFetchResult>;
}

export interface FetchIssuerFetcherOptions {
    fetch?: typeof globalThis.fetch;
}

export class FetchIssuerFetcher implements IssuerFetcher {
    private readonly _fetch: typeof globalThis.fetch;

    public constructor(options: FetchIssuerFetcherOptions = {}) {
        const fetchImpl = options.fetch ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            throw new Error('FetchIssuerFetcher requires a fetch implementation');
        }
        this._fetch = fetchImpl;
    }

    public async fetch(url: string, options: IssuerFetchOptions = {}): Promise<IssuerFetchResult> {
        const init: RequestInit = {};
        if (options.ifNoneMatch) {
            init.headers = { 'if-none-match': options.ifNoneMatch };
        }
        const response = await this._fetch(url, init);
        if (response.status === 304) {
            return {
                notModified: true,
                etag: response.headers.get('etag') ?? options.ifNoneMatch,
                cacheControl: response.headers.get('cache-control') ?? undefined,
            };
        }
        if (!response.ok) {
            throw new Error(`Issuer fetch ${url} returned ${response.status}`);
        }
        const rawBytes = new Uint8Array(await response.arrayBuffer());
        const issuer = JSON.parse(new TextDecoder().decode(rawBytes)) as Issuer;
        await verifyContentHash(issuer, rawBytes);
        return {
            issuer,
            rawBytes,
            etag: response.headers.get('etag') ?? undefined,
            cacheControl: response.headers.get('cache-control') ?? undefined,
        };
    }
}

async function verifyContentHash(issuer: Issuer, rawBytes: Uint8Array): Promise<void> {
    const match = /\+sha256-([0-9a-f]{64})$/.exec(issuer.version);
    if (!match) {
        return;
    }
    const expected = match[1];
    const digestBytes = rawBytes.buffer.slice(
        rawBytes.byteOffset,
        rawBytes.byteOffset + rawBytes.byteLength,
    ) as ArrayBuffer;
    const actualBuffer = await crypto.subtle.digest('SHA-256', digestBytes);
    const actual = Array.from(new Uint8Array(actualBuffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    if (actual !== expected) {
        throw new Error(
            `Issuer ${issuer.url} content hash mismatch (expected ${expected}, got ${actual})`,
        );
    }
}
