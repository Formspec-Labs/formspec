/** @filedesc Issuer / Party / LangMap / IssuerSource type declarations mirrored from the Issuer schema. */

export type LangMap = Record<string, string>;
export type StringOrLangMap = string | LangMap;

export interface ContactPoint {
    contactType?: string;
    email?: string;
    telephone?: string;
    url?: string;
    availableLanguage?: string[];
}

export interface Jurisdiction {
    level:
        | 'federal'
        | 'state'
        | 'county'
        | 'municipal'
        | 'tribal'
        | 'international'
        | 'private'
        | 'individual';
    name: string;
    code?: string;
}

export interface LogoVariant {
    url: string;
    altText?: StringOrLangMap;
    aspectRatio?: string;
    preferredBackground?: 'light' | 'dark' | 'any';
}

export interface Issuer {
    $formspecIssuer: '1.0';
    url: string;
    version: string;
    name: StringOrLangMap;
    kind: 'organization' | 'department' | 'program' | 'individual';
    displayName?: StringOrLangMap;
    shortName?: StringOrLangMap;
    identifier?: string;
    homepage?: string;
    parentOrganization?: string;
    organizationName?: StringOrLangMap;
    departmentName?: StringOrLangMap;
    jurisdiction?: Jurisdiction;
    defaultLanguage?: string;
    logo?: {
        primary?: LogoVariant;
        wordmark?: LogoVariant;
        monochrome?: LogoVariant;
    };
    contactPoint?: ContactPoint | ContactPoint[];
    extensions?: Record<string, unknown>;
}

export type IssuerResolutionSource = 'host-embed' | 'host-query' | 'definition' | 'unbranded';
export type IssuerOverrideResolutionSource = Extract<
    IssuerResolutionSource,
    'host-embed' | 'host-query'
>;

export type IssuerSource =
    | { kind: 'inline'; issuer: Issuer; source?: IssuerOverrideResolutionSource }
    | { kind: 'url'; url: string; source?: IssuerOverrideResolutionSource };

export interface ResolvedIssuer {
    /** Primary Issuer after cascade resolution. */
    primary: Issuer;
    /** Ordered as [primary, parent, grandparent, ...]; may be truncated at depth 8. */
    chain: Issuer[];
    source: IssuerResolutionSource;
    degraded?: {
        reason: 'parent-fetch-failed' | 'depth-capped' | 'cycle-detected';
        atUrl?: string;
    };
}
