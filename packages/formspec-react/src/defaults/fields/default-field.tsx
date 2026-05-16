'use client';

/** @filedesc Default field component — semantic HTML with ARIA, touch-gated errors, and CSS class structure. */
import { optionMatchesComboboxQuery } from '@formspec-org/engine';
import React, { useMemo, useRef, useEffect, useState } from 'react';
import type { FieldComponentProps } from '../../component-map';
import { useFormspecContext } from '../../context';

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

    // Resolve registry extension attributes for the field
    const { registryEntries } = useFormspecContext();
    const extensionAttrs = useMemo(() => {
        const extensions = node.fieldItem?.extensions as Record<string, boolean> | undefined;
        if (!extensions || registryEntries.size === 0) return {};
        const attrs: Record<string, any> = {};
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
        (extensionAttrs.placeholder as string | undefined) || componentPlaceholder;

    const descId = `${field.id}-desc`;
    const descriptionNode = field.description ? (
        <div id={descId} className="formspec-description">{field.description}</div>
    ) : null;
    const hintNode = field.hint ? <p id={`${field.id}-hint`} className="formspec-hint">{field.hint}</p> : null;

    // Supplementary text only — not validation errors (those use aria-invalid + live region on .formspec-error).
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

    // Checkbox / Toggle: inline layout
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
                // Item 17: Toggle gets role="switch", plain Checkbox does not
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

    // RadioGroup / CheckboxGroup — fieldset + legend (native group caption) to match default WC adapter.
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
                {/* Item 4: pass isReadonly so individual inputs get disabled */}
                {renderGroupControl(field, node, isReadonly, labelId, groupSupplementaryDescribedBy)}
                {errorNode}
            </fieldset>
        );
    }

    // Standard field: div + label + control
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

/** Renders radio/checkbox group options (ARIA matches default web component adapter). */
function renderGroupControl(
    field: FieldComponentProps['field'],
    node: FieldComponentProps['node'],
    // Item 4: isReadonly propagated to each input
    isReadonly: boolean,
    labelId: string,
    groupSupplementaryDescribedBy: string | undefined,
) {
    if (node.component === 'RadioGroup') {
        const orientation = node.props?.orientation as string | undefined;
        return (
            <div
                className="formspec-radio-group"
                role="radiogroup"
                aria-labelledby={labelId}
                {...(groupSupplementaryDescribedBy ? { 'aria-describedby': groupSupplementaryDescribedBy } : {})}
                {...(orientation === 'horizontal' ? { 'data-orientation': 'horizontal' as const } : {})}
            >
                {field.options.map((opt) => (
                    <label key={opt.value}>
                        <input
                            type="radio"
                            name={field.path}
                            value={opt.value}
                            checked={field.value === opt.value}
                            disabled={isReadonly}
                            onChange={isReadonly ? undefined : () => { field.setValue(opt.value); field.touch(); }}
                        />
                        {' '}
                        {opt.label}
                    </label>
                ))}
            </div>
        );
    }

    // CheckboxGroup
    const current = Array.isArray(field.value) ? field.value : [];
    const columns = node.props?.columns as number | string | undefined;
    const selectAll = node.props?.selectAll as boolean | undefined;
    const allValues = field.options.map(o => o.value);
    const allSelected = allValues.length > 0 && allValues.every(v => current.includes(v));

    const columnStyle: React.CSSProperties | undefined =
        typeof columns === 'string' ? { display: 'grid', gridTemplateColumns: columns } : undefined;
    const dataColumns =
        typeof columns === 'number' && columns > 1 ? { 'data-columns': String(columns) } : {};

    return (
        <div
            className="formspec-checkbox-group"
            role="group"
            aria-labelledby={labelId}
            {...(groupSupplementaryDescribedBy ? { 'aria-describedby': groupSupplementaryDescribedBy } : {})}
            style={columnStyle}
            {...dataColumns}
        >
            {selectAll && (
                <label className="formspec-select-all" data-select-all>
                    <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allSelected}
                        disabled={isReadonly}
                        onChange={isReadonly ? undefined : (e) => {
                            field.setValue(e.target.checked ? [...allValues] : []);
                            field.touch();
                        }}
                    />
                    Select all
                </label>
            )}
            {field.options.map((opt) => (
                <label key={opt.value}>
                    <input
                        type="checkbox"
                        name={field.path}
                        value={opt.value}
                        checked={current.includes(opt.value)}
                        disabled={isReadonly}
                        onChange={isReadonly ? undefined : (e) => {
                            const next = e.target.checked
                                ? [...current, opt.value]
                                : current.filter((v: string) => v !== opt.value);
                            field.setValue(next);
                            field.touch();
                        }}
                    />
                    {' '}
                    {opt.label}
                </label>
            ))}
        </div>
    );
}

/** Renders the form control for standard (non-group) field types. */
function renderControl(
    field: FieldComponentProps['field'],
    node: FieldComponentProps['node'],
    describedBy: string | undefined,
    isProtected = false,
    extensionAttrs: Record<string, any> = {},
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
                    onChange={(e) => field.setValue(e.target.value)}
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
                    onChange={(e) => field.setValue(e.target.value === '' ? null : Number(e.target.value))}
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

// ── Compound input components ─────────────────────────────────────

interface CommonInputProps {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    common: Record<string, any>;
    isReadonly: boolean;
}

function comboboxValuePresent(v: unknown): boolean {
    return v != null && v !== '';
}

/** Combobox select — searchable and/or multi-value; WAI-ARIA combobox + listbox. */
function ComboboxSelect({ field, node, common, isReadonly }: Pick<CommonInputProps, 'field' | 'node' | 'common' | 'isReadonly'>) {
    const multiple = !!(node.props?.multiple as boolean | undefined);
    const searchableFilter = !!(node.props?.searchable as boolean | undefined);
    const clearable = !!(node.props?.clearable as boolean | undefined);
    const placeholderText =
        ((common.placeholder as string | undefined) || (node.props?.placeholder as string | undefined) || 'Select…');

    const blurTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const selectedValues = useMemo(() => {
        if (!multiple) return [];
        const v = field.value;
        if (Array.isArray(v)) return v.map(String);
        if (v == null || v === '') return [];
        return [String(v)];
    }, [field.value, multiple]);

    const selectedSingle = multiple ? undefined : field.value;

    const selectedLabel = useMemo(() => {
        if (multiple || selectedSingle == null || selectedSingle === '') return '';
        const s = String(selectedSingle);
        return field.options.find((o) => o.value === s)?.label ?? s;
    }, [field.options, multiple, selectedSingle]);

    const filtered = useMemo(() => {
        const opts = field.options;
        if (!searchableFilter || !query.trim()) return opts;
        return opts.filter((o) => optionMatchesComboboxQuery(o, query));
    }, [field.options, query, searchableFilter]);

    const closedDisplay = useMemo(() => {
        if (multiple) {
            if (selectedValues.length === 0) return placeholderText;
            if (selectedValues.length === 1) {
                const v = selectedValues[0];
                return field.options.find((o) => o.value === v)?.label ?? '1 selected';
            }
            return `${selectedValues.length} selected`;
        }
        return selectedLabel || placeholderText;
    }, [multiple, selectedValues, field.options, selectedLabel, placeholderText]);

    const inputValue = open && searchableFilter ? query : closedDisplay;

    const readOnlyInput =
        isReadonly ||
        (multiple && (!open || !searchableFilter)) ||
        (!multiple && !open && selectedLabel !== '');

    const listboxId = common.id ? `${common.id}-listbox` : 'formspec-listbox';
    const highlightedOptionId =
        highlightedIndex >= 0 && highlightedIndex < filtered.length
            ? `${common.id ?? 'formspec'}-option-${highlightedIndex}`
            : undefined;

    const clearBlurTimer = () => {
        if (blurTimerRef.current !== undefined) {
            clearTimeout(blurTimerRef.current);
            blurTimerRef.current = undefined;
        }
    };

    useEffect(() => () => clearBlurTimer(), []);

    const closeList = () => {
        setOpen(false);
        setQuery('');
        setHighlightedIndex(-1);
    };

    const selectOptionSingle = (opt: { value: string; label: string }) => {
        if (isReadonly) return;
        field.setValue(opt.value);
        field.touch();
        closeList();
    };

    const toggleOptionMulti = (opt: { value: string; label: string }) => {
        if (isReadonly) return;
        const next = selectedValues.includes(opt.value)
            ? selectedValues.filter((v) => v !== opt.value)
            : [...selectedValues, opt.value];
        field.setValue(next);
        field.touch();
    };

    const clearAll = () => {
        if (isReadonly) return;
        field.setValue(multiple ? [] : null);
        field.touch();
        closeList();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setOpen(true);
            if (searchableFilter) setQuery('');
            const n0 = field.options.filter((o) => {
                if (!searchableFilter || !query.trim()) return true;
                return optionMatchesComboboxQuery(o, query);
            }).length;
            setHighlightedIndex(
                n0 > 0 ? (e.key === 'ArrowDown' ? 0 : n0 - 1) : -1,
            );
            e.preventDefault();
            return;
        }
        if (!open) return;

        const n = filtered.length;
        if (n === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((i) => (i < 0 ? 0 : (i + 1) % n));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((i) =>
                    i < 0 ? n - 1 : i <= 0 ? n - 1 : i - 1,
                );
                break;
            case 'Enter':
                if (highlightedIndex >= 0 && highlightedIndex < n) {
                    e.preventDefault();
                    const opt = filtered[highlightedIndex];
                    if (multiple) toggleOptionMulti(opt);
                    else selectOptionSingle(opt);
                }
                break;
            case ' ':
                if (multiple && highlightedIndex >= 0 && highlightedIndex < n) {
                    e.preventDefault();
                    toggleOptionMulti(filtered[highlightedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                closeList();
                break;
            default:
                break;
        }
    };

    const showClear =
        clearable &&
        !isReadonly &&
        (multiple ? selectedValues.length > 0 : comboboxValuePresent(selectedSingle));

    const { onBlur: commonTouchBlur, ...inputCommon } = common;

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!searchableFilter) return;
        setQuery(e.target.value);
        setHighlightedIndex(0);
    };

    return (
        <div
            className="formspec-combobox formspec-select-searchable"
            {...(multiple ? { 'data-multiple': 'true' } : {})}
        >
            {multiple && selectedValues.length > 0 && (
                <div className="formspec-combobox-chips" aria-label="Selected values">
                    {selectedValues.map((v) => {
                        const label = field.options.find((o) => o.value === v)?.label ?? v;
                        return (
                            <span key={v} className="formspec-combobox-chip">
                                {label}
                                <button
                                    type="button"
                                    className="formspec-combobox-chip-remove"
                                    aria-label={`Remove ${label}`}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        if (isReadonly) return;
                                        field.setValue(selectedValues.filter((x) => x !== v));
                                        field.touch();
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
            <div className="formspec-combobox-popover">
                <div className="formspec-combobox-row">
                    <input
                        {...inputCommon}
                        type="text"
                        role="combobox"
                        className="formspec-input formspec-combobox-input"
                        value={inputValue}
                        readOnly={readOnlyInput}
                        disabled={isReadonly}
                        placeholder={searchableFilter ? placeholderText : undefined}
                        aria-expanded={open}
                        aria-controls={listboxId}
                        aria-autocomplete={searchableFilter ? 'list' : 'none'}
                        aria-activedescendant={highlightedOptionId}
                        onFocus={() => {
                            clearBlurTimer();
                            setOpen(true);
                            if (searchableFilter) setQuery('');
                            setHighlightedIndex(-1);
                        }}
                        onBlur={() => {
                            commonTouchBlur?.();
                            blurTimerRef.current = setTimeout(closeList, 120);
                        }}
                        onChange={onInputChange}
                        onKeyDown={handleKeyDown}
                    />
                    {showClear && (
                        <button
                            type="button"
                            className="formspec-combobox-clear"
                            aria-label="Clear selection"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={clearAll}
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    )}
                    <span className="formspec-combobox-chevron" aria-hidden="true">
                        ▾
                    </span>
                </div>
                <ul
                    role="listbox"
                    id={listboxId}
                    className="formspec-combobox-list"
                    hidden={!open}
                    aria-multiselectable={multiple || undefined}
                >
                    {filtered.map((opt, index) => {
                        const optId = `${common.id ?? 'formspec'}-option-${index}`;
                        const isHighlighted = index === highlightedIndex;
                        const isChosen = multiple
                            ? selectedValues.includes(opt.value)
                            : String(selectedSingle ?? '') === opt.value;
                        return (
                            <li
                                key={opt.value}
                                id={optId}
                                role="option"
                                aria-selected={
                                    multiple
                                        ? isChosen
                                        : isHighlighted
                                }
                                className={[
                                    'formspec-combobox-option',
                                    isChosen ? 'formspec-option--selected' : '',
                                    isHighlighted ? 'formspec-option--highlighted' : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ') || undefined}
                                onMouseDown={
                                    isReadonly
                                        ? undefined
                                        : (e) => {
                                            e.preventDefault();
                                            if (multiple) toggleOptionMulti(opt);
                                            else selectOptionSingle(opt);
                                        }
                                }
                            >
                                {multiple && (
                                    <input
                                        type="checkbox"
                                        tabIndex={-1}
                                        readOnly
                                        checked={isChosen}
                                        aria-hidden="true"
                                    />
                                )}
                                {opt.label}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

/** Resolve ISO 4217 currency code (e.g. "USD") to its narrow symbol (e.g. "$"). */
function toCurrencySymbol(code: string): string {
    try {
        const parts = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: code.toUpperCase(),
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).formatToParts(1);
        return parts.find(p => p.type === 'currency')?.value ?? code;
    } catch {
        return code;
    }
}

/** Round-trip display for money amount input (matches web component bind sync). */
function formatMoneyAmountForInput(amount: unknown): string {
    if (amount === null || amount === undefined) return '';
    const n = typeof amount === 'number' ? amount : Number(amount);
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n * 100) / 100);
}

function MoneyInputControl({
    field,
    node,
    common,
    isReadonly,
    placeholder: resolvedPlaceholder,
}: CommonInputProps & { placeholder?: string }) {
    const currencyCode = ((node.props?.currency as string) || 'USD').toUpperCase();
    const currency = toCurrencySymbol(currencyCode);
    const min = node.props?.min != null ? String(node.props.min) : undefined;
    const max = node.props?.max != null ? String(node.props.max) : undefined;
    const step = node.props?.step != null ? String(node.props.step) : undefined;
    const placeholder = resolvedPlaceholder || 'Amount';

    const currencyId = `${field.id}-currency`;

    const rawValue = field.value;
    let amountStr = '';
    if (rawValue != null) {
        if (typeof rawValue === 'object' && rawValue !== null && 'amount' in rawValue) {
            amountStr = formatMoneyAmountForInput((rawValue as { amount?: unknown }).amount);
        } else if (typeof rawValue === 'number') {
            amountStr = formatMoneyAmountForInput(rawValue);
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const num = raw === '' ? null : Number(raw);
        field.setValue({
            amount: num !== null && Number.isFinite(num) ? num : null,
            currency: currencyCode,
        });
    };

    const moneyDescribedBy = [common['aria-describedby'], currencyId]
        .filter(Boolean)
        .join(' ') || undefined;

    return (
        <div className="formspec-money">
            <span
                id={currencyId}
                className="formspec-money-currency"
                aria-label={`Currency: ${currency}`}
            >
                {currency}
            </span>
            <input
                {...common}
                type="text"
                inputMode="decimal"
                pattern={'[0-9]*\\.?[0-9]*'}
                className="formspec-input formspec-money-amount"
                name={`${field.path}__amount`}
                placeholder={placeholder}
                aria-describedby={moneyDescribedBy}
                value={amountStr}
                readOnly={isReadonly}
                min={min}
                max={max}
                step={step}
                onChange={isReadonly ? undefined : handleChange}
            />
        </div>
    );
}

function SliderControl({ field, node, common, isReadonly }: CommonInputProps) {
    const minNum = node.props?.min != null ? Number(node.props.min) : 0;
    const minStr = node.props?.min != null ? String(node.props.min) : undefined;
    const maxStr = node.props?.max != null ? String(node.props.max) : undefined;
    const stepStr = node.props?.step != null ? String(node.props.step) : undefined;
    const maxNum = node.props?.max != null ? Number(node.props.max) : undefined;
    const stepNum = node.props?.step != null ? Number(node.props.step) : undefined;

    const showTicks = node.props?.showTicks === true;
    const ticksProp = node.props?.ticks as Array<{ value: number; label?: string }> | boolean | undefined;
    const showValue = node.props?.showValue !== false;

    const customTicks = Array.isArray(ticksProp) ? ticksProp : null;
    const listId =
        customTicks && customTicks.length > 0
            ? `${field.id}-ticks`
            : showTicks && maxNum != null && stepNum != null && Number.isFinite(maxNum) && Number.isFinite(stepNum)
                ? `formspec-ticks-${field.path.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
                : ticksProp === true && minStr != null && maxStr != null && stepStr != null
                    ? `formspec-ticks-${field.path.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
                    : undefined;

    const displayValue = field.value != null ? String(field.value) : String(minNum);

    let datalist: React.ReactNode = null;
    if (listId) {
        if (customTicks) {
            datalist = (
                <datalist id={listId}>
                    {customTicks.map(t => <option key={t.value} value={t.value} label={t.label} />)}
                </datalist>
            );
        } else if (showTicks && maxNum != null && stepNum != null && Number.isFinite(minNum)) {
            const opts: React.ReactNode[] = [];
            for (let v = minNum; v <= maxNum; v += stepNum) {
                opts.push(<option key={v} value={v} />);
            }
            datalist = <datalist id={listId}>{opts}</datalist>;
        } else if (ticksProp === true) {
            datalist = <datalist id={listId} />;
        }
    }

    return (
        <div className="formspec-slider-track">
            {datalist}
            <input
                {...common}
                type="range"
                className="formspec-input"
                value={field.value ?? minNum}
                disabled={isReadonly}
                min={minStr}
                max={maxStr}
                step={stepStr}
                list={listId}
                aria-valuetext={displayValue}
                onChange={isReadonly ? undefined : (e) => field.setValue(Number(e.target.value))}
            />
            {showValue ? <span className="formspec-slider-value">{displayValue}</span> : null}
        </div>
    );
}

const RATING_ICON_MAP: Record<string, [string, string]> = {
    star: ['\u2605', '\u2606'],
    heart: ['\u2665', '\u2661'],
    circle: ['\u25cf', '\u25cb'],
};

function resolveRatingIcons(icon?: string): [string, string] {
    if (!icon) return RATING_ICON_MAP.star;
    return RATING_ICON_MAP[icon] || [icon, icon];
}

function RatingControl({
    field,
    node,
    isReadonly,
    supplementaryDescribedBy,
}: {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    isReadonly: boolean;
    supplementaryDescribedBy?: string;
}) {
    const showError = !!(field.error && field.touched);
    const maxFromProps = node.props?.max ?? node.props?.maxRating;
    const maxRating = typeof maxFromProps === 'number' && maxFromProps > 0 ? maxFromProps : 5;
    const allowHalf = node.props?.allowHalf === true;
    const iconName = node.props?.icon as string | undefined;
    const [selectedIcon, unselectedIcon] = resolveRatingIcons(iconName);
    const isInteger = node.fieldItem?.dataType === 'integer';
    const raw = field.value;
    const currentValue = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0;

    const setRating = (v: number) => {
        let next = Math.max(0, Math.min(v, maxRating));
        if (isInteger) next = Math.round(next);
        field.setValue(next);
        field.touch();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (isReadonly) return;
        const step = allowHalf ? 0.5 : 1;
        let next: number | null = null;
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                next = Math.min(maxRating, currentValue + step);
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                next = Math.max(0, currentValue - step);
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = maxRating;
                break;
        }
        if (next != null) {
            e.preventDefault();
            setRating(next);
        }
    };

    const handleStarClick = (starIndex: number, event: React.MouseEvent<HTMLSpanElement>) => {
        if (isReadonly) return;
        const i = starIndex + 1;
        let value = i;
        if (allowHalf) {
            const rect = event.currentTarget.getBoundingClientRect();
            const clickedLeftHalf = rect.width > 0 && event.clientX - rect.left < rect.width / 2;
            value = clickedLeftHalf ? i - 0.5 : i;
        }
        setRating(value);
    };

    return (
        <div
            className="formspec-rating-stars"
            role="slider"
            tabIndex={isReadonly ? -1 : 0}
            aria-valuemin={0}
            aria-valuemax={maxRating}
            aria-valuenow={currentValue}
            aria-valuetext={`${currentValue} of ${maxRating}`}
            aria-label={field.label}
            aria-invalid={showError}
            {...(supplementaryDescribedBy ? { 'aria-describedby': supplementaryDescribedBy } : {})}
            onKeyDown={handleKeyDown}
        >
            {Array.from({ length: maxRating }, (_, idx) => {
                const starValue = idx + 1;
                const halfValue = idx + 0.5;
                const isSelected = starValue <= currentValue;
                const isHalf = allowHalf && !isSelected && halfValue <= currentValue;
                const glyph = isSelected || isHalf ? selectedIcon : unselectedIcon;
                return (
                    <span
                        key={starValue}
                        className={[
                            'formspec-rating-star',
                            isSelected ? 'formspec-rating-star--selected' : '',
                            isHalf ? 'formspec-rating-star--half' : '',
                        ].filter(Boolean).join(' ')}
                        data-value={String(starValue)}
                        onClick={(e) => handleStarClick(idx, e)}
                    >
                        {glyph}
                    </span>
                );
            })}
        </div>
    );
}

function SignatureControl({
    field,
    node,
    supplementaryDescribedBy,
}: {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    supplementaryDescribedBy?: string;
}) {
    const showError = !!(field.error && field.touched);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const height = (node.props?.height as number) || 200;
    const penColor = (node.props?.penColor as string) || '#000000';

    // Stable refs — field.setValue and field.touch don't change identity across renders,
    // but the `field` object itself is recreated by useField on every render.
    const { setValue, touch } = field;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // DPR-aware canvas sizing — use setTransform (absolute) not scale (cumulative)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.strokeStyle = penColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        const getPos = (e: MouseEvent | TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            if ('touches' in e) {
                return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
            }
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const onStart = (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            isDrawingRef.current = true;
            const { x, y } = getPos(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
        };

        const onMove = (e: MouseEvent | TouchEvent) => {
            if (!isDrawingRef.current) return;
            e.preventDefault();
            const { x, y } = getPos(e);
            ctx.lineTo(x, y);
            ctx.stroke();
        };

        const onEnd = () => {
            if (!isDrawingRef.current) return;
            isDrawingRef.current = false;
            setValue(canvas.toDataURL());
            touch();
        };

        canvas.addEventListener('mousedown', onStart);
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseup', onEnd);
        canvas.addEventListener('touchstart', onStart, { passive: false });
        canvas.addEventListener('touchmove', onMove, { passive: false });
        canvas.addEventListener('touchend', onEnd);

        return () => {
            canvas.removeEventListener('mousedown', onStart);
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('mouseup', onEnd);
            canvas.removeEventListener('touchstart', onStart);
            canvas.removeEventListener('touchmove', onMove);
            canvas.removeEventListener('touchend', onEnd);
        };
    }, [penColor, setValue, touch]);

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        field.setValue(null);
        field.touch();
    };

    return (
        <div className="formspec-signature">
            <canvas
                ref={canvasRef}
                id={field.id}
                // Item 1: WCAG 2.1.1 / 4.1.2 — canvas needs role, label, and keyboard focus
                role="img"
                aria-label={`Signature pad for ${field.label}`}
                aria-invalid={showError}
                {...(supplementaryDescribedBy ? { 'aria-describedby': supplementaryDescribedBy } : {})}
                tabIndex={0}
                className="formspec-signature-canvas"
                style={{ width: '100%', height, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
            />
            <button
                type="button"
                className="formspec-signature-clear"
                // Item 1: include field label so clear button has context for screen readers
                aria-label={`Clear ${field.label}`}
                onClick={handleClear}
            >
                Clear
            </button>
        </div>
    );
}

/** Item 22: FileUpload with drag-drop zone and maxSize validation. */
function FileUploadControl({ field, node, common, isReadonly }: CommonInputProps) {
    const accept = node.props?.accept as string | undefined;
    const multiple = node.props?.multiple as boolean | undefined;
    const maxSize = node.props?.maxSize as number | undefined;
    const dragDrop = node.props?.dragDrop !== false;

    const [sizeError, setSizeError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [files, setFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFiles = (incoming: FileList | null) => {
        if (!incoming || incoming.length === 0) return;
        const newFiles = Array.from(incoming);

        if (maxSize != null) {
            const oversized = newFiles.find(f => f.size > maxSize);
            if (oversized) {
                setSizeError(`"${oversized.name}" exceeds the maximum size of ${formatBytes(maxSize)}.`);
                return;
            }
        }
        setSizeError(null);

        if (multiple) {
            // Accumulate — deduplicate by name+size+lastModified
            const merged = [...files];
            for (const f of newFiles) {
                if (!merged.some(e => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified)) {
                    merged.push(f);
                }
            }
            setFiles(merged);
            field.setValue(merged);
        } else {
            setFiles([newFiles[0]]);
            field.setValue(newFiles[0]);
        }
        // Reset the input so the same file can be re-selected after removal
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index: number) => {
        const next = files.filter((_, i) => i !== index);
        setFiles(next);
        field.setValue(next.length > 0 ? (multiple ? next : next[0]) : null);
        field.touch();
    };

    const clearAll = () => {
        setFiles([]);
        setSizeError(null);
        field.setValue(null);
        field.touch();
    };

    const hiddenInput = (
        <input
            {...common}
            ref={fileInputRef}
            type="file"
            className="formspec-file-input-hidden"
            disabled={isReadonly}
            accept={accept}
            multiple={multiple}
            onChange={(e) => addFiles(e.target.files)}
        />
    );

    const fileList = files.length > 0 && (
        <ul className="formspec-file-list" aria-label="Selected files">
            {files.map((f, i) => (
                <li key={`${f.name}-${f.lastModified}`} className="formspec-file-list-item">
                    <span className="formspec-file-list-name">{f.name}</span>
                    <span className="formspec-file-list-size">{formatBytes(f.size)}</span>
                    {!isReadonly && (
                        <button
                            type="button"
                            className="formspec-file-list-remove"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => removeFile(i)}
                        >
                            <span aria-hidden="true">×</span>
                        </button>
                    )}
                </li>
            ))}
            {multiple && files.length > 1 && !isReadonly && (
                <li className="formspec-file-list-actions">
                    <button type="button" className="formspec-file-list-clear" onClick={clearAll}>
                        Clear all
                    </button>
                </li>
            )}
        </ul>
    );

    const errorEl = sizeError && (
        <p className="formspec-file-size-error formspec-error">{sizeError}</p>
    );

    const browseBtnClass = 'formspec-file-browse-btn formspec-focus-ring formspec-button-secondary';

    if (!dragDrop) {
        // Siblings only — formspec-file-upload lives on the field root (parity with default web component adapter).
        return (
            <>
                {hiddenInput}
                <button
                    type="button"
                    className={browseBtnClass}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReadonly}
                >
                    Choose file{multiple ? 's' : ''}
                </button>
                {fileList}
                {errorEl}
            </>
        );
    }

    return (
        <>
            <div
                className={`formspec-file-drop-zone formspec-focus-ring${isDragOver ? ' formspec-file-drop-zone--active' : ''}`}
                tabIndex={isReadonly ? -1 : 0}
                role="button"
                aria-label="Drop files here or click to browse"
                onKeyDown={(e) => {
                    if (isReadonly) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInputRef.current?.click();
                    }
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    addFiles(e.dataTransfer.files);
                }}
            >
                <div className="formspec-file-drop-content">
                    <span className="formspec-file-drop-icon" aria-hidden="true">{'\u21F5'}</span>
                    <span className="formspec-file-drop-label">
                        {files.length === 0
                            ? (multiple ? 'Drag & drop files here' : 'Drag & drop a file here')
                            : `${files.length} file${files.length !== 1 ? 's' : ''} selected`}
                    </span>
                    <button
                        type="button"
                        className={browseBtnClass}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isReadonly}
                    >
                        Browse
                    </button>
                </div>
            </div>
            {hiddenInput}
            {fileList}
            {errorEl}
        </>
    );
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}
