'use client';

/** @filedesc Default field dispatcher — layout chrome + per-component control routing. */
import React, { useMemo } from 'react';
import type { FieldComponentProps } from '../../component-map';
import { useFormspecContext } from '../../context';
import type { ExtensionAttrs } from './field-control-types';
import { GroupControl } from './group-control';
import { renderControl } from './render-control';

/**
 * Default field renderer — works for any field type.
 * Renders semantic HTML with ARIA attributes, theme-resolved classes,
 * onBlur touch behavior, and touch-gated error display.
 * Override per component type via the `components.fields` map.
 */
export function DefaultField({ field, node }: FieldComponentProps) {
    const isProtected = !field.visible && field.disabledDisplay === 'protected';
    const isReadonly = field.readonly || isProtected;
    const showError = !!(field.error && field.touched);
    const themeClass = node.cssClasses?.join(' ') || '';

    const { registryEntries } = useFormspecContext();
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

    const descId = `${field.id}-desc`;
    const descriptionNode = field.description ? (
        <div id={descId} className="formspec-description">{field.description}</div>
    ) : null;
    const hintNode = field.hint ? <p id={`${field.id}-hint`} className="formspec-hint">{field.hint}</p> : null;

    const supplementaryDescribedBy =
        [field.description ? descId : '', field.hint ? `${field.id}-hint` : ''].filter(Boolean).join(' ') || undefined;
    const errorNode = (
        <p id={`${field.id}-error`} className="formspec-error" aria-live="polite">
            {showError ? field.error : ''}
        </p>
    );
    const requiredNode = field.required ? (
        <abbr className="formspec-required usa-label--required" title="required"> *</abbr>
    ) : null;

    if (node.component === 'Checkbox' || node.component === 'Toggle') {
        const isToggle = node.component === 'Toggle';
        const onLabel = node.props?.onLabel as string | undefined;
        const offLabel = node.props?.offLabel as string | undefined;
        const hasToggleLabels = isToggle && (onLabel || offLabel);

        const checkboxInput = (
            <input
                id={field.id}
                type="checkbox"
                className={isToggle ? 'formspec-input' : undefined}
                role={isToggle ? 'switch' : undefined}
                checked={!!field.value}
                onChange={isReadonly ? undefined : (e) => field.setValue(e.target.checked)}
                onBlur={() => field.touch()}
                disabled={isReadonly}
                aria-invalid={showError}
                aria-required={field.required || undefined}
                {...(supplementaryDescribedBy ? { 'aria-describedby': supplementaryDescribedBy } : {})}
            />
        );

        return (
            <div
                className={`formspec-field formspec-field--inline ${isProtected ? 'formspec-protected' : ''} ${themeClass}`.trim()}
                style={node.style as React.CSSProperties | undefined}
                data-name={field.path}
            >
                <label htmlFor={field.id} className="formspec-label">
                    {field.label}
                    {requiredNode}
                </label>
                {descriptionNode}
                {hintNode}
                {isToggle ? (
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
                ) : (
                    checkboxInput
                )}
                {errorNode}
            </div>
        );
    }

    if (node.component === 'RadioGroup' || node.component === 'CheckboxGroup') {
        const labelId = `${field.id}-label`;
        const labelHidden = node.labelPosition === 'hidden';
        const groupSupplementaryDescribedBy =
            [field.description ? descId : '', field.hint ? `${field.id}-hint` : ''].filter(Boolean).join(' ') || undefined;

        return (
            <fieldset
                className={[`formspec-fieldset`, isProtected ? 'formspec-protected' : '', themeClass].filter(Boolean).join(' ').trim()}
                style={node.style as React.CSSProperties | undefined}
                data-name={field.path}
            >
                <legend
                    id={labelId}
                    className={labelHidden ? 'formspec-legend formspec-sr-only' : 'formspec-legend'}
                >
                    {field.label}
                    {requiredNode}
                </legend>
                {descriptionNode}
                {hintNode}
                <GroupControl
                    field={field}
                    node={node}
                    isReadonly={isReadonly}
                    labelId={labelId}
                    groupSupplementaryDescribedBy={groupSupplementaryDescribedBy}
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
            {...(node.accessibility?.role ? { role: node.accessibility.role } : {})}
            {...(node.accessibility?.description ? { 'aria-description': node.accessibility.description } : {})}
        >
            <label
                htmlFor={field.id}
                className={node.labelPosition === 'hidden' ? 'formspec-label formspec-sr-only' : 'formspec-label'}
            >
                {field.label}
                {requiredNode}
            </label>

            {descriptionNode}
            {hintNode}

            {renderControl(field, node, supplementaryDescribedBy, isProtected, extensionAttrs, resolvePlaceholder)}

            {errorNode}
        </div>
    );
}
