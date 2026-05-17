/**
 * @filedesc Dotted path normalization and tree item navigation by path.
 *
 * Paths use dot notation: `group.field`, `parent.child.leaf`.
 * Indices `[N]` and wildcards `[*]` are supported.
 */

/** The kind of path segment. */
export enum PathSegmentKind {
  /** Exact key: `name` */
  Exact,
  /** Wildcard: `[*]` */
  Wildcard,
  /** Numeric index: `[0]` */
  Indexed,
  /** Special index or property: `[@index]` */
  Special,
}

/** A single segment in a dotted path. */
export type PathSegment =
  | { kind: PathSegmentKind.Exact; key: string }
  | { kind: PathSegmentKind.Wildcard }
  | { kind: PathSegmentKind.Indexed; index: number }
  | { kind: PathSegmentKind.Special; content: string };

/** A parsed dotted path. */
export class Path {
  constructor(public readonly segments: PathSegment[]) {}

  /**
   * Parse a dotted path string into a Path object.
   * Handles `a.b.c`, `a[0].b`, `a[*].b`, and `a[@index]`.
   */
  static parse(s: string | null | undefined): Path {
    if (!s) return new Path([]);

    const segments: PathSegment[] = [];
    let current = '';
    let i = 0;

    while (i < s.length) {
      const char = s[i];
      if (char === '.') {
        if (current) {
          segments.push({ kind: PathSegmentKind.Exact, key: current });
          current = '';
        }
        i++;
      } else if (char === '[') {
        if (current) {
          segments.push({ kind: PathSegmentKind.Exact, key: current });
          current = '';
        }
        const start = i + 1;
        let end = start;
        while (end < s.length && s[end] !== ']') {
          end++;
        }

        if (end < s.length) {
          const content = s.slice(start, end);
          if (content === '*') {
            segments.push({ kind: PathSegmentKind.Wildcard });
          } else if (/^\d+$/.test(content)) {
            // Strict non-negative integer to match Rust `content.parse::<usize>()`.
            // `parseInt` is too lenient: it accepts `0abc`, `-5`, `1e3`, etc.,
            // and would produce silent cross-runtime drift vs Rust.
            segments.push({ kind: PathSegmentKind.Indexed, index: Number(content) });
          } else {
            segments.push({ kind: PathSegmentKind.Special, content });
          }
          i = end + 1;
        } else {
          // Unclosed bracket, treat remainder as part of current segment
          current += '[';
          i++;
        }
      } else {
        current += char;
        i++;
      }
    }

    if (current) {
      segments.push({ kind: PathSegmentKind.Exact, key: current });
    }

    return new Path(segments);
  }

  /** Returns the constituent segments as an array of strings (Exact keys only). */
  splitNormalized(): string[] {
    return this.segments
      .filter((s): s is { kind: PathSegmentKind.Exact; key: string } => s.kind === PathSegmentKind.Exact)
      .map((s) => s.key);
  }

  /** Returns the "base" path string with all indices and wildcards removed. */
  stripIndices(): string {
    return this.splitNormalized().join('.');
  }

  /** Returns the last segment key as a string. */
  leafKey(): string {
    const last = this.segments[this.segments.length - 1];
    if (!last) return '';
    if (last.kind === PathSegmentKind.Exact) return last.key;
    if (last.kind === PathSegmentKind.Wildcard) return '[*]';
    if (last.kind === PathSegmentKind.Indexed) return `[${last.index}]`;
    return `[${last.content}]`;
  }

  /** Returns the parent path as a string. */
  parentString(): string {
    if (this.segments.length === 0) return '';
    const parent = new Path(this.segments.slice(0, -1));
    return parent.toString();
  }

  /** Serialize back to dotted notation. */
  toString(): string {
    let result = '';
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (i > 0 && seg.kind === PathSegmentKind.Exact) {
        result += '.';
      }
      switch (seg.kind) {
        case PathSegmentKind.Exact:
          result += seg.key;
          break;
        case PathSegmentKind.Wildcard:
          result += '[*]';
          break;
        case PathSegmentKind.Indexed:
          result += `[${seg.index}]`;
          break;
        case PathSegmentKind.Special:
          result += `[${seg.content}]`;
          break;
        default:
          break;
      }
    }
    return result;
  }
}
