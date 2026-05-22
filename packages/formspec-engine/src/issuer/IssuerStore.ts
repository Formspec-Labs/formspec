/** @filedesc Issuer fetch, cache, cascade, and parent-chain walk with cycle/depth guards. */

import type { Issuer, IssuerSource, ResolvedIssuer } from './types';
import type { IssuerFetcher } from './IssuerFetcher';

export const MAX_CHAIN_DEPTH = 8;

export interface IssuerResolveInput {
    definitionIssuer?: IssuerSource;
    hostOverride?: IssuerSource;
}

export class IssuerStore {
    private readonly _cache = new Map<string, Issuer>();

    public constructor(private readonly _fetcher: IssuerFetcher) {}

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
            this._cache.set(source.issuer.url, source.issuer);
            return source.issuer;
        }
        return this.fetchCached(source.url);
    }

    private async fetchCached(url: string): Promise<Issuer> {
        const cached = this._cache.get(url);
        if (cached) {
            return cached;
        }
        const { issuer } = await this._fetcher.fetch(url);
        this._cache.set(url, issuer);
        if (issuer.url !== url) {
            this._cache.set(issuer.url, issuer);
        }
        return issuer;
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

function unbranded(): Issuer {
    return {
        $formspecIssuer: '1.0',
        url: 'about:unbranded',
        version: '0.0.0',
        name: '',
        kind: 'organization',
    };
}
