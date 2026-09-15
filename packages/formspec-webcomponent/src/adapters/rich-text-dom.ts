/** @filedesc writeRichText — render the core §4.2.1 rich-text subset into an element, replacing its content. */
import { parseRichText, isRichText, type RichBlock, type RichInline } from '@formspec-org/layout';

export interface RichTextOptions {
    /**
     * The host element's content model forbids block content — a `<label>` or a group's `<legend>`. Paragraphs
     * and list entries flatten to `<br>`-separated inline runs; the inline marks survive intact (core §4.2.1).
     */
    inline?: boolean;
    /**
     * Resolve `{{expression}}` in each parsed leaf. Supply it **with the authored template as `text`**: the
     * structure then comes from what the author wrote and every interpolated value lands as a text node, so a
     * respondent's answer containing `**` or `[x](https://evil.test)` can never open a markup boundary
     * (core §4.2.1, "interpolate, then parse … the markup boundary is what the author wrote"). Omit it when
     * `text` is already final — a string with no `{{}}` left in it.
     */
    interpolate?: (template: string) => string;
}

/** URI schemes a link may use after interpolation (core §4.2.1). Mirrors the parser's admission. */
const ADMITTED_LINK_SCHEMES = new Set(['https:', 'http:', 'mailto:']);

/**
 * Replace `el`'s content with `text` rendered through the core §4.2.1 subset.
 *
 * Every node is built with `createElement` / `createTextNode` and every author string lands as a text node, so
 * no path exists from a string to markup except the five constructs the parser recognises.
 *
 * Elements carry both the Formspec class and the USWDS one (`formspec-rich-list usa-list`), the same
 * dual-class convention the required marker already uses (`formspec-required usa-label--required`): the design
 * system styles its class, the default renderer styles its own, and neither adapter needs a seam for the other.
 */
export function writeRichText(el: HTMLElement, text: string | null | undefined, options?: RichTextOptions): void {
    const source = text ?? '';
    const interpolate = options?.interpolate ?? ((t: string) => t);
    if (!isRichText(source)) {
        // Plain strings render unchanged — no parse, no wrapper elements.
        el.textContent = interpolate(source);
        return;
    }
    const blocks = parseRichText(source);
    el.textContent = '';
    el.append(...(options?.inline ? inlineFragment(blocks, interpolate) : blockFragment(blocks, interpolate)));
}

type Interpolate = (template: string) => string;

/** Block rendering: one `<p>` per paragraph (or bare runs for a single one), `<ul><li>` per list. */
function blockFragment(blocks: RichBlock[], interpolate: Interpolate): Node[] {
    // A single paragraph needs no wrapper: the host element (`div.formspec-hint`, `div.usa-hint`) is the block.
    if (blocks.length === 1 && blocks[0].kind === 'paragraph') return inlineNodes(blocks[0].children, interpolate);

    const out: Node[] = [];
    for (const block of blocks) {
        if (block.kind === 'paragraph') {
            const p = document.createElement('p');
            p.className = 'formspec-rich-paragraph';
            p.append(...inlineNodes(block.children, interpolate));
            out.push(p);
            continue;
        }
        const ul = document.createElement('ul');
        ul.className = 'formspec-rich-list usa-list';
        for (const item of block.items) {
            const li = document.createElement('li');
            li.append(...inlineNodes(item, interpolate));
            ul.appendChild(li);
        }
        out.push(ul);
    }
    return out;
}

/** Inline rendering for a `<label>` / `<legend>`: block boundaries become `<br>` (core §4.2.1). */
function inlineFragment(blocks: RichBlock[], interpolate: Interpolate): Node[] {
    const runs: Node[][] = [];
    for (const block of blocks) {
        if (block.kind === 'paragraph') runs.push(inlineNodes(block.children, interpolate));
        else for (const item of block.items) runs.push(inlineNodes(item, interpolate));
    }
    const out: Node[] = [];
    runs.forEach((run, i) => {
        if (i > 0) out.push(document.createElement('br'));
        out.push(...run);
    });
    return out;
}

function inlineNodes(nodes: RichInline[], interpolate: Interpolate): Node[] {
    return nodes.flatMap((node): Node[] => {
        if (node.kind === 'text') return [document.createTextNode(interpolate(node.value))];
        if (node.kind === 'strong') return [withChildren(document.createElement('strong'), node.children, interpolate)];
        if (node.kind === 'em') return [withChildren(document.createElement('em'), node.children, interpolate)];

        // An interpolated href is re-checked: the author picked the scheme, but the value must not move it.
        const href = interpolate(node.href);
        if (!admitted(href)) return inlineNodes(node.children, interpolate);
        const a = document.createElement('a');
        a.className = 'formspec-rich-link usa-link';
        a.href = href;
        a.rel = 'noopener';
        // A new tab for a page, not for a mail client: `mailto:` hands off to the OS and leaves an empty tab.
        if (/^https?:$/.test(new URL(href).protocol)) a.target = '_blank';
        return [withChildren(a, node.children, interpolate)];
    });
}

function admitted(href: string): boolean {
    try {
        return ADMITTED_LINK_SCHEMES.has(new URL(href).protocol);
    } catch {
        return false;
    }
}

function withChildren<T extends HTMLElement>(el: T, children: RichInline[], interpolate: Interpolate): T {
    el.append(...inlineNodes(children, interpolate));
    return el;
}
