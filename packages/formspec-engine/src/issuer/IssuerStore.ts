/** @filedesc Issuer fetch, cache, cascade, and parent-chain walk with cycle/depth guards. */

import type { Issuer, IssuerSource, ResolvedIssuer } from './types';
import type { IssuerFetchResult, IssuerFetcher } from './IssuerFetcher';

export const MAX_CHAIN_DEPTH = 8;
const DEFAULT_CACHE_MAX_AGE_MS = 3_600_000;

export interface IssuerResolveInput {
    definitionIssuer?: IssuerSource;
    hostOverride?: IssuerSource;
}

export interface IssuerStoreOptions {
    now?: () => number;
    defaultMaxAgeMs?: number;
}

interface CacheEntry {
    issuer: Issuer;
    etag?: string;
    cacheControl?: string;
    expiresAt: number;
}

export class IssuerStore {
    private readonly _cache = new Map<string, CacheEntry>();
    private readonly _now: () => number;
    private readonly _defaultMaxAgeMs: number;

    public constructor(
        private readonly _fetcher: IssuerFetcher,
        options: IssuerStoreOptions = {},
    ) {
        this._now = options.now ?? Date.now;
        this._defaultMaxAgeMs = options.defaultMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;
    }

    public invalidate(url: string): void {
        this._cache.delete(url);
    }

    public async resolve(input: IssuerResolveInput): Promise<ResolvedIssuer> {
        if (input.hostOverride) {
            const primary = await this.materialize(input.hostOverride);
            return this.walkChain(primary, 'host-embed');
        }
        if (input.definitionIssuer) {
            const primary = await this.materialize(input.definitionIssuer);
            return this.walkChain(primary, 'definition');
        }
        return { primary: unbranded(), chain: [], source: 'unbranded' };
    }

    private async materialize(source: IssuerSource): Promise<Issuer> {
        if (source.kind === 'inline') {
            this.storeFresh(source.issuer.url, {
                issuer: source.issuer,
                rawBytes: new Uint8Array(),
            });
            return source.issuer;
        }
        return this.fetchCached(source.url);
    }

    private async fetchCached(url: string): Promise<Issuer> {
        const cached = this._cache.get(url);
        if (cached && cached.expiresAt > this._now()) {
            return cached.issuer;
        }

        const result = await this._fetcher.fetch(
            url,
            cached?.etag ? { ifNoneMatch: cached.etag } : undefined,
        );
        if (result.notModified === true) {
            if (!cached) {
                throw new Error(`Issuer fetch ${url} returned 304 without a cached issuer`);
            }
            const refreshed = this.refreshCacheEntry(cached, result);
            this.storeEntry(url, refreshed);
            this.storeEntry(refreshed.issuer.url, refreshed);
            return refreshed.issuer;
        }

        this.storeFresh(url, result);
        return result.issuer;
    }

    private storeFresh(
        url: string,
        result: Exclude<IssuerFetchResult, { notModified: true }>,
    ): void {
        const now = this._now();
        const expiresAt = cacheExpiry(result.cacheControl, now, this._defaultMaxAgeMs);
        if (expiresAt === null) {
            this.invalidate(url);
            this.invalidate(result.issuer.url);
            return;
        }
        const entry: CacheEntry = {
            issuer: result.issuer,
            etag: result.etag,
            cacheControl: result.cacheControl,
            expiresAt,
        };
        this.storeEntry(url, entry);
        this.storeEntry(result.issuer.url, entry);
    }

    private refreshCacheEntry(entry: CacheEntry, result: IssuerFetchResult): CacheEntry {
        const now = this._now();
        const cacheControl = result.cacheControl ?? entry.cacheControl;
        const expiresAt = cacheExpiry(cacheControl, now, this._defaultMaxAgeMs);
        return {
            issuer: entry.issuer,
            etag: result.etag ?? entry.etag,
            cacheControl,
            expiresAt: expiresAt ?? now,
        };
    }

    private storeEntry(url: string, entry: CacheEntry): void {
        this._cache.set(url, entry);
    }

    private async walkChain(
        primary: Issuer,
        source: ResolvedIssuer['source'],
    ): Promise<ResolvedIssuer> {
        const chain: Issuer[] = [primary];
        const seen = new Set<string>([primary.url]);
        let cursor = primary;
        let degraded: ResolvedIssuer['degraded'];

        while (cursor.parentOrganization) {
            const parentUrl = cursor.parentOrganization;
            if (chain.length >= MAX_CHAIN_DEPTH) {
                degraded = { reason: 'depth-capped', atUrl: parentUrl };
                break;
            }
            if (seen.has(parentUrl)) {
                degraded = { reason: 'cycle-detected', atUrl: parentUrl };
                break;
            }
            try {
                const parent = await this.fetchCached(parentUrl);
                chain.push(parent);
                seen.add(parentUrl);
                cursor = parent;
            } catch {
                degraded = { reason: 'parent-fetch-failed', atUrl: parentUrl };
                break;
            }
        }

        return { primary, chain, source, degraded };
    }
}

function cacheExpiry(
    cacheControl: string | undefined,
    now: number,
    defaultMaxAgeMs: number,
): number | null {
    if (!cacheControl) {
        return now + defaultMaxAgeMs;
    }
    const directives = cacheControl
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    if (directives.includes('no-store')) {
        return null;
    }
    if (directives.includes('no-cache')) {
        return now;
    }
    const maxAge = directives
        .map((part) => /^max-age=(\d+)$/.exec(part))
        .find((match): match is RegExpExecArray => match !== null);
    if (maxAge) {
        return now + Number(maxAge[1]) * 1000;
    }
    return now + defaultMaxAgeMs;
}

function unbranded(): Issuer {
    return {
        $formspecIssuer: '1.0',
        url: 'about:unbranded',
        version: '0.0.0',
        name: '',
        kind: 'organization',
    };
}
