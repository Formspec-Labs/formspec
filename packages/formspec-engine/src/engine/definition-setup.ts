/** @filedesc Definition constructor helper for resolving option sets. */

import { parseJsonExact } from '@formspec-org/integrity-canonical';
import type { FormDefinition } from '@formspec-org/types';
import { wasmResolveOptionSetsOnDefinition } from '../wasm-bridge-runtime.js';

export function resolveOptionSetsOnDefinition(definition: FormDefinition): FormDefinition {
    return parseJsonExact(
        wasmResolveOptionSetsOnDefinition(JSON.stringify(definition)),
    ) as FormDefinition;
}

