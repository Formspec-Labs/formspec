# Refactoring Plan: USWDS Adapters & Webcomponent Core Parity

## Phase 1: ARIA DescribedBy Management (Move to Core)
**Goal:** Eliminate boilerplate `aria-describedby` concatenation across all 26 input adapters.
- [ ] Modify `bindSharedFieldEffects` in `packages/formspec-webcomponent/src/behaviors/shared.ts`.
- [ ] Automatically calculate and set `aria-describedby` on the `actualInput` using `refs.hint?.id`, `refs.error?.id`, and any existing IDs already on the element.
- [ ] Remove manual `describedBy` string building from both the default adapter's `createFieldDOM` and the USWDS adapter's `createUSWDSFieldDOM`.
- [ ] Remove `setAttribute('aria-describedby', ...)` from all individual `default` and `uswds` component adapters.

## Phase 2: Semantic Field Wrappers (Fieldset vs. Div) (Move to Core & USWDS)
**Goal:** Ensure multi-input controls natively use `<fieldset>` and `<legend>` via the shared DOM builders instead of requiring adapters to "fork" the wrapper logic.
- [ ] Update `FieldDOMOptions` in `packages/formspec-webcomponent/src/adapters/default/shared.ts` to accept `asGroup?: boolean`.
- [ ] When `asGroup` is true, make `createFieldDOM` return a `<fieldset>` for the root and a `<legend>` for the label.
- [ ] Apply the same `asGroup` enhancement to `createUSWDSFieldDOM` in `packages/formspec-adapters/src/uswds/shared.ts`.
- [ ] Refactor `radio-group.ts` and `checkbox-group.ts` (in both default and USWDS) to use this updated DOM builder.

## Phase 3: Reactive Behavior Callbacks for Layouts (Move to Core)
**Goal:** Remove fragile `MutationObserver` usage in the USWDS adapter by providing explicit reactive callbacks from the core behavior hooks.
- [ ] Update `WizardRefs` in `packages/formspec-webcomponent/src/behaviors/types.ts` to include an optional `onStepChange?: (stepIndex: number, totalSteps: number) => void`.
- [ ] Invoke `refs.onStepChange` inside the reactive `effect()` in `useWizard`.
- [ ] Refactor `packages/formspec-adapters/src/uswds/wizard.ts` to use `onStepChange` instead of a `MutationObserver` on the panels.
- [ ] Update `TabsRefs` to include an optional `onTabChange?: (tabIndex: number) => void`.
- [ ] Invoke `refs.onTabChange` inside the reactive `effect()` in `useTabs`.
- [ ] Refactor `packages/formspec-adapters/src/uswds/tabs.ts` to use `onTabChange` instead of a `MutationObserver`.

## Phase 4: Shared Formatting Utilities (Move to Core)
**Goal:** DRY up formatting functions duplicated across the project.
- [ ] Move `formatBytes` out of `packages/formspec-webcomponent/src/behaviors/file-upload.ts` and into `packages/formspec-webcomponent/src/format.ts`.
- [ ] Export `formatBytes` from `src/index.ts`.
- [ ] Update the default `file-upload.ts` adapter to import and use the shared `formatBytes`.

## Phase 5: USWDS Adapter DRY & Cleanups (USWDS Specific)
**Goal:** Resolve specific tech debt identified within the `uswds` adapter package.
- [ ] **Option Rendering Utility:** Create a shared `buildUSWDSOptions` helper in `uswds/shared.ts` to handle the loop for creating `input` and `label` pairs for both `radio-group.ts` and `checkbox-group.ts`, removing the duplicate `buildCheckboxOptions` / `buildRadioOptions` logic.
- [ ] **Checkbox & Toggle Consolidation:** Review `checkbox.ts` and `toggle.ts` in the USWDS adapter. Extract the overlapping markup generation into a shared `renderUSWDSBooleanControl` helper.
- [ ] **Asset Portability:** Update `packages/formspec-adapters/src/uswds/layout/modal.ts` to replace the hardcoded `/assets/img/sprite.svg#close` path with a CSS-driven pseudo-element (like the official USWDS implementation uses) or rely on a customizable `AdapterContext` setting.
- [ ] **Validation State:** Standardize on using `applyUSWDSValidationState` across all USWDS adapters. Update `slider.ts`, `rating.ts`, and `signature.ts` to use this helper instead of manually toggling the `usa-form-group--error` class.