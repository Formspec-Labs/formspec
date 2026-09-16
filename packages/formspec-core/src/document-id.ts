/** @filedesc The one rule for an id that names a bundle file (mapping, registry): a single path segment. */

/**
 * Refuse an id a bundle writer could not use as a file name: empty, `.`/`..`, or carrying a
 * path separator or NUL. A tool-supplied id such as `../escaped` would otherwise write
 * `<id>.<suffix>.json` outside the bundle folder, past the host's path policy.
 */
export function assertDocumentId(id: unknown, what: string): asserts id is string {
  if (typeof id !== 'string' || id === '' || id === '.' || id === '..' || /[/\\\0]/.test(id)) {
    throw new Error(`${what} id must be a single file-name segment (no "/", "\\", NUL, "." or ".."): ${JSON.stringify(id)}`);
  }
}
