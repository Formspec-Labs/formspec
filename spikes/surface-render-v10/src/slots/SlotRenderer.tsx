/**
 * @filedesc Slot dispatch — hand-built. Gap ledger `slot-dispatch`.
 *
 * The slot-type taxonomy is closed and shipped (ADR 0150 §6.2), enforced by the
 * schema, by lint, and by the app-graph validator. No runtime anywhere reads
 * it. This switch is the only place in the stack where a `slotType` becomes
 * pixels, and it is 40 lines long — which is the point. The work is not hard;
 * it simply has never been done, and until it is, every host that wants to run
 * a Surface writes these 40 lines again and disagrees with the last one.
 *
 * `embed-route` is unimplemented: this bundle uses none, and implementing a
 * composition primitive with no fixture to check it against would be guessing.
 * Recorded on the switch's default arm rather than silently skipped.
 *
 * The theme grant arrives as a prop. Slot renderers cannot reach the tenant
 * Theme any other way — that is what makes bar R3 structural.
 */
import type { SurfaceDocument, ThemeDocument } from '@formspec-org/types';
import { DefinitionFormSlot } from './DefinitionFormSlot.tsx';
import { ExperienceUnitSlot } from './ExperienceUnitSlot.tsx';
import { ModuleWidgetSlot, type ModuleWidgetBinding } from './ModuleWidgetSlot.tsx';
import { StaticContentSlot, type StaticContentBinding } from './StaticContentSlot.tsx';
import type { WidgetContext } from '../widgets/tenant-chrome.tsx';

type Slot = SurfaceDocument['routes'][number]['slots'][number];

export interface SlotRendererProps {
  slot: Slot;
  themeDocument: ThemeDocument;
  context: WidgetContext;
}

export function SlotRenderer({ slot, themeDocument, context }: SlotRendererProps) {
  switch (slot.slotType) {
    case 'definition-form': {
      const binding = slot.binding as { definitionRef?: string };
      if (!binding.definitionRef) return <UnrenderableSlot slot={slot} why="no definition to show" />;
      return (
        <DefinitionFormSlot
          definitionRef={binding.definitionRef}
          themeDocument={themeDocument}
          {...(context.onAdvance ? { onSubmit: context.onAdvance } : {})}
        />
      );
    }
    case 'experience-unit': {
      const binding = slot.binding as { unitRef?: string };
      if (!binding.unitRef) return <UnrenderableSlot slot={slot} why="no step to show" />;
      return <ExperienceUnitSlot unitRef={binding.unitRef} />;
    }
    case 'module-widget':
      return <ModuleWidgetSlot binding={slot.binding as ModuleWidgetBinding} context={context} />;
    case 'static-content':
      return <StaticContentSlot binding={slot.binding as StaticContentBinding} />;
    case 'embed-route':
      // Not implemented. This bundle contains none, and `embed-route` carries
      // real semantics — an embedded route paints on the host route's surface,
      // which is why the theme-authority rule walks embed edges. Guessing at it
      // with nothing to check against would put a wrong answer in the ledger.
      return <UnrenderableSlot slot={slot} why="this spike does not render embedded routes" />;
    default:
      return <UnrenderableSlot slot={slot} why="this kind of slot is not recognised" />;
  }
}

function UnrenderableSlot({ slot, why }: { slot: Slot; why: string }) {
  return (
    <p className="slot-missing" role="status">
      A part of this page called “{slot.title ?? slot.id}” is not shown: {why}.
    </p>
  );
}
