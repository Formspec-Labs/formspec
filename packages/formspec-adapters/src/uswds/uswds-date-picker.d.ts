// No upstream `.d.ts` for USWDS's own per-component JS, and `@uswds/uswds` is an optional peer dependency
// (see package.json) — a real declaration would describe an install that may not exist. Shape matches the
// `behavior()` object `usa-date-picker/src/index.js` exports: `on`/`off` (init+add / teardown+remove,
// uswds-core/src/js/utils/behavior.js), `init` alone (enhance only, no listeners), `setCalendarValue`.
//
// This file has no top-level import/export outside the `declare module` block, so TypeScript treats it as
// a global script and this becomes a fresh ambient module declaration rather than an augmentation of an
// (unresolvable) real one — see date-picker.ts for the one file that imports it.
declare module '@uswds/uswds/js/usa-date-picker' {
    export interface USWDSDatePicker {
        on(root: ParentNode): void;
        off(root: ParentNode): void;
        init(root: ParentNode): void;
        setCalendarValue(el: Element, dateString: string): void;
    }
    const datePicker: USWDSDatePicker;
    export default datePicker;
}
