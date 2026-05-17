/** @filedesc Standard (non-group) field control switch — dispatches by component type. */
'use client';
import React from 'react';
import type { FieldComponentProps } from '../../component-map';
import type { ExtensionAttrs } from './field-control-types';
import { ComboboxSelect } from './controls/combobox-select';
import { MoneyInputControl } from './controls/money-input';
import { SliderControl } from './controls/slider';
import { RatingControl } from './controls/rating';
import { SignatureControl } from './controls/signature';
import { FileUploadControl } from './controls/file-upload';

export function renderControl(
    field: FieldComponentProps['field'],
    node: FieldComponentProps['node'],
    describedBy: string | undefined,
    isProtected = false,
    extensionAttrs: ExtensionAttrs = {},
    resolvePlaceholder: (componentPlaceholder?: string) => string | undefined = (value) => value,
) {
    const { dataType, id, path, value } = field;
    const isReadonly = field.readonly || isProtected;
    const showError = !!(field.error && field.touched);
    const autoComplete = (node.props?.autoComplete as string) || undefined;
    const common = {
        id,
        name: path,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        'aria-invalid': showError,
        'aria-required': field.required,
        required: field.required,
        'aria-disabled': isProtected || undefined,
        onBlur: () => field.touch(),
        autoComplete,
    };

    switch (node.component) {
        case 'Select': {
            const clearable = node.props?.clearable as boolean | undefined;
            const searchable = node.props?.searchable as boolean | undefined;
            const multiple = node.props?.multiple as boolean | undefined;
            const placeholderOpt =
                resolvePlaceholder(node.props?.placeholder as string | undefined) || 'Select…';

            if (searchable || multiple) {
                return (
                    <ComboboxSelect
                        field={field}
                        node={node}
                        common={{ ...common, placeholder: resolvePlaceholder(node.props?.placeholder as string | undefined) }}
                        isReadonly={isReadonly}
                    />
                );
            }

            return (
                <div className="formspec-select-wrapper">
                    <select
                        {...common}
                        className="formspec-input formspec-select-native"
                        value={value ?? ''}
                        onChange={isReadonly ? undefined : (e) => field.setValue(e.target.value)}
                        disabled={isReadonly}
                    >
                        {/* Item 5: hidden prevents placeholder appearing in iOS picker dropdown */}
                        <option value="" disabled hidden>{placeholderOpt}</option>
                        {field.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    {clearable && value && !isReadonly && (
                        <button
                            type="button"
                            className="formspec-select-clear"
                            aria-label="Clear selection"
                            onClick={() => { field.setValue(null); field.touch(); }}
                        >
                            {/* Item 28: hide decorative × from screen readers */}
                            <span aria-hidden="true">×</span>
                        </button>
                    )}
                </div>
            );
        }

        case 'DatePicker': {
            const variant = node.props?.variant as string | undefined;
            // Item 20: minDate/maxDate → native min/max attributes
            const minDate = node.props?.minDate as string | undefined;
            const maxDate = node.props?.maxDate as string | undefined;
            const placeholder = resolvePlaceholder(node.props?.placeholder as string | undefined);
            let inputType = 'date';
            if (variant === 'dateTime' || dataType === 'dateTime') inputType = 'datetime-local';
            else if (variant === 'time' || dataType === 'time') inputType = 'time';
            return (
                <input
                    {...common}
                    type={inputType}
                    value={value ?? ''}
                    readOnly={isReadonly}
                    placeholder={placeholder}
                    min={minDate}
                    max={maxDate}
                    onChange={isReadonly ? undefined : (e) => field.setValue(e.target.value)}
                />
            );
        }

        case 'NumberInput': {
            const min = node.props?.min != null ? Number(node.props.min) : undefined;
            const max = node.props?.max != null ? Number(node.props.max) : undefined;
            const step = node.props?.step != null ? Number(node.props.step) : undefined;
            const showStepper = node.props?.showStepper as boolean | undefined;
            const placeholder = resolvePlaceholder(node.props?.placeholder as string | undefined);

            const numberInput = (
                <input
                    {...common}
                    type="number"
                    value={value ?? ''}
                    readOnly={isReadonly}
                    placeholder={placeholder}
                    min={min != null ? String(min) : undefined}
                    max={max != null ? String(max) : undefined}
                    step={step != null ? String(step) : undefined}
                    onChange={
                        isReadonly
                            ? undefined
                            : (e) => field.setValue(e.target.value === '' ? null : Number(e.target.value))
                    }
                />
            );

            if (showStepper) {
                const stepVal = step ?? 1;
                const numVal = typeof value === 'number' ? value : 0;
                return (
                    <div className="formspec-stepper">
                        <button
                            type="button"
                            className="formspec-stepper-decrement"
                            // Item 26: include field label for screen reader context
                            aria-label={`Decrease ${field.label}`}
                            disabled={isReadonly || (min != null && numVal - stepVal < min)}
                            onClick={() => { field.setValue(numVal - stepVal); field.touch(); }}
                        >
                            −
                        </button>
                        {numberInput}
                        <button
                            type="button"
                            className="formspec-stepper-increment"
                            // Item 26: include field label for screen reader context
                            aria-label={`Increase ${field.label}`}
                            disabled={isReadonly || (max != null && numVal + stepVal > max)}
                            onClick={() => { field.setValue(numVal + stepVal); field.touch(); }}
                        >
                            +
                        </button>
                    </div>
                );
            }

            return numberInput;
        }

        case 'FileUpload':
            return <FileUploadControl field={field} node={node} common={common} isReadonly={isReadonly} />;

        case 'MoneyInput':
            return (
                <MoneyInputControl
                    field={field}
                    node={node}
                    common={common}
                    isReadonly={isReadonly}
                    placeholder={resolvePlaceholder(node.props?.placeholder as string | undefined)}
                />
            );

        case 'Slider':
            return <SliderControl field={field} node={node} common={common} isReadonly={isReadonly} />;

        case 'Rating':
            return (
                <RatingControl
                    field={field}
                    node={node}
                    isReadonly={isReadonly}
                    supplementaryDescribedBy={describedBy}
                />
            );

        case 'Signature':
            return <SignatureControl field={field} node={node} supplementaryDescribedBy={describedBy} />;

        case 'TextInput':
        default: {
            const maxLines = node.props?.maxLines as number | undefined;
            const prefix = node.props?.prefix as string | undefined;
            const suffix = node.props?.suffix as string | undefined;
            const placeholder = node.props?.placeholder as string | undefined;
            const inputMode = node.props?.inputMode as string | undefined;
            const isTextarea = dataType === 'text' || maxLines != null;

            // Item 15: build aria-describedby chain that includes prefix/suffix ids
            const adornmentIds = [
                prefix ? `${id}-prefix` : '',
                suffix ? `${id}-suffix` : '',
            ].filter(Boolean);
            const adornedDescribedBy = adornmentIds.length
                ? [...(describedBy ? [describedBy] : []), ...adornmentIds].join(' ')
                : describedBy;

            const controlProps = {
                ...common,
                'aria-describedby': adornedDescribedBy || undefined,
            };

            const control = isTextarea ? (
                <textarea
                    {...controlProps}
                    rows={maxLines}
                    placeholder={resolvePlaceholder(placeholder)}
                    value={value ?? ''}
                    readOnly={isReadonly}
                    maxLength={extensionAttrs.maxLength}
                    onChange={(e) => field.setValue(e.target.value)}
                />
            ) : (
                <input
                    {...controlProps}
                    type={extensionAttrs.type || 'text'}
                    value={value ?? ''}
                    readOnly={isReadonly}
                    placeholder={resolvePlaceholder(placeholder)}
                    inputMode={(extensionAttrs.inputMode || inputMode) as React.HTMLAttributes<HTMLInputElement>['inputMode']}
                    maxLength={extensionAttrs.maxLength}
                    pattern={extensionAttrs.pattern}
                    autoComplete={extensionAttrs.autoComplete || autoComplete}
                    onChange={(e) => field.setValue(e.target.value)}
                />
            );

            if (prefix || suffix) {
                return (
                    <div className="formspec-input-adornment">
                        {/* Item 15: id on prefix/suffix spans for aria-describedby linkage */}
                        {prefix && <span id={`${id}-prefix`} className="formspec-input-prefix">{prefix}</span>}
                        {control}
                        {suffix && <span id={`${id}-suffix`} className="formspec-input-suffix">{suffix}</span>}
                    </div>
                );
            }
            return control;
        }
    }
}
