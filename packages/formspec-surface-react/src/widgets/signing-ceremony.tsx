/** @filedesc Read, consent, Sign, then Submit through qualified Surface data and mapped actions. */
import { useEffect, useId, useRef, useState } from 'react';
import canonicalize from 'canonicalize';
import type { FormResponse, Generation, SigningContent, SigningContentSource } from '@formspec-org/types';
import { Heading } from '../heading.js';
import type { SurfaceWidgetActionInput, SurfaceWidgetProps } from '../widget-api.js';
import { SIGNING_CONTENT_SOURCE_PROPS_SCHEMA } from '../generated/signing-content-source-schema.js';
import { WidgetEmptyState } from './empty-state.js';

export interface SigningCeremonyCopy {
  'x-generation'?: Generation;
  heading: string;
  readInstruction: string;
  readConfirmation: string;
  signerName: string;
  pending: string;
  signed: string;
  failed: string;
  unavailable: string;
}
export interface SigningCeremonyConfig {
  contentRefs: Readonly<Record<string, SigningContentSource>>;
  copy: Readonly<Record<string, SigningCeremonyCopy>>;
}
export interface SigningCeremonyDraft {
  id: string;
  version: number;
  /** Digest of the frozen preparation, admitted by the host using its existing Response byte profile. */
  responseHash: string;
}
export type SigningCeremonyResult =
  | { state: 'unsigned' }
  | {
      state: 'signed';
      response: FormResponse;
      draft: { id: string; version: number };
      verification: { mode: 'delegated-service-key'; provider: string; keyId: string };
    };
export interface SigningCeremonyData {
  content: SigningContent;
  response: FormResponse;
  draft: SigningCeremonyDraft;
  actor: { id: string };
  signingResult: SigningCeremonyResult;
  /** Exact mapped Action label refs resolved through the admitted Locale; literal labels need no entry. */
  actionLabels: Readonly<Record<string, string>>;
}

const COPY_KEYS = ['heading', 'readInstruction', 'readConfirmation', 'signerName', 'pending', 'signed', 'failed', 'unavailable'] as const;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every((d) => d.enumerable && 'value' in d);
}
function same(a: unknown, b: unknown): boolean {
  try { return canonicalize(a) === canonicalize(b); } catch { return false; }
}
function localeEntry(value: unknown, locale: string): unknown {
  if (!record(value)) return undefined;
  const keys = Object.keys(value).filter((key) => key.toLowerCase() === locale.toLowerCase());
  return keys.length === 1 ? value[keys[0]!] : undefined;
}

/** Defensive reading supplements the Registry and qualified Data Source schema admission. */
function admit(props: SurfaceWidgetProps): { data: SigningCeremonyData; copy: SigningCeremonyCopy } | undefined {
  const { content, response, draft, actor, signingResult, actionLabels } = props.data;
  if (!record(content) || !record(content.source) || !text(content.source.ref) || !text(content.source.version)
    || !text(content.locale) || !text(content.documentId) || !text(content.signingIntent)
    || !['declaration', 'paperAlternative', 'affirmationText', 'delegatedSigningNotice'].every((key) => text(content[key]))
    || !record(content.electronicConsent) || !['textRef', 'version', 'text', 'controlLabel'].every((key) => text((content.electronicConsent as Record<string, unknown>)[key]))
    || !record(response) || response.$formspecResponse !== '1.0' || response.status !== 'completed' || !text(response.id)
    || !text(response.definitionUrl) || !text(response.definitionVersion)
    || !record(draft) || !text(draft.id) || !revision(draft.version) || !text(draft.responseHash)
    || !record(actor) || !text(actor.id) || !record(signingResult) || !['unsigned', 'signed'].includes(String(signingResult.state))
    || !record(actionLabels) || !Object.values(actionLabels).every(text)) return undefined;
  const source = localeEntry(props.config.contentRefs, content.locale);
  const copy = localeEntry(props.config.copy, content.locale);
  if (!record(source) || source.ref !== content.source.ref || source.version !== content.source.version
    || !record(copy) || !COPY_KEYS.every((key) => text(copy[key]))
    || !content.source.ref.startsWith(`${response.definitionUrl}#/extensions/x-formspec-signing-content/entries/`)
    || (record(response.displayedLocale) && String(response.displayedLocale.locale).toLowerCase() !== content.locale.toLowerCase())) return undefined;
  // The loader freezes its outer record, not every nested value. Capture what is actually displayed.
  try {
    return { data: structuredClone({ content, response, draft, actor, signingResult, actionLabels }) as unknown as SigningCeremonyData,
      copy: structuredClone(copy) as unknown as SigningCeremonyCopy };
  } catch { return undefined; }
}

/** A qualified verified result must describe this exact persisted response. This does no crypto. */
function currentSigned(data: SigningCeremonyData): boolean {
  const result = data.signingResult;
  const commitment = data.response.extensions?.['x-formspec-signing-content'];
  if (result.state !== 'signed' || !record(result.draft) || !record(result.verification)
    || result.verification.mode !== 'delegated-service-key' || !text(result.verification.provider) || !text(result.verification.keyId)
    || result.draft.id !== data.draft.id || result.draft.version !== data.draft.version || !same(result.response, data.response)
    || !commitment || commitment.draftId !== data.draft.id || !revision(commitment.draftVersion)
    || commitment.draftVersion + 1 !== data.draft.version || commitment.actorRef !== data.actor.id
    || !text(commitment.signerName) || !text(commitment.signedAt) || commitment.consentAccepted !== true
    || !same(commitment.content, data.content) || !/^[a-f0-9]{64}$/.test(commitment.documentHash)
    || commitment.documentHashAlgorithm !== 'sha-256') return false;
  const signatures = data.response.authoredSignatures;
  if (!Array.isArray(signatures) || signatures.length !== 1) return false;
  const signature = signatures[0]!;
  if (!record(signature) || !record(signature.signedPayload)) return false;
  const payload = signature.signedPayload;
  return signature.signerId === commitment.actorRef && signature.signerName === commitment.signerName
    && signature.documentId === data.content.documentId && signature.signingIntent === data.content.signingIntent
    && signature.signatureProvider === result.verification.provider && signature.consentAccepted === true
    && signature.consentTextRef === data.content.electronicConsent.textRef && signature.consentVersion === data.content.electronicConsent.version
    && signature.affirmationText === data.content.affirmationText && signature.documentHash === commitment.documentHash
    && signature.documentHashAlgorithm === commitment.documentHashAlgorithm && payload.canonicalization === 'formspec-response-signing-v1'
    && payload.responseId === data.response.id && payload.definitionUrl === data.response.definitionUrl
    && payload.definitionVersion === data.response.definitionVersion && payload.signedAt === commitment.signedAt
    && payload.signingIntent === data.content.signingIntent;
}

export function SigningCeremony(props: SurfaceWidgetProps) {
  const admitted = admit(props);
  if (!admitted || props.route.routeClass !== 'ceremony' || props.admitsTenantTheme) {
    return <WidgetEmptyState>Signing is unavailable because the required ceremony data is incomplete.</WidgetEmptyState>;
  }
  // Remount local assent controls for any changed snapshot, actor, content, language, or saved revision.
  const generation = canonicalize({ response: admitted.data.response, draft: admitted.data.draft, actor: admitted.data.actor, content: admitted.data.content });
  return <SigningCeremonyAct key={generation} props={props} {...admitted} />;
}

function SigningCeremonyAct({ props, data, copy }: { props: SurfaceWidgetProps; data: SigningCeremonyData; copy: SigningCeremonyCopy }) {
  const id = useId();
  const scroll = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const [atEnd, setAtEnd] = useState(false);
  const [read, setRead] = useState(false);
  const [consent, setConsent] = useState(false);
  const signed = currentSigned(data);
  const [name, setName] = useState(() => signed ? data.response.extensions!['x-formspec-signing-content']!.signerName : '');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    alive.current = true;
    const area = scroll.current;
    if (area && area.clientHeight > 0 && area.scrollHeight <= area.clientHeight + 1) setAtEnd(true);
    return () => { alive.current = false; };
  }, []);
  const mapped = (output: string) => {
    const actions = (props.actions ?? []).filter((action) => action.outputName === output);
    if (actions.length !== 1) return undefined;
    const action = actions[0]!;
    const label = action.label && ('literal' in action.label ? action.label.literal : data.actionLabels[action.label.ref]);
    return text(label) && label.trim().length ? { action, label } : undefined;
  };
  const sign = mapped('sign');
  const submit = mapped('submit');
  const paper = mapped('paper');
  async function emit(output: 'sign' | 'submit' | 'paper') {
    if (pending || !mapped(output)) return;
    const checked = admit(props);
    if (!checked || !same(checked.data, data)) return;
    const isSigned = currentSigned(checked.data);
    if (output === 'sign' && (isSigned || !atEnd || !read || !consent || !name.trim())) return;
    if (output === 'submit' && !isSigned) return;
    const input: SurfaceWidgetActionInput = output === 'sign'
      ? { draftId: data.draft.id, draftVersion: data.draft.version, responseId: data.response.id!, responseHash: data.draft.responseHash,
          source: { ref: data.content.source.ref, version: data.content.source.version }, locale: data.content.locale,
          signerName: name, consentAccepted: true }
      : output === 'submit'
        ? { draftId: data.draft.id, draftVersion: data.draft.version, canonical_response: data.response as unknown as SurfaceWidgetActionInput }
        : { source: { ref: data.content.source.ref, version: data.content.source.version }, locale: data.content.locale };
    setPending(true); setFailed(false);
    try {
      const emission = props.emitAction(output, input);
      const result = emission ? await emission.completion : undefined;
      if (alive.current) setFailed(!result || result.status !== 'completed');
    } catch { if (alive.current) setFailed(true); }
    finally { if (alive.current) setPending(false); }
  }
  return <section className="fs-surface-ceremony" data-widget="signing-ceremony" data-tenant-theme="refused">
    <Heading level={props.headingLevel}>{copy.heading}</Heading>
    <p id={`${id}-read`}>{copy.readInstruction}</p>
    <div ref={scroll} className="fs-surface-ceremony__full-text" tabIndex={0} role="region" aria-label={copy.heading} aria-describedby={`${id}-read`}
      onScroll={() => { const area = scroll.current; if (area && area.scrollTop + area.clientHeight >= area.scrollHeight - 1) setAtEnd(true); }}>
      <p data-probe="signing-declaration">{data.content.declaration}</p>
      <p data-probe="signing-electronic-consent">{data.content.electronicConsent.text}</p>
      <p data-probe="signing-affirmation">{data.content.affirmationText}</p>
      <p data-probe="signing-delegation">{data.content.delegatedSigningNotice}</p>
    </div>
    <p className="fs-surface-ceremony__paper" data-probe="signing-paper-alternative">{data.content.paperAlternative}</p>
    <label><input type="checkbox" checked={read} disabled={!atEnd || pending || signed} onChange={(event) => setRead(event.currentTarget.checked)} />{copy.readConfirmation}</label>
    <label><input type="checkbox" checked={consent} disabled={!read || pending || signed} onChange={(event) => setConsent(event.currentTarget.checked)} />{data.content.electronicConsent.controlLabel}</label>
    <label htmlFor={`${id}-name`}>{copy.signerName}</label>
    <input id={`${id}-name`} autoComplete="name" value={name} disabled={pending || signed} onChange={(event) => setName(event.currentTarget.value)} />
    <div className="fs-surface-ceremony__actions">
      {sign && <button type="button" disabled={pending || signed || !atEnd || !read || !consent || !name.trim()} onClick={() => void emit('sign')}>{sign.label}</button>}
      {submit && <button type="button" disabled={pending || !signed} onClick={() => void emit('submit')}>{submit.label}</button>}
      {paper && <button type="button" disabled={pending} onClick={() => void emit('paper')}>{paper.label}</button>}
    </div>
    <p role="status" aria-live="polite">{pending ? copy.pending : failed ? copy.failed : signed ? copy.signed : !sign || !submit ? copy.unavailable : ''}</p>
  </section>;
}

/** Publish this exact config schema as the Registry entry's widgetShape.props. */
export const SIGNING_CEREMONY_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['contentRefs', 'copy'],
  properties: {
    contentRefs: {
      type: 'object', minProperties: 1,
      propertyNames: { pattern: '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' },
      additionalProperties: SIGNING_CONTENT_SOURCE_PROPS_SCHEMA,
    },
    copy: {
      type: 'object', minProperties: 1,
      propertyNames: { pattern: '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' },
      additionalProperties: {
        type: 'object', additionalProperties: false, required: COPY_KEYS,
        properties: { ...Object.fromEntries(COPY_KEYS.map((key) => [key, { type: 'string', minLength: 1 }])),
          'x-generation': { type: 'object' } },
      },
    },
    'x-generation': { type: 'object' },
  },
} as const;

export const SIGNING_CEREMONY_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/SigningCeremony@0.1';
export const SIGNING_CEREMONY_RENDERED_CONFIG_NODES = [
  { pointerPattern: '', kind: 'signing-ceremony' },
  { pointerPattern: '/copy/*', kind: 'signing-ceremony-copy' },
] as const;
/** Exact authored Registry widgetShape; source payload schemas stay in the Data Sources catalog. */
export const SIGNING_CEREMONY_WIDGET_SHAPE = {
  widgetName: 'SigningCeremony',
  props: SIGNING_CEREMONY_CONFIG_SCHEMA,
  dataInputs: ['content', 'response', 'draft', 'actor', 'signingResult', 'actionLabels'].map((name) => ({ name, required: true })),
  actionOutputs: [{ name: 'sign' }, { name: 'submit' }, { name: 'paper' }],
  childrenPolicy: 'none',
  deliveryContractId: SIGNING_CEREMONY_DELIVERY_CONTRACT_ID,
  renderedConfigNodes: SIGNING_CEREMONY_RENDERED_CONFIG_NODES,
} as const;
