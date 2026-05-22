'use client';

/** @filedesc React issuer chrome and query-override helpers. */
import React, { useEffect, useState } from 'react';
import {
    resolveLangValue,
    type ContactPoint,
    type IFormEngine,
    type Issuer,
    type IssuerSource,
    type LogoVariant,
    type ResolvedIssuer,
} from '@formspec-org/engine';
import { useSignal } from './use-signal';

export interface IssuerChromeSlotProps {
    engine: IFormEngine;
    hostOrigin?: string;
    mode?: IssuerChromeMode;
    headerWidth?: IssuerChromeHeaderWidth;
}

type IssuerChromeMode = 'light' | 'dark' | 'high-contrast';
type IssuerChromeHeaderWidth = 'wide' | 'narrow';

export function IssuerChromeSlot({
    engine,
    hostOrigin,
    mode = 'light',
    headerWidth = 'wide',
}: IssuerChromeSlotProps) {
    const localeTick = useSignal(engine.localeSignal);
    const [resolved, setResolved] = useState<ResolvedIssuer | null>(null);

    useEffect(() => {
        let cancelled = false;
        setResolved(null);
        void engine.getResolvedIssuer()
            .then((next) => {
                if (!cancelled) {
                    setResolved(next.source === 'unbranded' ? null : next);
                }
            })
            .catch((error) => {
                console.warn('Issuer resolution failed', error);
            });
        return () => {
            cancelled = true;
        };
    }, [engine, localeTick]);

    if (!resolved || resolved.source === 'unbranded') {
        return <div className="fs-issuer-chrome-slot" />;
    }

    const issuer = resolved.primary;
    const locale = engine.getActiveLocale() || 'en';
    const defaultLanguage = issuer.defaultLanguage ?? 'en';
    const displayName = resolveLangValue(issuer.displayName ?? issuer.name, locale, defaultLanguage) ?? '';
    const logo = selectLogoVariant(issuer, { mode, headerWidth });
    const altText = logo
        ? resolveLangValue(logo.altText, locale, defaultLanguage) ?? displayName
        : undefined;
    const breadcrumb = resolveBreadcrumb(resolved, locale, defaultLanguage);
    const supportEmail = primaryContactEmail(issuer);

    return (
        <div className="fs-issuer-chrome-slot">
            <header className="fs-issuer-chrome" data-source={resolved.source}>
                {logo ? (
                    <img className="fs-issuer-logo" src={logo.url} alt={altText ?? ''} />
                ) : null}
                <div className="fs-issuer-text">
                    <div className="fs-issuer-name">{displayName}</div>
                    {breadcrumb ? (
                        <div className="fs-issuer-org-breadcrumb">{breadcrumb}</div>
                    ) : null}
                    {supportEmail ? (
                        <a className="fs-issuer-support" href={`mailto:${supportEmail}`}>
                            {supportEmail}
                        </a>
                    ) : null}
                </div>
                {resolved.source === 'host-query' ? (
                    <div className="fs-issuer-query-indicator" role="status">
                        {`Branding provided by ${hostOrigin ?? 'host'}`}
                    </div>
                ) : null}
            </header>
        </div>
    );
}

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

function selectLogoVariant(
    issuer: Issuer,
    ctx: { mode: IssuerChromeMode; headerWidth: IssuerChromeHeaderWidth },
): LogoVariant | undefined {
    const { primary, wordmark, monochrome } = issuer.logo ?? {};
    const dark = ctx.mode !== 'light';
    const narrow = ctx.headerWidth === 'narrow';
    const preferred = dark ? monochrome : narrow ? wordmark : primary;
    return preferred ?? primary ?? wordmark ?? monochrome;
}

function resolveBreadcrumb(
    resolved: ResolvedIssuer,
    locale: string,
    defaultLanguage: string,
): string | undefined {
    const parts: string[] = [];
    const organizationName = resolveLangValue(
        resolved.primary.organizationName,
        locale,
        defaultLanguage,
    );
    if (organizationName) {
        parts.push(organizationName);
    }

    for (const issuer of resolved.chain.slice(1)) {
        const name = resolveLangValue(
            issuer.displayName ?? issuer.name,
            locale,
            issuer.defaultLanguage ?? defaultLanguage,
        );
        if (name && !parts.includes(name)) {
            parts.push(name);
        }
    }

    return parts.length > 0 ? parts.join(' / ') : undefined;
}

function primaryContactEmail(issuer: Issuer): string | undefined {
    const contacts = contactPoints(issuer.contactPoint);
    return contacts.find((contact) => contact.contactType === 'customer support')?.email
        ?? contacts.find((contact) => contact.email != null)?.email;
}

function contactPoints(contactPoint: Issuer['contactPoint']): ContactPoint[] {
    if (!contactPoint) {
        return [];
    }
    return Array.isArray(contactPoint) ? contactPoint : [contactPoint];
}

function warnIgnored(reason: string): void {
    globalThis.console?.warn?.(`Formspec Issuer query override ignored: ${reason}`);
}
