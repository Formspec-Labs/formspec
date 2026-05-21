# ADR 0046: Headless Component Architecture with Render Adapters

**Status:** Accepted
**Date:** 2026-03-18
**Reviewed:** 2026-03-18 (code-scout, formspec-scout — findings integrated)

## Context

The webcomponent package (`packages/formspec-webcomponent/`) renders Formspec forms via component plugins registered in a `ComponentRegistry`. Each plugin implements a `render()` function that mixes three distinct concerns in a single code path:

1. **Structure** — creating DOM elements and arranging them into a hierarchy
2. **Behavior** — wiring reactive signal subscriptions, event handlers, value coercion, ARIA attributes, touched tracking, validation display
3. **Styling** — applying theme-resolved classes, tokens, and inline styles

This coupling creates a concrete problem: design systems like USWDS (U.S. Web Design System) require different DOM structures than the webcomponent emits. USWDS radio buttons use `<div class="usa-radio"><input class="usa-radio__input"><label class="usa-radio__label">` — a wrapper-per-option structure with BEM class names. The webcomponent emits native `<input type="radio">` with adjacent `<label>` text. No amount of CSS class injection (`x-classes`, `cssClass`) can bridge this gap — the DOM shape is wrong.

Today this is patched with "bridge CSS" — a supplementary stylesheet that uses CSS tricks to approximate the target design system's appearance despite structural mismatches. This works but is fragile, incomplete, and must be maintained per design system.

### The poster child: `field-input.ts`

`renderInputComponent()` is a single 540-line function containing a monolithic if/else chain that handles every field type (RadioGroup, CheckboxGroup, MoneyInput, Select, Toggle, TextInput, NumberInput, DatePicker). Each branch interleaves DOM creation with signal subscriptions, event wiring, and value type coercion. To support a new DOM structure for any of these, you'd have to fork the entire function.

Additionally, 5 input plugins (Slider, Rating, FileUpload, Signature, MoneyInput in `inputs.ts`) contain their own self-contained DOM + signal wiring inline rather than delegating to `renderInputComponent`. The problem exists in two places, not one.

### Alignment with ADR 0045 (Rust Shared Kernel)

ADR 0045 establishes that `index.ts` (FormEngine + Preact Signals reactive state) is the only TypeScript that stays; all pure logic moves to Rust/WASM. The behavior hooks proposed here sit at the boundary — they consume the engine's reactive API and present a signal-free contract to adapters. This means:

- Behavior hooks depend on FormEngine (TypeScript, stays)
- Adapters are pure DOM, no signal dependency — they could be authored in any language that targets DOM
- The split creates a clean seam: if the engine API changes (e.g., Rust FFI), only behavior hooks need updating — adapters are untouched

---

## Decision

Apply **dependency inversion** to the component render layer. Today, each component plugin is a concrete unit that owns both logic and markup — the thing that knows the behavior also builds the DOM. We invert this: both sides depend on a shared abstraction (the behavior contract), neither owns the other.

```
Classic DI:     high-level module  →  interface  ←  low-level module
This ADR:       behavior hook      →  FieldBehavior / FieldRefs  ←  render adapter
```

The behavior hook doesn't know what DOM the adapter will create. The adapter doesn't know what reactive system drives the behavior. They agree on `FieldRefs` (what elements to bind to) and `ResolvedPresentationBlock` (what the theme wants). The webcomponent's orchestrator is the composition root that connects them.

This is the same pattern that Zag.js, Headless UI, and Radix converged on independently — DI applied to the render layer. The behavior is the "business logic"; the adapter is the "infrastructure."

Concretely, split each component plugin into two layers:

1. **Behavior hooks** — functions that accept a `RenderContext` and component descriptor, and return a typed **behavior contract**: static props, reactive accessors, and a `bind(refs)` function that wires all reactive effects given DOM element references.

2. **Render adapters** — functions that receive a behavior contract and build DOM. The default adapter reproduces today's DOM structure. Design-system adapters (USWDS, Bootstrap, etc.) emit their own markup. Adapters never import `@preact/signals-core` — they are pure DOM construction.

The existing `ComponentPlugin.render()` becomes an orchestrator (composition root): call behavior hook → look up adapter → call adapter. The adapter calls `bind()` after building DOM.

---

## Architecture

### Behavior Contract

Each component type defines a typed behavior contract. Field components share a common base:

```typescript
/** Returned by every field behavior hook. */
interface FieldBehavior {
  /** Resolved field identity. */
  fieldPath: string;
  id: string;

  /** Static content for the field. */
  label: string;
  hint: string | null;
  description: string | null;

  /**
   * Resolved presentation from the 5-level theme cascade.
   * All $token. references are pre-resolved to concrete values.
   * Adapters read this for labelPosition, cssClass, style, accessibility,
   * and widgetConfig — see "Adapter Contract Obligations" below.
   */
  presentation: ResolvedPresentationBlock;

  /**
   * Current options for choice/multiChoice fields. Empty array for
   * non-choice fields. Returns the current snapshot — may change if
   * remote options load asynchronously.
   */
  options(): ReadonlyArray<{ value: string; label: string }>;

  /**
   * Wire ALL reactive effects to the provided DOM refs. This includes:
   *   - Value sync (engine → DOM and DOM → engine event listeners)
   *   - Validation display (error text, aria-invalid)
   *   - Required indicator (label update, aria-required)
   *   - Readonly state (input attribute, aria-readonly, root class)
   *   - Relevance (show/hide root, aria-hidden)
   *   - Touched tracking (focusout/change → touched state)
   *   - Option change rebuilds (calls refs.rebuildOptions when options change)
   *
   * Returns a dispose function that tears down all subscriptions.
   *
   * IMPORTANT: bind() owns ALL event wiring. Adapters MUST NOT register
   * their own event listeners for value sync, change detection, or
   * touch tracking. Adapters only build DOM structure.
   */
  bind(refs: FieldRefs): () => void;
}

/**
 * Pre-resolved PresentationBlock — all $token. references already
 * substituted with concrete values. Adapters never need token resolution.
 */
interface ResolvedPresentationBlock {
  widget?: string;
  widgetConfig?: Record<string, any>;
  labelPosition?: 'top' | 'start' | 'hidden';
  style?: Record<string, string>;
  accessibility?: { role?: string; description?: string; liveRegion?: string };
  cssClass?: string | string[];
  fallback?: string[];
}

interface FieldRefs {
  /** Outermost wrapper — receives relevance show/hide and readonly styling. */
  root: HTMLElement;
  /** Label element — receives required indicator updates. */
  label: HTMLElement;
  /**
   * Primary input control. For simple fields this is the <input>/<select>/
   * <textarea>. For choice groups this is the fieldset/container.
   * bind() uses this for aria-invalid, aria-required, aria-readonly.
   * For simple fields, bind() also sets .value/.checked and registers
   * input/change event listeners on this element.
   */
  control: HTMLElement;
  /** Hint text element (optional). */
  hint?: HTMLElement;
  /** Error display element — receives validation message and visibility. */
  error?: HTMLElement;
  /**
   * For choice fields: individual option input elements keyed by option value.
   * bind() registers change listeners on each and syncs checked state.
   * Adapters create these elements but MUST NOT register change listeners.
   */
  optionControls?: Map<string, HTMLInputElement>;
  /**
   * Called by bind() when options change asynchronously (remote options).
   * The adapter provides this callback during initial render. bind() calls
   * it with the new options array; the adapter rebuilds the options DOM
   * inside the provided container and returns updated optionControl refs.
   *
   * If not provided, bind() triggers a full component re-render on
   * option change (current behavior, acceptable fallback).
   */
  rebuildOptions?: (
    container: HTMLElement,
    options: ReadonlyArray<{ value: string; label: string }>
  ) => Map<string, HTMLInputElement>;
}
```

Component-specific contracts extend this base:

```typescript
interface RadioGroupBehavior extends FieldBehavior {
  /** ARIA role for the group container. */
  groupRole: 'radiogroup';
  /** Shared input name for all radio buttons. */
  inputName: string;
}

interface WizardBehavior {
  steps: ReadonlyArray<{ id: string; title: string }>;
  activeStep(): number;
  totalSteps(): number;
  canGoNext(): boolean;
  canGoPrev(): boolean;
  goNext(): void;
  goPrev(): void;
  goToStep(index: number): void;
  /**
   * Render a step's content into a container. This requires access to
   * ctx.renderComponent for recursive child rendering, which makes
   * WizardBehavior inherently coupled to the render pipeline. This is
   * an accepted tradeoff — wizard step content IS DOM construction,
   * and the alternative (pre-rendering all panels) is worse.
   */
  renderStep(index: number, parent: HTMLElement): void;
  bind(refs: WizardRefs): () => void;
}

interface WizardRefs {
  root: HTMLElement;
  stepIndicators?: HTMLElement[];
  stepContent: HTMLElement;
  prevButton?: HTMLButtonElement;
  nextButton?: HTMLButtonElement;
}
```

### Value Sync Ownership

**`bind()` owns ALL event wiring and value synchronization.** This is a critical invariant:

- `bind()` registers `input`/`change` event listeners on `refs.control` (or `refs.optionControls` for choice fields)
- `bind()` handles value coercion (string→number, boolean via `.checked`, money objects, min/max clamping)
- `bind()` syncs engine state → DOM (setting `.value`, `.checked`)
- Adapters MUST NOT register any event listeners for value sync, change detection, or touch tracking

This avoids the "two owners" problem where both adapter and behavior hook compete to handle the same events on the same element.

### Behavior Hook Functions

Each hook extracts behavior from the engine and returns a contract. Helpers like `resolveFieldPath()` and `toFieldId()` are new utilities created in `behaviors/shared.ts`:

```typescript
// behaviors/text-input.ts
export function useTextInput(
  ctx: RenderContext,
  comp: any,  // component descriptor from component tree
  prefix: string
): FieldBehavior {
  const fieldPath = resolveFieldPath(comp, prefix);
  const id = toFieldId(fieldPath);
  const item = ctx.findItemByKey(comp.bind);
  const presentation = resolveAndStripTokens(
    ctx.resolveItemPresentation({ key: item.key, type: 'field', dataType: item.dataType }),
    ctx.resolveToken
  );

  return {
    fieldPath,
    id,
    label: comp.labelOverride || item.label || item.key,
    hint: comp.hintOverride || item.hint || null,
    description: item.description || null,
    presentation,
    options: () => [],

    bind(refs: FieldRefs): () => void {
      const disposers: Array<() => void> = [];

      // Value sync: engine → DOM
      disposers.push(effect(() => {
        const val = ctx.engine.getValue(fieldPath);
        if (document.activeElement !== refs.control) {
          (refs.control as HTMLInputElement).value = val ?? '';
        }
      }));

      // Value sync: DOM → engine (bind owns this, not the adapter)
      refs.control.addEventListener('input', (e) => {
        ctx.engine.setValue(fieldPath, (e.target as HTMLInputElement).value);
      });

      // Required indicator
      disposers.push(effect(() => {
        const req = ctx.engine.requiredSignals[fieldPath]?.value ?? false;
        refs.label.innerHTML = req
          ? `${this.label} <span class="formspec-required">*</span>`
          : this.label;
        refs.control.setAttribute('aria-required', String(req));
      }));

      // Validation display
      disposers.push(effect(() => {
        ctx.touchedVersion.value; // subscribe to touch changes
        const error = ctx.engine.errorSignals[fieldPath]?.value;
        const show = ctx.touchedFields.has(fieldPath) ? (error || '') : '';
        if (refs.error) refs.error.textContent = show;
        refs.control.setAttribute('aria-invalid', String(!!show));
      }));

      // Readonly
      disposers.push(effect(() => {
        const ro = ctx.engine.readonlySignals[fieldPath]?.value ?? false;
        (refs.control as HTMLInputElement).readOnly = ro;
        refs.control.setAttribute('aria-readonly', String(ro));
        refs.root.classList.toggle('formspec-field--readonly', ro);
      }));

      // Relevance
      disposers.push(effect(() => {
        const rel = ctx.engine.relevantSignals[fieldPath]?.value ?? true;
        refs.root.classList.toggle('formspec-hidden', !rel);
        refs.control.setAttribute('aria-hidden', String(!rel));
      }));

      // Touched tracking (bind owns this, not the adapter)
      const markTouched = () => {
        if (!ctx.touchedFields.has(fieldPath)) {
          ctx.touchedFields.add(fieldPath);
          ctx.touchedVersion.value += 1;
        }
      };
      refs.root.addEventListener('focusout', markTouched);
      refs.root.addEventListener('change', markTouched);

      return () => disposers.forEach(d => d());
    }
  };
}

/**
 * Pre-resolve all $token. references in a PresentationBlock.
 * Adapters receive concrete values only — no token resolution needed.
 */
function resolveAndStripTokens(
  block: PresentationBlock,
  resolveToken: (v: any) => any
): ResolvedPresentationBlock {
  const resolved: any = { ...block };
  if (resolved.style) {
    resolved.style = Object.fromEntries(
      Object.entries(resolved.style).map(([k, v]) => [k, resolveToken(v)])
    );
  }
  if (resolved.cssClass) {
    resolved.cssClass = Array.isArray(resolved.cssClass)
      ? resolved.cssClass.map(c => resolveToken(c))
      : resolveToken(resolved.cssClass);
  }
  return resolved;
}
```

### Render Adapter Interface

```typescript
/**
 * A render adapter provides DOM construction functions for component types.
 * Missing entries fall back to the default adapter.
 */
interface RenderAdapter {
  /** Human-readable adapter name (e.g., 'uswds', 'bootstrap'). */
  name: string;

  /**
   * Component types this adapter explicitly supports. Adapters SHOULD be
   * complete (cover all field types they intend to style) or document which
   * types fall through to the default adapter. Mixing adapters produces
   * inconsistent visual results — this is a known tradeoff, not a bug.
   */
  components: Partial<Record<string, AdapterRenderFn>>;
}

/**
 * An adapter render function receives a behavior contract and a parent element.
 * It MUST:
 *   1. Create DOM elements
 *   2. Apply cascade-resolved cssClass and accessibility from behavior.presentation
 *      (see "Adapter Contract Obligations")
 *   3. Append the root element to parent
 *   4. Call behavior.bind(refs) with references to the created elements
 *   5. Store the dispose function returned by bind() for later cleanup
 *
 * It MUST NOT:
 *   - Import @preact/signals-core or access the engine directly
 *   - Register event listeners for value sync, change detection, or touch tracking
 *     (bind() owns all event wiring)
 */
type AdapterRenderFn<B = any> = (behavior: B, parent: HTMLElement, ctx: AdapterContext) => void;

/**
 * Minimal context passed to adapter render functions. Provides the dispose
 * callback registration and any adapter-level utilities.
 */
interface AdapterContext {
  /** Register a cleanup function to be called when the component is torn down. */
  onDispose(fn: () => void): void;
}
```

### Adapter Contract Obligations

Adapters MUST honor the following properties from `behavior.presentation` (the cascade-resolved `PresentationBlock`):

| Property | Obligation | Rationale |
|---|---|---|
| `cssClass` | **MUST** apply to the root element, additively alongside any design-system classes | Theme spec §5.5 guarantees union-merge semantics across cascade levels. Dropping cascade-resolved classes silently breaks theme author expectations. |
| `labelPosition` | **MUST** respect for structural label placement: `'top'` = label above input, `'start'` = label beside input (inline), `'hidden'` = visually hidden but present in accessible markup | Semantic property from theme cascade; adapter owns the structural interpretation. |
| `style` | **SHOULD** apply to the root element as inline styles | Low specificity, easily overridden by design-system classes. Adapters that use utility classes MAY ignore inline styles if their classes cover the same properties. |
| `accessibility` | **MUST** apply `role`, `aria-description`, `aria-live` from the accessibility block to the root element | Spec §9.2 requires themes not reduce accessibility. Ignoring cascade-resolved ARIA attributes violates this. |
| `widgetConfig` | **SHOULD** read for semantic configuration (e.g., `{ searchable: true }` for dropdowns, `{ direction: 'horizontal' }` for radio groups, `{ rows: 5 }` for textareas) | These influence DOM structure and control behavior, not just styling. |
| `x-classes` in `widgetConfig` | **MAY** read `widgetConfig['x-classes']` for fine-grained slot overrides | Design-system adapters that own their markup typically ignore x-classes. The default adapter SHOULD support them for backwards compatibility. |

Example — USWDS adapter honoring cascade cssClass:

```typescript
const renderTextInput: AdapterRenderFn<FieldBehavior> = (behavior, parent, actx) => {
  const p = behavior.presentation;

  const root = el('div', { class: 'usa-form-group', 'data-name': behavior.fieldPath });
  // MUST: apply cascade-resolved classes alongside design-system classes
  if (p.cssClass) {
    const cascadeClasses = Array.isArray(p.cssClass) ? p.cssClass : [p.cssClass];
    cascadeClasses.forEach(c => root.classList.add(...c.split(/\s+/).filter(Boolean)));
  }

  // Respect labelPosition from cascade
  const labelPosition = p.labelPosition ?? 'top';
  const label = el('label', {
    class: labelPosition === 'hidden' ? 'usa-sr-only' : 'usa-label',
    for: behavior.id,
  });
  label.textContent = behavior.label;
  root.appendChild(label);

  // Apply cascade accessibility
  if (p.accessibility?.role) root.setAttribute('role', p.accessibility.role);
  if (p.accessibility?.description) root.setAttribute('aria-description', p.accessibility.description);
  if (p.accessibility?.liveRegion) root.setAttribute('aria-live', p.accessibility.liveRegion);

  // Hint
  if (behavior.hint) {
    const hint = el('span', { class: 'usa-hint', id: `${behavior.id}-hint` });
    hint.textContent = behavior.hint;
    root.appendChild(hint);
  }

  const input = el('input', {
    class: 'usa-input',
    id: behavior.id,
    name: behavior.fieldPath,
    type: 'text',
  });
  root.appendChild(input);

  const error = el('span', {
    class: 'usa-error-message',
    id: `${behavior.id}-error`,
    role: 'alert',
    'aria-live': 'polite',
  });
  root.appendChild(error);

  parent.appendChild(root);

  // bind() wires all reactive behavior — adapter does NOT register event listeners
  const dispose = behavior.bind({ root, label, control: input, error });
  actx.onDispose(dispose);
};
```

### USWDS RadioGroup (the structural mismatch case)

```typescript
// packages/formspec-adapters/src/uswds/radio-group.ts
const renderRadioGroup: AdapterRenderFn<RadioGroupBehavior> = (behavior, parent, actx) => {
  const p = behavior.presentation;
  const fieldset = el('fieldset', { class: 'usa-fieldset', role: behavior.groupRole });

  // Apply cascade cssClass
  if (p.cssClass) {
    const classes = Array.isArray(p.cssClass) ? p.cssClass : [p.cssClass];
    classes.forEach(c => fieldset.classList.add(...c.split(/\s+/).filter(Boolean)));
  }

  const legend = el('legend', { class: 'usa-legend' });
  legend.textContent = behavior.label;
  fieldset.appendChild(legend);

  const optionControls = new Map<string, HTMLInputElement>();

  function buildOptions(options: ReadonlyArray<{ value: string; label: string }>) {
    // Clear existing options (for rebuildOptions callback)
    fieldset.querySelectorAll('.usa-radio').forEach(el => el.remove());
    const controls = new Map<string, HTMLInputElement>();

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optId = `${behavior.id}-${i}`;

      // USWDS radio pattern: wrapper div > input + label
      const wrapper = el('div', { class: 'usa-radio' });
      const radio = el('input', {
        class: 'usa-radio__input',
        type: 'radio',
        id: optId,
        name: behavior.inputName,
        value: opt.value,
      }) as HTMLInputElement;
      controls.set(opt.value, radio);
      // NOTE: no change listener — bind() owns all event wiring

      const optLabel = el('label', {
        class: 'usa-radio__label',
        for: optId,
      });
      optLabel.textContent = opt.label;

      wrapper.append(radio, optLabel);
      fieldset.appendChild(wrapper);
    }
    return controls;
  }

  const initialControls = buildOptions(behavior.options());

  const error = el('span', {
    class: 'usa-error-message',
    id: `${behavior.id}-error`,
    role: 'alert',
    'aria-live': 'polite',
  });
  fieldset.appendChild(error);
  parent.appendChild(fieldset);

  // bind() wires checked state sync, validation, required, relevance, touched
  const dispose = behavior.bind({
    root: fieldset,
    label: legend,
    control: fieldset,
    error,
    optionControls: initialControls,
    rebuildOptions: (_container, newOptions) => buildOptions(newOptions),
  });
  actx.onDispose(dispose);
};
```

### Adapter Registration and Resolution

```typescript
// On the ComponentRegistry (existing singleton)
class ComponentRegistry {
  private adapters = new Map<string, RenderAdapter>();
  private activeAdapter: string = 'default';

  /** Register an adapter. The 'default' adapter is always present. */
  registerAdapter(adapter: RenderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /** Set the active adapter by name. */
  setAdapter(name: string): void {
    if (!this.adapters.has(name)) {
      console.warn(`Adapter '${name}' not registered, falling back to 'default'.`);
      return;
    }
    this.activeAdapter = name;
  }

  /** Resolve the render function for a component type. Falls back to default. */
  resolveAdapterFn(componentType: string): AdapterRenderFn {
    const active = this.adapters.get(this.activeAdapter);
    return active?.components[componentType]
        ?? this.adapters.get('default')!.components[componentType]!;
  }
}
```

Per-instance override is also supported via the `<formspec-render>` element:

```typescript
class FormspecRender extends HTMLElement {
  /** Override the global adapter for this form instance. */
  set adapter(name: string) { /* ... */ }
}
```

This enables multiple forms with different design systems on one page.

### Package Structure

```
packages/
  formspec-webcomponent/
    src/
      behaviors/              ← NEW: extracted behavior hooks
        shared.ts             ← FieldBehavior, FieldRefs, resolveFieldPath(), toFieldId(),
                                 resolveAndStripTokens(), shared bind helpers
        text-input.ts         ← useTextInput()
        number-input.ts       ← useNumberInput()
        radio-group.ts        ← useRadioGroup()
        checkbox-group.ts     ← useCheckboxGroup()
        select.ts             ← useSelect()
        toggle.ts             ← useToggle()
        money-input.ts        ← useMoneyInput()
        date-picker.ts        ← useDatePicker()
        file-upload.ts        ← useFileUpload()
        slider.ts             ← useSlider()        (currently inline in inputs.ts)
        rating.ts             ← useRating()         (currently inline in inputs.ts)
        signature.ts          ← useSignature()      (currently inline in inputs.ts)
        textarea.ts           ← useTextarea()
        search-input.ts       ← useSearchInput()
        wizard.ts             ← useWizard()
        tabs.ts               ← useTabs()
      adapters/               ← NEW: adapter registry + default adapter
        registry.ts           ← AdapterRegistry, AdapterContext
        default/              ← current DOM output, restructured
          index.ts            ← exports defaultAdapter
          text-input.ts
          radio-group.ts
          ...
      components/             ← MODIFIED: now thin orchestrators
        inputs.ts             ← calls behavior hook → resolves adapter → calls adapter
        layout.ts             ← layout components (see "Scope Boundaries" below)
        display.ts            ← display components (minimal behavior)
        interactive.ts        ← wizard, tabs: full behavior split
        special.ts
      rendering/
        field-input.ts        ← DELETED (replaced by behaviors/ + adapters/)
        emit-node.ts          ← MODIFIED: adapter dispatch in orchestrator
      styling/                ← UNCHANGED (adapters receive pre-resolved tokens)
      types.ts                ← MODIFIED: adds behavior + adapter types
```

External adapter packages:

```
packages/
  formspec-adapters/                  ← NEW: adapter library package
    src/
      index.ts                        ← barrel export for all adapters
      helpers.ts                      ← shared utilities (el, applyCascadeClasses, applyCascadeAccessibility)
      uswds/                          ← USWDS v3 adapter
        index.ts                      ← exports uswdsAdapter
        text-input.ts
        radio-group.ts
        checkbox-group.ts
        select.ts
        ...
    package.json                      ← peer-depends on formspec-webcomponent
```

---

## Scope Boundaries

### What IS in scope

The behavior/adapter split applies to:

- **Field components** (15 types): TextInput, NumberInput, RadioGroup, CheckboxGroup, Select, Toggle, MoneyInput, DatePicker, FileUpload, Slider, Rating, Textarea, SearchInput, Signature, and any future field types
- **Interactive components** (2 types): Wizard, Tabs — these have significant behavior (step state, navigation, soft validation) that benefits from extraction

### What is NOT in scope (and why)

**Layout components** (Section, Stack, Grid, Panel, Collapsible, Accordion, etc.) create structural containers and recursively render children. Their behavior is minimal (CSS grid application, collapse toggle state). They don't have the behavior/structure coupling problem this ADR addresses. Design-system adapters can customize layout containers via the existing `cssClass` cascade. If layout customization needs grow, a future ADR can extend the adapter pattern to layout components.

**Repeat group chrome** (add/remove buttons, instance wrappers) lives in `emit-node.ts`, not in component plugins. This DOM is outside the per-component adapter boundary. Design systems that need custom repeat chrome will need either:
- Extended `cssClass` targeting (sufficient for most cases)
- A future "repeat adapter" concept (if structural mismatches arise)

This is a known gap, not a blocking issue. Repeat chrome is simpler than field inputs and has fewer structural variants across design systems.

**Page layout** (spec §6) is a theme-tier concern handled by the planner (`formspec-layout`). The adapter pattern operates below the page level — adapters render individual components, not pages. Grid column spans, regions, and responsive breakpoints are handled by layout components, which remain unchanged. One practical concern: adapter-emitted width constraints (e.g., `class="max-w-md"`) could conflict with grid column spans. Adapter authors should avoid hardcoded width constraints on root elements when the form uses page layout.

---

## Migration Path

The refactor is incremental — one component at a time, existing behavior preserved at every step.

### Phase 1: Infrastructure

1. Define `FieldBehavior`, `FieldRefs`, `ResolvedPresentationBlock`, `RenderAdapter`, `AdapterRenderFn`, `AdapterContext` types in `types.ts`
2. Create `behaviors/shared.ts` with `resolveFieldPath()`, `toFieldId()`, `resolveAndStripTokens()`, and shared bind helpers (relevance, required indicator, readonly, touched tracking, validation display)
3. Create `adapters/registry.ts` with registration and resolution
4. Wire `ComponentRegistry` to delegate to adapter resolution
5. Register the 'default' adapter (initially empty — components fall back to current behavior)

### Phase 2: Extract field components (one at a time)

Two groups of field components need extraction:

**Group A — currently in `field-input.ts`** (8 types): TextInput, NumberInput, RadioGroup, CheckboxGroup, Select, Toggle, DatePicker, Textarea

For each:
1. **Extract behavior** — create `behaviors/<component>.ts`, move all signal wiring, value coercion, event handling, ARIA management into the `bind()` function
2. **Extract default render** — create `adapters/default/<component>.ts`, move DOM creation from the current code
3. **Update plugin** — the plugin's `render()` calls the behavior hook, resolves the adapter, and delegates
4. **Test** — verify existing E2E tests pass with zero DOM changes

**Group B — currently inline in `inputs.ts`** (5 types): Slider, Rating, FileUpload, Signature, MoneyInput

These have self-contained DOM + signal wiring that does NOT go through `renderInputComponent`. Same extraction process, but the source code is in `inputs.ts` plugin render functions, not `field-input.ts`.

### Phase 3: Build USWDS adapter

1. Create USWDS adapter in `packages/formspec-adapters/src/uswds/`
2. Implement adapter render functions using USWDS v3 markup patterns (`usa-form-group`, `usa-input`, `usa-radio`, etc.)
3. Build the reference form example app using this adapter

### Phase 4: Extract interactive components

Wizard and Tabs have the most complex behavior (step state, navigation guards, soft validation). Extract last. Note: `WizardBehavior.renderStep()` necessarily couples to the render pipeline (`ctx.renderComponent`) — this is an accepted tradeoff because wizard step content IS recursive DOM construction.

### Phase 5: Clean up

1. Delete `rendering/field-input.ts` (replaced entirely by behaviors + adapters)
2. Remove bridge CSS files (no longer needed when adapters own structure)
3. Update documentation

---

## Interaction with Theme Spec

**The theme spec does not change.** The adapter layer is entirely below the theme's concern. No new schema properties are needed. Existing themes work unchanged with the default adapter.

- The theme cascade still resolves `defaults` → `selectors` → `items` into a `PresentationBlock` per item (spec §5.5)
- The behavior hook pre-resolves all `$token.` references (per spec §7.3 step 3), producing a `ResolvedPresentationBlock` with concrete values
- The resolved block is passed to the adapter via `behavior.presentation`
- Adapters MUST honor `cssClass` (union semantics, spec §5.5), `labelPosition`, and `accessibility` from the resolved block — see "Adapter Contract Obligations" above
- `x-classes` in `widgetConfig` remains available for the default adapter and any adapter that chooses to support fine-grained slot overrides
- Widget fallback chain resolution (spec §4.3) happens in the **planner** (`formspec-layout/src/planner.ts:resolveWidget()`), before the adapter layer ever sees the component. The adapter receives the already-resolved component type. Per spec, "Fallback resolution does NOT carry widgetConfig forward" — this is naturally satisfied because the planner selects a different component type, and the cascade resolves widgetConfig for that type independently.

---

## What the adapter does NOT own

| Concern | Owner | Rationale |
|---|---|---|
| Value coercion (string → number, money objects) | Behavior hook (`bind()`) | Coupled to engine types, not DOM |
| Value sync event listeners (input, change) | Behavior hook (`bind()`) | Single owner avoids "two listeners" bugs |
| Signal subscriptions | Behavior hook (`bind()`) | Adapters must not depend on `@preact/signals-core` |
| ARIA state updates (aria-invalid, aria-required) | Behavior hook (`bind()`) | Driven by engine state |
| Theme cascade resolution | RenderContext (unchanged) | Adapter receives the resolved result |
| Token resolution (`$token.` → value) | Behavior hook (`resolveAndStripTokens`) | Adapter receives concrete values only |
| Widget fallback chain resolution | Layout planner (`formspec-layout`) | Happens at plan time, before rendering |
| Touch tracking | Behavior hook (`bind()`) | Engine-coupled state |
| Option change reactivity | Behavior hook (`bind()`) via `rebuildOptions` | Adapter provides rebuild callback; hook drives it |

## What the adapter DOES own

| Concern | Rationale |
|---|---|
| DOM element creation and hierarchy | The whole point — different design systems need different structures |
| Design-system CSS class names on elements | Design-system-specific |
| Cascade-resolved `cssClass` application (MUST) | Honoring the spec's union-merge guarantee |
| `labelPosition` structural interpretation (MUST) | Adapter decides top vs. inline vs. sr-only |
| Cascade `accessibility` attributes (MUST) | Static ARIA from theme cascade |
| Wrapper elements (relative containers, icon overlays) | Design-system structural patterns |
| Custom visual indicators (styled radio circles, toggle tracks) | Design-system components |
| `rebuildOptions` callback for async option changes | Adapter owns option DOM structure |

---

## Alternatives Considered

### A. Extended x-classes (more slots, no structural change)

Add more class injection points: `optionRoot`, `optionLabel`, `optionControl`, `wizardStep`, `wizardNav`, `repeatAdd`, `repeatRemove`, etc.

**Pros:** No code changes to plugins. Pure theme-side solution.
**Cons:** Cannot fix structural mismatches (sr-only peer pattern, wrapper elements, icon overlays). Grows the x-classes vocabulary unboundedly. Bridge CSS still required for every design system.

**Rejected because** it doesn't solve the core problem — DOM shape.

### B. Structural variants (named DOM modes per component)

Each component supports named variants: `RadioGroup` has `"mode": "native"` (current) and `"mode": "peer"` (sr-only pattern). Variants are declared in the theme.

**Pros:** Declarative, no JS code in themes.
**Cons:** Every new design system pattern requires a new hardcoded variant in the webcomponent. Combinatorial explosion as design systems diverge. Not extensible by third parties.

**Rejected because** it moves the problem from bridge CSS to hardcoded variant proliferation.

### C. JSON-declarative templates

Theme documents include a `componentTemplates` property that describes DOM structure in JSON (tag, classes, children, slots).

**Pros:** Fully declarative, no JS needed.
**Cons:** Reinvents a template language in JSON. Quickly becomes as complex as real code for anything beyond trivial components. Cannot express event wiring, conditional rendering, or dynamic content without escaping to a Turing-complete sublanguage.

**Rejected because** the inevitable complexity makes it worse than just writing code.

### D. Status quo (bridge CSS per design system)

Keep the current architecture. Author a bridge CSS file for each design system that approximates the visual result using CSS-only techniques.

**Pros:** Zero refactoring. Works today for simple cases.
**Cons:** Fragile, maintenance-heavy, incomplete (cannot fix structural mismatches), poor results for complex components (wizard steps, radio groups), must be maintained per design system.

**Acceptable as a short-term approach** but not a long-term architecture.

### E. Framework adapters (React, Vue, Svelte)

Not an alternative but a future extension: the headless behavior pattern could enable non-DOM adapters where React/Vue/Svelte components consume behavior contracts. This is noted as a potential benefit, not a current goal.

---

## Testing Strategy

### Behavior hooks (unit tests)

Behavior hooks depend on `RenderContext` and `FormEngine`. Test with a real engine instance loaded with a minimal definition. Verify:
- Returned contract has correct `fieldPath`, `id`, `label`, `hint`, `options()`
- `bind()` sets up correct reactive effects (mock DOM elements, verify signal-driven updates)
- Value coercion works for each data type
- Touched tracking fires correctly

### Adapters (integration tests)

Adapters need a behavior contract to render. Create test helpers that build a mock `FieldBehavior` with static values and a no-op `bind()`. Verify:
- Correct DOM structure produced
- Cascade `cssClass` applied to root element
- `labelPosition` variations produce correct structure
- `accessibility` attributes present
- `bind()` called with correct refs

### End-to-end (Playwright, existing suite)

The existing E2E test suite is the primary regression gate. After extracting each component:
- All existing tests MUST pass with zero changes
- This verifies the default adapter reproduces the current DOM exactly
- New E2E tests for the USWDS adapter verify the alternative DOM

### Per-component migration validation

Each component extraction follows: extract → test default adapter → verify E2E. No batch migrations. One component at a time.

---

## Out of Scope

- **Adapter composition** (layering two adapters, e.g., "USWDS layout + custom inputs") — single active adapter with fallback to default is sufficient for v1.
- **Layout component adapters** — layout containers don't have the behavior/structure coupling problem. Future ADR if needed.
- **Repeat group adapters** — repeat chrome in `emit-node.ts` is outside the per-component boundary. Future work if needed.

---

## Success Criteria

- [x] Behavior hooks exist for all 15 field component types (Group A + Group B)
- [x] Default adapter reproduces the current DOM output — all existing E2E tests pass with zero changes
- [x] At least one external adapter (USWDS) demonstrates a structurally different DOM
- [x] No adapter imports `@preact/signals-core`
- [x] Adapters honor cascade-resolved `cssClass` (verified by tests)
- [ ] Remote options work via `rebuildOptions` callback
- [x] `x-classes` still works with the default adapter (backwards compatible)
- [x] `field-input.ts` is deleted and replaced by focused, per-component files
- [x] USWDS adapter covers all 15 component types:
  - [x] TextInput (including textarea variant) — `usa-form-group` / `usa-input` / `usa-textarea`
  - [x] NumberInput — `usa-input` type=number
  - [x] RadioGroup — `usa-fieldset` / `usa-radio` / `usa-radio__input`
  - [x] CheckboxGroup (with selectAll) — `usa-fieldset` / `usa-checkbox`
  - [x] Select — `usa-select`
  - [x] DatePicker — `usa-input` type=date
  - [x] Checkbox — `usa-checkbox`
  - [x] Toggle — `usa-checkbox` (fallback — USWDS has no native toggle)
  - [x] MoneyInput — `usa-input-group` with `usa-input-prefix` for currency
  - [x] Slider — `usa-range`
  - [x] Rating — custom with `usa-form-group` + USWDS design tokens
  - [x] FileUpload — `usa-file-input` / `usa-file-input__target` with drag-drop
  - [x] Signature — canvas + `usa-button--outline` clear button
  - [x] Wizard — `usa-step-indicator` segments + `usa-button` nav
  - [x] Tabs — `usa-button-group--segmented` tab bar
- [ ] USWDS adapter remaining polish:
  - [ ] Error-class toggling (`usa-form-group--error`, `usa-input--error`) via MutationObserver or bind callback
  - [ ] Signature touch event support for mobile
  - [ ] Tests for all USWDS adapter components
- [ ] A reference form app renders correctly with the USWDS adapter

---

## References

- ADR 0045 — Rust Shared Kernel (Hybrid Strategy): establishes FormEngine stays in TypeScript, pure logic moves to Rust. Behavior hooks align with this boundary.
- USWDS v3 (`https://designsystem.digital.gov/`): U.S. Web Design System component markup patterns — the first external adapter target
- Zag.js (`https://zagjs.com/`): headless state machine library. Conceptual model for the behavior/adapter split.
- Formspec Theme Spec (§4, §5, §7): widget catalog, selector cascade, processing model — unchanged by this ADR
- `packages/formspec-webcomponent/src/behaviors/`: extracted behavior hooks (17 components)
- `packages/formspec-webcomponent/src/adapters/default/`: default adapter (reproduces original DOM)
- `packages/formspec-adapters/src/uswds/`: USWDS v3 adapter implementation
- `formspec-layout/src/planner.ts:resolveWidget()`: where widget fallback resolution actually happens
