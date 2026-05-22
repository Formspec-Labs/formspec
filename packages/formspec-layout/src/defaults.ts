/**
 * Map a definition item to its default component type based on `dataType`.
 *
 * Used as a fallback when no component document is provided or when the
 * theme's widget cascade doesn't resolve to an available component.
 *
 * @param item - A definition item with a `dataType` property.
 * @returns The default component type string (e.g. "TextInput", "NumberInput").
 */
import { COMPATIBILITY_MATRIX } from '@formspec-org/types';

export function getDefaultComponent(item: { dataType?: string }): string {
    if (item.dataType === 'number') return 'NumberInput';
    return COMPATIBILITY_MATRIX[item.dataType ?? '']?.[0] ?? 'TextInput';
}
