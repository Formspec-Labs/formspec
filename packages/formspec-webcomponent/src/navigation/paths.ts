/** @filedesc Field path normalization; validation result paths share `data-name` 0-based indexes. */
export function normalizeFieldPath(path: unknown): string {
    return typeof path === 'string' ? path.trim() : '';
}
