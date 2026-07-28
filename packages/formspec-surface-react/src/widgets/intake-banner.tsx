/**
 * @filedesc `IntakeBanner` — the lead-in above a form.
 *
 * What an intake banner is for: setting expectations before someone starts
 * filling something in — roughly how long it takes, what happens to their
 * answers, what they need to hand. It is the one widget in the starter set that
 * lands on an `intake` route, so it is the one that may carry tenant branding.
 *
 * Everything it shows comes from `binding.config`. It invents no copy: a banner
 * that promises "your answers are saved as you go" on a bundle with no draft
 * store is a lie the renderer told on the tenant's behalf.
 */
import type { HeadingLevel } from '@formspec-org/surface';
import { Heading } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
import type { SurfaceWidgetProps } from '../widget-api.js';

export interface IntakeBannerConfig {
  /** Small label above the headline — the service or programme name. */
  eyebrow?: string;
  headline?: string;
  /** One or two sentences. Longer belongs in an `experience-unit` slot. */
  body?: string;
  /** What a person should have to hand before they start. */
  checklist?: readonly string[];
}

function readConfig(config: Readonly<Record<string, unknown>>): IntakeBannerConfig {
  const text = (key: string): string | undefined =>
    typeof config[key] === 'string' && config[key] !== '' ? (config[key] as string) : undefined;
  const checklist = Array.isArray(config.checklist)
    ? config.checklist.filter((item): item is string => typeof item === 'string' && item !== '')
    : undefined;
  const parsed: IntakeBannerConfig = {};
  const eyebrow = text('eyebrow');
  const headline = text('headline');
  const body = text('body');
  if (eyebrow !== undefined) parsed.eyebrow = eyebrow;
  if (headline !== undefined) parsed.headline = headline;
  if (body !== undefined) parsed.body = body;
  if (checklist !== undefined && checklist.length > 0) parsed.checklist = checklist;
  return parsed;
}

export function IntakeBanner({ config, headingLevel, admitsTenantTheme }: SurfaceWidgetProps) {
  const parsed = readConfig(config);
  const empty =
    parsed.eyebrow === undefined &&
    parsed.headline === undefined &&
    parsed.body === undefined &&
    parsed.checklist === undefined;

  return (
    <div
      className="fs-surface-banner"
      data-widget="intake-banner"
      data-tenant-theme={admitsTenantTheme ? 'admitted' : 'refused'}
    >
      {empty ? (
        <WidgetEmptyState>
          Nothing has been written for this banner yet, so there is nothing to read here.
        </WidgetEmptyState>
      ) : (
        <>
          {parsed.eyebrow && <p className="fs-surface-banner__eyebrow">{parsed.eyebrow}</p>}
          {parsed.headline && (
            <Heading level={headingLevel as HeadingLevel} className="fs-surface-banner__headline">
              {parsed.headline}
            </Heading>
          )}
          {parsed.body && <p className="fs-surface-banner__body">{parsed.body}</p>}
          {parsed.checklist && (
            <ul className="fs-surface-banner__checklist">
              {parsed.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
