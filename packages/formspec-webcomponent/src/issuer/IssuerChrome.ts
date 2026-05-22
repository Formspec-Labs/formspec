/** @filedesc Issuer chrome render: name, logo, breadcrumb, contact, query-override indicator. */
import {
    resolveLangValue,
    type ContactPoint,
    type Issuer,
    type ResolvedIssuer,
} from '@formspec-org/engine/render';
import { selectLogoVariant, type LogoRenderContext } from './logoVariant';

export interface IssuerChromeProps {
    resolved: ResolvedIssuer;
    locale?: string;
    hostOrigin?: string;
    mode?: LogoRenderContext['mode'];
    headerWidth?: LogoRenderContext['headerWidth'];
    document?: Document;
}

export function IssuerChrome({
    resolved,
    locale = 'en',
    hostOrigin,
    mode = 'light',
    headerWidth = 'wide',
    document: ownerDocument = globalThis.document,
}: IssuerChromeProps): HTMLElement | null {
    if (resolved.source === 'unbranded') {
        return null;
    }

    const issuer = resolved.primary;
    const defaultLanguage = issuer.defaultLanguage ?? 'en';
    const displayName = resolveLangValue(issuer.displayName ?? issuer.name, locale, defaultLanguage)
        ?? '';
    const logo = selectLogoVariant(issuer, { mode, headerWidth });
    const altText = logo
        ? resolveLangValue(logo.altText, locale, defaultLanguage) ?? displayName
        : undefined;
    const breadcrumb = resolveBreadcrumb(resolved, locale, defaultLanguage);
    const supportEmail = primaryContactEmail(issuer);

    const header = ownerDocument.createElement('header');
    header.className = 'fs-issuer-chrome';
    header.dataset.source = resolved.source;

    if (logo) {
        const img = ownerDocument.createElement('img');
        img.className = 'fs-issuer-logo';
        img.src = logo.url;
        img.alt = altText ?? '';
        header.appendChild(img);
    }

    const text = ownerDocument.createElement('div');
    text.className = 'fs-issuer-text';

    const name = ownerDocument.createElement('div');
    name.className = 'fs-issuer-name';
    name.textContent = displayName;
    text.appendChild(name);

    if (breadcrumb) {
        const crumb = ownerDocument.createElement('div');
        crumb.className = 'fs-issuer-org-breadcrumb';
        crumb.textContent = breadcrumb;
        text.appendChild(crumb);
    }

    if (supportEmail) {
        const link = ownerDocument.createElement('a');
        link.className = 'fs-issuer-support';
        link.href = `mailto:${supportEmail}`;
        link.textContent = supportEmail;
        text.appendChild(link);
    }

    header.appendChild(text);

    if (resolved.source === 'host-query') {
        const indicator = ownerDocument.createElement('div');
        indicator.className = 'fs-issuer-query-indicator';
        indicator.role = 'status';
        indicator.textContent = `Branding provided by ${hostOrigin ?? 'host'}`;
        header.appendChild(indicator);
    }

    return header;
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
