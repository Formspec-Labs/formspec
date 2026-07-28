/**
 * @filedesc One route, rendered. Hand-built — part of gap ledger `surface-shell`.
 *
 * Slots render in authored order. The Surface schema has an optional `position`
 * hint with, in its own words, "no normative position vocabulary" at v0.1 — so
 * an author can say `left` and every renderer is free to disagree about what
 * that means. Authored order is the only thing that is actually defined, so
 * that is what this uses.
 *
 * The theme note is deliberately visible. `THEME-ROUTE-CLASS` has been an
 * authoring-time diagnostic since it landed; a person using the app has never
 * been able to see it. On a page that refuses tenant branding, saying so in
 * plain language is most of the value of having the rule.
 */
import { useLayoutEffect } from 'react';
import { enforceDocumentRootThemeBoundary, type ThemeGrant } from '../theme-grant.ts';
import type { VerificationOutcome } from '../verify.ts';
import { SlotRenderer } from '../slots/SlotRenderer.tsx';
import type { RouteHandle } from './route-match.ts';

export interface RouteViewProps {
  handle: RouteHandle;
  params: Readonly<Record<string, string>>;
  grant: ThemeGrant;
  verification: VerificationOutcome;
  onAdvance?: () => void;
  nextRouteTitle?: string;
}

export function RouteView({
  handle,
  params,
  grant,
  verification,
  onAdvance,
  nextRouteTitle,
}: RouteViewProps) {
  const { route } = handle;
  const transition = (route.transitions ?? [])[0];

  // The shipped renderer writes tenant tokens to `<html>` and never cleans them
  // up, so the shell's own boundary is not enough. See
  // `enforceDocumentRootThemeBoundary` — this is a workaround for a defect in
  // `formspec-react`, recorded in the gap ledger, not a design.
  useLayoutEffect(() => {
    enforceDocumentRootThemeBoundary(grant);
  });
  const context = {
    params,
    verification,
    ...(onAdvance ? { onAdvance } : {}),
    ...(nextRouteTitle ? { nextRouteTitle } : {}),
  };

  return (
    <article
      className={`route route--${grant.admitsTenantTheme ? 'branded' : 'platform'}`}
      data-route={route.id}
      data-route-class={route.routeClass ?? 'unclassified'}
      data-tenant-theme={grant.admitsTenantTheme ? 'admitted' : 'refused'}
      data-tenant-token-count={grant.tenantTokenKeys.length}
      aria-labelledby={`route-title-${route.id}`}
    >
      <h1 className="route__title" id={`route-title-${route.id}`}>
        {route.title ?? route.id}
      </h1>

      <p className={`themenote themenote--${grant.admitsTenantTheme ? 'on' : 'off'}`} data-probe="theme-note">
        {grant.reason}
      </p>

      <div className="route__slots">
        {route.slots.map((slot) => (
          <section
            className="slot"
            key={slot.id}
            data-slot={slot.id}
            data-slot-type={slot.slotType}
            aria-label={slot.title ?? slot.id}
          >
            {slot.title && slot.slotType !== 'static-content' && (
              <h2 className="slot__title">{slot.title}</h2>
            )}
            <SlotRenderer slot={slot} themeDocument={grant.themeDocument} context={context} />
          </section>
        ))}
      </div>

      {transition && onAdvance && (
        <TransitionAffordance
          trigger={String(transition.trigger)}
          nextRouteTitle={nextRouteTitle ?? String(transition.to)}
          onAdvance={onAdvance}
        />
      )}
    </article>
  );
}

/**
 * The shell's own "go to the next page" control. Hand-built — gap ledger
 * `transition-has-no-trigger-source`.
 *
 * The Surface declares `transitions: [{trigger: 'submit', to: 'certify'}]`. The
 * shipped renderer will inject a submit button, but only when a Response
 * Actions document publishes an Action with `submit` intent — deliberately, so
 * that nothing fires implicitly. This bundle carries no Response Actions
 * document at all. So the transition is authored, is schema-valid, is signed,
 * and has nothing anywhere that can fire it: the app as described cannot get
 * off its own first page.
 *
 * This button exists so the four routes are clickable. It is not a submit; it
 * navigates. Saying so on the button is the honest version.
 */
function TransitionAffordance({
  trigger,
  nextRouteTitle,
  onAdvance,
}: {
  trigger: string;
  nextRouteTitle: string;
  onAdvance: () => void;
}) {
  return (
    <div className="transition" data-probe="transition-affordance">
      <button type="button" className="transition__button" onClick={onAdvance}>
        Continue to {nextRouteTitle}
      </button>
      <p className="transition__note">
        The page says it moves on when “{trigger}” happens. Nothing in this bundle can make that
        happen, so this button just moves you along.
      </p>
    </div>
  );
}
