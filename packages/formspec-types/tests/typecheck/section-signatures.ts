/** @filedesc Compile-time section-signature scope and whole-profile compatibility checks. */
import type { AttachmentValue, AuthoredSignature, AuthoredSignatureSignedPayload } from '../../src/index.js';

declare const evidence: Omit<AuthoredSignature, 'partyRole' | 'coveredPaths' | 'signedPayload'>;
declare const pins: Omit<AuthoredSignatureSignedPayload, 'canonicalization'>;

const section = {
  ...evidence,
  partyRole: 'parent',
  coveredPaths: ['parents[0].income'] as [string],
  signedPayload: { ...pins, canonicalization: 'formspec-response-section-signing-v1' as const },
} satisfies AuthoredSignature;

const whole = {
  ...evidence,
  signedPayload: { ...pins, canonicalization: 'formspec-response-signing-v1' as const },
} satisfies AuthoredSignature;

// @ts-expect-error Section profile must carry its role and concrete coverage.
const missingScope: AuthoredSignature = { ...whole, signedPayload: section.signedPayload };
// @ts-expect-error Whole-response profile cannot claim a partial signing scope.
const partialWhole: AuthoredSignature = { ...section, signedPayload: whole.signedPayload };
// @ts-expect-error A section cannot carry an empty coverage tuple.
const emptySection: AuthoredSignature = { ...section, coveredPaths: [] };
// @ts-expect-error The authored signature object remains closed to extra evidence selectors.
const extraField: AuthoredSignature = { ...section, signatureMethod: 'retired-selector' };

void [missingScope, partialWhole, emptySection, extraField];

const fileRef = { contentType: 'image/jpeg', url: 'urn:files:photo', size: 1024 } satisfies AttachmentValue;
const inlineFile = { contentType: 'text/plain', data: 'aGVsbG8=' } satisfies AttachmentValue;
const both = { ...inlineFile, url: 'urn:files:text' } satisfies AttachmentValue;
// @ts-expect-error Attachment values require the existing contentType field.
const missingMime: AttachmentValue = { url: 'urn:files:photo' };
// @ts-expect-error Attachment values require a reference or inline content.
const missingContent: AttachmentValue = { contentType: 'image/jpeg' };
// @ts-expect-error Size is a byte count, not a string.
const wrongSize: AttachmentValue = { ...fileRef, size: '1024' };
void [fileRef, inlineFile, both, missingMime, missingContent, wrongSize];
