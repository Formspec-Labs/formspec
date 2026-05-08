# @formspec/core — API Reference

*Auto-generated from TypeScript declarations — do not hand-edit.*

Raw form project state management: command dispatch, handler pipeline, undo/redo, and the IProjectCore abstraction. Framework-independent foundation for Formspec authoring tools.

formspec-core

Raw form project state management: command dispatch, handler pipeline,
undo/redo, and the IProjectCore abstraction.

Schema-derived document types come from formspec-types (re-exported here).
For the behavior-driven authoring API, use formspec-studio-core.

## `createChangesetMiddleware(control: ChangesetRecorderControl): Middleware`

Creates a recording middleware controlled by the given handle.

The middleware is a pure side-effect observer: it passes commands through
unchanged and records them after successful execution. It never blocks
or transforms commands — the user is never locked out.

#### interface `ChangesetRecorderControl`

Control interface for the changeset recording middleware.

The ProposalManager in studio-core holds this handle and toggles
`recording` and `currentActor` as the changeset lifecycle progresses.
The MCP layer sets `currentActor = 'ai'` inside beginEntry/endEntry
brackets; outside those brackets the actor defaults to `'user'`.

- **recording** (`boolean`): Whether the middleware should record commands passing through.
- **currentActor** (`'ai' | 'user'`): Current actor — determines which recording track captures the commands.

##### `onCommandsRecorded(actor: 'ai' | 'user', commands: Readonly<AnyCommand[][]>, results: Readonly<CommandResult[]>, priorState: Readonly<ProjectState>): void`

Called after each successful dispatch when recording is on.

## `isAuthoredComponentDocument(doc: unknown): doc is ComponentState`

## `hasAuthoredComponentTree(doc: unknown): doc is ComponentState`

## `createComponentArtifact(url?: string): ComponentState`

## `normalizeComponentState(component: ComponentState | undefined, url?: string): ComponentState`

## `getEditableComponentDocument(state: Pick<ProjectState, 'component'>): ComponentState`

## `getCurrentComponentDocument(state: Pick<ProjectState, 'component'>): ComponentState`

## `normalizeBindsFromUnknown(binds: unknown): FormBind[] | undefined`

## `componentPropertiesHandlers: {
    'component.setNodeProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setNodeType': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setNodeStyle': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setNodeAccessibility': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.spliceArrayProp': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setFieldWidget': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeNotFound: true;
    } | {
        rebuildComponentTree: false;
        nodeNotFound?: undefined;
    };
    'component.setResponsiveOverride': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setGroupRepeatable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
    'component.setGroupDisplayMode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setGroupDataTable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.registerCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.updateCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.deleteCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.renameCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setToken': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setBreakpoint': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setDocumentProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `componentTreeHandlers: {
    /**
     * Rebuild bound/display nodes from the current definition while preserving
     * layout wrappers (Page, Card, etc.). Used when a node was removed from the
     * tree but the definition item still exists — e.g. Layout "Remove from Tree"
     * followed by placing the item on a page again.
     */
    'component.reconcileFromDefinition': (state: import("../types.js").ProjectState) => {
        rebuildComponentTree: false;
    };
    'component.addNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            bind: string;
            nodeId?: undefined;
        } | {
            nodeId: string;
            bind?: undefined;
        };
    };
    'component.deleteNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.moveNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.reorderNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.duplicateNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            bind: string;
            nodeId?: undefined;
        } | {
            nodeId: string;
            bind?: undefined;
        };
    };
    'component.wrapNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            nodeId: string;
        };
    };
    /**
     * Wrap several sibling nodes in one layout container, preserving their relative order.
     * Resolves all targets before mutating; removes from highest index downward so indices stay valid.
     */
    'component.wrapSiblingNodes': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            nodeId: string;
        };
    };
    'component.unwrapNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

Handlers for definition bind management and field configuration commands.

**Binds** in Formspec are declarative rules that connect a field (identified by
a dot-path) to dynamic behaviors: calculated values, relevance conditions,
required/readonly state, validation constraints, default values, and various
processing directives. Each bind entry targets a single path and carries one
or more property expressions (typically FEL strings). The binds array lives at
`definition.binds` and is the primary mechanism for making fields reactive.

This module also registers handlers for direct field/item property editing
(data type, options, extensions) which operate on the `definition.items` tree
rather than the binds array.

definition-binds

## `definitionBindsHandlers: {
    'definition.setBind': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setItemProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: boolean;
    };
    'definition.setFieldDataType': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setFieldOptions': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setItemExtension': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

Handlers for definition bind management and field configuration commands.

**Binds** in Formspec are declarative rules that connect a field (identified by
a dot-path) to dynamic behaviors: calculated values, relevance conditions,
required/readonly state, validation constraints, default values, and various
processing directives. Each bind entry targets a single path and carries one
or more property expressions (typically FEL strings). The binds array lives at
`definition.binds` and is the primary mechanism for making fields reactive.

This module also registers handlers for direct field/item property editing
(data type, options, extensions) which operate on the `definition.items` tree
rather than the binds array.

## `definitionInstancesHandlers: {
    'definition.addInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.renameInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `definitionItemsHandlers: {
    /**
     * Handler for `definition.addItem`.
     *
     * Creates a new item and inserts it into the definition item tree.
     *
     * **Payload** (`AddItemPayload`):
     * - `type` — `"field"` | `"group"` | `"display"` (required).
     * - `parentPath` — Dot-path of the parent item. Omit to insert at root.
     * - `insertIndex` — Position within the parent's children. Omit to append.
     * - `key` — Desired item key. Auto-generated from type if omitted.
     * - `dataType` — For fields only; defaults to `"string"`.
     * - `label`, `description`, `hint`, `options`, `labels` — Optional metadata.
     *
     * **Returns**: `{ rebuildComponentTree: true, insertedPath }` where
     * `insertedPath` is the full dot-path of the newly created item.
     *
     * **Side effects**: Ensures the key is unique among siblings. Groups get
     * an empty `children` array. Fields default to `dataType: "string"`.
     *
     * @throws If `parentPath` cannot be resolved in the item tree.
     */
    'definition.addItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        insertedPath: string;
    };
    /**
     * Handler for `definition.deleteItem`.
     *
     * Removes an item (and its entire subtree) from the definition, then
     * cleans up all cross-references to the deleted paths.
     *
     * **Payload**: `{ path }` — Dot-path of the item to delete.
     *
     * **Returns**: `{ rebuildComponentTree: true }`.
     *
     * **Side effects** (cascading cleanup):
     * - Removes the item from its parent's children array.
     * - Filters out any `binds` entries whose `path` matches a deleted path.
     * - Filters out any `shapes` entries whose `target` matches a deleted path.
     * - Deletes matching keys from `theme.items` per-item overrides.
     *
     * @throws If `path` cannot be resolved in the item tree.
     */
    'definition.deleteItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
    /**
     * Handler for `definition.renameItem`.
     *
     * Changes an item's key and rewrites all references across every artifact
     * to maintain consistency.
     *
     * **Payload**: `{ path, newKey }` — `path` is the current dot-path;
     * `newKey` is the replacement key string.
     *
     * **Returns**: `{ rebuildComponentTree: true, newPath }` where `newPath`
     * is the updated full dot-path after the rename.
     *
     * @throws If `path` cannot be resolved in the item tree.
     */
    'definition.renameItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        newPath: string;
    };
    /**
     * Handler for `definition.moveItem`.
     *
     * Moves an item from its current location to a new parent and/or position
     * within the definition item tree.
     *
     * @throws If `sourcePath` cannot be resolved or `targetParentPath` is invalid.
     */
    'definition.moveItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        newPath: string;
    };
    /**
     * Handler for `definition.reorderItem`.
     *
     * Swaps an item with its adjacent sibling in the specified direction
     * within the same parent.
     *
     * @throws If `path` cannot be resolved in the item tree.
     */
    'definition.reorderItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    } | {
        rebuildComponentTree: true;
    };
    /**
     * Handler for `definition.duplicateItem`.
     *
     * Creates a deep clone of an item (including its entire subtree) and
     * inserts the clone immediately after the original.
     *
     * @throws If `path` cannot be resolved in the item tree.
     */
    'definition.duplicateItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        insertedPath: string;
    };
}`

Handlers for definition-level metadata commands.

Form metadata consists of top-level descriptive properties on the definition
document: `title`, `name`, `description`, `url`, `version`, `status`, `date`,
`derivedFrom`, `versionAlgorithm`, and `nonRelevantBehavior`. These properties
identify and describe the form but do not affect field structure, binds, or
runtime behavior.

Currently only the `definition.setFormTitle` command is implemented here.
Other metadata properties (url, version, name, description, status, date, etc.)
are handled by the generic `definition.setDefinitionProperty` command registered
elsewhere.

definition-metadata

## `definitionMetadataHandlers: {
    'definition.setFormTitle': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

**Command: `definition.setFormTitle`**

Sets the human-readable title of the form definition. The title is a top-level
metadata property displayed to end users as the form's heading or name. It is
distinct from `name` (a machine-readable identifier) and `description` (a
longer explanatory text).

**Payload:**
- `title` -- The new title string for the form. An empty string is valid
  (clears the title display).

## `definitionMigrationsHandlers: {
    'definition.addMigration': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteMigration': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setMigrationProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.addFieldMapRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setFieldMapRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteFieldMapRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setMigrationDefaults': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `definitionOptionsetsHandlers: {
    'definition.setOptionSet': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setOptionSetProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteOptionSet': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.promoteToOptionSet': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `definitionPagesHandlers: {
    'definition.setDefinitionProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setFormPresentation': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setGroupRef': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
}`

## `definitionShapesHandlers: {
    'definition.addShape': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setShapeProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setShapeComposition': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.renameShape': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteShape': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `definitionVariablesHandlers: {
    'definition.addVariable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setVariable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteVariable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `resolveItemLocation(state: ProjectState, path: string): {
    parent: FormItem[];
    index: number;
    item: FormItem;
} | undefined`

Resolve a dot-separated item path to its location within the definition item tree.

Walks the `state.definition.items` hierarchy following each segment of the
dot-path through nested `children` arrays. Returns the parent array containing
the target item, the item's index within that array, and the item itself.

Used by virtually every definition-item handler (`deleteItem`, `renameItem`,
`moveItem`, `reorderItem`, `duplicateItem`) to locate an item before mutating it.

## `builtinHandlers: Readonly<{
    'project.import': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: boolean;
        clearHistory: false;
    };
    'project.importSubform': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
    'project.loadRegistry': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'project.removeRegistry': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'project.publish': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.load': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.remove': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.select': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setString': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setStrings': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.removeString': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setMetadata': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setFallback': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.create': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.delete': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.rename': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.select': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setTargetSchema': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.addRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.deleteRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.clearRules': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.reorderRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setAdapter': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setDefaults': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.autoGenerateRules': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setExtension': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setRuleExtension': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.addInnerRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setInnerRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.deleteInnerRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.reorderInnerRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setToken': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setTokens': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setDefaults': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.addSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.deleteSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.reorderSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemOverride': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.deleteItemOverride': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemStyle': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemWidgetConfig': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemAccessibility': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setBreakpoint': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setStylesheets': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setDocumentProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setExtension': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setTargetCompatibility': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setNodeProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setNodeType': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setNodeStyle': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setNodeAccessibility': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.spliceArrayProp': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setFieldWidget': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeNotFound: true;
    } | {
        rebuildComponentTree: false;
        nodeNotFound?: undefined;
    };
    'component.setResponsiveOverride': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setGroupRepeatable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
    'component.setGroupDisplayMode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setGroupDataTable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.registerCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.updateCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.deleteCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.renameCustom': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setToken': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setBreakpoint': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.setDocumentProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.reconcileFromDefinition': (state: import("../types.js").ProjectState) => {
        rebuildComponentTree: false;
    };
    'component.addNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            bind: string;
            nodeId?: undefined;
        } | {
            nodeId: string;
            bind?: undefined;
        };
    };
    'component.deleteNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.moveNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.reorderNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'component.duplicateNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            bind: string;
            nodeId?: undefined;
        } | {
            nodeId: string;
            bind?: undefined;
        };
    };
    'component.wrapNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            nodeId: string;
        };
    };
    'component.wrapSiblingNodes': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
        nodeRef: {
            nodeId: string;
        };
    };
    'component.unwrapNode': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.addMigration': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteMigration': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setMigrationProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.addFieldMapRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setFieldMapRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteFieldMapRule': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setMigrationDefaults': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setDocument': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.remove': (state: import("../types.js").ProjectState) => {
        rebuildComponentTree: false;
    };
    'screener.setMetadata': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.addItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.deleteItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setItemProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.reorderItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setBind': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.addPhase': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.removePhase': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.reorderPhase': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setPhaseProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.addRoute': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setRouteProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.deleteRoute': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.reorderRoute': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setAvailability': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setResultValidity': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.addInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.renameInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteInstance': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setOptionSet': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setOptionSetProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteOptionSet': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.promoteToOptionSet': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setDefinitionProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setFormPresentation': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setGroupRef': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
    'definition.addVariable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setVariable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteVariable': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.addShape': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setShapeProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setShapeComposition': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.renameShape': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.deleteShape': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setBind': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setItemProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: boolean;
    };
    'definition.setFieldDataType': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setFieldOptions': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.setItemExtension': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'definition.addItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        insertedPath: string;
    };
    'definition.deleteItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
    'definition.renameItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        newPath: string;
    };
    'definition.moveItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        newPath: string;
    };
    'definition.reorderItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    } | {
        rebuildComponentTree: true;
    };
    'definition.duplicateItem': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
        insertedPath: string;
    };
    'definition.setFormTitle': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}>`

Locale command handlers.

Locale documents provide translated strings for a form definition.
Each locale is keyed by its BCP 47 code in ProjectState.locales.

All handlers return `{ rebuildComponentTree: false }` because locale
mutations do not alter the definition item tree structure.

handlers/locale

## `localeHandlers: {
    'locale.load': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.remove': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.select': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setString': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setStrings': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.removeString': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setMetadata': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'locale.setFallback': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

Mapping command handlers.

The Formspec mapping document defines bidirectional transforms between form
responses (source) and external data schemas (target).

All handlers return `{ rebuildComponentTree: false }` because mapping
mutations do not alter the definition item tree structure.

handlers/mapping

## `mappingHandlers: {
    'mapping.create': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.delete': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.rename': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.select': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setProperty': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setTargetSchema': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.addRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.deleteRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.clearRules': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.reorderRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setAdapter': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setDefaults': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.autoGenerateRules': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setExtension': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setRuleExtension': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.addInnerRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.setInnerRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.deleteInnerRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'mapping.reorderInnerRule': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `projectHandlers: {
    'project.import': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: boolean;
        clearHistory: false;
    };
    'project.importSubform': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: true;
    };
    'project.loadRegistry': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'project.removeRegistry': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'project.publish': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `screenerHandlers: {
    'screener.setDocument': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.remove': (state: ProjectState) => {
        rebuildComponentTree: false;
    };
    'screener.setMetadata': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.addItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.deleteItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setItemProperty': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.reorderItem': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setBind': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.addPhase': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.removePhase': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.reorderPhase': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setPhaseProperty': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.addRoute': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setRouteProperty': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.deleteRoute': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.reorderRoute': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setAvailability': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'screener.setResultValidity': (state: ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

## `themeHandlers: {
    'theme.setToken': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setTokens': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setDefaults': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.addSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.deleteSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.reorderSelector': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemOverride': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.deleteItemOverride': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemStyle': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemWidgetConfig': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setItemAccessibility': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setBreakpoint': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setStylesheets': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setDocumentProperty': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setExtension': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
    'theme.setTargetCompatibility': (state: import("../types.js").ProjectState, payload: unknown) => {
        rebuildComponentTree: false;
    };
}`

Shared tree utilities for component handlers.

Both component-properties.ts and component-tree.ts operate on the same
component tree structure. This module centralizes the shared TreeNode type,
tree initialization, and Studio-generated marking to avoid duplication.

handlers/tree-utils

## `ensureTree(state: ProjectState): TreeNode`

Ensure the component document has a root tree node.

Initializes `component.tree` with a synthetic Stack root if absent.

#### type `TreeNode`

Internal representation of a component tree node.

- `component` -- the component type name (built-in or custom).
- `bind` -- present when the node is bound to a definition item key. In memory
  this stores the **leaf `item.key`** only (e.g. `"email"`), not the full dotted
  path. At export time, `cleanTreeForExport()` in `raw-project.ts` rewrites it to
  the absolute path by prepending the group prefix accumulated from ancestor nodes
  (e.g. `"contact.email"`). Code that reads `bind` from an in-memory `TreeNode`
  must not assume it is a rooted path.
- `definitionItemPath` -- optional absolute definition path for this node (set by
  `reconcileComponentTree`). Studio-only; stripped on export. Disambiguates
  duplicate leaf keys across pages and layout wrappers.
- `nodeId` -- present on unbound nodes (layout, container).
- `children` -- child nodes; only meaningful for Layout and Container types.
- `style`, `accessibility`, `responsive` -- typed sub-objects for property handlers.
- Additional keys hold component-specific props.

#### class `HistoryManager`

Manages undo/redo stacks and command log.
Pure data structure — no knowledge of commands or state shape.

##### `constructor(maxDepth?: number)`

##### `push(snapshot: T): void`

##### `popUndo(current: T): T | null`

##### `popRedo(current: T): T | null`

##### `clear(): void`

##### `clearRedo(): void`

##### `appendLog(entry: LogEntry): void`

##### `clearLog(): void`

## `normalizeBcp47(code: string): string`

Normalize BCP 47: lowercase language, title-case script, uppercase region.

## `resolvePageStructure(state: PageStructureInput, definitionItemKeys: string[]): ResolvedPageStructure`

Resolves the current page structure from the component tree.

Reads Page nodes from `component.tree` (a Stack > Page* hierarchy).
Applies bidirectional propagation (groups ↔ children) and emits diagnostics.

#### interface `ResolvedRegion`

Enriched region with existence check.
Each region represents a bound item placed on a page.

- **key**: `string`
- **span**: `number`
- **start?**: `number`
- **responsive?**: `Record<string, {
        span?: number;
        start?: number;
        hidden?: boolean;
    }>`
- **exists**: `boolean`

#### interface `ResolvedPage`

Resolved page with enriched regions.
Derived from Page nodes in the component tree.

- **id**: `string`
- **title**: `string`
- **description?**: `string`
- **regions**: `ResolvedRegion[]`

#### interface `PageDiagnostic`

- **code**: `'UNKNOWN_REGION_KEY' | 'PAGEMODE_MISMATCH'`
- **severity**: `'warning' | 'error'`
- **message**: `string`

#### interface `ResolvedPageStructure`

- **mode**: `'single' | 'wizard' | 'tabs'`
- **pages**: `ResolvedPage[]`
- **diagnostics**: `PageDiagnostic[]`
- **unassignedItems**: `string[]`
- **itemPageMap**: `Record<string, string>`

#### type `PageStructureInput`

The document slices resolvePageStructure reads.

```ts
type PageStructureInput = {
    definition: Pick<FormDefinition, 'formPresentation' | 'items'>;
    component?: Pick<ComponentState, 'tree'>;
};
```

#### class `CommandPipeline`

Phase-aware command execution pipeline.

Clones state once, runs commands across phases with inter-phase
reconciliation (when any command in a phase signals rebuild), and
returns the new state plus all results. Middleware wraps the full plan.

##### `constructor(handlers: Readonly<Record<string, CommandHandler>>, middleware: Middleware[])`

##### `execute(state: ProjectState, phases: AnyCommand[][], reconcile: (clone: ProjectState) => void): {
        newState: ProjectState;
        results: CommandResult[];
    }`

#### interface `ProjectCommandMap`

- **'theme.setToken'**: `{
        key: string;
        value: unknown;
    }`
- **'theme.setTokens'**: `{
        tokens: Record<string, unknown>;
    }`
- **'theme.setDefaults'**: `{
        property: string;
        value: unknown;
    }`
- **'theme.addSelector'**: `{
        match: unknown;
        apply: unknown;
        insertIndex?: number;
    }`
- **'theme.setSelector'**: `{
        index: number;
        match?: unknown;
        apply?: unknown;
    }`
- **'theme.deleteSelector'**: `{
        index: number;
    }`
- **'theme.reorderSelector'**: `{
        index: number;
        direction: 'up' | 'down';
    }`
- **'theme.setItemOverride'**: `{
        itemKey: string;
        property: string;
        value: unknown;
    }`
- **'theme.deleteItemOverride'**: `{
        itemKey: string;
    }`
- **'theme.setItemStyle'**: `{
        itemKey: string;
        property: string;
        value: unknown;
    }`
- **'theme.setItemWidgetConfig'**: `{
        itemKey: string;
        property: string;
        value: unknown;
    }`
- **'theme.setItemAccessibility'**: `{
        itemKey: string;
        property: string;
        value: unknown;
    }`
- **'theme.setBreakpoint'**: `{
        name: string;
        minWidth: number | null;
    }`
- **'theme.setStylesheets'**: `{
        urls: string[];
    }`
- **'theme.setDocumentProperty'**: `{
        property: string;
        value: unknown;
    }`
- **'theme.setExtension'**: `{
        key: string;
        value: unknown;
    }`
- **'theme.setTargetCompatibility'**: `{
        compatibleVersions: string;
    }`
- **'screener.setDocument'**: `ScreenerDocument`
- **'screener.remove'**: `Record<string, unknown>`
- **'screener.setMetadata'**: `Record<string, unknown>`
- **'screener.addItem'**: `Record<string, unknown>`
- **'screener.deleteItem'**: `{
        key: string;
    }`
- **'screener.setItemProperty'**: `{
        key: string;
        property: string;
        value: unknown;
    }`
- **'screener.reorderItem'**: `{
        index: number;
        direction: 'up' | 'down';
    }`
- **'screener.setBind'**: `{
        path: string;
        properties: Record<string, unknown>;
    }`
- **'screener.addPhase'**: `{
        id: string;
        strategy: string;
        label?: string;
        insertIndex?: number;
    }`
- **'screener.removePhase'**: `{
        phaseId: string;
    }`
- **'screener.reorderPhase'**: `{
        phaseId: string;
        direction: 'up' | 'down';
    }`
- **'screener.setPhaseProperty'**: `{
        phaseId: string;
        property: string;
        value: unknown;
    }`
- **'screener.addRoute'**: `{
        phaseId: string;
        route: Record<string, unknown>;
        insertIndex?: number;
    }`
- **'screener.setRouteProperty'**: `{
        phaseId: string;
        index: number;
        property: string;
        value: unknown;
    }`
- **'screener.deleteRoute'**: `{
        phaseId: string;
        index: number;
    }`
- **'screener.reorderRoute'**: `{
        phaseId: string;
        index: number;
        direction: 'up' | 'down';
    }`
- **'screener.setAvailability'**: `{
        from?: string | null;
        until?: string | null;
    }`
- **'screener.setResultValidity'**: `{
        duration: string | null;
    }`
- **'project.import'**: `Record<string, any>`
- **'project.importSubform'**: `{
        definition: Record<string, unknown>;
        targetGroupPath?: string;
        keyPrefix?: string;
    }`
- **'project.loadRegistry'**: `{
        registry: Record<string, unknown>;
    }`
- **'project.removeRegistry'**: `{
        url: string;
    }`
- **'project.publish'**: `{
        version: string;
        summary?: string;
    }`
- **'mapping.create'**: `{
        id: string;
        targetSchema?: any;
    }`
- **'mapping.delete'**: `{
        id: string;
    }`
- **'mapping.rename'**: `{
        oldId: string;
        newId: string;
    }`
- **'mapping.select'**: `{
        id: string;
    }`
- **'mapping.setProperty'**: `{
        mappingId?: string;
        property: string;
        value: unknown;
    }`
- **'mapping.setTargetSchema'**: `{
        mappingId?: string;
        property: string;
        value: unknown;
    }`
- **'mapping.addRule'**: `{
        mappingId?: string;
        sourcePath?: string;
        targetPath?: string;
        transform?: string;
        insertIndex?: number;
    }`
- **'mapping.setRule'**: `{
        mappingId?: string;
        index: number;
        property: string;
        value: unknown;
    }`
- **'mapping.deleteRule'**: `{
        mappingId?: string;
        index: number;
    }`
- **'mapping.clearRules'**: `{
        mappingId?: string;
    }`
- **'mapping.reorderRule'**: `{
        mappingId?: string;
        index: number;
        direction: 'up' | 'down';
    }`
- **'mapping.setAdapter'**: `{
        mappingId?: string;
        format: string;
        config: unknown;
    }`
- **'mapping.setDefaults'**: `{
        mappingId?: string;
        defaults: Record<string, unknown>;
    }`
- **'mapping.autoGenerateRules'**: `{
        mappingId?: string;
        scopePath?: string;
        priority?: number;
        replace?: boolean;
    }`
- **'mapping.setExtension'**: `{
        mappingId?: string;
        key: string;
        value: unknown;
    }`
- **'mapping.setRuleExtension'**: `{
        mappingId?: string;
        index: number;
        key: string;
        value: unknown;
    }`
- **'mapping.addInnerRule'**: `{
        mappingId?: string;
        ruleIndex: number;
        sourcePath?: string;
        targetPath?: string;
        transform?: string;
        insertIndex?: number;
    }`
- **'mapping.setInnerRule'**: `{
        mappingId?: string;
        ruleIndex: number;
        innerIndex: number;
        property: string;
        value: unknown;
    }`
- **'mapping.deleteInnerRule'**: `{
        mappingId?: string;
        ruleIndex: number;
        innerIndex: number;
    }`
- **'mapping.reorderInnerRule'**: `{
        mappingId?: string;
        ruleIndex: number;
        innerIndex: number;
        direction: 'up' | 'down';
    }`
- **'locale.load'**: `{
        document: Record<string, unknown>;
    }`
- **'locale.remove'**: `{
        localeId: string;
    }`
- **'locale.select'**: `{
        localeId: string;
    }`
- **'locale.setString'**: `{
        localeId?: string;
        key: string;
        value: string | null;
    }`
- **'locale.setStrings'**: `{
        localeId?: string;
        strings: Record<string, string>;
    }`
- **'locale.removeString'**: `{
        localeId?: string;
        key: string;
    }`
- **'locale.setMetadata'**: `{
        localeId?: string;
        property: string;
        value: unknown;
    }`
- **'locale.setFallback'**: `{
        localeId?: string;
        fallback: string | null;
    }`
- **'definition.addVariable'**: `Record<string, unknown>`
- **'definition.setVariable'**: `{
        name: string;
        property: string;
        value: unknown;
    }`
- **'definition.deleteVariable'**: `{
        name: string;
    }`
- **'definition.addShape'**: `Record<string, unknown>`
- **'definition.setShapeProperty'**: `{
        id: string;
        property: string;
        value: unknown;
    }`
- **'definition.setShapeComposition'**: `{
        id: string;
        mode: string;
        refs?: string[];
        ref?: string;
    }`
- **'definition.renameShape'**: `{
        id: string;
        newId: string;
    }`
- **'definition.deleteShape'**: `{
        id: string;
    }`
- **'definition.setDefinitionProperty'**: `{
        property: string;
        value: unknown;
    }`
- **'definition.setFormPresentation'**: `{
        property: string;
        value: unknown;
    }`
- **'definition.setGroupRef'**: `{
        path: string;
        ref: string | null;
        keyPrefix?: string;
    }`
- **'definition.setOptionSet'**: `{
        name: string;
        options?: unknown[];
        source?: string;
    }`
- **'definition.setOptionSetProperty'**: `{
        name: string;
        property: string;
        value: unknown;
    }`
- **'definition.deleteOptionSet'**: `{
        name: string;
    }`
- **'definition.promoteToOptionSet'**: `{
        path: string;
        name: string;
    }`
- **'definition.addMigration'**: `{
        fromVersion: string;
        description?: string;
    }`
- **'definition.deleteMigration'**: `{
        fromVersion: string;
    }`
- **'definition.setMigrationProperty'**: `{
        fromVersion: string;
        property: string;
        value: unknown;
    }`
- **'definition.addFieldMapRule'**: `{
        fromVersion: string;
        source: string;
        target: string | null;
        transform: string;
        expression?: string;
        insertIndex?: number;
    }`
- **'definition.setFieldMapRule'**: `{
        fromVersion: string;
        index: number;
        property: string;
        value: unknown;
    }`
- **'definition.deleteFieldMapRule'**: `{
        fromVersion: string;
        index: number;
    }`
- **'definition.setMigrationDefaults'**: `{
        fromVersion: string;
        defaults: Record<string, unknown>;
    }`
- **'definition.setFormTitle'**: `{
        title: string;
    }`
- **'definition.addItem'**: `Record<string, unknown>`
- **'definition.deleteItem'**: `{
        path: string;
    }`
- **'definition.renameItem'**: `{
        path: string;
        newKey: string;
    }`
- **'definition.moveItem'**: `{
        sourcePath: string;
        targetParentPath?: string;
        targetIndex?: number;
    }`
- **'definition.reorderItem'**: `{
        path: string;
        direction: 'up' | 'down';
    }`
- **'definition.duplicateItem'**: `{
        path: string;
    }`
- **'definition.addInstance'**: `Record<string, unknown>`
- **'definition.setInstance'**: `{
        name: string;
        property: string;
        value: unknown;
    }`
- **'definition.renameInstance'**: `{
        name: string;
        newName: string;
    }`
- **'definition.deleteInstance'**: `{
        name: string;
    }`
- **'definition.setBind'**: `{
        path: string;
        properties: Record<string, unknown>;
    }`
- **'definition.setItemProperty'**: `{
        path: string;
        property: string;
        value: unknown;
    }`
- **'definition.setFieldDataType'**: `{
        path: string;
        dataType: NonNullable<FormItem['dataType']>;
    }`
- **'definition.setFieldOptions'**: `{
        path: string;
        options: unknown;
    }`
- **'definition.setItemExtension'**: `{
        path: string;
        extension: string;
        value: unknown;
    }`
- **'component.reconcileFromDefinition'**: `Record<string, never>`
- **'component.addNode'**: `{
        parent: {
            bind?: string;
            nodeId?: string;
        };
        insertIndex?: number;
        component: string;
        bind?: string;
        props?: Record<string, unknown>;
    }`
- **'component.deleteNode'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
    }`
- **'component.moveNode'**: `{
        source: {
            bind?: string;
            nodeId?: string;
        };
        targetParent: {
            bind?: string;
            nodeId?: string;
        };
        targetIndex?: number;
    }`
- **'component.reorderNode'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        direction: 'up' | 'down';
    }`
- **'component.duplicateNode'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
    }`
- **'component.wrapNode'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        wrapper: {
            component: string;
            props?: Record<string, unknown>;
        };
    }`
- **'component.wrapSiblingNodes'**: `{
        nodes: Array<{
            bind?: string;
            nodeId?: string;
        }>;
        wrapper: {
            component: string;
            props?: Record<string, unknown>;
        };
    }`
- **'component.unwrapNode'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
    }`
- **'component.setNodeProperty'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        property: string;
        value: unknown;
    }`
- **'component.setNodeType'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        component: string;
        preserveProps?: boolean;
    }`
- **'component.setNodeStyle'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        property: string;
        value: unknown;
    }`
- **'component.setNodeAccessibility'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        property: string;
        value: unknown;
    }`
- **'component.spliceArrayProp'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        property: string;
        index: number;
        deleteCount: number;
        insert?: unknown[];
    }`
- **'component.setFieldWidget'**: `{
        fieldKey: string;
        widget: string;
    }`
- **'component.setResponsiveOverride'**: `{
        node: {
            bind?: string;
            nodeId?: string;
        };
        breakpoint: string;
        patch: unknown;
    }`
- **'component.setGroupRepeatable'**: `{
        groupKey: string;
        repeatable: boolean;
    }`
- **'component.setGroupDisplayMode'**: `{
        groupKey: string;
        mode: string;
    }`
- **'component.setGroupDataTable'**: `{
        groupKey: string;
        config: unknown;
    }`
- **'component.registerCustom'**: `{
        name: string;
        params: unknown;
        tree: unknown;
    }`
- **'component.updateCustom'**: `{
        name: string;
        params?: unknown;
        tree?: unknown;
    }`
- **'component.deleteCustom'**: `{
        name: string;
    }`
- **'component.renameCustom'**: `{
        name: string;
        newName: string;
    }`
- **'component.setToken'**: `{
        key: string;
        value: unknown;
    }`
- **'component.setBreakpoint'**: `{
        name: string;
        minWidth: number | null;
    }`
- **'component.setDocumentProperty'**: `{
        property: string;
        value: unknown;
    }`

#### interface `IProjectCore`

Abstraction over the raw project core.
Implemented by RawProject (formspec-core). Consumed by Project (formspec-studio-core).
This is the seam between the two packages.

- **locales** (`Readonly<Record<string, LocaleState>>`): Read-only view of all loaded locale states, keyed by BCP 47 code.

##### `dispatch(command: Command<T, ProjectCommandMap[T]>): CommandResult`

##### `dispatch(command: Command<T, ProjectCommandMap[T]>[]): CommandResult[]`

##### `batch(commands: Command<T, ProjectCommandMap[T]>[]): CommandResult[]`

##### `batchWithRebuild(phase1: Command<T, ProjectCommandMap[T]>[], phase2: Command<T, ProjectCommandMap[T]>[]): CommandResult[]`

##### `undo(): boolean`

##### `redo(): boolean`

##### `resetHistory(): void`

##### `restoreState(snapshot: ProjectState): void`

Wholesale replace the project state with a prior snapshot.

Used by the ProposalManager for changeset reject/partial-merge
(snapshot-and-replay). History stack is cleared on restore because
the changeset is the undo mechanism during its lifetime.

Invalidates all cached views.

##### `onChange(listener: ChangeListener): () => void`

##### `fieldPaths(): string[]`

##### `itemPaths(): string[]`

##### `itemAt(path: string): FormItem | undefined`

##### `responseSchemaRows(): ResponseSchemaRow[]`

##### `statistics(): ProjectStatistics`

##### `instanceNames(): string[]`

##### `variableNames(): string[]`

##### `optionSetUsage(name: string): string[]`

##### `searchItems(filter: ItemFilter): ItemSearchResult[]`

##### `effectivePresentation(fieldKey: string): Record<string, unknown>`

##### `bindFor(path: string): Record<string, unknown> | undefined`

##### `componentFor(fieldKey: string): Record<string, unknown> | undefined`

##### `resolveExtension(name: string): Record<string, unknown> | undefined`

##### `unboundItems(): string[]`

##### `resolveToken(key: string): string | number | undefined`

##### `allDataTypes(): DataTypeInfo[]`

##### `parseFEL(expression: string, context?: FELParseContext): FELParseResult`

##### `traceFEL(expression: string, fields?: Record<string, unknown>): import('@formspec-org/engine/fel-runtime').FelTraceResult`

Evaluate a FEL expression and return a structured trace of evaluation
steps. Intended for MCP / LLM surfaces; values are projected to JSON
so type fidelity (money, date) is lost but readability is universal.

##### `felFunctionCatalog(): FELFunctionEntry[]`

##### `availableReferences(context?: string | FELParseContext): FELReferenceSet`

##### `allExpressions(): ExpressionLocation[]`

##### `expressionDependencies(expression: string): string[]`

##### `fieldDependents(fieldPath: string): FieldDependents`

##### `variableDependents(variableName: string): string[]`

##### `dependencyGraph(): DependencyGraph`

##### `listRegistries(): RegistrySummary[]`

##### `browseExtensions(filter?: ExtensionFilter): Record<string, unknown>[]`

##### `diffFromBaseline(fromVersion?: string): Change[]`

##### `previewChangelog(): FormspecChangelog`

##### `diagnose(): Diagnostics`

##### `previewMapping(params: import('./types.js').MappingPreviewParams): import('./types.js').MappingPreviewResult`

##### `localeAt(code: string): LocaleState | undefined`

Get a specific locale state by BCP 47 code.

##### `activeLocaleCode(): string | undefined`

Get the currently selected locale code in the editor.

##### `export(): ProjectBundle`

#### type `FormspecCoreProject`

Authoring-time project session: co-edited definition / component / theme / mappings,
command dispatch, undo/redo, read-model queries, and export.

Implemented by {@link RawProject}. Higher layers (e.g. formspec-studio-core) should
depend on this type rather than the concrete class when only the contract is needed.

```ts
type FormspecCoreProject = IProjectCore;
```

#### type `CreateFormspecCoreProject`

Factory shape for {@link createRawProject}. Returns a {@link FormspecCoreProject}.

```ts
type CreateFormspecCoreProject = (options?: ProjectOptions) => FormspecCoreProject;
```

## `resolvePageStructureFromTree(tree: TreeNode, pageMode: 'single' | 'wizard' | 'tabs', allItemKeys: string[]): ResolvedPageStructure`

Resolve page structure from the component tree.

Walks the root node's direct children for `component: 'Page'` nodes.
Each Page's subtree is recursively searched for bound items (any node with a
`bind` property). Non-Page children of the root contribute unassigned items.

## `fieldDependents(state: ProjectState, fieldPath: string): FieldDependents`

Reverse lookup: find all binds, shapes, variables, and mapping rules that
reference a given field.

## `variableDependents(state: ProjectState, variableName: string): string[]`

Find all bind paths whose FEL expressions reference a given variable.

## `dependencyGraph(state: ProjectState): DependencyGraph`

Build a full dependency graph across all FEL expressions in the project.

## `diagnose(state: ProjectState, schemaValidator?: SchemaValidator): Diagnostics`

On-demand multi-pass validation of the current project state.

## `computeDropTargets(state: ProjectState, draggedPaths: string[]): DropTarget[]`

Compute valid drop locations for a set of dragged item paths.

Walks the definition tree and produces before/after targets for every item
not in the dragged set (or a descendant of it). Groups also get an "inside"
target allowing drops into them.

#### interface `DropTarget`

A potential drop location in the definition tree.

- **targetPath** (`string`): Dot-path of the reference item.
- **position** (`'before' | 'after' | 'inside'`): Position relative to the target: before, after, or inside (for groups).
- **valid** (`boolean`): Whether this drop is valid (not onto self or descendant of dragged).

## `parseFEL(state: ProjectState, expression: string, context?: FELParseContext): FELParseResult`

Parse and validate a FEL expression without saving it to project state.

## `felFunctionCatalog(state: ProjectState): FELFunctionEntry[]`

Enumerate the full FEL function catalog: built-in plus extension functions.

## `availableReferences(state: ProjectState, context?: string | FELParseContext): FELReferenceSet`

Scope-aware list of valid FEL references at a given path.

## `allExpressions(state: ProjectState): ExpressionLocation[]`

Enumerate all FEL expressions in the project with their artifact locations.

## `expressionDependencies(_state: ProjectState, expression: string): string[]`

List all field paths that a FEL expression references.

## `fieldPaths(state: ProjectState): string[]`

All leaf field paths in the definition item tree, in document order.
Paths use dot-notation (e.g., `"contact.email"`). Groups are traversed
but not included -- only items with `type === 'field'` appear.

## `itemPaths(state: ProjectState): string[]`

All leaf item paths (fields AND display/content items) in document order.
Groups are traversed but not included — only leaf items appear.

## `itemAt(state: ProjectState, path: string): FormItem | undefined`

Resolve an item by its dot-path within the definition tree.

## `responseSchemaRows(state: ProjectState): ResponseSchemaRow[]`

Build a flat list of rows describing the response schema for the current definition.

## `instanceNames(state: ProjectState): string[]`

All instance names declared in the definition's `instances` map.

## `variableNames(state: ProjectState): string[]`

All variable names declared in the definition.

## `optionSetUsage(state: ProjectState, name: string): string[]`

Find all field paths that reference a given named option set.

## `searchItems(state: ProjectState, filter: ItemFilter): ItemSearchResult[]`

Search definition items by type, dataType, label substring, or extension usage.
All filter criteria are AND-ed. Results include the full dot-notation path.

## `effectivePresentation(state: ProjectState, fieldKey: string): Record<string, unknown>`

Resolve the effective presentation for a field through the theme cascade.

## `bindFor(state: ProjectState, path: string): Record<string, unknown> | undefined`

Get the effective bind properties for a field path.

## `componentFor(state: ProjectState, fieldKey: string): Record<string, unknown> | undefined`

Find the component tree node bound to a field key.

## `unboundItems(state: ProjectState): string[]`

Find definition fields that have no corresponding node in the component tree.

## `resolveToken(state: ProjectState, key: string): string | number | undefined`

Resolve a design token value through the two-tier cascade.

## `allDataTypes(state: ProjectState): DataTypeInfo[]`

Enumerate all valid data types: the 13 core types plus any dataType extensions
from loaded registries.

## `shapesForPath(state: ProjectState, path: string): FormShape[]`

All shape rules targeting a given path.
A shape matches if its `target` equals the path (exact) or matches via wildcard (`[*]`).

## `normalizeBinds(state: ProjectState, path: string): NormalizedBinds`

Merge all bind properties targeting `path` with any `prePopulate`/`initialValue`
from the item definition into a flat record of constraints.

#### interface `NormalizedBinds`

Merged view of all bind constraints and prePopulate affecting a field path.

- **required?**: `string`
- **readonly?**: `string`
- **relevant?**: `string`
- **calculate?**: `string`
- **constraint?**: `string`
- **constraintMessage?**: `string`
- **initialValue?**: `unknown`
- **default?**: `unknown`
- **prePopulate?**: `unknown`

## `previewMapping(state: ProjectState, params: MappingPreviewParams): MappingPreviewResult`

Executes a mapping transformation simulation (preview) using the current project state.
This is a pure query and does not modify the state.

## `optionSetUsageCount(state: ProjectState, name: string): number`

Count the number of fields in the definition that reference a given option set name.

## `listRegistries(state: ProjectState): RegistrySummary[]`

Enumerate loaded extension registries with summary metadata.

## `browseExtensions(state: ProjectState, filter?: ExtensionFilter): Record<string, unknown>[]`

Browse extension entries across all loaded registries with optional filtering.

## `resolveExtension(state: ProjectState, name: string): Record<string, unknown> | undefined`

Resolve an extension name against all loaded registries.

## `buildSearchIndex(state: ProjectState): SearchIndexEntry[]`

Build a flat search index of all items in the definition tree.
Walks depth-first, producing one entry per item (including groups).

#### interface `SearchIndexEntry`

A single entry in the search index, suitable for client-side filtering.

- **key** (`string`): Item key (leaf segment).
- **path** (`string`): Full dot-notation path.
- **label** (`string`): Human-readable label (falls back to key).
- **type** (`string`): Item kind: field, group, or display.
- **dataType** (`string | undefined`): Data type for fields (undefined for groups/displays).

## `commonAncestor(paths: string[]): string | undefined`

Find the deepest shared prefix of dot-separated paths.
Returns undefined if paths share no common ancestor (or if the array is empty).

## `pathsOverlap(a: string, b: string): boolean`

Check whether one path is an ancestor of the other (or they are identical).
Uses dot-boundary matching to avoid partial-segment false positives.

## `expandSelection(paths: string[], state: ProjectState): string[]`

Given selected paths, expand to include all descendants from the definition tree.
Returns a deduplicated list.

## `serializeToJSON(state: ProjectState): unknown`

Extract the definition document as a clean JSON object (deep copy).
The result is fully JSON-serializable and safe to stringify/transmit.

## `describeShapeConstraint(shape: FormShape): string`

Produce a human-readable description of a shape constraint.

If the shape has a message, uses that. Otherwise falls back to the
constraint expression. Includes severity when not the default "error".

## `statistics(state: ProjectState): ProjectStatistics`

Compute form complexity metrics by walking the item tree.

## `flattenDefinitionTree(state: ProjectState): FlatTreeItem[]`

Walk the definition item tree depth-first and return a flat list of items
with path, depth, type, label, and parentPath.

#### interface `FlatTreeItem`

A single entry in the flattened tree representation.

- **path** (`string`): Full dot-notation path (e.g. "contact.email").
- **depth** (`number`): Nesting depth: 0 for root items.
- **type** (`string`): Item kind: field, group, or display.
- **label** (`string`): Human-readable label (falls back to key).
- **parentPath** (`string | undefined`): Parent's dot-path, or undefined for root items.

## `flattenItems(items: FormItem[], prefix?: string, visited?: WeakSet<object>): FlattenedItem[]`

Flatten an item tree into comparable rows carrying both exact-path and rename-tolerant signatures.

## `diffFromBaseline(state: ProjectState, fromVersion?: string): Change[]`

Compute a structured diff from a baseline (or a specific published version)
to the current definition state.

## `previewChangelog(state: ProjectState): FormspecChangelog`

Preview what the changelog would look like without committing to a publish.

#### type `FlattenedItem`

```ts
type FlattenedItem = {
    path: string;
    parentPath: string;
    key: string;
    item: FormItem;
    snapshot: string;
    signature: string;
};
```

## `createRawProject(options?: ProjectOptions): RawProject`

Factory function for creating a new {@link RawProject} instance.

#### class `RawProject`

Central editing surface for a Formspec artifact bundle.

Manages four co-evolving artifacts (definition, component, theme, mapping)
plus extension registries and version history. Every mutation flows through a
command-dispatch pipeline. Queries are delegated to pure functions in `queries/`.

##### `constructor(options?: ProjectOptions)`

- **(get) mapping** (`Readonly<MappingDocument>`): Returns the mapping document for the currently selected integration.

##### `localeAt(code: string): LocaleState | undefined`

##### `activeLocaleCode(): string | undefined`

##### `fieldPaths(): string[]`

##### `itemPaths(): string[]`

##### `itemAt(path: string): FormItem | undefined`

##### `responseSchemaRows(): ResponseSchemaRow[]`

##### `statistics(): ProjectStatistics`

##### `instanceNames(): string[]`

##### `variableNames(): string[]`

##### `optionSetUsage(name: string): string[]`

##### `searchItems(filter: ItemFilter): ItemSearchResult[]`

##### `effectivePresentation(fieldKey: string): Record<string, unknown>`

##### `bindFor(path: string): Record<string, unknown> | undefined`

##### `componentFor(fieldKey: string): Record<string, unknown> | undefined`

##### `resolveExtension(name: string): Record<string, unknown> | undefined`

##### `unboundItems(): string[]`

##### `resolveToken(key: string): string | number | undefined`

##### `allDataTypes(): DataTypeInfo[]`

##### `parseFEL(expression: string, context?: FELParseContext): FELParseResult`

##### `traceFEL(expression: string, fields?: Record<string, unknown>): FelTraceResult`

##### `felFunctionCatalog(): FELFunctionEntry[]`

##### `availableReferences(context?: string | FELParseContext): FELReferenceSet`

##### `allExpressions(): ExpressionLocation[]`

##### `expressionDependencies(expression: string): string[]`

##### `fieldDependents(fieldPath: string): FieldDependents`

##### `variableDependents(variableName: string): string[]`

##### `dependencyGraph(): DependencyGraph`

##### `listRegistries(): RegistrySummary[]`

##### `browseExtensions(filter?: ExtensionFilter): Record<string, unknown>[]`

##### `diffFromBaseline(fromVersion?: string): Change[]`

##### `previewChangelog(): FormspecChangelog`

##### `previewMapping(params: import('./types.js').MappingPreviewParams): import('./types.js').MappingPreviewResult`

##### `diagnose(): Diagnostics`

##### `export(): ProjectBundle`

##### `resetHistory(): void`

##### `restoreState(snapshot: ProjectState): void`

Wholesale replace project state with a prior snapshot.

CONTRACT — the snapshot is held BY REFERENCE:
  - Callers MUST NOT mutate `snapshot` after this call. The project will
    observe those mutations as corruption of its internal state.
  - Callers who intend to keep using their own copy MUST clone before
    passing (see ProposalManager — every call site wraps with
    `structuredClone`).

Why by-reference rather than cloning inside?  Snapshots are already full
`ProjectState` graphs (definition + component + theme + mappings + locales
+ baseline). In snapshot-and-replay flows (reject / partial-merge) the
caller clones once from the stored `snapshotBefore`; cloning again here
would double the cost of every replay for a guarantee the caller already
provides.  In dev builds we deep-freeze the snapshot after assignment so
accidental mutation throws at the mutation site rather than silently
corrupting downstream reads.

##### `undo(): boolean`

##### `redo(): boolean`

##### `onChange(listener: ChangeListener): () => void`

##### `dispatch(command: Command<T, ProjectCommandMap[T]>): CommandResult`

##### `dispatch(command: Command<T, ProjectCommandMap[T]>[]): CommandResult[]`

##### `batchWithRebuild(phase1: Command<T, ProjectCommandMap[T]>[], phase2: Command<T, ProjectCommandMap[T]>[]): CommandResult[]`

##### `clearRedo(): void`

##### `batch(commands: Command<T, ProjectCommandMap[T]>[]): CommandResult[]`

## `indexRegistryPayload(registry: Record<string, unknown>, fallbackUrl?: string): LoadedRegistry`

Build a loaded registry record from a registry document payload.
Ensures a stable `url` on the stored document for `project.removeRegistry`.

## `normalizeState(state: ProjectState): void`

Enforce cross-artifact invariants on a mutable state object.
Runs after every dispatch and batch cycle.
Undo/redo bypass this — snapshots were already normalized.

## `resolveThemeCascade(theme: ThemeCascadeInput, itemKey: string, itemType: string, itemDataType?: string, definition?: DefinitionCascadeInput): Record<string, ResolvedProperty>`

#### interface `ResolvedProperty`

- **value**: `unknown`
- **source**: `'form-default' | 'item-hint' | 'default' | 'selector' | 'item-override'`
- **sourceDetail?**: `string`

#### interface `DefinitionCascadeInput`

Optional definition-level inputs for the 2 lowest cascade levels.

- **formPresentation?**: `Record<string, unknown>`
- **itemPresentation?**: `Record<string, unknown>`

#### type `ThemeCascadeInput`

The three cascade-relevant slices of a ThemeDocument.

```ts
type ThemeCascadeInput = Pick<ThemeDocument, 'defaults' | 'selectors' | 'items'>;
```

## `defaultComponentType(item: FormItem): string`

Determine the default component type for a definition item.
Maps item types to sensible widget defaults: field -> TextInput,
group -> Stack, display -> Text.

## `reconcileComponentTree(definition: FormDefinition, currentTree: unknown | undefined): TreeNode`

Rebuild the component tree to mirror the definition item hierarchy.

Pure function — takes all inputs as arguments, returns the new tree root.
Preserves existing bound node properties (widget overrides, styles) and
unbound layout nodes (re-inserted at original positions).

The algorithm:
  1. Snapshot layout wrappers (_layout: true) with their full subtrees.
  2. Collect existing bound/display nodes by path, rebuild from definition.
  3. Build a flat Stack root with all definition-derived nodes.
  4. Re-insert layout wrappers (including Page nodes) at original positions.

#### interface `ComponentState`

Component working state — content without required envelope metadata.
Handlers read/write tree, tokens, breakpoints, etc.

- **tree?**: `unknown`
- **targetDefinition?**: `{
        url: string;
    }`
- **tokens?**: `Record<string, unknown>`
- **breakpoints?**: `Record<string, number>`
- **components?**: `Record<string, unknown>`

#### interface `ThemeState`

Theme working state — content without required envelope metadata.
Handlers read/write defaults, selectors, items, pages, etc.

- **targetDefinition?**: `{
        url: string;
        compatibleVersions?: string;
    }`
- **tokens?**: `Record<string, unknown>`
- **defaults?**: `Record<string, unknown>`
- **selectors?**: `unknown[]`
- **items?**: `Record<string, unknown>`
- **pages?**: `unknown[]`
- **breakpoints?**: `Record<string, number>`
- **stylesheets?**: `string[]`
- **extensions?**: `Record<string, unknown>`

#### interface `MappingState`

Mapping working state — content without required envelope metadata.
Handlers read/write rules, targetSchema, adapters, etc.

- **rules?**: `unknown[]`
- **targetSchema?**: `Record<string, unknown>`
- **definitionRef?**: `string`
- **definitionVersion?**: `string`
- **direction?**: `'forward' | 'reverse' | 'both'`
- **defaults?**: `Record<string, unknown>`
- **autoMap?**: `boolean`
- **conformanceLevel?**: `'core' | 'bidirectional' | 'extended'`
- **adapters?**: `Record<string, unknown>`

#### interface `LocaleState`

Working state for a single locale document.
Keyed by BCP 47 code in ProjectState.locales.

- **locale** (`string`): BCP 47 locale code (e.g. "fr", "fr-CA").
- **version** (`string`): Locale document version.
- **fallback** (`string`): BCP 47 code of the fallback locale (optional).
- **targetDefinition** (`{
        url: string;
        compatibleVersions?: string;
    }`): Target definition this locale was authored for.
- **strings** (`Record<string, string>`): Locale string key-value pairs.
- **name** (`string`): Human-readable name of the locale (e.g. "Français").
- **title** (`string`): Display title for the locale.
- **description** (`string`): Description of the locale document.
- **url** (`string`): URL of the locale document source.

#### interface `ExtensionsState`

Read-only extension state loaded into a project.

Registries provide custom data types, FEL functions, constraints, and properties.
They are reference data -- the project loads them but does not author them.

- **registries** (`LoadedRegistry[]`): All extension registries currently loaded into the project.

#### interface `LoadedRegistry`

A single extension registry that has been fetched and indexed.
All fields are JSON-serializable — no Maps or class instances.

- **url** (`string`): Canonical URL of the registry document.
- **document** (`unknown`): The raw registry document as loaded.
- **entries** (`Record<string, unknown>`): Extension entries keyed by name. Plain object for JSON serializability.

#### interface `VersioningState`

Tracks the definition's version history.

Enables changelog generation (structured diff with semver impact classification)
and version publishing. The baseline is compared against the current definition
to compute pending changes.

- **baseline** (`FormDefinition`): Snapshot of the definition at the last publish (or project creation).
- **releases** (`VersionRelease[]`): Ordered release history, oldest first.

#### interface `VersionRelease`

A published version of the definition, including its changelog and frozen snapshot.

- **version** (`string`): Semver version string (e.g. `"1.2.0"`).
- **publishedAt** (`string`): ISO 8601 timestamp of when this version was published.
- **changelog** (`unknown`): Structured diff from the previous version.
- **snapshot** (`FormDefinition`): Frozen definition snapshot at this version.

#### interface `ProjectState`

The complete state of a studio project.

Contains four editable Formspec artifacts (definition, component, theme, mapping)
plus two supporting subsystems (extensions, versioning). No UI state (selection,
panel visibility, viewport) lives here -- that belongs to the consumer.

Mutations happen exclusively through dispatched commands; never mutate directly.

- **definition** (`FormDefinition`): The form's structure and behavior: items, binds, shapes, variables, etc.
- **component** (`ComponentState`): The form's component document and layout structure.
- **theme** (`ThemeState`): Visual presentation content: tokens, defaults, selectors, page layout.
- **mappings** (`Record<string, MappingState>`): Named mapping collection: rules, targetSchema, adapters, etc. keyed by unique ID.
- **selectedMappingId** (`string`): ID of the mapping currently being edited in the UI.
- **locales** (`Record<string, LocaleState>`): Loaded locale documents keyed by BCP 47 code.
- **selectedLocaleId** (`string`): BCP 47 code of the active locale in the editor.
- **extensions** (`ExtensionsState`): Loaded extension registries providing custom types, functions, and constraints.
- **screener** (`ScreenerDocument | null`): Standalone Screener Document, or null if no screener is loaded.
- **versioning** (`VersioningState`): Baseline snapshot and release history for changelog generation.

#### interface `Command`

A serializable edit operation dispatched against a Project.

Every mutation to project state is expressed as a command. Commands can be
logged, replayed, transmitted, and persisted -- enabling undo/redo, collaboration,
and audit trails.

- **type** (`T`): Discriminant identifying which handler processes this command.
- **payload** (`P`): Command-specific data (e.g. the item to add, the path to remove).
- **id** (`string`): Optional client-generated ID for correlation (not used by the engine).

#### interface `CommandResult`

Result returned by every command handler after mutating state.

Tells the Project (and consumers) what side effects are needed.

- **rebuildComponentTree** (`boolean`): Whether the component tree needs rebuilding (e.g. after structural item changes).
- **clearHistory** (`boolean`): If true, discard all undo/redo history (e.g. after a full project replacement).
- **insertedPath** (`string`): Canonical path of a newly inserted item, returned by add-item style handlers.
- **newPath** (`string`): Canonical path after a move or rename operation.
- **nodeRef** (`{
        bind?: string;
        nodeId?: string;
    }`): Reference to a created/wrapped component node, returned by component tree handlers.
- **nodeNotFound** (`boolean`): True when the target component node was not found (non-throwing).

#### interface `LogEntry`

A timestamped record of a dispatched command.

The full command log is serializable and can be persisted then replayed
on a fresh project to reconstruct state.

- **command** (`AnyCommand | InternalCommand`): The command that was dispatched (or an internal lifecycle label for batch/undo/redo).
- **timestamp** (`number`): Epoch milliseconds when the command was dispatched.

#### interface `ProjectOptions`

Configuration for creating a new Project instance via `createProject()`.

- **seed** (`Partial<ProjectState>`): Partial initial state. Omitted fields get sensible defaults (empty definition
with a generated URL, blank component/theme/mapping documents, no extensions).
- **registries** (`unknown[]`): Extension registry documents to load at creation time.
- **maxHistoryDepth** (`number`): Maximum number of undo snapshots to retain (default: 50). Oldest pruned first.
- **middleware** (`Middleware[]`): Middleware functions inserted into the dispatch pipeline.
- **schemaValidator** (`SchemaValidator`): Optional schema validator. A wrapper around formspec-engine `lintDocument()` is sufficient. When set, diagnose() runs structural validation and populates the structural diagnostics array. Omit in environments where schemas are not available (e.g. browser without bundled schemas).
- **handlers** (`Record<string, CommandHandler>`): Additional command handlers merged with builtins. Keys override builtins.

#### interface `ChangeEvent`

Describes a state change that just occurred. Passed to {@link ChangeListener} callbacks.

- **command** (`AnyCommand | InternalCommand`): The command that triggered this change, or an internal lifecycle label for undo/redo/batch.
- **result** (`CommandResult`): The result returned by the command handler.
- **source** (`string`): How the change originated: `'dispatch'`, `'undo'`, `'redo'`, or `'batch'`.

#### interface `ProjectStatistics`

Aggregate complexity metrics for a project.
Returned by `Project.statistics()` for dashboards and heuristic checks.

- **fieldCount** (`number`): Number of leaf field items in the definition.
- **groupCount** (`number`): Number of group (repeatable/non-repeatable) items.
- **displayCount** (`number`): Number of display (read-only output) items.
- **maxNestingDepth** (`number`): Deepest nesting level of groups within groups.
- **bindCount** (`number`): Total number of bind entries (calculate, relevant, required, readonly, constraint).
- **shapeCount** (`number`): Number of cross-field validation shapes.
- **variableCount** (`number`): Number of named FEL variables.
- **expressionCount** (`number`): Total FEL expressions across all artifacts.
- **componentNodeCount** (`number`): Number of nodes in the component tree.
- **totalMappingRuleCount** (`number`): Total number of mapping rules across all integrations.
- **mappingCount** (`number`): Number of distinct mapping documents.
- **screenerFieldCount** (`number`): Number of fields in the screener (0 if no screener loaded).
- **screenerRouteCount** (`number`): Total routing rules across all screener phases (0 if no screener loaded).
- **screenerPhaseCount** (`number`): Number of evaluation phases in the screener (0 if no screener loaded).

#### interface `ItemFilter`

Criteria for searching definition items via `Project.searchItems()`.
All fields are optional; when multiple are set they are AND-combined.

- **type** (`'field' | 'group' | 'display'`): Filter by item kind.
- **dataType** (`string`): Filter by data type name (exact match).
- **label** (`string`): Filter by label text (substring match).
- **hasExtension** (`string`): Filter to items that declare this extension name.

#### interface `ItemSearchResult`

A search result item augmented with its full dot-notation path.
The `path` disambiguates same-named items in different groups.

- **path** (`string`): Full dot-notation path (e.g. `"contact.email"`).

#### interface `DataTypeInfo`

Describes a data type available in the project.
Includes the 13 core types plus any extension-provided types from loaded registries.

- **name** (`string`): The data type name (e.g. `'string'`, `'x-formspec-url'`).
- **source** (`'core' | 'extension'`): Whether this type is built-in or provided by an extension registry.
- **baseType** (`string`): For extension data types, the core type it extends.
- **registryUrl** (`string`): URL of the registry that provides this extension type.

#### interface `RegistrySummary`

Summary of a loaded extension registry for display purposes.

- **url** (`string`): Canonical URL of the registry.
- **entryCount** (`number`): Number of extension entries in this registry.

#### interface `ExtensionFilter`

Criteria for filtering extension entries within loaded registries.

- **category** (`'dataType' | 'function' | 'constraint' | 'property' | 'namespace'`): Filter by extension category.
- **status** (`'draft' | 'stable' | 'deprecated' | 'retired'`): Filter by lifecycle status.
- **namePattern** (`string`): Filter by name (substring or glob match).

#### interface `FELMappingContext`

Mapping-editor context for expression parsing/autocomplete.

- **ruleIndex** (`number`): Optional mapping rule index in the current document.
- **direction** (`'forward' | 'reverse'`): Mapping transform direction.
- **sourcePath** (`string`): Source path context for the current rule/expression.
- **targetPath** (`string`): Target path context for the current rule/expression.

#### interface `MappingPreviewParams`

Configuration for running a mapping preview.

- **mappingId** (`string`): ID of the mapping to simulate. If omitted, uses the currently selected mapping.
- **sampleData** (`Record<string, unknown>`): The source data to transform (form response if forward, external data if reverse).
- **direction** (`'forward' | 'reverse'`): Transform direction: 'forward' (form->target) or 'reverse' (target->form).
- **ruleIndices** (`number[]`): Optional subset of rule indices to execute. If omitted, all rules are run.

#### interface `MappingPreviewResult`

Results of a mapping preview simulation.

- **output** (`unknown`): The transformed output data.
- **diagnostics** (`unknown[]`): Issues encountered during the transformation.
- **appliedRules** (`number`): Keys or indices of rules that were successfully applied.
- **direction** (`string`): Direction that was executed.

#### interface `FELParseContext`

Editor context for parsing FEL and assembling reference suggestions.

- **targetPath** (`string`): Definition path currently being edited (supports repeat-scope inference).
- **mappingContext** (`FELMappingContext`): Optional mapping-editor context for mapping-specific references.

#### interface `FELParseResult`

Result of parsing and validating a FEL expression via `Project.parseFEL()`.
Enables inline validation and autocomplete in expression editors.

- **valid** (`boolean`): Whether the expression is syntactically and semantically valid.
- **errors** (`Diagnostic[]`): Parse or validation errors found in the expression.
- **warnings** (`Diagnostic[]`): Warnings (non-fatal issues like unknown function names).
- **references** (`string[]`): Field paths referenced by the expression ($ references).
- **variables** (`string[]`): Variable names referenced by the expression (@ references).
- **functions** (`string[]`): FEL function names called in the expression.

#### interface `FELReferenceSet`

Scope-aware set of valid references available at a given path.

Returned by `Project.availableReferences()`. Includes repeat-group context
refs (`@current`, `@index`, `@count`) when inside a repeat, and mapping
context refs (`@source`, `@target`) when inside a mapping expression.

- **fields** (`{
        path: string;
        dataType: string;
        label?: string;
        /**
         * Present only when contextPath is inside a repeatable group.
         * - `'local'` — field is inside the same innermost repeat group as contextPath.
         * - `'global'` — field is outside that repeat group.
         */
        scope?: 'local' | 'global';
    }[]`): Fields that can be referenced, with their data type and optional label.
- **variables** (`{
        name: string;
        expression: string;
    }[]`): Named variables declared in the definition.
- **instances** (`{
        name: string;
        source?: string;
    }[]`): External data source instances.
- **contextRefs** (`string[]`): Context-specific references (e.g. `@current`, `@index`, `@source`).

#### interface `FELFunctionEntry`

A FEL function available in the project.
Combines built-in stdlib functions with extension-provided functions.

- **name** (`string`): Function name as used in FEL expressions.
- **category** (`string`): Functional category (e.g. `'aggregate'`, `'string'`, `'date'`).
- **source** (`'builtin' | 'extension'`): Whether this function is built-in or provided by an extension.
- **signature** (`string`): Function signature (e.g. `'sum(array<number>) -> number'`).
- **description** (`string`): Human-readable description of what the function does.
- **registryUrl** (`string`): URL of the registry providing this function, if extension-sourced.

#### interface `ExpressionLocation`

Location of a FEL expression within the project's artifacts.
Returned by `Project.allExpressions()` for cross-artifact expression indexing.

- **expression** (`string`): The FEL expression string.
- **artifact** (`'definition' | 'component' | 'mapping'`): Which artifact contains this expression.
- **location** (`string`): Human-readable location descriptor (e.g. `'binds.age.calculate'`).

#### interface `DependencyGraph`

Full dependency graph across all FEL expressions in the project.

Nodes are fields, variables, or shapes. Edges indicate that one node's
expression references another. Cycles are detected and reported separately.

- **nodes** (`{
        id: string;
        type: 'field' | 'variable' | 'shape';
    }[]`): All nodes participating in FEL dependency relationships.
- **edges** (`{
        from: string;
        to: string;
        via: string;
    }[]`): Directed edges: `from` references `to` via the named expression property.
- **cycles** (`string[][]`): Groups of node IDs forming circular dependency chains.

#### interface `FieldDependents`

Reverse lookup: everything that depends on a specific field.
Returned by `Project.fieldDependents()`.

- **binds** (`{
        path: string;
        property: string;
    }[]`): Bind entries whose expressions reference this field.
- **shapes** (`{
        id: string;
        property: string;
    }[]`): Shape rules whose expressions reference this field.
- **variables** (`string[]`): Names of variables whose expressions reference this field.
- **mappingRules** (`string[]`): Identifiers of mapping rules that reference this field (format: `mappingId:index`).
- **screenerRoutes** (`Array<{
        phaseId: string;
        routeIndex: number;
    }>`): Screener routes whose expressions reference this field.

#### interface `Diagnostic`

A single diagnostic message produced during project validation.
Used across structural, expression, extension, and consistency checks.

- **artifact** (`'definition' | 'component' | 'theme' | 'mapping'`): Which artifact produced this diagnostic.
- **path** (`string`): JSON-pointer-style path to the problematic element.
- **severity** (`'error' | 'warning' | 'info'`): Severity level.
- **code** (`string`): Machine-readable diagnostic code (e.g. `'UNRESOLVED_EXTENSION'`).
- **message** (`string`): Human-readable description of the issue.
- **line** (`number`): 1-based line number within the expression, when available (FEL parse errors).
- **column** (`number`): 1-based column number within the expression, when available (FEL parse errors).
- **span** (`{
        start: number;
        end: number;
    }`): Character span in source when provided by the analyzer (Rust lexer indices).

#### interface `Diagnostics`

Grouped diagnostic results from `Project.diagnostics()`.

Diagnostics are categorized by check type and include aggregate severity counts
for quick status display.

- **structural** (`Diagnostic[]`): Schema and structural validity issues.
- **expressions** (`Diagnostic[]`): FEL parse errors, unresolved references, and type mismatches.
- **extensions** (`Diagnostic[]`): Unresolved extensions and registry-related issues.
- **consistency** (`Diagnostic[]`): Cross-artifact consistency problems (e.g. component refs to missing items).
- **counts** (`{
        error: number;
        warning: number;
        info: number;
    }`): Aggregate counts by severity across all categories.

#### interface `ResponseSchemaRow`

A single row in the response schema view.

Describes one item (field or group) from the definition in terms of its
JSON representation in a submitted form response. Rows are returned in
document order (depth-first) by `Project.responseSchemaRows()`.

- **path** (`string`): Full dotted path to this item (e.g. `"contact.email"`).
- **key** (`string`): The item's key (leaf segment of path).
- **label** (`string`): The item's label, or the key if no label is set.
- **depth** (`number`): Nesting depth: 0 for root items, 1 for children of root groups, etc.
- **jsonType** (`'string' | 'number' | 'boolean' | 'object' | 'array<object>'`): JSON type of the item's value in a form response:
- `"object"` for non-repeatable groups
- `"array<object>"` for repeatable groups
- `"number"` for fields with dataType `integer` or `decimal`
- `"boolean"` for fields with dataType `boolean`
- `"string"` for all other fields
- **required** (`boolean`): Whether any bind for this path has a `required` property.
- **calculated** (`boolean`): Whether any bind for this path has a `calculate` property.
- **conditional** (`boolean`): Whether any bind for this path has a `relevant` or `readonly` property.

#### interface `Change`

A single change detected between two definition versions.
Part of a {@link FormspecChangelog}.

- **type** (`'added' | 'removed' | 'modified' | 'moved' | 'renamed'`): Kind of change: structural addition/removal, modification, relocation, or rename.
- **target** (`'item' | 'bind' | 'shape' | 'optionSet' | 'dataSource' | 'screener' | 'migration' | 'metadata'`): Which definition element was affected.
- **path** (`string`): Dot-path to the affected element.
- **impact** (`'breaking' | 'compatible' | 'cosmetic'`): Semver impact classification: breaking changes require a major bump.
- **description** (`string`): Human-readable description of the change.
- **before** (`unknown`): Previous value (for modified/removed changes).
- **after** (`unknown`): New value (for modified/added changes).

#### interface `FormspecChangelog`

Structured diff between two definition versions.

Generated by comparing the versioning baseline against the current definition,
or between two published releases. Includes an overall semver impact classification
derived from the highest-impact individual change.

- **definitionUrl** (`string`): URL of the definition these changes apply to.
- **fromVersion** (`string`): Version string of the earlier snapshot.
- **toVersion** (`string`): Version string of the later snapshot.
- **semverImpact** (`'breaking' | 'compatible' | 'cosmetic'`): Overall semver impact (the maximum across all individual changes).
- **changes** (`Change[]`): Individual changes detected between the two versions.

#### type `BuiltinCommandType`

```ts
type BuiltinCommandType = keyof ProjectCommandMap;
```

#### type `AnyCommand`

A command with any type and payload -- used when the specific command type is not known statically.

```ts
type AnyCommand = {
    [K in BuiltinCommandType]: Command<K, ProjectCommandMap[K]>;
}[BuiltinCommandType];
```

#### type `InternalCommandType`

Synthetic lifecycle labels emitted by the project for history/notification
purposes only. These are never dispatched through command handlers and
therefore do not belong in ProjectCommandMap.

```ts
type InternalCommandType = 'undo' | 'redo' | 'restoreState' | 'batch' | 'batchWithRebuild';
```

#### type `InternalCommand`

```ts
type InternalCommand = Command<InternalCommandType, Record<string, unknown>>;
```

#### type `CommandHandler`

A function that applies a command's payload to a cloned project state.
Handlers receive a mutable clone of ProjectState and mutate it in-place.
They return a CommandResult indicating what side effects are needed.

```ts
type CommandHandler = (state: ProjectState, payload: unknown) => CommandResult & Record<string, unknown>;
```

#### type `Middleware`

A function that wraps the command execution pipeline.

Middleware sees the current (read-only) state and the full command plan
(an array of phases, each phase being an array of commands). It must call
`next(commands)` to continue the pipeline, or may short-circuit, transform
the commands, or perform side effects before/after.

#### type `ChangeListener`

Callback invoked after every state change (dispatch, undo, redo, batch).

```ts
type ChangeListener = (state: Readonly<ProjectState>, event: ChangeEvent) => void;
```
