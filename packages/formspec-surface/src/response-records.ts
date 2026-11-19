/** @filedesc Prepare immutable filings, seeded drafts, and review decisions for Surface hosts. */
import type {
  DispositionObservation, FormDefinition, FormItem, FormResponse, NewerSelectedResponse, ResponseSelection,
  ResponseSelectionContext, ResponseSelectionRecord, SelectResponses,
  SurfaceScenarioDraft, SurfaceScenarioProfile,
} from '@formspec-org/types';
import type { DraftKey, FilingObservation } from './draft-port.js';
import { canonicalFiniteJson, snapshotFiniteJson, type FiniteJsonValue } from './finite-json.js';

export interface ResponseRecordTools {
  parseResponse(text: string): FormResponse;
  subjectId: (type: string, keys: NonNullable<NonNullable<FormResponse['subject']>['keys']>) => string;
  selectResponses: SelectResponses;
  isValidAuthored?: (authored: string) => boolean;
}

export interface ResponseFiling extends NewerSelectedResponse {
  key: DraftKey;
  definitionVersion: string;
  responseJson: string;
  sample: 'preview-submit' | 'fixture';
}

export interface PreparedDraftFixture {
  key: DraftKey;
  definitionVersion: string;
  responseId: string;
  authored: string;
  data: Record<string, FiniteJsonValue>;
}

export interface DraftFixtureIssue {
  /** Subpath relative to the profile (for example, "drafts[0].subject.keys"). */
  subpath: string;
  message: string;
}

export type ResponseFixtures = Pick<SurfaceScenarioProfile, 'filings' | 'decisions' | 'drafts'>;

const DEFAULT_DRAFT_AUTHORED = '1970-01-01T00:00:00Z';
const DECIMAL_TEXT = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const RAW_NUMBER_TEXT = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u;
const CURRENCY_CODE = /^[A-Z]{3}$/u;
const BASE64_TEXT = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
// ajv-formats' `uri-reference` pattern, verbatim, for `schemas/common.schema.json#/$defs/AttachmentValue`.
// Keep the flags exactly `i`: adding `u` enables Unicode case folding (U+212A, U+017F) the schema refuses.
const URI_REFERENCE =
  /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
const RFC3339_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|([+-])(\d{2}):(\d{2}))$/u;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/**
 * Validate an RFC 3339 Response ordering instant with exact calendar and leap-second rules,
 * delegating to the native Rust `isValidResponseAuthored` oracle whenever `tools` is supplied.
 */
export function validResponseAuthored(authored: string, tools?: ResponseRecordTools): boolean {
  if (tools?.isValidAuthored) return tools.isValidAuthored(authored);
  const match = RFC3339_INSTANT.exec(authored);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return false;
  if (hour > 23 || minute > 59 || second > 60) return false;
  const zone = match[7]!;
  let offsetMinutes = 0;
  if (zone !== 'Z' && zone !== 'z') {
    const sign = match[8] === '-' ? -1 : 1;
    const offHour = Number(match[9]);
    const offMinute = Number(match[10]);
    if (offHour > 23 || offMinute > 59) return false;
    offsetMinutes = sign * (offHour * 60 + offMinute);
  }
  if (second === 60) {
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, 59) - offsetMinutes * 60_000;
    const utc = new Date(utcMs);
    if (
      utc.getUTCHours() !== 23 ||
      utc.getUTCMinutes() !== 59 ||
      utc.getUTCSeconds() !== 59 ||
      !((utc.getUTCMonth() === 5 && utc.getUTCDate() === 30) ||
        (utc.getUTCMonth() === 11 && utc.getUTCDate() === 31))
    ) {
      return false;
    }
  }
  return true;
}

export function defaultDraftResponseId(
  scope: string,
  definitionUrl: string,
  subject?: { type: string; keys: Readonly<Record<string, string | number>> },
): string {
  const subjectToken = subject
    ? canonicalFiniteJson([subject.type, subject.keys as unknown as FiniteJsonValue])
    : 'respondent';
  return `urn:formspec:preview-draft:${encodeURIComponent(scope)}:${encodeURIComponent(definitionUrl)}:${encodeURIComponent(subjectToken)}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function own(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRawJson(value: unknown): value is { readonly rawJSON: string } {
  const check = (JSON as unknown as { isRawJSON?: (input: unknown) => boolean }).isRawJSON;
  return typeof check === 'function' && check(value);
}

function collectScopeItems(items: readonly FormItem[], target: Map<string, FormItem>): void {
  for (const item of items) {
    if (item.type === 'field') {
      target.set(item.key, item);
      if (item.children?.length) collectScopeItems(item.children, target);
    } else if (item.type === 'group') {
      target.set(item.key, item);
    }
  }
}

function validMoneyValue(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !own(value, 'amount') || !own(value, 'currency')) return false;
  if (typeof value.currency !== 'string' || !CURRENCY_CODE.test(value.currency)) return false;
  // Core §3.4.1 requires `amount` on a `money` value to be serialized as a canonical decimal JSON string.
  return typeof value.amount === 'string' && DECIMAL_TEXT.test(value.amount);
}

function validAttachmentValue(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  if (typeof value.contentType !== 'string' || value.contentType.length === 0) return false;
  const hasUrl = own(value, 'url');
  const hasData = own(value, 'data');
  if (!hasUrl && !hasData) return false;
  if (hasUrl && (typeof value.url !== 'string' || value.url.length === 0 || !URI_REFERENCE.test(value.url))) return false;
  if (hasData && (typeof value.data !== 'string' || value.data.length === 0 || !BASE64_TEXT.test(value.data))) return false;
  if (own(value, 'size')) {
    const validSize =
      (typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size >= 0) ||
      (isRawJson(value.size) && /^(?:0|[1-9][0-9]*)$/u.test(value.size.rawJSON));
    if (!validSize) return false;
  }
  return true;
}

function validFieldValue(dataType: FormItem['dataType'], value: unknown): boolean {
  if (value === null) return true;
  switch (dataType) {
    case 'string':
    case 'text':
    case 'date':
    case 'dateTime':
    case 'time':
    case 'uri':
    case 'choice':
      return typeof value === 'string';
    case 'integer':
      return (typeof value === 'number' && Number.isSafeInteger(value)) ||
        (isRawJson(value) && /^-?[0-9]+$/u.test(value.rawJSON));
    case 'decimal':
      return (typeof value === 'number' && Number.isFinite(value)) ||
        (isRawJson(value) && RAW_NUMBER_TEXT.test(value.rawJSON));
    case 'boolean':
      return typeof value === 'boolean';
    case 'multiChoice':
      return Array.isArray(value) && value.every(entry => typeof entry === 'string');
    case 'money':
      return validMoneyValue(value);
    case 'attachment':
      return validAttachmentValue(value);
    default:
      return true;
  }
}

function validateDraftData(
  items: readonly FormItem[],
  record: Record<string, unknown>,
  path: string,
  definitionUrl: string,
  issues: DraftFixtureIssue[],
): void {
  const scopeItems = new Map<string, FormItem>();
  collectScopeItems(items, scopeItems);
  for (const [key, value] of Object.entries(record)) {
    const itemPath = `${path}.${key}`;
    const item = scopeItems.get(key);
    if (!item) {
      const validKeys = [...scopeItems.keys()];
      issues.push({
        subpath: itemPath,
        message: `Unknown item key "${key}" in draft data for Definition "${definitionUrl}"${
          validKeys.length > 0 ? ` (valid keys: ${validKeys.join(', ')})` : ''
        }.`,
      });
      continue;
    }
    if (item.type === 'group' && item.repeatable) {
      if (!Array.isArray(value)) {
        issues.push({
          subpath: itemPath,
          message: `Repeatable group "${key}" in draft data for Definition "${definitionUrl}" must be an array of row objects.`,
        });
        continue;
      }
      value.forEach((row, rowIndex) => {
        const rowPath = `${itemPath}[${rowIndex}]`;
        if (!isPlainRecord(row)) {
          issues.push({
            subpath: rowPath,
            message: `Row ${rowIndex} of repeatable group "${key}" must be a JSON object.`,
          });
          return;
        }
        validateDraftData(item.children ?? [], row, rowPath, definitionUrl, issues);
      });
    } else if (item.type === 'group') {
      if (!isPlainRecord(value)) {
        issues.push({
          subpath: itemPath,
          message: `Group "${key}" in draft data for Definition "${definitionUrl}" must be a JSON object.`,
        });
        continue;
      }
      validateDraftData(item.children ?? [], value, itemPath, definitionUrl, issues);
    } else if (item.type === 'field' && !validFieldValue(item.dataType, value)) {
      issues.push({
        subpath: itemPath,
        message: `Field "${key}" (${item.dataType ?? 'unknown'}) in draft data for Definition "${definitionUrl}" has an incompatible value type.`,
      });
    }
  }
}

function inspectDraftFixtures(
  definitions: ReadonlyMap<string, FormDefinition>,
  drafts: readonly SurfaceScenarioDraft[] | undefined,
  options?: {
    tools?: ResponseRecordTools | undefined;
    existingResponseIds?: ReadonlySet<string> | undefined;
    scope?: string | undefined;
  },
): { drafts: PreparedDraftFixture[]; issues: DraftFixtureIssue[] } {
  const issues: DraftFixtureIssue[] = [];
  const prepared: PreparedDraftFixture[] = [];
  const seenKeys = new Set<string>();
  const seenResponseIds = new Set<string>(options?.existingResponseIds ?? []);
  const tools = options?.tools;
  const scope = options?.scope;

  for (let index = 0; index < (drafts?.length ?? 0); index += 1) {
    const draft = drafts![index]!;
    const base = `drafts[${index}]`;
    const beforeIssues = issues.length;

    const definition = definitions.get(draft.definitionUrl);
    if (!definition) {
      const known = [...definitions.keys()];
      issues.push({
        subpath: `${base}.definitionUrl`,
        message: `Draft references Definition "${draft.definitionUrl}", which is not in the resolved bundle${
          known.length > 0 ? ` (known Definitions: ${known.join(', ')})` : ''
        }.`,
      });
      continue;
    }

    if (draft.definitionVersion !== undefined && draft.definitionVersion !== definition.version) {
      issues.push({
        subpath: `${base}.definitionVersion`,
        message: `Draft pins definitionVersion "${draft.definitionVersion}", but Definition "${definition.url}" in the bundle has version "${definition.version}".`,
      });
    }

    if (draft.authored !== undefined && !validResponseAuthored(draft.authored, tools)) {
      issues.push({
        subpath: `${base}.authored`,
        message: `Draft authored timestamp "${draft.authored}" is not a valid RFC 3339 Response instant.`,
      });
    }

    let validSubject = true;
    let derivedSubjectId: string | undefined;
    if (!definition.subject) {
      if (draft.subject !== undefined) {
        validSubject = false;
        issues.push({
          subpath: `${base}.subject`,
          message: `Definition "${definition.url}" declares no subject; omit draft.subject.`,
        });
      }
    } else {
      const declaredEntries = Object.entries(definition.subject.keys);
      if (draft.subject === undefined) {
        validSubject = false;
        issues.push({
          subpath: `${base}.subject`,
          message: `Definition "${definition.url}" requires subject "${definition.subject.type}" with keys [${
            declaredEntries.map(([name]) => name).join(', ')
          }].`,
        });
      } else {
        if (draft.subject.type !== definition.subject.type) {
          validSubject = false;
          issues.push({
            subpath: `${base}.subject.type`,
            message: `Draft subject.type "${draft.subject.type}" does not match Definition "${definition.url}" subject.type "${definition.subject.type}".`,
          });
        }
        const keyProblems: string[] = [];
        for (const [keyName, keySpec] of declaredEntries) {
          if (!own(draft.subject.keys, keyName)) {
            keyProblems.push(`missing required key "${keyName}" (${keySpec.dataType})`);
            continue;
          }
          const supplied = draft.subject.keys[keyName];
          const ok = keySpec.dataType === 'integer'
            ? typeof supplied === 'number' && Number.isSafeInteger(supplied)
            : typeof supplied === 'string';
          if (!ok) {
            keyProblems.push(`key "${keyName}" must be a ${keySpec.dataType}`);
          }
        }
        for (const suppliedKey of Object.keys(draft.subject.keys)) {
          if (!own(definition.subject.keys, suppliedKey)) {
            keyProblems.push(`unexpected key "${suppliedKey}"`);
          }
        }
        if (keyProblems.length > 0) {
          validSubject = false;
          issues.push({
            subpath: `${base}.subject.keys`,
            message: `Invalid subject keys for Definition "${definition.url}": ${keyProblems.join('; ')}.`,
          });
        } else if (validSubject && tools) {
          try {
            derivedSubjectId = tools.subjectId(draft.subject.type, draft.subject.keys);
          } catch (error) {
            validSubject = false;
            issues.push({
              subpath: `${base}.subject`,
              message: error instanceof Error ? error.message : 'Unable to derive subject id for draft.',
            });
          }
        }
      }
    }

    if (validSubject) {
      const canonicalSubject = draft.subject
        ? [draft.subject.type, Object.entries(draft.subject.keys).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]
        : null;
      const activeKey = JSON.stringify([definition.url, canonicalSubject]);
      if (seenKeys.has(activeKey)) {
        issues.push({
          subpath: base,
          message: `Duplicate active draft for Definition "${definition.url}"${
            draft.subject ? ` and subject ${JSON.stringify(draft.subject.keys)}` : ''
          }. A profile may seed at most one active draft per filing unit.`,
        });
      } else {
        seenKeys.add(activeKey);
      }
    }

    const responseId = draft.responseId ?? defaultDraftResponseId(scope ?? 'default', definition.url, draft.subject);
    if (seenResponseIds.has(responseId)) {
      issues.push({
        subpath: draft.responseId !== undefined ? `${base}.responseId` : base,
        message: `Draft responseId "${responseId}" must be unique across all drafts and filings in the profile.`,
      });
    } else {
      seenResponseIds.add(responseId);
    }

    let snappedData: Record<string, FiniteJsonValue> | undefined;
    try {
      const snapped = snapshotFiniteJson(draft.data, false);
      if (!isPlainRecord(snapped)) {
        issues.push({ subpath: `${base}.data`, message: 'Draft data must be a JSON object.' });
      } else {
        snappedData = snapped;
        validateDraftData(definition.items, snapped, `${base}.data`, definition.url, issues);
      }
    } catch (error) {
      issues.push({
        subpath: `${base}.data`,
        message: error instanceof Error ? error.message : 'Draft data must be finite JSON.',
      });
    }

    if (scope !== undefined && tools !== undefined && issues.length === beforeIssues && snappedData !== undefined) {
      prepared.push({
        key: {
          scope,
          definitionUrl: definition.url,
          ...(draft.subject && derivedSubjectId !== undefined
            ? { subject: { type: draft.subject.type, keys: { ...draft.subject.keys }, id: derivedSubjectId } }
            : {}),
        },
        definitionVersion: definition.version,
        responseId,
        authored: draft.authored ?? DEFAULT_DRAFT_AUTHORED,
        data: snappedData,
      });
    }
  }

  return { drafts: prepared, issues };
}

export function validateDraftFixtures(
  definitions: ReadonlyMap<string, FormDefinition>,
  drafts: readonly SurfaceScenarioDraft[] | undefined,
  options?: {
    scope?: string | undefined;
    tools?: ResponseRecordTools | undefined;
    existingResponseIds?: ReadonlySet<string> | undefined;
  },
): DraftFixtureIssue[] {
  return inspectDraftFixtures(definitions, drafts, options).issues;
}

export function prepareDraftFixtures(
  scope: string,
  definitions: ReadonlyMap<string, FormDefinition>,
  drafts: readonly SurfaceScenarioDraft[] | undefined,
  tools: ResponseRecordTools,
  existingResponseIds?: ReadonlySet<string>,
): PreparedDraftFixture[] {
  const result = inspectDraftFixtures(definitions, drafts, {
    scope,
    tools,
    ...(existingResponseIds !== undefined ? { existingResponseIds } : {}),
  });
  if (result.issues.length > 0) {
    throw new Error(result.issues[0]!.message);
  }
  return result.drafts;
}

export const responsePairKey = ({ responseId, responseHash }: { responseId: string; responseHash?: string | undefined }): string =>
  JSON.stringify([responseId, responseHash]);

export function responseDraftKey(scope: string, response: FormResponse, definition: FormDefinition, tools: ResponseRecordTools): DraftKey {
  if (!definition.subject) {
    if (response.subject?.keys !== undefined) throw new Error('An implicit filing unit cannot declare subject keys.');
    return { scope, definitionUrl: definition.url };
  }
  const { type, keys, id } = response.subject ?? {};
  if (!type || !keys || type !== definition.subject.type || tools.subjectId(type, keys) !== id) {
    throw new Error('The Response subject does not match its derived filing unit.');
  }
  return { scope, definitionUrl: definition.url, subject: { type, keys, id } };
}

export function responseSelectionRecord(
  key: DraftKey, responseJson: string, kind: ResponseSelectionRecord['kind'],
): ResponseSelectionRecord {
  return { scope: key.scope, kind, responseJson, ...(key.subject === undefined && { implicitSubjectId: 'preview' }) };
}

export function prepareResponseFiling(
  scope: string, definitions: ReadonlyMap<string, FormDefinition>, responseJson: string,
  sample: ResponseFiling['sample'], tools: ResponseRecordTools,
): ResponseFiling {
  const response = tools.parseResponse(responseJson);
  const definition = definitions.get(response.definitionUrl);
  if (!definition || response.$formspecResponse !== '1.0' || response.status !== 'completed' || !response.id) {
    throw new Error('A preview filing must be a completed Response for a known Definition.');
  }
  const key = responseDraftKey(scope, response, definition, tools);
  const result = tools.selectResponses([responseSelectionRecord(key, responseJson, 'filing')], {
    definition: { url: response.definitionUrl }, status: 'completed', cardinality: 'latest',
    subject: [], pin: 'none',
  }, { scope, authorized: true, source: 'catalog', upstreamSubject: definition.subject ?? null, projection: [] });
  const responseHash = result.status === 'available' ? result.records[0]?.responseHash : undefined;
  if (!responseHash) throw new Error('The Response cannot be admitted as a filing.');
  return { key, definitionVersion: response.definitionVersion, responseJson, responseId: response.id, responseHash, sample };
}

export function prepareResponseFixtures(
  scope: string, definitions: ReadonlyMap<string, FormDefinition>, fixtures: ResponseFixtures,
  tools: ResponseRecordTools,
) {
  const filings = (fixtures.filings ?? []).map(({ responseJson }) =>
    prepareResponseFiling(scope, definitions, responseJson, 'fixture', tools));
  const filingResponseIds = new Set(filings.map(filing => filing.responseId));
  if (filingResponseIds.size !== filings.length) {
    throw new Error('Fixture Response ids must be unique within the profile.');
  }
  const pairs = new Set(filings.map(responsePairKey));
  const decisions = new Map<string, DispositionObservation>();
  for (const { responseId, responseHash, decision } of fixtures.decisions ?? []) {
    const key = responsePairKey({ responseId, responseHash });
    if (!pairs.has(key) || decisions.has(key)) throw new Error('A fixture decision must name one unique fixture Response id and hash.');
    decisions.set(key, structuredClone(decision));
  }
  const drafts = prepareDraftFixtures(scope, definitions, fixtures.drafts, tools, filingResponseIds);
  return { filings, decisions, drafts };
}

export function selectFilingStatus(
  key: DraftKey, definition: FormDefinition, candidates: readonly ResponseFiling[],
  decisions: ReadonlyMap<string, DispositionObservation>, tools: ResponseRecordTools,
): FilingObservation {
  const selection: ResponseSelection = {
    definition: { url: key.definitionUrl }, status: 'completed', cardinality: 'latest', pin: 'none', whenNone: 'empty',
    subject: Object.keys(key.subject?.keys ?? {}).map(name => ({ key: name, op: 'eq', from: { subject: name } })),
  };
  const context: ResponseSelectionContext = {
    scope: key.scope, authorized: true, source: 'catalog', upstreamSubject: definition.subject ?? null, projection: [],
    ...(key.subject && { consumerSubject: key.subject.keys }),
  };
  const result = tools.selectResponses(candidates.map(record => responseSelectionRecord(record.key, record.responseJson, 'filing')),
    selection, context);
  if (result.status !== 'available') return { status: 'unavailable' };
  if (result.none) return { status: 'none' };
  const selected = result.records[0];
  if (!selected?.responseHash) return { status: 'unavailable' };
  const { responseId, responseHash } = selected;
  const chosen = candidates.find(candidate => candidate.responseId === responseId && candidate.responseHash === responseHash);
  if (!chosen) return { status: 'unavailable' };
  const decision = decisions.get(responsePairKey(chosen));
  return {
    status: decision?.status === 'decided' ? decision.review : 'filed',
    receiptRef: responseId, responseHash, sample: chosen.sample,
    review: decision?.status === 'unavailable' ? 'unavailable' : 'available',
    comments: decision?.status === 'decided' ? [...decision.comments] : [],
  };
}
