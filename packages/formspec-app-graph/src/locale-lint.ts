/** @filedesc Locale spec §7 lint of each loaded Locale against its resolved target, through an injected linter. */

import type {
  AppGraphContext,
  AppGraphCrossArtifactValidator,
  AppGraphDiagnostic,
  AppGraphSeverity,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import { componentTargetUrl } from './locale-associations.js';
import { handlesByKind, ownProp, record, stringProp } from './surface-widgets.js';

/**
 * The documents a Locale is linted against (Locale spec §7): its target
 * Definition or Screener plus the Theme and Component documents that render
 * that Definition. Key names match the engine linter's options, so a host
 * passes `lintDocument` from `@formspec-org/engine` unchanged.
 */
export interface AppGraphLocaleLintContext {
  definitionDocument?: unknown;
  screenerDocument?: unknown;
  themeDocument?: unknown;
  componentDocuments?: unknown[];
}

export interface AppGraphLintDiagnostic {
  code?: string;
  severity?: string;
  path?: string;
  message?: string;
}

/**
 * The host's document linter, injected the way schema validators are: this
 * package carries no engine. Formspec hosts pass the engine's `lintDocument`
 * (the Rust `formspec-lint` E1400–E1411 Locale checks via WASM).
 */
export type AppGraphDocumentLinter = (
  document: unknown,
  context: AppGraphLocaleLintContext,
) => { diagnostics?: readonly AppGraphLintDiagnostic[] };

/** Diagnostics from this validator keep the Locale spec's own codes under this origin. */
export const LOCALE_LINT_ORIGIN = 'x-formspec-lint' as const;

const BARE_ITEM_KEY_RULE =
  'Item strings use the Definition Item\'s bare key at any depth (`givenName.label`), never a dotted path through groups (`applicant.givenName.label`) or an indexed path (Locale spec §3.1).';

function severity(value: string | undefined): AppGraphSeverity | undefined {
  return value === 'error' || value === 'warning' || value === 'info' ? value : undefined;
}

/** `$.strings["a.b"][0].c` -> `/strings/a.b/0/c`; anything unparsed falls back to the root. */
export function lintPathToJsonPointer(path: string | undefined): string {
  if (!path || path === '$') return '';
  const segments: string[] = [];
  const pattern = /\.([^.[\]]+)|\["((?:[^"\\]|\\.)*)"\]|\[(\d+)\]/gy;
  pattern.lastIndex = path.startsWith('$') ? 1 : 0;
  while (pattern.lastIndex < path.length) {
    const match = pattern.exec(path);
    if (!match) return '';
    const segment = match[1] ?? (match[2] !== undefined ? JSON.parse(`"${match[2]}"`) as string : match[3]!);
    segments.push(segment.replace(/~/g, '~0').replace(/\//g, '~1'));
  }
  return segments.map((segment) => `/${segment}`).join('');
}

function exactlyOne<T>(values: readonly T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function handleUrlMatches(handle: ResolvedArtifactHandle, url: string): boolean {
  return handle.ref?.url === url && stringProp(record(handle.document), 'url') === url;
}

/** The target's documents, or undefined when the target does not resolve exactly once (APP-GRAPH-LOCALE-TARGET owns that). */
function lintContextFor(
  context: AppGraphContext,
  kind: string | undefined,
  url: string | undefined,
): AppGraphLocaleLintContext | undefined {
  if (kind === 'app') return {};
  if (!url) return undefined;
  if (kind === 'screener') {
    const screener = exactlyOne(handlesByKind(context.handles, 'screener').filter((handle) => handleUrlMatches(handle, url)));
    return screener ? { screenerDocument: screener.document } : undefined;
  }
  if (kind !== 'definition') return undefined;
  const definition = exactlyOne(handlesByKind(context.handles, 'definition').filter((handle) => handleUrlMatches(handle, url)));
  if (!definition) return undefined;
  const theme = exactlyOne(handlesByKind(context.handles, 'theme').filter((handle) =>
    stringProp(record(ownProp(record(handle.document), 'targetDefinition')), 'url') === url
  ));
  const components = handlesByKind(context.handles, 'component')
    .filter((handle) => componentTargetUrl(record(handle.document)) === url)
    .map((handle) => handle.document);
  return {
    definitionDocument: definition.document,
    ...(theme ? { themeDocument: theme.document } : {}),
    ...(components.length > 0 ? { componentDocuments: components } : {}),
  };
}

/**
 * Build the cross-artifact validator that runs the injected linter over every
 * loaded Locale with its resolved target. Pass it in `crossArtifactValidators`;
 * error-severity Locale findings (E1400–E1411) then fail the report.
 */
export function localeLintValidator(lint: AppGraphDocumentLinter): AppGraphCrossArtifactValidator {
  return (context) => handlesByKind(context.handles, 'locale').flatMap((locale): AppGraphDiagnostic[] => {
    const target = record(ownProp(record(locale.document), 'target'));
    const targetKind = stringProp(target, 'kind');
    const targetUrl = stringProp(target, 'url');
    const lintContext = lintContextFor(context, targetKind, targetUrl);
    if (!lintContext) return [];
    return (lint(locale.document, lintContext).diagnostics ?? []).flatMap((finding): AppGraphDiagnostic[] => {
      const level = severity(finding.severity);
      if (!level || level === 'info' || !finding.code) return [];
      return [{
        code: finding.code,
        severity: level,
        phase: 'cross-artifact',
        origin: LOCALE_LINT_ORIGIN,
        message: `Locale '${locale.slot}': ${finding.message ?? finding.code}${finding.code === 'E1402' ? ` ${BARE_ITEM_KEY_RULE}` : ''}`,
        primarySource: diagnosticSourceForHandle(locale, lintPathToJsonPointer(finding.path)),
        details: {
          lintPath: finding.path,
          targetKind,
          targetUrl,
        },
      }];
    });
  });
}
