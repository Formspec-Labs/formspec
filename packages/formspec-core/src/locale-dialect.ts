/** @filedesc Preserve supported Locale dialects through public authoring import. */
export function supportedLocaleDialect(value: unknown): '2.0' | '2.1' {
    if (value === undefined) return '2.0';
    if (value === '2.0' || value === '2.1') return value;
    throw new Error('Unsupported Locale dialect');
}
