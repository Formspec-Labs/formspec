/** @filedesc Merge working artifact state with required spec envelope fields for export/getters. */
import type {
  ComponentDocument,
  ThemeDocument,
  MappingDocument,
} from '@formspec-org/types';
import type { ComponentState, ThemeState, MappingState } from './types.js';

export function withComponentEnvelope(body: ComponentState, definitionUrl: string): ComponentDocument {
  return {
    $formspecComponent: '1.0',
    version: '0.1.0',
    targetDefinition: { url: definitionUrl },
    ...body,
  } as ComponentDocument;
}

/**
 * Merge working Theme state with the required Theme envelope fields.
 *
 * Unlike {@link withComponentEnvelope} this mints NO `targetDefinition` default:
 * theme-spec §2.2.1 makes an absent `targetDefinition` a declaration of bundle scope,
 * and `theme.schema.json` no longer requires it. Defaulting here would rewrite every
 * bundle-scoped Theme into a Definition-scoped one at export.
 */
export function withThemeEnvelope(body: ThemeState): ThemeDocument {
  return {
    $formspecTheme: '1.0',
    ...(body.version === undefined ? { version: '0.1.0' } : {}),
    ...body,
  } as ThemeDocument;
}

/**
 * View working theme state as a ThemeDocument (same object reference; envelope
 * fields are added only at export via {@link withThemeEnvelope}).
 */
export function viewThemeDocument(theme: ThemeState): ThemeDocument {
  return theme as unknown as ThemeDocument;
}

/**
 * Strip the spec-version marker from an imported theme document into working state. The
 * document's identity (`url`, `version`, `name`, `title`, `description`) stays: a manifest pins
 * a Theme by (url, version), so dropping them would make a saved bundle stop resolving.
 */
export function themeStateFromDocument(doc: ThemeDocument): ThemeState {
  const { $formspecTheme: _v, ...rest } = doc;
  return rest as ThemeState;
}

export function withMappingEnvelope(body: MappingState, definitionUrl: string): MappingDocument {
  const { rules, targetSchema, definitionRef, definitionVersion, ...rest } = body;
  const extra = structuredClone(rest);
  return {
    $formspecMapping: '1.0',
    version: '0.1.0',
    definitionRef: definitionRef ?? definitionUrl,
    definitionVersion: definitionVersion ?? '>=0.0.0',
    targetSchema: structuredClone(targetSchema ?? { format: 'json' }),
    rules: structuredClone(rules ?? []),
    ...extra,
  } as MappingDocument;
}

/** Strip envelope fields from an imported mapping document into working state. */
export function mappingStateFromDocument(doc: MappingDocument): MappingState {
  const {
    $formspecMapping: _v,
    $schema: _schema,
    ...rest
  } = doc;
  return rest as MappingState;
}
