/** @filedesc ValidationSummary rows for the web component's adapters — the shared reader fed from this host's signals and DOM. */
import {
    readValidationSummaryRows as readRows,
    type ValidationSummaryComp,
    type ValidationSummaryRow,
    type ValidationSummarySource,
} from '@formspec-org/layout';
import type { ValidationResult } from '@formspec-org/types';
import type { DisplayHostSlice } from './display-host';
import { uiText } from './ui-text';

export type { ValidationSummaryRow } from '@formspec-org/layout';

/**
 * The rows a ValidationSummary shows now, reading the signals that change them — call it inside the render
 * effect. The selection, gating, wording and links are the shared reader's (`@formspec-org/layout`); this
 * host supplies the latest submit, the touch gate, the live report, each field's live label and control id,
 * and — the one thing only a renderer knows — whether a jump can land in its DOM.
 */
export function readValidationSummaryRows(
    host: DisplayHostSlice,
    comp: ValidationSummaryComp,
    showFieldErrorsByDefault: boolean,
): ValidationSummaryRow[] {
    const detail = host.latestSubmitDetailSignal.value;
    const touched = host.touchedVersion.value > 0;
    const submitted = (): ValidationResult[] | null => {
        if (detail === null) return null;
        const fromReport = detail.validationReport?.results;
        const fromResponse = detail.response?.validationResults;
        return Array.isArray(fromReport) ? fromReport : Array.isArray(fromResponse) ? fromResponse : [];
    };
    const source: ValidationSummarySource = {
        submitted: submitted(),
        touched,
        live: () => {
            host.engine.structureVersion.value;
            return host.engine.getValidationReport({ profile: 'live' }).results;
        },
        message: (result) => host.engine.resolveValidationMessage(result) ?? '',
        field: (path) => {
            const vm = host.engine.getFieldVM(path);
            return vm ? { label: vm.label.value, controlId: vm.id || null } : null;
        },
        jumpable: (path) => host.resolveValidationTarget(path).jumpable,
        chrome: (key, params) => uiText(host.engine, key, params).value,
    };
    return readRows(comp, source, { showFieldErrorsByDefault });
}
