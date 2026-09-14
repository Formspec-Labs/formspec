'use client';

/** @filedesc Default field dispatcher — layout chrome + per-component control routing. */
import React, { useMemo } from 'react';
import type { FieldComponentProps } from '../../component-map';
import { useFormspecContext, findItemByKey } from '../../context';
import type { ExtensionAttrs } from './field-control-types';
import { GroupControl } from './group-control';
import { renderControl, type InputAdornments } from './render-control';
import { needTraceAttrs, projectionMetadataAttrs } from '../../projection-metadata.js';
import { useSemanticFieldControl } from '../../use-semantic-field-control.js';

/** Definition item `prefix`/`suffix` (core §4.2.3) for the field at instance `path`. */
function itemAdornments(engine: ReturnType<typeof useFormspecContext>['engine'], path: string): InputAdornments {
    const item = findItemByKey(engine.getDefinition().items ?? [], path);
    return { prefix: item?.prefix, suffix: item?.suffix };
}

/**
 * Default field renderer — works for any field type.
 * Renders semantic HTML with ARIA attributes, theme-resolved classes,
 * onBlur touch behavior, and touch-gated error display.
 * Override per component type via the `components.fields` map.
 */
export function DefaultField({ field, node }: FieldComponentProps) {
    const isProtected = !field.visible && field.disabledDisplay === 'protected';
    const isReadonly = field.readonly || isProtected;
    useSemanticFieldControl(field, isReadonly);
    const showError = !!(field.error && field.touched);
    const themeClass = node.cssClasses?.join(' ') || '';
    const graphAttrs = projectionMetadataAttrs(node);

    const {
        engine,
        registryEntries,
        resolveFieldHelp,
        admitFieldHelpUri,
        fieldHelpLabel,
    } = useFormspecContext();
    const extensionAttrs = useMemo((): ExtensionAttrs => {
        const extensions = node.fieldItem?.extensions as Record<string, boolean> | undefined;
        if (!extensions || registryEntries.size === 0) return {};
        const attrs: ExtensionAttrs = {};
        for (const [extName, enabled] of Object.entries(extensions)) {
            if (!enabled) continue;
            const entry = registryEntries.get(extName);
            if (!entry) continue;
            if (entry.metadata?.inputMode) attrs.inputMode = entry.metadata.inputMode;
            if (entry.metadata?.autocomplete) attrs.autoComplete = entry.metadata.autocomplete;
            if (entry.constraints?.maxLength != null) attrs.maxLength = entry.constraints.maxLength;
            if (entry.constraints?.pattern) attrs.pattern = entry.constraints.pattern;
            if (entry.metadata?.placeholder) attrs.placeholder = entry.metadata.placeholder;
            if (entry.metadata?.inputType) attrs.type = entry.metadata.inputType;
        }
        return attrs;
    }, [node.fieldItem?.extensions, registryEntries]);
    const resolvePlaceholder = (componentPlaceholder?: string) =>
        extensionAttrs.placeholder || componentPlaceholder;

    const authoredNeedAnchors = node.needAnchors ?? [];
    const labelNeedAttrs = needTraceAttrs([
        ...authoredNeedAnchors,
        ...field.labelNeedAnchors,
    ]);
    const hintNeedAttrs = needTraceAttrs([
        ...authoredNeedAnchors,
        ...field.hintNeedAnchors,
    ]);
    const descriptionNeedAttrs = needTraceAttrs([
        ...authoredNeedAnchors,
        ...field.descriptionNeedAnchors,
    ]);
    const descId = `${field.id}-desc`;
    const descriptionNode = field.description ? (
        <div
            id={descId}
            className="formspec-description"
            {...descriptionNeedAttrs}
        >
            {field.description}
        </div>
    ) : null;
    const hintNode = field.hint ? (
        <p
            id={`${field.id}-hint`}
            className="formspec-hint"
            {...hintNeedAttrs}
        >
            {field.hint}
        </p>
    ) : null;
    const humanReferences = resolveFieldHelp?.(field.path) ?? [];
    const helpNeedAnchors = humanReferences.flatMap((reference) => reference.needAnchors);
    const helpNode = humanReferences.length > 0 ? (
        <details
            className="formspec-field-help"
            {...needTraceAttrs(helpNeedAnchors)}
        >
            <summary className="formspec-field-help-summary">{fieldHelpLabel}</summary>
            <div className="formspec-field-help-content">
                {humanReferences.map((reference, index) => {
                    const href = reference.uri
                        ? admitFieldHelpUri(reference.uri)
                        : undefined;
                    return (
                        <article
                            className="formspec-field-help-reference"
                            key={reference.id ?? `${reference.title}:${index}`}
                            {...needTraceAttrs(reference.needAnchors)}
                        >
                            <h4 className="formspec-field-help-title">
                                {href ? (
                                    <a href={href}>{reference.title}</a>
                                ) : reference.title}
                            </h4>
                            {reference.description ? <p>{reference.description}</p> : null}
                            {reference.content ? <p>{reference.content}</p> : null}
                        </article>
                    );
                })}
            </div>
        </details>
    ) : null;

    // Supplementary text ids, plus the error id while an error is shown (USWDS validation pattern:
    // the control's aria-describedby names its error message). Parity with webcomponent bindSharedFieldEffects.
    const errorId = `${field.id}-error`;
    const describedBy = [
        field.description ? descId : '',
        field.hint ? `${field.id}-hint` : '',
        showError ? errorId : '',
    ].filter(Boolean).join(' ') || undefined;
    const errorNode = (
        <p id={errorId} className="formspec-error" aria-live="polite">
            {showError ? field.error : ''}
        </p>
    );
    const requiredNode = field.required ? (
        <abbr className="formspec-required usa-label--required" title="required"> *</abbr>
    ) : null;

    if (node.component === 'Toggle') {
        const onLabel = node.props?.onLabel as string | undefined;
        const offLabel = node.props?.offLabel as string | undefined;
        const hasToggleLabels = onLabel || offLabel;

        const checkboxInput = (
            <input
                id={field.id}
                type="checkbox"
                className="formspec-input"
                role="switch"
                checked={!!field.value}
                onChange={isReadonly ? undefined : (e) => field.setValue(e.target.checked)}
                onBlur={() => field.touch()}
                disabled={isReadonly}
                aria-invalid={showError}
                aria-required={field.required || undefined}
                {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            />
        );

        return (
            <div
                className={`formspec-field formspec-field--inline formspec-field--toggle ${isProtected ? 'formspec-protected' : ''} ${themeClass}`.trim()}
                style={node.style as React.CSSProperties | undefined}
                data-name={field.path}
                {...graphAttrs}
            >
                <label
                    htmlFor={field.id}
                    className="formspec-label"
                    {...labelNeedAttrs}
                >
                    {field.label}
                    {requiredNode}
                </label>
                {descriptionNode}
                {hintNode}
                {helpNode}
                <div
                    className={`formspec-toggle${field.value ? ' formspec-toggle--on' : ''}`.trim()}
                >
                    {hasToggleLabels && (
                        <span className="formspec-toggle-label formspec-toggle-off" aria-hidden="true">
                            {offLabel}
                        </span>
                    )}
                    {checkboxInput}
                    {hasToggleLabels && (
                        <span className="formspec-toggle-label formspec-toggle-on" aria-hidden="true">
                            {onLabel}
                        </span>
                    )}
                </div>
                {errorNode}
            </div>
        );
    }

    if (node.component === 'RadioGroup' || node.component === 'CheckboxGroup') {
        const labelId = `${field.id}-label`;
        const labelHidden = node.labelPosition === 'hidden';
        // A checkbox `group` has no aria-required (WAI-ARIA 1.2): the legend says "required" in place of the asterisk.
        const legendRequiredNode = node.component === 'CheckboxGroup' && field.required ? (
            <>
                <abbr className="formspec-required usa-label--required" title="required" aria-hidden="true"> *</abbr>
                <span className="formspec-sr-only usa-sr-only"> required</span>
            </>
        ) : requiredNode;

        return (
            <fieldset
                className={[`formspec-fieldset`, isProtected ? 'formspec-protected' : '', themeClass].filter(Boolean).join(' ').trim()}
                style={node.style as React.CSSProperties | undefined}
                data-name={field.path}
                {...graphAttrs}
            >
                <legend
                    id={labelId}
                    className={labelHidden ? 'formspec-legend formspec-sr-only' : 'formspec-legend'}
                    {...labelNeedAttrs}
                >
                    {field.label}
                    {legendRequiredNode}
                </legend>
                {descriptionNode}
                {hintNode}
                {helpNode}
                <GroupControl
                    field={field}
                    node={node}
                    isReadonly={isReadonly}
                    invalid={showError}
                    labelId={labelId}
                    describedBy={describedBy}
                />
                {errorNode}
            </fieldset>
        );
    }

    const controlSurfaceClass =
        node.component === 'Slider' ? 'formspec-slider'
            : node.component === 'Rating' ? 'formspec-rating'
            : node.component === 'FileUpload' ? 'formspec-file-upload'
            : '';

    return (
        <div
            className={[`formspec-field`, isProtected ? 'formspec-protected' : '', themeClass, controlSurfaceClass].filter(Boolean).join(' ').trim()}
            style={node.style as React.CSSProperties | undefined}
            data-name={field.path}
            {...graphAttrs}
            {...(node.accessibility?.role ? { role: node.accessibility.role } : {})}
            {...(node.accessibility?.description ? { 'aria-description': node.accessibility.description } : {})}
        >
            <label
                htmlFor={field.id}
                className={node.labelPosition === 'hidden' ? 'formspec-label formspec-sr-only' : 'formspec-label'}
                {...labelNeedAttrs}
            >
                {field.label}
                {requiredNode}
            </label>

            {descriptionNode}
            {hintNode}
            {helpNode}

            {renderControl(field, node, describedBy, isProtected, extensionAttrs, resolvePlaceholder, itemAdornments(engine, field.path))}

            {errorNode}
        </div>
    );
}
