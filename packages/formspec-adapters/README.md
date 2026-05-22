# formspec-adapters

Render adapter library for `formspec-webcomponent`. Each adapter provides design-system-specific DOM for Formspec form components while reusing the shared behavior hooks that handle all reactive state, value sync, ARIA management, and validation display.

## How Adapters Work

Formspec's webcomponent uses a headless behavior/adapter architecture ([ADR 0046](../../thoughts/archive/adr/0046-headless-component-adapters.md)):

```
behavior hook  →  FieldBehavior contract  ←  render adapter
     (signals, ARIA, values)          (DOM structure, CSS classes)
```

A **behavior hook** extracts reactive state from the engine and returns a typed contract with a `bind(refs)` function. A **render adapter** builds DOM, then calls `bind()` with element references. The behavior wires all event listeners, signal effects, and ARIA updates onto those elements.

The default adapter (built into `formspec-webcomponent`) reproduces Formspec's standard DOM. Adapters in this package provide alternative DOM structures for specific design systems.

## Install

```bash
npm install formspec-adapters
```

Peer dependency: `formspec-webcomponent`.

## Usage

```js
import { globalRegistry } from 'formspec-webcomponent';
import { exampleAdapter } from 'formspec-adapters';

globalRegistry.registerAdapter(exampleAdapter);
globalRegistry.setAdapter('example');
```

Per-form override:

```js
const el = document.querySelector('formspec-render');
el.adapter = 'example';
```

## Writing an Adapter

An adapter is a `RenderAdapter` object mapping component type strings to render functions:

```ts
import type { RenderAdapter, AdapterRenderFn, TextInputBehavior } from 'formspec-webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from 'formspec-adapters/helpers';

const renderTextInput: AdapterRenderFn<TextInputBehavior> = (behavior, parent, actx) => {
    const p = behavior.presentation;

    // 1. Build your DOM structure
    const root = el('div', { class: 'my-field', 'data-name': behavior.fieldPath });
    applyCascadeClasses(root, p);         // MUST: honor theme cssClass
    applyCascadeAccessibility(root, p);   // MUST: honor theme accessibility

    const label = el('label', { for: behavior.id });
    label.textContent = behavior.label;
    if (p.labelPosition === 'hidden') label.classList.add('sr-only');
    root.appendChild(label);

    const input = el('input', {
        id: behavior.id,
        type: 'text',
        name: behavior.fieldPath,
        class: 'my-input',
    });
    root.appendChild(input);

    const error = el('div', { role: 'alert', 'aria-live': 'polite' });
    root.appendChild(error);

    parent.appendChild(root);

    // 2. bind() wires ALL reactive behavior — do NOT register your own event listeners
    const dispose = behavior.bind({ root, label, control: input, error });
    actx.onDispose(dispose);
};

export const myAdapter: RenderAdapter = {
    name: 'my-design-system',
    components: {
        TextInput: renderTextInput,
        // Missing entries fall back to the default adapter.
    },
};
```

### Adapter Contract

**Must:**

| Obligation | Reason |
|---|---|
| Apply `behavior.presentation.cssClass` to root element | Theme spec guarantees union-merge across cascade levels |
| Respect `behavior.presentation.labelPosition` (`top` / `start` / `hidden`) | Semantic property from theme cascade |
| Apply `behavior.presentation.accessibility` attributes | Spec requires themes not reduce accessibility |
| Call `behavior.bind(refs)` after building DOM | Wires all reactive effects |
| Register dispose via `actx.onDispose(dispose)` | Cleanup on re-render |

**Should:**

| Obligation | Reason |
|---|---|
| Apply `behavior.presentation.style` as inline styles | Low specificity, easily overridden. Adapters using utility classes may skip. |
| Read `behavior.presentation.widgetConfig` for semantic config | `{ searchable: true }`, `{ direction: 'horizontal' }`, `{ rows: 5 }`, etc. |

**Must not:**

| Rule | Reason |
|---|---|
| Import `@preact/signals-core` | Adapters are pure DOM — no signal dependency |
| Register event listeners for value sync, change, or touch | `bind()` owns all event wiring |
| Access `formspec-engine` directly | All engine interaction goes through the behavior contract |

### FieldRefs

The `refs` object passed to `bind()` tells the behavior where to attach effects:

| Ref | Purpose |
|---|---|
| `root` | Outermost wrapper — receives relevance show/hide and readonly class |
| `label` | Label element — receives required indicator updates |
| `control` | Primary input control — receives aria-invalid, aria-required; `bind()` finds the deepest `<input>`/`<select>`/`<textarea>` inside for value sync |
| `hint` | *(optional)* Hint text element |
| `error` | *(optional)* Error display — receives validation message text |
| `optionControls` | *(choice fields)* Map of option value → `<input>` element for radio/checkbox groups |
| `rebuildOptions` | *(optional)* Callback for async option changes |

### Component-Specific Behaviors

Each component type has a typed behavior interface that extends `FieldBehavior` with component-specific properties:

| Behavior | Key Properties |
|---|---|
| `TextInputBehavior` | `placeholder`, `maxLines`, `prefix`, `suffix`, `resolvedInputType`, `extensionAttrs` |
| `NumberInputBehavior` | `min`, `max`, `step`, `dataType` |
| `RadioGroupBehavior` | `groupRole`, `inputName`, `orientation`, `options()` |
| `CheckboxGroupBehavior` | `groupRole`, `selectAll`, `columns`, `options()`, `setValue()` |
| `SelectBehavior` | `placeholder`, `clearable`, `dataType`, `options()` |
| `ToggleBehavior` | `onLabel`, `offLabel` |
| `DatePickerBehavior` | `inputType`, `minDate`, `maxDate` |
| `MoneyInputBehavior` | `min`, `max`, `step`, `placeholder`, `resolvedCurrency` |
| `SliderBehavior` | `min`, `max`, `step`, `showTicks`, `showValue` |
| `RatingBehavior` | `maxRating`, `icon`, `allowHalf`, `isInteger`, `setValue()` |
| `FileUploadBehavior` | `accept`, `multiple`, `dragDrop` |
| `SignatureBehavior` | `height`, `strokeColor` |
| `WizardBehavior` | `steps`, `activeStep()`, `goNext()`, `goPrev()`, `renderStep()` |
| `TabsBehavior` | `tabLabels`, `position`, `activeTab()`, `setActiveTab()`, `renderTab()` |

## Helpers

```ts
import { el, applyCascadeClasses, applyCascadeAccessibility } from 'formspec-adapters/helpers';
```

| Helper | Purpose |
|---|---|
| `el(tag, attrs?)` | Create an element with attributes in one call |
| `applyCascadeClasses(root, presentation)` | Apply theme-resolved cssClass with union-merge semantics |
| `applyCascadeAccessibility(root, presentation)` | Apply theme-resolved role, aria-description, aria-live |

## Integrating CSS Frameworks

Adapters are the integration point between Formspec and CSS frameworks like Tailwind, Bootstrap, or any utility-class / component-class system. The adapter owns the DOM — it decides what classes go on which elements.

### Tailwind CSS

Tailwind adapters emit utility classes directly in the markup. No bridge CSS or runtime class injection needed — the adapter IS the bridge.

```ts
import type { AdapterRenderFn, TextInputBehavior } from 'formspec-webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from 'formspec-adapters/helpers';

const renderTextInput: AdapterRenderFn<TextInputBehavior> = (behavior, parent, actx) => {
    const p = behavior.presentation;

    const root = el('div', { class: 'max-w-md', 'data-name': behavior.fieldPath });
    applyCascadeClasses(root, p);
    applyCascadeAccessibility(root, p);

    // Label — Tailwind typography utilities
    const labelClasses = p.labelPosition === 'hidden'
        ? 'sr-only'
        : 'block text-sm font-medium text-gray-700';
    const label = el('label', { class: labelClasses, for: behavior.id });
    label.textContent = behavior.label;

    // Inline layout for 'start' labelPosition
    if (p.labelPosition === 'start') root.classList.add('flex', 'items-center', 'gap-3');

    root.appendChild(label);

    // Hint
    let hint: HTMLElement | undefined;
    if (behavior.hint) {
        hint = el('div', { class: 'mt-1 text-sm text-gray-500' });
        hint.textContent = behavior.hint;
        root.appendChild(hint);
    }

    // Input — Tailwind form utilities
    const input = el('input', {
        id: behavior.id,
        type: behavior.resolvedInputType || 'text',
        name: behavior.fieldPath,
        class: 'mt-1 block w-full rounded-md border-gray-300 shadow-sm ' +
               'focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm',
    });
    if (behavior.placeholder) input.setAttribute('placeholder', behavior.placeholder);
    root.appendChild(input);

    // Error — Tailwind color utilities
    const error = el('div', {
        class: 'mt-1 text-sm text-red-600',
        role: 'alert',
        'aria-live': 'polite',
    });
    root.appendChild(error);

    parent.appendChild(root);

    const dispose = behavior.bind({ root, label, control: input, hint, error });
    actx.onDispose(dispose);
};
```

**Tailwind integration notes:**

- **`integrationCSS` is omitted** — nothing is injected into `<head>`. Styling is only utility classes on the emitted DOM, compiled by your Tailwind/Vite (or CDN) pipeline. In Tailwind v4, add `@source` for `packages/formspec-adapters/src/tailwind/**/*.ts` so class names are discovered.

- **Core plugin styling** — `Card`, `ActionButton`, and `ValidationSummary` are not adapter-rendered; they still use `formspec-*` class hooks. Import **`formspec-adapters/tailwind-formspec-core.css`** for light-theme defaults (teal accent, white cards, validation summary). Rules are in **`@layer components`** so Tailwind **utilities** on those nodes (e.g. `cssClass` on `ActionButton`) override the defaults. Override `--formspec-tw-*` on `:root` for token tweaks without utilities.

**Customization:**

- The adapter is intentionally **neutral**. Colors are kept minimal in `TW` constants. Override via:
  - `cssClass` in your theme (union-merge supported)
  - CSS custom properties (`--accent-color`, `--error-color`)
  - `tailwind-merge` (recommended — see below)
- `behavior.presentation.style` can be used for inline styles if needed.
- `widgetConfig` can drive structural choices.

**tailwind-merge support:**
The adapter works well with `tailwind-merge`. Call `setTailwindMerge(twMerge)` from `formspec-layout` in your app to automatically resolve conflicting utilities from the theme cascade.

See ADR 0049 for details on `cssClassReplace` and `classStrategy: "tailwind-merge"`.

**Current design:**
Field widgets use subtle zinc / `currentColor` in `TW` constants. Shared defaults for `Card`, submit, and validation summary live in `src/tailwind/tailwind-formspec-core.css` (package export `formspec-adapters/tailwind-formspec-core.css`).

### Tailwind + `peer` Pattern (Radio Buttons)

Design systems like USWDS Tailwind v2 use `<input class="sr-only peer">` with styled sibling elements and `peer-checked:` variants — a fundamentally different DOM structure from native radio buttons. This is the exact problem adapters solve.

```ts
const renderRadioGroup: AdapterRenderFn<RadioGroupBehavior> = (behavior, parent, actx) => {
    const p = behavior.presentation;
    const fieldset = el('fieldset', { class: 'space-y-2', role: behavior.groupRole });
    applyCascadeClasses(fieldset, p);

    const legend = el('legend', { class: 'text-sm font-bold mb-2' });
    legend.textContent = behavior.label;
    fieldset.appendChild(legend);

    const optionControls = new Map<string, HTMLInputElement>();
    const optionContainer = el('div', { class: 'space-y-2' });

    for (const opt of behavior.options()) {
        const optLabel = el('label', { class: 'flex items-center gap-3 cursor-pointer relative' });

        // sr-only peer pattern — the input is invisible, siblings react to its state
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.className = 'sr-only peer';
        radio.name = behavior.inputName;
        radio.value = opt.value;
        optionControls.set(opt.value, radio);
        // NOTE: no change listener — bind() owns all event wiring

        // Styled indicator — uses peer-checked: variants
        const indicator = el('div', {
            class: 'flex items-center justify-center size-5 rounded-full ' +
                   'ring-2 ring-offset-0 ring-gray-400 ' +
                   'peer-checked:ring-indigo-600 ' +
                   'peer-checked:before:block peer-checked:before:size-2.5 ' +
                   'peer-checked:before:rounded-full peer-checked:before:bg-indigo-600 ' +
                   'peer-focus:outline-2 peer-focus:outline-indigo-500',
        });

        const text = el('div', { class: 'text-sm text-gray-900' });
        text.textContent = opt.label;

        optLabel.append(radio, indicator, text);
        optionContainer.appendChild(optLabel);
    }

    fieldset.appendChild(optionContainer);

    const error = el('div', {
        class: 'mt-1 text-sm text-red-600',
        role: 'alert',
        'aria-live': 'polite',
    });
    fieldset.appendChild(error);

    parent.appendChild(fieldset);

    const dispose = behavior.bind({
        root: fieldset,
        label: legend,
        control: fieldset,
        error,
        optionControls,
    });
    actx.onDispose(dispose);
};
```

No bridge CSS. No `x-classes` workarounds. The adapter owns the DOM structure, and `bind()` wires checked state, validation, and ARIA onto whatever elements the adapter creates.

### Bootstrap

Bootstrap adapters use component classes (`form-control`, `form-label`, `form-select`, etc.):

```ts
const renderTextInput: AdapterRenderFn<TextInputBehavior> = (behavior, parent, actx) => {
    const p = behavior.presentation;

    const root = el('div', { class: 'mb-3' });
    applyCascadeClasses(root, p);
    applyCascadeAccessibility(root, p);

    const label = el('label', { class: 'form-label', for: behavior.id });
    label.textContent = behavior.label;
    if (p.labelPosition === 'hidden') label.classList.add('visually-hidden');
    root.appendChild(label);

    const input = el('input', {
        id: behavior.id,
        type: behavior.resolvedInputType || 'text',
        name: behavior.fieldPath,
        class: 'form-control',
    });
    if (behavior.placeholder) input.setAttribute('placeholder', behavior.placeholder);
    root.appendChild(input);

    const error = el('div', { class: 'invalid-feedback', role: 'alert', 'aria-live': 'polite' });
    root.appendChild(error);

    parent.appendChild(root);

    const dispose = behavior.bind({ root, label, control: input, error });
    actx.onDispose(dispose);
};
```

**Bootstrap integration notes:**

- Bootstrap's `is-invalid` class on the input drives `invalid-feedback` visibility. You can watch `error.textContent` via a MutationObserver to toggle `is-invalid` on the input, or use CSS `:has()` if browser support allows.
- `form-floating` labels (Bootstrap 5) require the `<input>` before the `<label>` — just reorder in the adapter.
- `input-group` with prepend/append maps naturally to `TextInputBehavior.prefix` / `suffix`.

### Headless / Unstyled

For fully custom designs with no framework, adapters are just vanilla DOM:

```ts
const renderTextInput: AdapterRenderFn<TextInputBehavior> = (behavior, parent, actx) => {
    const root = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = behavior.label;
    label.htmlFor = behavior.id;
    const input = document.createElement('input');
    input.id = behavior.id;
    const error = document.createElement('div');
    root.append(label, input, error);
    parent.appendChild(root);

    actx.onDispose(behavior.bind({ root, label, control: input, error }));
};
```

Bring your own CSS. The behavior hook handles everything else.

### Shared Patterns Across Frameworks

Regardless of framework, every adapter follows the same flow:

1. Read `behavior.presentation` for theme-cascade decisions (label position, accessibility, classes)
2. Build DOM with your framework's class vocabulary
3. Call `behavior.bind(refs)` — the behavior figures out the rest
4. Register dispose via `actx.onDispose()`

The adapter never needs to know about signals, the engine, validation rules, or FEL expressions. It just builds markup.

## Package Structure

```
src/
  index.ts          — barrel export for all adapters
  helpers.ts        — shared utilities (el, applyCascadeClasses, applyCascadeAccessibility)
  <adapter-name>/   — one directory per design-system adapter
    index.ts        — exports the RenderAdapter object
    text-input.ts   — per-component render functions
    radio-group.ts
    ...
```

## Development

```bash
npm run build          # tsc
npm run test           # vitest (happy-dom)
npm run test:watch     # vitest watch mode
```
