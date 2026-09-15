/** @filedesc Rich-text subset parser — Core §4.2.1 Markdown subset for label, hint, and display text. */

/**
 * An inline run inside a {@link RichBlock}.
 *
 * `strong`, `em` and `link` nest inline children; `text` is a literal run. There is no node kind for a
 * construct outside the subset, by design: anything the subset does not define stays `text`.
 */
export type RichInline =
    | { kind: 'text'; value: string }
    | { kind: 'strong'; children: RichInline[] }
    | { kind: 'em'; children: RichInline[] }
    | { kind: 'link'; href: string; children: RichInline[] };

/** A block in the subset: a paragraph, or one unordered list with an inline run per entry. */
export type RichBlock =
    | { kind: 'paragraph'; children: RichInline[] }
    | { kind: 'list'; items: RichInline[][] };

/** URI schemes a `[text](uri)` link may use (core §4.2.1). Everything else stays literal text. */
const ADMITTED_LINK_SCHEMES = new Set(['https:', 'http:', 'mailto:']);

/** Lines that open or continue an unordered list: `- ` or `* `, leading whitespace allowed. */
const LIST_ITEM = /^\s*[-*]\s+(.*)$/;

/**
 * True when `source` contains a character sequence the subset could turn into markup.
 *
 * A negative answer is the fast path *and* the guarantee behind "plain strings render unchanged": a caller
 * that sees `false` can write the string as-is, byte for byte, instead of round-tripping it through the
 * parser. Deliberately over-inclusive — a `_` in `field_name` answers `true` and then parses to one literal
 * text run, which is correct, just not free.
 */
export function isRichText(source: string): boolean {
    return source.includes('**')
        || source.includes('_')
        || source.includes('[')
        || /(^|\n)\s*[-*]\s/.test(source)
        || /\n[ \t]*\n/.test(source);
}

/**
 * Parse the core §4.2.1 rich-text subset: paragraphs, `- ` / `* ` lists, `**strong**`, `_emphasis_`, and
 * `[text](https|http|mailto URI)`. Nothing else is markup — headings, images, code, tables and raw HTML
 * are literal text, as is any link with another scheme.
 *
 * **Callers MUST interpolate `{{ }}` before calling.** The parser has no notion of interpolation, so a value
 * substituted in beforehand is parsed like any other text and CANNOT re-open the markup boundary in the other
 * direction — see the emitter, which never builds markup from a node's text. The rule that protects the
 * respondent (an answer containing `**` is never bold) is the emitter's, enforced by parsing once.
 */
export function parseRichText(source: string): RichBlock[] {
    const blocks: RichBlock[] = [];
    let paragraph: string[] = [];
    let list: string[] | null = null;

    const flushParagraph = () => {
        if (paragraph.length === 0) return;
        blocks.push({ kind: 'paragraph', children: parseInline(paragraph.join(' ')) });
        paragraph = [];
    };
    const flushList = () => {
        if (!list) return;
        blocks.push({ kind: 'list', items: list.map((entry) => parseInline(entry)) });
        list = null;
    };

    for (const line of source.split('\n')) {
        const item = LIST_ITEM.exec(line);
        if (item) {
            flushParagraph();
            (list ??= []).push(item[1].trim());
            continue;
        }
        if (line.trim() === '') {
            flushParagraph();
            flushList();
            continue;
        }
        flushList();
        paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    return blocks;
}

/** Parse one paragraph or list entry into inline runs. `allowLink` is false inside a link (no nested links). */
function parseInline(source: string, allowLink = true): RichInline[] {
    const out: RichInline[] = [];
    let literal = '';
    let i = 0;

    const pushLiteral = () => {
        if (literal === '') return;
        out.push({ kind: 'text', value: literal });
        literal = '';
    };

    while (i < source.length) {
        const rest = source.slice(i);

        if (rest.startsWith('**')) {
            const close = source.indexOf('**', i + 2);
            if (close > i + 2) {
                pushLiteral();
                out.push({ kind: 'strong', children: parseInline(source.slice(i + 2, close), allowLink) });
                i = close + 2;
                continue;
            }
        }

        if (source[i] === '_' && isWordBoundary(source[i - 1])) {
            const close = findEmphasisClose(source, i + 1);
            if (close > i + 1) {
                pushLiteral();
                out.push({ kind: 'em', children: parseInline(source.slice(i + 1, close), allowLink) });
                i = close + 1;
                continue;
            }
        }

        if (allowLink && source[i] === '[') {
            const link = matchLink(source, i);
            if (link) {
                pushLiteral();
                out.push({ kind: 'link', href: link.href, children: parseInline(link.text, false) });
                i = link.end;
                continue;
            }
        }

        literal += source[i];
        i += 1;
    }
    pushLiteral();
    return out;
}

/** `_` delimits emphasis only at a word boundary, so `field_name_here` stays one literal run. */
function isWordBoundary(char: string | undefined): boolean {
    return char === undefined || !/[A-Za-z0-9]/.test(char);
}

/** Index of the closing `_` at a word boundary at or after `from`, or -1. */
function findEmphasisClose(source: string, from: number): number {
    for (let i = from; i < source.length; i += 1) {
        if (source[i] === '_' && isWordBoundary(source[i + 1])) return i;
    }
    return -1;
}

/**
 * Match `[text](uri)` starting at `start`. Returns null when the shape does not close, when `text` or `uri`
 * is empty, when `uri` contains whitespace, or when the scheme is not admitted — a `javascript:` or `data:`
 * URI is not a link, and the whole sequence stays literal text. A leading `!` is the image syntax, which the
 * subset excludes: `![alt](uri)` is literal text in full, not a link labelled `alt`.
 */
function matchLink(source: string, start: number): { text: string; href: string; end: number } | null {
    if (source[start - 1] === '!') return null;
    const textEnd = source.indexOf(']', start + 1);
    if (textEnd < 0 || source[textEnd + 1] !== '(') return null;
    const hrefEnd = source.indexOf(')', textEnd + 2);
    if (hrefEnd < 0) return null;
    const text = source.slice(start + 1, textEnd);
    const href = source.slice(textEnd + 2, hrefEnd);
    if (text === '' || href === '' || /[\s[\]]/.test(href)) return null;
    if (!admitLinkHref(href)) return null;
    return { text, href, end: hrefEnd + 1 };
}

/** True when `href` parses to an absolute URI with an admitted scheme (core §4.2.1). */
function admitLinkHref(href: string): boolean {
    try {
        return ADMITTED_LINK_SCHEMES.has(new URL(href).protocol);
    } catch {
        return false;
    }
}

/** Flatten an inline tree back to its text content — the plain-text rendering of a parsed string. */
export function richTextToPlain(blocks: RichBlock[]): string {
    const inline = (nodes: RichInline[]): string =>
        nodes.map((n) => (n.kind === 'text' ? n.value : inline(n.children))).join('');
    return blocks
        .map((b) => (b.kind === 'paragraph' ? inline(b.children) : b.items.map(inline).join('\n')))
        .join('\n\n');
}
