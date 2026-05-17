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

export function withThemeEnvelope(body: ThemeState, definitionUrl: string): ThemeDocument {
  return {
    $formspecTheme: '1.0',
    version: '0.1.0',
    targetDefinition: { url: definitionUrl },
    ...body,
  } as ThemeDocument;
}

export function withMappingEnvelope(body: MappingState, definitionUrl: string): MappingDocument {
  const { rules, targetSchema, definitionRef, definitionVersion, ...rest } = body;
  return {
    $formspecMapping: '1.0',
    version: '0.1.0',
    definitionRef: definitionRef ?? definitionUrl,
    definitionVersion: definitionVersion ?? '>=0.0.0',
    targetSchema: targetSchema ?? { format: 'json' },
    rules: rules ?? [],
    ...rest,
  } as MappingDocument;
}
