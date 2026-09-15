/** @filedesc Registers all built-in component plugins with the global registry. */
import { globalRegistry } from '../registry';
import { defaultAdapter } from '../adapters/default/index';
import { LayoutPlugins } from './layout';
import { InputPlugins } from './inputs';
import { HeadingPlugin, TextPlugin, CardPlugin, AlertPlugin, BadgePlugin, ProgressBarPlugin, SummaryPlugin, ValidationSummaryPlugin } from './display';
import { TabsPlugin, ActionButtonPlugin } from './interactive';
import { ConditionalGroupPlugin, DataTablePlugin } from './special';
import { HiddenPlugin } from './hidden';

/**
 * Registers the built-in component plugins — layout, input, display, interactive, special, and the
 * `Hidden` presentation widget — with the global registry. The list below is the inventory.
 * Wizard behavior is driven by formPresentation.pageMode, not a component plugin.
 */
export function registerDefaultComponents() {
    LayoutPlugins.forEach(p => globalRegistry.register(p));
    InputPlugins.forEach(p => globalRegistry.register(p));
    globalRegistry.register(HeadingPlugin);
    globalRegistry.register(TextPlugin);
    globalRegistry.register(CardPlugin);
    globalRegistry.register(AlertPlugin);
    globalRegistry.register(BadgePlugin);
    globalRegistry.register(ProgressBarPlugin);
    globalRegistry.register(SummaryPlugin);
    globalRegistry.register(TabsPlugin);
    globalRegistry.register(ActionButtonPlugin);
    globalRegistry.register(ValidationSummaryPlugin);
    globalRegistry.register(ConditionalGroupPlugin);
    globalRegistry.register(DataTablePlugin);
    globalRegistry.register(HiddenPlugin);
    globalRegistry.registerAdapter(defaultAdapter);
}
