/** @filedesc Factory for FormEngine instances. */

import type { FormDefinition } from '@formspec-org/types';
import type { FormEngineOptions } from '../interfaces.js';
import { FormEngine } from './FormEngine.js';

export function createFormEngine(
    definition: FormDefinition,
    options?: FormEngineOptions,
): FormEngine {
    return new FormEngine(definition, options);
}
