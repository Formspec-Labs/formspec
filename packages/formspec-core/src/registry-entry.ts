/** @filedesc Narrow loaded extension registry entries without casts in call sites. */

export interface RegistryEntryShape {
  category?: string;
  name?: string;
  baseType?: string;
  source?: string;
  functionCategory?: string;
  group?: string;
}

export function registryEntry(entry: unknown): RegistryEntryShape {
  if (entry !== null && typeof entry === 'object') {
    return entry as RegistryEntryShape;
  }
  return {};
}
