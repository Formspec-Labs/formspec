/**
 * @filedesc `CeremonyFrame` — the frame around a signing act.
 *
 * ## The sharp edge this widget sits on
 *
 * A `ceremony` route refuses tenant chrome theming, because *the signer's
 * preimage IS the thing signed* (`surface-spec.md` §3): what the person read is
 * the evidence, not a view of it. So this is a **module-supplied widget that is
 * required to render unbranded** — a shape the Registry does not currently
 * express, because `widgetShape.tokenSlots` says which token categories a widget
 * accepts and never says "and none of them on these routes" (gap ledger
 * `widget-x-ceremony-frame`).
 *
 * How it holds anyway, without the Registry expressing it: the widget paints
 * only through `--formspec-*` custom properties, and on a refusing route those
 * properties were emitted from a theme document built from the platform token
 * registry alone (`@formspec-org/surface`'s `createThemeAuthority`). The widget
 * needs no rule of its own — it cannot reach a tenant token because none is in
 * scope. `admitsTenantTheme` is surfaced in the DOM so that absence is
 * measurable rather than merely intended.
 *
 * ## What it does not do
 *
 * It does not sign. There is no signing act in a Surface slot binding and no
 * channel to one, so a control that looked like "sign here" would be a button
 * that produces no signature. It renders the statement being attested to and
 * says, in plain language, that the act itself is not available here.
 */
import { Heading, nextLevel } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
import type { SurfaceWidgetProps } from '../widget-api.js';

export interface CeremonyFrameConfig {
  /** What the person is about to do, before the statement. */
  lead?: string;
  /** The statement being attested to. This is the preimage. */
  statement?: string;
  /** The wording of the confirmation, when a host can actually take one. */
  acknowledgement?: string;
}

function readConfig(config: Readonly<Record<string, unknown>>): CeremonyFrameConfig {
  const text = (key: string): string | undefined =>
    typeof config[key] === 'string' && config[key] !== '' ? (config[key] as string) : undefined;
  const parsed: CeremonyFrameConfig = {};
  const lead = text('lead');
  const statement = text('statement');
  const acknowledgement = text('acknowledgement');
  if (lead !== undefined) parsed.lead = lead;
  if (statement !== undefined) parsed.statement = statement;
  if (acknowledgement !== undefined) parsed.acknowledgement = acknowledgement;
  return parsed;
}

export function CeremonyFrame({ config, headingLevel, admitsTenantTheme, slot }: SurfaceWidgetProps) {
  const parsed = readConfig(config);

  return (
    <div
      className="fs-surface-ceremony"
      data-widget="ceremony-frame"
      data-tenant-theme={admitsTenantTheme ? 'admitted' : 'refused'}
    >
      {slot.title && (
        <Heading level={headingLevel} className="fs-surface-ceremony__title">
          {slot.title}
        </Heading>
      )}
      {parsed.lead && <p className="fs-surface-ceremony__lead">{parsed.lead}</p>}

      {parsed.statement ? (
        <blockquote className="fs-surface-ceremony__statement" data-probe="ceremony-statement">
          {parsed.statement}
        </blockquote>
      ) : (
        <WidgetEmptyState>
          There is no declaration to read here yet, so there is nothing to agree to.
        </WidgetEmptyState>
      )}

      {parsed.acknowledgement && (
        <p className="fs-surface-ceremony__acknowledgement">{parsed.acknowledgement}</p>
      )}

      <Heading level={nextLevel(headingLevel)} className="fs-surface-visually-hidden">
        About signing
      </Heading>
      <p className="fs-surface-ceremony__note">
        Signing is not something this page can do on its own. What you read here is what would be
        signed.
      </p>
    </div>
  );
}
