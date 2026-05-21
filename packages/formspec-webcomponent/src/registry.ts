/** @filedesc ComponentRegistry class with plugin dispatch and adapter resolution. */
import { ComponentPlugin } from './types';
import type { RenderAdapter, AdapterRenderFn } from './adapters/types';

/**
 * Map-based registry that dispatches component type strings to their
 * {@link ComponentPlugin} implementations, and resolves render adapter
 * functions for the headless component architecture.
 *
 * At render time the `FormspecRender` element looks up each component
 * descriptor's `component` field in the registry to find the plugin
 * responsible for building the corresponding DOM subtree.
 *
 * Built-in components are registered at module load via
 * `registerDefaultComponents()`. Custom plugins can be added at any
 * time by calling {@link register} on the {@link globalRegistry} singleton.
 */
const INTEGRATION_STYLE_ID = 'formspec-adapter-integration';

export class ComponentRegistry {
    private plugins: Map<string, ComponentPlugin> = new Map();
    private adapters: Map<string, RenderAdapter> = new Map();
    private activeAdapter: string = 'default';

    /**
     * Register a component plugin, keyed by its `type` string.
     * If a plugin with the same type already exists it is silently replaced.
     *
     * @param plugin - The plugin to register.
     */
    register(plugin: ComponentPlugin) {
        this.plugins.set(plugin.type, plugin);
    }

    /**
     * Look up a registered plugin by component type.
     *
     * @param type - Component type identifier (e.g. `"TextInput"`, `"Section"`).
     * @returns The matching plugin, or `undefined` if no plugin is registered for that type.
     */
    get(type: string): ComponentPlugin | undefined {
        return this.plugins.get(type);
    }

    /** The number of currently registered component plugins. */
    get size(): number {
        return this.plugins.size;
    }

    /** Register a render adapter. The 'default' adapter is always the fallback. */
    registerAdapter(adapter: RenderAdapter): void {
        this.adapters.set(adapter.name, adapter);
    }

    /** Set the active adapter by name. Warns and keeps current if name is unknown. */
    setAdapter(name: string): void {
        if (!this.adapters.has(name)) {
            console.warn(`Adapter '${name}' not registered, keeping current adapter.`);
            return;
        }
        this.activeAdapter = name;
        this.applyIntegrationCSS();
    }

    /** Inject or remove the active adapter's integrationCSS in the document head. */
    private applyIntegrationCSS(): void {
        const existing = document.getElementById(INTEGRATION_STYLE_ID);
        if (existing) existing.remove();

        const adapter = this.adapters.get(this.activeAdapter);
        if (adapter?.integrationCSS) {
            const style = document.createElement('style');
            style.id = INTEGRATION_STYLE_ID;
            style.textContent = adapter.integrationCSS;
            document.head.appendChild(style);
        }
    }

    /** Resolve the render function for a component type. Falls back to default adapter. */
    resolveAdapterFn(componentType: string): AdapterRenderFn | undefined {
        const active = this.adapters.get(this.activeAdapter);
        return active?.components[componentType]
            ?? this.adapters.get('default')?.components[componentType];
    }

    /** Get the name of the currently active adapter. */
    get activeAdapterName(): string {
        return this.activeAdapter;
    }
}

/**
 * Application-wide singleton registry shared by all `<formspec-render>` instances.
 *
 * All 33 built-in component plugins are registered here at module load.
 * External code can register additional plugins via `globalRegistry.register(plugin)`.
 */
export const globalRegistry = new ComponentRegistry();
