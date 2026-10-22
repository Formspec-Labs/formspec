/** @filedesc The host page contract shared by the browser entry and the Node page builder: the documents a page is built from and the ids and attributes it uses. No DOM, no Node. */
import type { LocaleDocument } from '@formspec-org/engine/render';
import type { ComponentDocument, FormDefinition } from '@formspec-org/types';
import type { ThemeDocument } from '@formspec-org/layout';
import type { FormDataRecord } from './hub-types';

/** The receipt page printed after the form (ADR 0166 §2): what was accepted, and how to check this document. */
export interface HostReceipt {
    heading: string;
    /** Label and value pairs, shown as a definition list. */
    facts: Array<{ label: string; value: string }>;
    /** Plain-language instructions for checking the printed document. */
    verify: string;
}

/** The pinned documents a page is built from (ADR 0166 §1). Nothing else shapes the render. */
export interface HostDocuments {
    definition: FormDefinition;
    component?: ComponentDocument | null;
    theme?: ThemeDocument | null;
    /** Every pinned Locale; `locale` picks the active one. */
    locales?: LocaleDocument[];
    /** The Locale code to show; the Definition's own wording when absent. */
    locale?: string;
    /** A Response's `data` to show filled in. */
    initialData?: FormDataRecord | null;
    /**
     * Print mode: every page of the form shown at once, controls read-only, navigation hidden, and the
     * `receipt` page after the form. The page Gotenberg turns into the receipt PDF.
     */
    readOnly?: boolean;
    receipt?: HostReceipt | null;
}

/** Ids of the two inline `<script>` blocks the page builder writes and {@link bootHost} reads. */
export const HOST_CONFIG_ID = 'formspec-host-config';
export const HOST_WASM_ID = 'formspec-host-wasm';

/** Set on `<html>` once the form is drawn (`ready`) or could not be (`error`). */
export const HOST_STATE_ATTRIBUTE = 'data-formspec-host';
