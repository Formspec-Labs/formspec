/** @filedesc Validate instance JSON against optional per-instance schema (datatype strings). */

import { getNestedValue, isJsonRecord, validateDataType } from './helpers.js';

export function validateInstanceDataAgainstSchema(
    instanceName: string,
    data: unknown,
    schema: Record<string, unknown> | undefined,
): void {
    if (!schema || typeof schema !== 'object') {
        return;
    }
    if (!isJsonRecord(data)) {
        return;
    }
    for (const [path, dataType] of Object.entries(schema)) {
        if (typeof dataType !== 'string') {
            continue;
        }
        const value = getNestedValue(data, path);
        if (value === undefined || value === null) {
            continue;
        }
        if (!validateDataType(value, dataType)) {
            throw new Error(`Instance '${instanceName}' schema mismatch at '${path}': expected ${dataType}`);
        }
    }
}
