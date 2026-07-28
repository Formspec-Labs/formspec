/**
 * @filedesc `definition-form` slot — the one slot type the platform already
 * renders.
 *
 * This is bar R2. `FormspecForm` is the shipped respondent-rendering path from
 * `@formspec-org/react`; the fields, labels, widget hints, validation and
 * submit affordance all come from it. Nothing about the form is drawn here.
 *
 * The two things the shell supplies are recorded gaps, not conveniences:
 *
 * - `themeDocument` comes from the route's theme grant, never from the bundle
 *   directly (see `theme-grant.ts`) — gap ledger `theme-authority-unexported`
 *   and `platform-theme-merge`.
 * - `registryEntries` come from the bundle Registry, because the renderer takes
 *   them as a flat prop and nothing wires the bundle's Registry documents to it
 *   — gap ledger `registry-entries-wiring`, which also names the precedence
 *   hole the `flatMap` below papers over.
 */
import { FormspecForm } from '@formspec-org/react';
import type { ThemeDocument } from '@formspec-org/types';
import { definitionByRef, registries } from '../bundle.ts';

export interface DefinitionFormSlotProps {
  definitionRef: string;
  themeDocument: ThemeDocument;
  onSubmit?: () => void;
}

export function DefinitionFormSlot({ definitionRef, themeDocument, onSubmit }: DefinitionFormSlotProps) {
  const definition = definitionByRef(definitionRef);
  const registryEntries = registries.flatMap(
    (registry) => (registry.entries ?? []) as unknown[],
  );

  return (
    <FormspecForm
      definition={definition}
      themeDocument={themeDocument}
      registryEntries={registryEntries}
      onSubmit={() => onSubmit?.()}
    />
  );
}
