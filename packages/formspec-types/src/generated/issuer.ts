/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { Party, LangMap, ContactPoint, Extensions } from './common.js';
/**
 * A standalone sidecar declaring who is asking the form. One Issuer publishes many Definitions. Definitions point OUT to Issuer (inverse cardinality of locale/references/ontology). Receipt-side displayedIssuer pins the resolved Issuer at submit-time inside the signed-payload preimage.
 */
export type IssuerDocument = Party & {
  /**
   * Sidecar version pin.
   */
  $formspecIssuer: '1.0';
  $schema?: string;
  /**
   * Canonical URL of this Issuer document (distinct from Party.homepage).
   */
  url: string;
  /**
   * Semver, optionally suffixed with +sha256-<hex> for content-hash invalidation.
   */
  version: string;
  name: string | LangMap;
  /**
   * Issuer UI-tier role; not WOS scope-tier Organization (ADR 0146).
   */
  kind: 'organization' | 'department' | 'program' | 'individual';
  displayName?: string | LangMap;
  shortName?: string | LangMap;
  identifier?: string;
  homepage?: string;
  /**
   * URL of the parent Issuer document. Linear chain; no nesting.
   */
  parentOrganization?: string;
  organizationName?: string | LangMap;
  departmentName?: string | LangMap;
  jurisdiction?: {
    level: 'federal' | 'state' | 'county' | 'municipal' | 'tribal' | 'international' | 'private' | 'individual';
    name: string;
    /**
     * ISO 3166-1 alpha-2 for international; ISO 3166-2 for state; jurisdiction-specific below.
     */
    code?: string;
  };
  defaultLanguage?: string;
  logo?: {
    primary?: LogoVariant;
    wordmark?: LogoVariant;
    monochrome?: LogoVariant;
  };
  contactPoint?: ContactPoint | ContactPoint[];
  extensions?: Extensions;
};
/**
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "LogoVariant".
 */
export interface LogoVariant {
  url: string;
  altText?: string | LangMap;
  aspectRatio?: string;
  preferredBackground?: 'light' | 'dark' | 'any';
}
