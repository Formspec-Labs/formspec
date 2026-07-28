/**
 * @filedesc `module-widget` slot — the lookup from a binding to a component.
 * Hand-built. Gap ledger `module-widget-runtime` and `widget-data-binding`.
 *
 * What the platform supplies at this seam: the Registry declares the widget's
 * name, version, status and `widgetShape`; the ModuleResolver admits it; lint
 * E603 checks the module is declared. All of that is authoring-time.
 *
 * What the platform does not supply: anything that turns `{moduleId,
 * widgetName}` into something on screen, and any channel for handing that
 * something data. Both walls are hit here.
 *
 * The unresolved case renders a visible refusal rather than nothing, because a
 * bundle that names a widget nobody implements is a fact a person should see.
 */
import { widgetRegistryEntry } from '../bundle.ts';
import { resolveWidget, type WidgetContext } from '../widgets/tenant-chrome.tsx';

export interface ModuleWidgetBinding {
  moduleId?: string;
  widgetName?: string;
}

export function ModuleWidgetSlot({
  binding,
  context,
}: {
  binding: ModuleWidgetBinding;
  context: WidgetContext;
}) {
  const moduleId = binding.moduleId ?? '';
  const widgetName = binding.widgetName ?? '';
  const Widget = resolveWidget(moduleId, widgetName);

  if (!Widget) {
    const declared = widgetRegistryEntry(widgetName) !== undefined;
    return (
      <p className="slot-missing" role="status">
        This page asks for a component called “{widgetName}”
        {declared
          ? ' that the bundle describes but nothing in the platform builds.'
          : ' that nothing in the bundle even describes.'}
      </p>
    );
  }

  return <Widget context={context} />;
}
