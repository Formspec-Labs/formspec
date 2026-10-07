/** @filedesc Resolve immutable authored signing wording and hash the complete displayed content. */
import canonicalize from 'canonicalize';
import type { FormDefinition, FormResponse, SigningContent, SigningContentSource } from '@formspec-org/types';

/** The host supplies its maintained common.schema.json SigningContent validator. */
export type SigningContentValidator = (value: unknown) => boolean;

export interface ResolveAuthoredSigningContentInput {
    /** Already admitted immutable Definition; the host verifies its publication hash. */
    definition: FormDefinition;
    response: Pick<FormResponse, 'definitionUrl' | 'definitionVersion' | 'displayedLocale'>;
    source: SigningContentSource;
    locale: string;
    validateContent: SigningContentValidator;
}

/** Resolve only an exact entry in the already loaded, Response-pinned Definition. No fetch or fallback. */
export function resolveAuthoredSigningContent(input: ResolveAuthoredSigningContentInput): SigningContent {
    const { definition, response, source, locale, validateContent } = input;
    const url = ownData(definition, 'url');
    if (url !== ownData(response, 'definitionUrl') || ownData(definition, 'version') !== ownData(response, 'definitionVersion')) {
        throw new Error('Signing content requires the exact Response-pinned Definition');
    }
    const prefix = `${url}#/extensions/x-formspec-signing-content/entries/`;
    const sourceRef = ownData(source, 'ref');
    const sourceVersion = ownData(source, 'version');
    const id = typeof sourceRef === 'string' && sourceRef.startsWith(prefix) ? sourceRef.slice(prefix.length) : '';
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
        throw new Error('Signing source must identify one declared content entry');
    }
    const catalog = ownData(ownData(definition, 'extensions'), 'x-formspec-signing-content');
    if (ownData(catalog, 'version') !== '1.0') {
        throw new Error('Signing content entry is unavailable');
    }
    const content = ownData(ownData(catalog, 'entries'), id) as SigningContent;
    assertPlainContent(content);
    if (!validateContent(content)) throw new Error('Signing content failed the shared schema');
    const displayedLocale = Object.getOwnPropertyDescriptor(response, 'displayedLocale');
    if (displayedLocale && !('value' in displayedLocale)) throw new Error('Displayed locale must be an own data property');
    if (content.source.ref !== sourceRef || content.source.version !== sourceVersion
        || content.locale.toLowerCase() !== locale.toLowerCase()
        || (displayedLocale?.value && String(ownData(displayedLocale.value, 'locale')).toLowerCase() !== locale.toLowerCase())) {
        throw new Error('Signing content source, version or displayed locale does not match');
    }
    // Return a detached value: subsequent host mutations cannot silently change the displayed snapshot.
    return structuredClone(content);
}

/** UTF-8 RFC 8785 JCS of the entire schema-valid SigningContent; exact authored strings survive. */
export function signingContentBytes(content: SigningContent, validateContent: SigningContentValidator): Uint8Array {
    assertPlainContent(content);
    if (!validateContent(content)) throw new Error('Signing content failed the shared schema');
    const json = canonicalize(content);
    if (json === undefined) throw new Error('Signing content cannot be canonicalized');
    return new TextEncoder().encode(json);
}

/** Content documentHash only. This does not sign a Response or verify a signature. */
export async function hashSigningContent(
    content: SigningContent,
    validateContent: SigningContentValidator,
): Promise<string> {
    const bytes = signingContentBytes(content, validateContent);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ownData(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object') throw new Error('Signing source is not structured data');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new Error('Signing source must resolve through own data properties');
    }
    return descriptor.value;
}

// Admission only; ordering and encoding remain the maintained canonicalizer's job.
// SigningContent is composed only of strings and plain objects. Reject runtime hooks before validation.
function assertPlainContent(value: unknown, ancestors = new Set<object>()): void {
    if (typeof value === 'string') {
        // Native isWellFormed is not available in every ES2020 host. This checks, never normalizes.
        if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
            throw new Error('Signing content contains invalid Unicode');
        }
        return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
        || ancestors.has(value) || Object.getOwnPropertySymbols(value).length) {
        throw new Error('Signing content must contain only plain JSON objects and strings');
    }
    const hook = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value) ?? {}, 'toJSON');
    if (hook && (!('value' in hook) || typeof hook.value === 'function')) {
        throw new Error('Signing content inherits a serialization hook');
    }
    ancestors.add(value);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
        assertPlainContent(key);
        if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Signing content contains a runtime property');
        assertPlainContent(descriptor.value, ancestors);
    }
    ancestors.delete(value);
}
