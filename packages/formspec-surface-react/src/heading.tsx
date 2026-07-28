/**
 * @filedesc `<Heading>` — a heading that takes its level from the composition,
 * not from the component that draws it.
 *
 * Every heading in this package goes through here. A widget or slot renderer
 * that writes `<h2>` directly is a component that is right exactly once — until
 * it is embedded, nested, or dropped onto a route whose host renders its own
 * title. Heading levels are the document outline, and the outline is an
 * accessibility contract (WCAG 1.3.1), so the level is an input.
 */
import type { ReactNode } from 'react';
import type { HeadingLevel } from '@formspec-org/surface';

export interface HeadingProps {
  level: HeadingLevel;
  className?: string;
  id?: string;
  children: ReactNode;
}

export function Heading({ level, className, id, children }: HeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <Tag className={className} id={id}>
      {children}
    </Tag>
  );
}

/** One level down, never past 6. */
export function nextLevel(level: HeadingLevel): HeadingLevel {
  return Math.min(level + 1, 6) as HeadingLevel;
}
