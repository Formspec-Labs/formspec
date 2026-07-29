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
 * The schema now describes `level` as a rank from 1 through 6 within the
 * enclosing route or slot. This amendment matters because an absolute reading
 * does not compose: a route renders its own title as the page's `h1`, so an
 * authored `level: 1` inside that route would produce a **second** `h1` — which
 * is exactly what the spike shipped on `/certify` and `/receipt`.
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

/** Closed at v0.2 — `surface.schema.json` `$defs/Slot`, `static-content` gate. */
export const STATIC_CONTENT_KINDS = ['heading', 'text', 'image', 'divider'] as const;
export type StaticContentKind = (typeof STATIC_CONTENT_KINDS)[number];

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface StaticContentBinding {
  kind?: unknown;
  content?: unknown;
  alt?: unknown;
  level?: unknown;
}

export type StaticContentPlan =
  | { kind: 'heading'; content: string; level: HeadingLevel }
  | { kind: 'text'; content: string }
  | { kind: 'image'; src: string; alt: string; decorative: boolean }
  | { kind: 'divider' };

export interface SurfaceStaticAssetRequest {
  kind: 'image';
  /** The untrusted URL or asset reference authored in `binding.content`. */
  source: string;
  site: SurfaceDiagnosticSite;
}

export type SurfaceStaticAssetResolution =
  | { status: 'admitted'; source: string }
  | { status: 'refused'; reason?: string | undefined };

/**
 * The host's synchronous admission boundary for static assets.
 *
 * The resolver may turn an authored asset reference into a runtime URL, but it
 * must return a refusal when its origin or reference is not allowed.
 */
export type SurfaceStaticAssetResolver = (
  request: SurfaceStaticAssetRequest,
) => SurfaceStaticAssetResolution;

export interface StaticContentPlanInput {
  binding: StaticContentBinding;
  /** Level the enclosing container's content starts at. Default 2. */
  headingBaseLevel?: HeadingLevel;
  /** Required before an authored image source may reach a binding. */
  staticAssetResolver?: SurfaceStaticAssetResolver | undefined;
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
        'STATIC-CONTENT-KIND-UNKNOWN',
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
      if (typeof binding.alt !== 'string') {
        diagnostics.push(
          surfaceDiagnostic(
            'STATIC-IMAGE-NO-ALT',
            'An image binding has no authored alternative text. The image is unavailable because the shell cannot infer a description from its title, URL, or filename.',
            site,
            { src: content, authoredAlt: binding.alt },
          ),
        );
        return { plan: undefined, diagnostics };
      }
      const alt = binding.alt;
      const admittedSource = admitStaticImageSource(
        input.staticAssetResolver,
        content,
        site,
      );
      if (admittedSource.status === 'refused') {
        diagnostics.push(
          surfaceDiagnostic(
            'STATIC-IMAGE-SOURCE-REFUSED',
            'The host did not admit this image source, so the image is unavailable.',
            site,
            { authoredSource: content, reason: admittedSource.reason },
          ),
        );
        return { plan: undefined, diagnostics };
      }
      return {
        plan: { kind: 'image', src: admittedSource.source, alt, decorative: alt === '' },
        diagnostics,
      };
    }

    case 'divider':
      return { plan: { kind: 'divider' }, diagnostics };
  }
}

function admitStaticImageSource(
  resolver: SurfaceStaticAssetResolver | undefined,
  source: string,
  site: SurfaceDiagnosticSite,
):
  | { status: 'admitted'; source: string }
  | { status: 'refused'; reason: string } {
  if (resolver === undefined) {
    return { status: 'refused', reason: 'resolver-absent' };
  }

  try {
    const result = resolver({ kind: 'image', source, site });
    if (
      result?.status === 'admitted' &&
      typeof result.source === 'string' &&
      result.source.trim() !== ''
    ) {
      return { status: 'admitted', source: result.source };
    }
    if (result?.status === 'admitted') {
      return { status: 'refused', reason: 'empty-admitted-source' };
    }
    if (result?.status === 'refused') {
      return { status: 'refused', reason: result.reason ?? 'host-refused' };
    }
    return { status: 'refused', reason: 'resolver-result-invalid' };
  } catch {
    return { status: 'refused', reason: 'resolver-error' };
  }
}
