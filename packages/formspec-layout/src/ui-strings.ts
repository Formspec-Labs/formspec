/** @filedesc Closed renderer-chrome string inventory (Locale spec §3.1.10 `$ui.<ChromeStringKey>`) and its `{{$param}}` filler. */

/**
 * English default for every closed `$ui.<ChromeStringKey>` suffix (Locale spec §3.1.10). One entry per
 * key the schema's `ChromeStringKey` enum admits — kept one-for-one by
 * `packages/formspec-layout/tests/ui-strings.test.ts`, which reads `schemas/locale.schema.json` directly.
 * A template's `{{$name}}` placeholders are renderer-supplied literal parameters (label, index, total,
 * count, max, status, reason, message) filled by {@link fillUiParams} — never FEL, never the form scope.
 */
export const UI_STRINGS = {
    'select.placeholder': 'Select…',
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
    'dataTable.addRow': 'Add Row',
    'dataTable.remove': 'Remove',
    'dataTable.removeRow': 'Remove row {{$index}}',
    'dataTable.actions': 'Actions',
    'wizard.stepTitle': 'Step {{$index}}',
    'wizard.stepStatus': 'Step {{$index}} of {{$total}}: {{$title}}',
    'wizard.finalStepStatus': 'Step {{$index}} of {{$total}}: {{$title}} — final step',
    'wizard.stepAnnouncement': '{{$title}}. Step {{$index}} of {{$total}}.',
    'wizard.finalStepAnnouncement': '{{$title}}. Next will submit the form.',
    'wizard.expandNavigation': 'Expand navigation',
    'select.loadingOptions': 'Loading options...',
    'select.remoteFallback': 'Remote options unavailable; using fallback options.',
    'select.remoteFailed': 'Failed to load options.',
    'modal.open': 'Open',
    'fileUpload.dropzone': 'Drop files here or click to browse',
    'fileUpload.dropzoneKeyboard': 'Drop files here or press Enter to browse',
    'fileUpload.browse': 'Upload a file',
    'validationSummary.fixOne': 'Please fix this error before continuing:',
    'validationSummary.fixMany': 'Please fix these {{$count}} errors before continuing:',
    'validationSummary.reviewOne': 'Please review this warning before continuing:',
    'validationSummary.reviewMany': 'Please review these {{$count}} warnings before continuing:',
    'validationSummary.review': 'Please review the following before continuing:',
    'validationSummary.errorCountOne': 'There is 1 error on this form.',
    'validationSummary.errorCount': 'There are {{$count}} errors on this form.',
    'validationSummary.issueCountOne': 'There is 1 issue to review on this form.',
    'validationSummary.issueCount': 'There are {{$count}} issues to review on this form.',
    'validationSummary.row': '{{$label}}: {{$message}}',
    'action.submit': 'Submit',
    'action.inProgress': 'In progress.',
    'action.completed': 'Completed',
    'action.blocked': 'Blocked',
    'action.failed': 'Failed',
    'action.deferred': 'Deferred',
    'action.unresolved': 'Unresolved',
    'action.status': '{{$status}}.',
    'action.statusReason': '{{$status}}: {{$reason}}',
    'screener.submit': 'Check Eligibility',
    'screener.answerOne': 'Please answer at least one question',
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
