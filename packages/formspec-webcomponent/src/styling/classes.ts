/** @filedesc CSS class application and widget class-slot resolution from theme config. */
import type { PresentationBlock } from '@formspec-org/layout';
import type { StylingHost } from './index';
import { resolveToken } from './tokens';

import type { ComponentPresentationSource } from '../hub-types.js';

/** (adapter name, class) pairs already warned about — process-wide, so a class warns once, not once per render. */
const warnedUnknownClasses = new Set<string>();

/**
 * Theme spec escape-hatch ladder (§2.4): `cssClass` is only meaningful in the vocabulary of the adapter
 * the Theme names. An adapter that declares no vocabulary (the default adapter today) gets no check —
 * everything past this is silent for every existing Theme until an adapter opts in.
 */
function warnIfUnknownClass(adapterName: string, cls: string, vocabulary: ReadonlySet<string> | undefined): void {
    if (!vocabulary || vocabulary.has(cls)) return;
    const key = `${adapterName}::${cls}`;
    if (warnedUnknownClasses.has(key)) return;
    warnedUnknownClasses.add(key);
    console.warn(
        `Theme cssClass '${cls}' is not in the '${adapterName}' adapter's class vocabulary — ` +
            `it will render as a literal class with no guaranteed styling.`,
    );
}

export function applyCssClass(host: StylingHost, el: HTMLElement, comp: ComponentPresentationSource): void {
    if (!comp.cssClass) return;
    const vocabulary = host.adapterClassVocabulary();
    const classes = Array.isArray(comp.cssClass) ? comp.cssClass : [comp.cssClass];
    for (const cls of classes) {
        const resolved = String(resolveToken(host, cls));
        for (const c of resolved.split(/\s+/)) {
            if (!c) continue;
            el.classList.add(c);
            warnIfUnknownClass(host.resolvedAdapterName, c, vocabulary);
        }
    }
}

export function applyClassValue(host: StylingHost, el: HTMLElement, classValue: unknown): void {
    if (classValue === undefined || classValue === null) return;
    const values = Array.isArray(classValue) ? classValue : [classValue];
    for (const cls of values) {
        const resolved = String(resolveToken(host, cls));
        for (const c of resolved.split(/\s+/)) {
            if (c) el.classList.add(c);
        }
    }
}

export function resolveWidgetClassSlots(_host: StylingHost, presentation: PresentationBlock): {
    root?: unknown;
    label?: unknown;
    control?: unknown;
    hint?: unknown;
    error?: unknown;
} {
    const widgetConfig = presentation.widgetConfig;
    if (!widgetConfig || typeof widgetConfig !== 'object') return {};

    const config = widgetConfig as Record<string, unknown>;
    const extensionSlots = (
        config['x-classes'] &&
        typeof config['x-classes'] === 'object' &&
        !Array.isArray(config['x-classes'])
    )
        ? config['x-classes'] as Record<string, unknown>
        : {};

    return {
        root: config.rootClass ?? extensionSlots.root,
        label: config.labelClass ?? extensionSlots.label,
        control: config.controlClass ?? config.inputClass ?? extensionSlots.control ?? extensionSlots.input,
        hint: config.hintClass ?? extensionSlots.hint,
        error: config.errorClass ?? extensionSlots.error,
    };
}
