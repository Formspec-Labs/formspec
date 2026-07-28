/**
 * @filedesc `SurfaceSlot` — one planned slot, rendered — and `SurfaceSlotFrame`,
 * the ONE place a slot's own title becomes a heading.
 *
 * The dispatch already happened: `@formspec-org/surface`'s `planRoute` turned a
 * `slotType` into a typed `SlotPlan`, exhaustively and without React in scope.
 * This file binds each plan variant to elements and nothing else, which is why
 * a second renderer (web component, server-side) needs a file this size rather
 * than a re-implementation of the taxonomy.
 *
 * ## Why the frame is a component and not two inline expressions
 *
 * `surface-shell-spec.md` §8.3 item 10: "Where a decision — whether to render a
 * slot's own title, which level a title takes — is made in more than one code
 * path, those paths MUST agree; divergent duplicates of the same rule are how a
 * fixed defect reappears one nesting level down." It did: the top-level path
 * suppressed a slot title only for `kind: heading`, and the embed path
 * suppressed it for **all** `static-content` kinds, throwing away the authored
 * title of every `text`, `image` and `divider` slot inside an embed — the exact
 * bug the top-level path had already been fixed to remove. The embed path also
 * rendered the title at the HOST slot's base rather than the child's, so an
 * embedded title sat at the same rank as its host while its content sat one
 * deeper. {@link SurfaceSlotFrame} is both paths now.
 */
import type { ReactNode } from 'react';
import { FormspecForm } from '@formspec-org/react';
import type { SlotPlan, SurfaceStrings, ThemeGrant } from '@formspec-org/surface';
import { Heading, nextLevel } from './heading.js';
import type {
  SurfaceWidget,
  SurfaceWidgetDataResolver,
  SurfaceWidgetRouteContext,
} from './widget-api.js';

export interface SurfaceSlotProps {
  plan: SlotPlan<SurfaceWidget>;
  grant: ThemeGrant;
  route: SurfaceWidgetRouteContext;
  /** The shell's own person-facing strings, host-overridable (§3.0). */
  strings: SurfaceStrings;
  widgetData?: SurfaceWidgetDataResolver | undefined;
  /** Shows the design rationale on `experience-unit` slots. Off for respondents. */
  showExperienceNeeds?: boolean | undefined;
  /**
   * The bundle's Response Actions document.
   *
   * `FormspecForm` injects a submit control ONLY when this publishes an Action
   * with `submit` intent — response-actions-spec §10 forbids implicit default
   * Actions, so a renderer that invented one would be wrong. Passing it is what
   * makes a form-bearing route able to fire its own transition.
   */
  responseActionsDocument?: unknown;
  /** An Action published under `intent` completed successfully. */
  onActionCompleted?: ((intent: string) => void) | undefined;
}

/**
 * True when the slot's own binding already produces the heading for its
 * content, so a slot-level title on top of it would be two headings for one
 * piece of content.
 *
 * Every other slot type — INCLUDING a `text`, `image` or `divider` static slot
 * — keeps its authored title. Dropping it for the whole slot type silently
 * threw away authored content: the spike bundle's `applyReassurance` slot is
 * `kind: text` titled "Before you start", and the title vanished.
 */
export function rendersOwnHeading(plan: SlotPlan<SurfaceWidget>): boolean {
  return plan.slotType === 'static-content' && plan.content?.kind === 'heading';
}

/**
 * The wrapper every slot renders inside, at every nesting depth: the element,
 * the data attributes a probe reads, and the slot's own title at **the plan's**
 * heading level.
 *
 * `aria-label` is set only when the slot carries an authored title. Labelling a
 * region with a slot id turns machine vocabulary into something a screen reader
 * announces, and a `<section>` with no accessible name is inert rather than a
 * landmark — which is the honest shape for a slot the author did not name.
 */
export function SurfaceSlotFrame(props: SurfaceSlotProps) {
  const { plan } = props;
  return (
    <section
      className="fs-surface-slot"
      data-slot={plan.slotId}
      data-slot-type={plan.slotType}
      {...(plan.title ? { 'aria-label': plan.title } : {})}
    >
      {plan.title && !rendersOwnHeading(plan) && (
        <Heading level={plan.headingBaseLevel} className="fs-surface-slot__title">
          {plan.title}
        </Heading>
      )}
      <SurfaceSlot {...props} />
    </section>
  );
}

export function SurfaceSlot({
  plan,
  grant,
  route,
  strings,
  widgetData,
  showExperienceNeeds = false,
  responseActionsDocument,
  onActionCompleted,
}: SurfaceSlotProps): ReactNode {
  switch (plan.slotType) {
    case 'definition-form': {
      if (plan.status === 'unresolved' || plan.definition === undefined) {
        return <UnavailableSlot>{strings('slotUnavailableDefinitionForm')}</UnavailableSlot>;
      }
      // `themeDocument` comes from the route's grant and never from the bundle
      // directly. On a refusing route that object was built from the platform
      // token registry and never saw a tenant token — which is what makes the
      // boundary structural rather than a styling choice.
      return (
        <FormspecForm
          definition={plan.definition}
          themeDocument={grant.themeDocument}
          registryEntries={plan.registryEntries as unknown[]}
          // `@formspec-org/types` generates `ResponseActionsDocument` from the
          // schema; `@formspec-org/react` takes the engine's
          // `ResponseActionsDocumentInput`. Neither is assignable to the other,
          // which is a shipped-type mismatch rather than a shell decision —
          // finding F6, owner `formspec-types` / `formspec-engine`.
          responseActionsDocument={(responseActionsDocument ?? null) as never}
          {...(onActionCompleted
            ? { onSubmit: () => onActionCompleted('submit') }
            : {})}
        />
      );
    }

    case 'experience-unit': {
      const { unit } = plan;
      if (unit.status === 'unresolved') {
        return <UnavailableSlot>{strings('slotUnavailableExperienceUnit')}</UnavailableSlot>;
      }
      return (
        <div className="fs-surface-unit" data-experience-unit={unit.unitRef}>
          {unit.title && (
            <Heading level={plan.headingBaseLevel} className="fs-surface-unit__title">
              {unit.title}
            </Heading>
          )}
          {/*
            `needRefs[].description` is design rationale ABOUT the respondent,
            not copy FOR them — "this is the screen someone would want to leave
            and come back to". Off by default; an authoring or review surface
            turns it on.
          */}
          {showExperienceNeeds && unit.needs.length > 0 && (
            <ul className="fs-surface-unit__needs" data-probe="experience-needs">
              {unit.needs.map((need) => (
                <li key={need.id}>{need.description ?? need.id}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    case 'module-widget': {
      const { resolution, key } = plan;
      if (resolution.status !== 'resolved') {
        return (
          <UnavailableSlot>
            {strings(
              resolution.status === 'unimplemented'
                ? 'slotUnavailableWidgetUnimplemented'
                : 'slotUnavailableWidgetUndeclared',
              { widgetName: key.widgetName, moduleId: key.moduleId },
            )}
          </UnavailableSlot>
        );
      }
      // A resolved-but-undeclared widget still renders — the host supplied a
      // component. `WIDGET-UNDECLARED` is already in the plan's diagnostics
      // (§3.3): a shell MAY render it, and MUST say it did.
      const Widget = resolution.component;
      return (
        <Widget
          moduleId={key.moduleId}
          widgetName={key.widgetName}
          slot={{ id: plan.slotId, title: plan.title }}
          route={route}
          headingLevel={plan.headingBaseLevel}
          config={plan.config ?? {}}
          data={widgetData?.({
            moduleId: key.moduleId,
            widgetName: key.widgetName,
            slotId: plan.slotId,
            route,
            config: plan.config ?? {},
          })}
          admitsTenantTheme={grant.admitsTenantTheme}
        />
      );
    }

    case 'static-content': {
      const { content } = plan;
      if (content === undefined) {
        return <UnavailableSlot>{strings('slotUnavailableStaticContent')}</UnavailableSlot>;
      }
      switch (content.kind) {
        case 'heading':
          return (
            <Heading level={content.level} className="fs-surface-static-heading">
              {content.content}
            </Heading>
          );
        case 'text':
          return <p className="fs-surface-static-text">{content.content}</p>;
        case 'image':
          return (
            <img
              className="fs-surface-static-image"
              src={content.src}
              alt={content.alt}
              // A decorative image is announced to nobody. That is the correct
              // treatment for an image with no accessible name, and the wrong
              // outcome for an image that carries meaning — which is why the
              // missing alt channel reports on EVERY image slot (finding F1)
              // rather than only on this branch.
              {...(content.decorative ? { role: 'presentation' } : {})}
            />
          );
        case 'divider':
          // Presentational only: no accessible name, not focusable, and
          // `content` is not rendered as text even when non-empty (§3.4.2).
          return <hr className="fs-surface-static-divider" />;
      }
      return null;
    }

    case 'embed-route': {
      if (plan.status !== 'ready') {
        return (
          <UnavailableSlot>
            {strings(
              plan.status === 'cycle'
                ? 'slotUnavailableEmbedCycle'
                : 'slotUnavailableEmbedUnresolved',
            )}
          </UnavailableSlot>
        );
      }
      // Embedded content paints on the HOST route's surface, so it renders under
      // the host's grant — an embedded route cannot restore branding the host
      // refuses. Headings step down a level, which `planRoute` already decided;
      // this renders the level it was handed and re-derives nothing.
      return (
        <div className="fs-surface-embed" data-embed-route={plan.routeRef} data-embed-mode={plan.mode}>
          {plan.slots.map((child) => (
            <SurfaceSlotFrame
              key={child.slotId}
              plan={child}
              grant={grant}
              route={route}
              strings={strings}
              widgetData={widgetData}
              showExperienceNeeds={showExperienceNeeds}
              responseActionsDocument={responseActionsDocument}
              onActionCompleted={onActionCompleted}
            />
          ))}
        </div>
      );
    }
  }
}

function UnavailableSlot({ children }: { children: ReactNode }) {
  return (
    <p className="fs-surface-unavailable" role="status" data-probe="slot-unavailable">
      {children}
    </p>
  );
}

export { nextLevel };
