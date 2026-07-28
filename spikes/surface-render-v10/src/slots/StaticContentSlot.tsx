/**
 * @filedesc `static-content` slot — hand-built. Gap ledger `static-content-rendering`.
 *
 * The binding carries `{kind, content}` and, for headings, `level`. The schema
 * types this slot's binding loosely, so the `kind` vocabulary is not written
 * down as a closed set anywhere the spike could find. This renderer therefore
 * handles the two kinds the bundle uses and renders anything else as plain
 * text rather than guessing — an unknown kind that renders as *something* is a
 * quieter failure than one that renders as nothing.
 *
 * Heading levels are an accessibility contract, which is exactly why this
 * should ship once instead of being re-guessed per host.
 */
export interface StaticContentBinding {
  kind?: string;
  content?: string;
  level?: number;
}

export function StaticContentSlot({ binding }: { binding: StaticContentBinding }) {
  const content = binding.content ?? '';

  if (binding.kind === 'heading') {
    const level = Math.min(Math.max(binding.level ?? 2, 1), 6);
    const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <Tag className="static-heading">{content}</Tag>;
  }

  return <p className="static-text">{content}</p>;
}
