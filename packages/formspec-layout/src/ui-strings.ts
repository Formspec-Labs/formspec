/** @filedesc Closed renderer-chrome string inventory (Locale spec §3.1.10 `$ui.<ChromeStringKey>`) and its `{{$param}}` filler. */

/**
 * English default for every closed `$ui.<ChromeStringKey>` suffix (Locale spec §3.1.10). One entry per
 * key the schema's `ChromeStringKey` enum admits — kept one-for-one by
 * `packages/formspec-layout/tests/ui-strings.test.ts`, which reads `schemas/locale.schema.json` directly.
 * A template's `{{$name}}` placeholders are renderer-supplied literal parameters (label, index, total,
 * count, max) filled by {@link fillUiParams} — never FEL, never the form scope.
 */
export const UI_STRINGS = {
    'select.placeholder': 'Select…',
    'select.clear': 'Clear',
    'select.clearSelection': 'Clear selection',
    'select.selectedValues': 'Selected values',
    'select.selectAll': 'Select All',
    'repeat.add': 'Add {{$label}}',
    'repeat.remove': 'Remove {{$label}}',
    'repeat.row': '{{$label}} {{$index}}',
    'repeat.rowOf': '{{$label}} {{$index}} of {{$total}}',
    'repeat.rowNamed': '{{$label}} of {{$total}}',
    'wizard.next': 'Next',
    'wizard.nextStep': 'Next step',
    'wizard.previous': 'Previous',
    'wizard.previousStep': 'Previous step',
    'wizard.skip': 'Skip',
    'wizard.skipStep': 'Skip this step',
    'wizard.submit': 'Submit',
    'wizard.submitForm': 'Submit form',
    'wizard.steps': 'Form steps',
    'wizard.progress': 'Form progress',
    'wizard.step': 'Step',
    'wizard.collapseNavigation': 'Collapse navigation',
    'modal.close': 'Close',
    'alert.dismiss': 'Dismiss',
    'validationSummary.heading': 'Please correct the following',
    'date.format': 'MM/DD/YYYY',
    'characterCount.limit': 'You can enter up to {{$max}} characters',
    'characterCount.allowed': '{{$max}} characters allowed',
    'characterCount.left': '{{$count}} characters left',
    'characterCount.leftOne': '1 character left',
    'characterCount.over': '{{$count}} characters over limit',
    'characterCount.overOne': '1 character over limit',
    'signature.clear': 'Clear',
    'signature.canvas': 'Signature canvas. Use the Clear button to reset.',
    'money.amount': 'Amount',
    'money.currency': 'Currency code',
    'fieldHelp.label': 'Help me answer this question',
    'screener.continue': 'Continue',
    'screener.required': 'Required',
    'screener.back': 'Back to screening',
} as const;

/** Closed suffix set for `$ui.<ChromeStringKey>` (Locale spec §3.1.10), one-for-one with the schema enum. */
export type ChromeStringKey = keyof typeof UI_STRINGS;

/**
 * Substitute `{{$name}}` in `template` with `params[name]`, literally — no FEL, no expression evaluation.
 * A placeholder with no matching param is left as-is, so a caller can partially fill a template.
 */
export function fillUiParams(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/\{\{\$(\w+)\}\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
}
