/**
 * @filedesc `static-content` — the closed kind vocabulary, and the heading-level
 * contract.
 *
 * ## The vocabulary IS closed, and the spike said otherwise
 *
 * surface-render-v10's ledger recorded that the `kind` vocabulary "is not
 * written down as a closed set anywhere the spike could find". That is wrong and
 * the correction matters more than the entry: `surface.schema.json`
 * `$defs/Slot`'s `static-content` `allOf` gate carries
 * `enum: [heading, text, image, divider]`, and `surface-spec.md` §5 repeats it —
 * "the four shapes Surface guarantees renderers know how to display without
 * consulting a module". So this renders all four, exhaustively, and an unknown
 * kind is a schema violation rather than a rendering decision.
 *
 * ## Heading levels are an accessibility contract, so the shell owns them
 *
 * The schema types `level` as an absolute 1–6. Absolute levels do not compose:
 * a route renders its own title as the page's `h1`, so an authored `level: 1`
 * inside that route produces a **second** `h1` and a document with two page
 * headings — which is exactly what the spike shipped on `/certify` and
 * `/receipt`.
 *
 * The contract this package states:
 *
 * - A route's title is the page heading. Content inside the route starts one
 *   level below it — `headingBaseLevel`, default 2.
 * - An authored `level` is a **rank within the route**, not a document level:
 *   `level: n` renders at `headingBaseLevel + (n - 1)`, clamped to 6.
 * - Nesting (an `embed-route` slot) raises the base by one, so embedded content
 *   never outranks its host.
 * - No level is ever skipped, and there is never a second `h1`.
 *
 * A host that renders no route title of its own passes `headingBaseLevel: 1` and
 * gets the authored levels back verbatim. The contract is configurable at the
 * composition boundary and fixed everywhere below it, which is the only place it
 * can be got right once.
 */
import { surfaceDiagnostic, type SurfaceDiagnostic, type SurfaceDiagnosticSite } from './diagnostics.js';

/** Closed at v0.1 — `surface.schema.json` `$defs/Slot`, `static-content` gate. */
export const STATIC_CONTENT_KINDS = ['heading', 'text', 'image', 'divider'] as const;
export type StaticContentKind = (typeof STATIC_CONTENT_KINDS)[number];

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface StaticContentBinding {
  kind?: unknown;
  content?: unknown;
  level?: unknown;
}

export type StaticContentPlan =
  | { kind: 'heading'; content: string; level: HeadingLevel }
  | { kind: 'text'; content: string }
  | { kind: 'image'; src: string; alt: string; decorative: boolean }
  | { kind: 'divider' };

export interface StaticContentPlanInput {
  binding: StaticContentBinding;
  /** Level the enclosing container's content starts at. Default 2. */
  headingBaseLevel?: HeadingLevel;
  /** `slot.title`, the only accessible-name channel an image slot has. */
  slotTitle?: string | undefined;
  site: SurfaceDiagnosticSite;
}

export interface StaticContentPlanResult {
  plan: StaticContentPlan | undefined;
  diagnostics: readonly SurfaceDiagnostic[];
}

function clampLevel(value: number): HeadingLevel {
  return Math.min(Math.max(Math.round(value), 1), 6) as HeadingLevel;
}

/** `level: n` inside a container whose content starts at `base`. Never skips, never exceeds 6. */
export function resolveHeadingLevel(authored: unknown, base: HeadingLevel = 2): HeadingLevel {
  const rank = typeof authored === 'number' && Number.isFinite(authored) ? clampLevel(authored) : 1;
  return clampLevel(base + (rank - 1));
}

/**
 * The level a binding renders the route's OWN title at, given the baseline its
 * content starts from — or `undefined` when the binding must render no title
 * heading at all.
 *
 * One rule, one site (`surface-shell-spec.md` §8.3 item 10). At the default
 * baseline of 2 the route title is the page's single `h1`. A host that renders
 * its own page heading passes `headingBaseLevel: 1`, and that host "has taken
 * that responsibility on" (§3.4.1 obligation 1) — the shell honours the
 * baseline it was given, which means NOT emitting a second `h1` under the
 * host's. `undefined` is that case; a binding then labels the route region
 * without a heading rather than competing for level 1.
 */
export function resolveRouteTitleLevel(base: HeadingLevel = 2): HeadingLevel | undefined {
  return base <= 1 ? undefined : (clampLevel(base - 1) as HeadingLevel);
}

export function planStaticContent(input: StaticContentPlanInput): StaticContentPlanResult {
  const { binding, site } = input;
  const base = input.headingBaseLevel ?? 2;
  const kind = binding.kind;
  const content = typeof binding.content === 'string' ? binding.content : '';
  const diagnostics: SurfaceDiagnostic[] = [];

  if (typeof kind !== 'string' || !(STATIC_CONTENT_KINDS as readonly string[]).includes(kind)) {
    diagnostics.push(
      surfaceDiagnostic(
        'SLOT-BINDING-INCOMPLETE',
        `A static-content slot declares kind ${JSON.stringify(kind)}, which is outside the closed set ${STATIC_CONTENT_KINDS.join(' | ')}.`,
        site,
        { kind },
      ),
    );
    return { plan: undefined, diagnostics };
  }

  switch (kind as StaticContentKind) {
    case 'heading':
      return {
        plan: { kind: 'heading', content, level: resolveHeadingLevel(binding.level, base) },
        diagnostics,
      };

    case 'text':
      return { plan: { kind: 'text', content }, diagnostics };

    case 'image': {
      // `content` is "a URL or asset ref" (surface-spec §5). There is NO
      // alt-text field in the binding — the closest thing is `slot.title`,
      // which is optional and is a region label rather than a description of
      // the image. An image with no accessible name is a WCAG 2.2 SC 1.1.1
      // failure and the shell cannot invent one, so: never synthesize a name
      // from the URL (a filename read aloud is confidently wrong), use
      // `slot.title` when the author gave one, mark the image decorative
      // otherwise.
      //
      // The diagnostic fires on EVERY image slot, both branches
      // (surface-shell-spec §3.4.2, §7.3). Silencing it on the `slot.title`
      // branch hides the schema gap behind the workaround: a region label
      // pressed into service is a fallback, not an authored alt, and the count
      // of fires is the measure of finding F1's size. **Closing this needs an
      // `alt` field on the static-content binding in `surface.schema.json`
      // (finding F1, owner: Surface) — it is not closable in a renderer**, so
      // this diagnostic stays lit until that schema change lands.
      const alt = input.slotTitle ?? '';
      diagnostics.push(
        surfaceDiagnostic(
          'STATIC-IMAGE-NO-ALT',
          alt === ''
            ? 'An image slot has no alternative text: the static-content binding carries no alt field and the slot has no title. It is rendered as decorative, which is wrong if it carries meaning.'
            : `An image slot has no authored alternative text: the static-content binding carries no alt field, so the slot title "${alt}" is standing in for one. A region label is not a description of the image.`,
          site,
          { src: content, accessibleName: alt, source: alt === '' ? 'none' : 'slot.title', finding: 'F1' },
        ),
      );
      return {
        plan: { kind: 'image', src: content, alt, decorative: alt === '' },
        diagnostics,
      };
    }

    case 'divider':
      return { plan: { kind: 'divider' }, diagnostics };
  }
}
