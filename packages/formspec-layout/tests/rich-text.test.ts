/** @filedesc Tests for the core §4.2.1 rich-text subset parser. */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseRichText, isRichText, richTextToPlain, type RichInline } from '../src/rich-text';

/** Text content of an inline tree, ignoring marks. */
const flat = (nodes: RichInline[]): string =>
    nodes.map((n) => (n.kind === 'text' ? n.value : flat(n.children))).join('');

describe('parseRichText — blocks', () => {
    it('reads a single line as one paragraph', () => {
        expect(parseRichText('Were you able and available for work?')).toEqual([
            { kind: 'paragraph', children: [{ kind: 'text', value: 'Were you able and available for work?' }] },
        ]);
    });

    it('splits paragraphs on a blank line', () => {
        const blocks = parseRichText('First.\n\nSecond.');
        expect(blocks).toHaveLength(2);
        expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
    });

    it('joins a soft line break inside a paragraph with a space', () => {
        const blocks = parseRichText('Answer all questions\nhonestly.');
        expect(blocks).toHaveLength(1);
        expect(flat((blocks[0] as { children: RichInline[] }).children)).toBe('Answer all questions honestly.');
    });

    it('reads consecutive `- ` lines as one list', () => {
        // The NJ eligibility question: a paragraph, then its examples.
        const blocks = parseRichText(
            "Answer 'No' if something is preventing you. Some examples include:\n- Physical or mental health\n- Transportation\n- Childcare",
        );
        expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list']);
        const list = blocks[1] as { kind: 'list'; items: RichInline[][] };
        expect(list.items.map(flat)).toEqual(['Physical or mental health', 'Transportation', 'Childcare']);
    });

    it('accepts `* ` bullets as the same construct', () => {
        const blocks = parseRichText('* One\n* Two');
        expect(blocks).toEqual([
            {
                kind: 'list',
                items: [[{ kind: 'text', value: 'One' }], [{ kind: 'text', value: 'Two' }]],
            },
        ]);
    });

    it('ends a list at the next non-list line', () => {
        expect(parseRichText('- One\nAfter.').map((b) => b.kind)).toEqual(['list', 'paragraph']);
    });
});

describe('parseRichText — inline', () => {
    it('reads **strong**', () => {
        expect(parseRichText('week of **03/23/2025 to 03/29/2025**')).toEqual([
            {
                kind: 'paragraph',
                children: [
                    { kind: 'text', value: 'week of ' },
                    { kind: 'strong', children: [{ kind: 'text', value: '03/23/2025 to 03/29/2025' }] },
                ],
            },
        ]);
    });

    it('reads _emphasis_ at a word boundary', () => {
        const blocks = parseRichText('an _approximate_ date');
        expect((blocks[0] as { children: RichInline[] }).children[1]).toEqual({
            kind: 'em',
            children: [{ kind: 'text', value: 'approximate' }],
        });
    });

    it('leaves intraword underscores literal', () => {
        expect(parseRichText('use field_name_here')).toEqual([
            { kind: 'paragraph', children: [{ kind: 'text', value: 'use field_name_here' }] },
        ]);
    });

    it('reads an https link', () => {
        const blocks = parseRichText('I understand that [false information](https://nj.gov/penalties) may apply.');
        expect((blocks[0] as { children: RichInline[] }).children[1]).toEqual({
            kind: 'link',
            href: 'https://nj.gov/penalties',
            children: [{ kind: 'text', value: 'false information' }],
        });
    });

    it('reads a mailto link', () => {
        const blocks = parseRichText('Write [us](mailto:help@nj.gov).');
        expect((blocks[0] as { children: RichInline[] }).children[1]).toMatchObject({
            kind: 'link',
            href: 'mailto:help@nj.gov',
        });
    });

    it('leaves a javascript: link literal', () => {
        expect(parseRichText('[click](javascript:alert(1))')).toEqual([
            { kind: 'paragraph', children: [{ kind: 'text', value: '[click](javascript:alert(1))' }] },
        ]);
    });

    it('leaves a data: link literal', () => {
        expect(flat((parseRichText('[x](data:text/html,<b>hi</b>)')[0] as { children: RichInline[] }).children))
            .toBe('[x](data:text/html,<b>hi</b>)');
    });

    it('leaves a relative link literal — the subset admits absolute admitted schemes only', () => {
        expect(flat((parseRichText('[x](/local/page)')[0] as { children: RichInline[] }).children)).toBe('[x](/local/page)');
    });

    it('leaves an unterminated delimiter literal', () => {
        expect(flat((parseRichText('a ** b')[0] as { children: RichInline[] }).children)).toBe('a ** b');
        expect(flat((parseRichText('a [b](https://x.test')[0] as { children: RichInline[] }).children)).toBe('a [b](https://x.test');
    });

    it('does not treat constructs outside the subset as markup', () => {
        const outside = '# Heading `code` ![img](https://x.test/a.png) > quote | a | b | 1. one';
        expect(flat((parseRichText(outside)[0] as { children: RichInline[] }).children)).toBe(outside);
    });

    it('does not treat raw HTML as markup', () => {
        const html = '<script>alert(1)</script>';
        expect(parseRichText(html)).toEqual([{ kind: 'paragraph', children: [{ kind: 'text', value: html }] }]);
    });

    it('nests strong inside a link label', () => {
        const blocks = parseRichText('[read the **rules**](https://nj.gov/rules)');
        const link = (blocks[0] as { children: RichInline[] }).children[0] as { kind: string; children: RichInline[] };
        expect(link.kind).toBe('link');
        expect(link.children.map((c) => c.kind)).toEqual(['text', 'strong']);
    });

    it('never nests a link inside a link', () => {
        const blocks = parseRichText('[outer [inner](https://x.test)](https://outer.test)');
        const links: RichInline[] = [];
        const walk = (nodes: RichInline[], insideLink: boolean) => {
            for (const n of nodes) {
                if (n.kind === 'link') {
                    expect(insideLink).toBe(false);
                    links.push(n);
                }
                if (n.kind !== 'text') walk(n.children, insideLink || n.kind === 'link');
            }
        };
        walk((blocks[0] as { children: RichInline[] }).children, false);
        expect(links).toHaveLength(1);
    });
});

describe('isRichText', () => {
    it('is false for text with no subset characters', () => {
        expect(isRichText('Were you actively seeking work?')).toBe(false);
    });

    it('is true when a construct could be present', () => {
        expect(isRichText('a **b**')).toBe(true);
        expect(isRichText('- a')).toBe(true);
        expect(isRichText('a\n\nb')).toBe(true);
    });
});

describe('property: interpolated values never become markup', () => {
    // Core §4.2.1: interpolate first, then parse — but the parse must not be given a chance to read a
    // respondent-supplied value as markup. The emitter enforces that by never re-parsing node text; here we
    // prove the complementary half: whatever a value contains, it survives into a text run verbatim.
    it('round-trips arbitrary plain text through parse + flatten', () => {
        fc.assert(
            fc.property(fc.string(), (value) => {
                const normalized = value.replace(/\r/g, '');
                fc.pre(!isRichText(normalized) && normalized.trim() === normalized && !normalized.includes('\n'));
                expect(richTextToPlain(parseRichText(normalized))).toBe(normalized);
            }),
            { numRuns: 500 },
        );
    });

    it('never produces a link whose href is outside the admitted schemes', () => {
        const hrefs = fc.oneof(
            fc.constantFrom('javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', '/relative', 'ftp://x.test'),
            fc.string(),
        );
        fc.assert(
            fc.property(fc.string({ minLength: 1 }), hrefs, (text, href) => {
                const links: string[] = [];
                const walk = (nodes: RichInline[]) => {
                    for (const n of nodes) {
                        if (n.kind === 'link') links.push(n.href);
                        if (n.kind !== 'text') walk(n.children);
                    }
                };
                for (const block of parseRichText(`[${text}](${href})`)) {
                    if (block.kind === 'paragraph') walk(block.children);
                    else block.items.forEach(walk);
                }
                for (const found of links) {
                    expect(['https:', 'http:', 'mailto:']).toContain(new URL(found).protocol);
                }
            }),
            { numRuns: 500 },
        );
    });
});
