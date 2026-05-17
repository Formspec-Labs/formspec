/** @filedesc Produce human-readable descriptions of shape constraints. */
import type { FormShape } from '@formspec-org/types';

/**
 * Produce a human-readable description of a shape constraint.
 *
 * If the shape has a message, uses that. Otherwise falls back to the
 * constraint expression. Includes severity when not the default "error".
 */
export function describeShapeConstraint(shape: FormShape): string {
  const s = shape;
  const target = s.target ?? '?';
  const severity = s.severity as string | undefined;

  // Build the core description
  let description: string;
  if (s.message) {
    description = s.message;
  } else if (s.constraint) {
    description = s.constraint;
  } else if (s.and) {
    description = `Composition (AND) of shapes: ${(s.and as string[]).join(', ')}`;
  } else if (s.or) {
    description = `Composition (OR) of shapes: ${(s.or as string[]).join(', ')}`;
  } else if (s.not) {
    description = `Negation of shape: ${s.not}`;
  } else if (s.xone) {
    description = `Exactly one of shapes: ${(s.xone as string[]).join(', ')}`;
  } else {
    description = `Shape "${s.id}" on target "${target}"`;
  }

  // Prefix with target context
  const targetLabel = target === '#' ? 'Form-level' : `"${target}"`;

  // Prefix with severity when non-default
  const parts: string[] = [];
  if (severity && severity !== 'error') {
    parts.push(`[${severity}]`);
  }
  parts.push(`${targetLabel}: ${description}`);

  return parts.join(' ');
}
