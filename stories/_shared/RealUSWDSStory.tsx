/** Story pane that renders the real USWDS component markup in an isolated shadow root. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import uswdsCssUrl from '@uswds/uswds/css/uswds.css?url';
import { getRealUswdsPreset, type RealUswdsRenderPreset } from './uswds-comparison-presets';

type USWDSBehavior = {
    on?: (root?: ParentNode) => void;
    off?: (root?: ParentNode) => void;
};

type FormspecItem = {
    key: string;
    type?: string;
    dataType?: string;
    label?: string;
    hint?: string;
    required?: boolean;
    repeatable?: boolean;
    minRepeat?: number;
    maxRepeat?: number;
    relevant?: string;
    constraint?: string;
    constraintMessage?: string;
    options?: Array<{ value: string; label: string }>;
    presentation?: Record<string, any>;
    children?: FormspecItem[];
};

type RenderPreset = RealUswdsRenderPreset;

export interface RealUSWDSStoryProps {
    definition: any;
    componentDocument?: any;
    showSubmit?: boolean;
    maxWidth?: number;
}

const paneStyle: React.CSSProperties = {
    maxWidth: 640,
    margin: '0 auto',
};

const tabsPanelTopPadding = '1.5rem';

function requiredMark(required?: boolean) {
    if (!required) return null;
    return (
        <abbr title="required" className="usa-label--required">
            {' *'}
        </abbr>
    );
}

function renderHint(item: FormspecItem, id: string, fallback?: string) {
    const text = item.hint ?? fallback;
    if (!text) return null;
    return (
        <div className="usa-hint" id={`${id}-hint`}>
            {text}
        </div>
    );
}

/** Mirrors `createUSWDSError` in packages/formspec-adapters/src/uswds/shared.ts — always in the DOM; empty when valid. */
function renderUswdsErrorMessage(id: string, text: string) {
    return (
        <span className="usa-error-message" id={`${id}-error`}>
            {text}
        </span>
    );
}

/** Matches adapter `describedBy`: optional hint id + always `${id}-error`. */
function uswdsInputDescribedBy(id: string, includeHint: boolean) {
    const parts = [includeHint ? `${id}-hint` : '', `${id}-error`].filter(Boolean);
    return parts.join(' ') || undefined;
}

function normalizeWidgetHint(item: FormspecItem) {
    const raw = String(item.presentation?.widgetHint ?? '').trim().toLowerCase();
    if (raw === 'dropdown') return 'select';
    if (raw === 'radio') return 'radiogroup';
    if (raw === 'multiselect') return 'checkboxgroup';
    if (raw === 'textarea') return 'textinput';
    if (raw === 'text') return 'paragraph';
    if (raw === 'alert') return 'banner';
    return raw;
}

function toCurrencyDisplay(raw: unknown) {
    if (typeof raw !== 'string') return '$';
    const value = raw.trim();
    if (!value) return '$';

    if (value.length === 3 && /^[A-Z]{3}$/i.test(value)) {
        try {
            const parts = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: value.toUpperCase(),
                currencyDisplay: 'narrowSymbol',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).formatToParts(1);
            return parts.find((part) => part.type === 'currency')?.value || value.toUpperCase();
        } catch {
            return value.toUpperCase();
        }
    }

    return value;
}

function matchesWidgetHint(item: FormspecItem, ...candidates: string[]) {
    const widgetHint = normalizeWidgetHint(item);
    return candidates.some((candidate) => widgetHint === candidate.toLowerCase());
}

function toId(path: string) {
    return `real-uswds-${path.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function renderAlert(text: string, severity: 'info' | 'warning' | 'error' | 'success' = 'info', heading?: string) {
    const className = severity === 'error'
        ? 'usa-alert usa-alert--error'
        : severity === 'warning'
            ? 'usa-alert usa-alert--warning'
            : severity === 'success'
                ? 'usa-alert usa-alert--success'
                : 'usa-alert usa-alert--info';

    return (
        <div className={className} role={severity === 'error' ? 'alert' : undefined}>
            <div className="usa-alert__body">
                {heading ? <h3 className="usa-alert__heading">{heading}</h3> : null}
                <p className="usa-alert__text">{text}</p>
            </div>
        </div>
    );
}

function renderDisplayItem(item: FormspecItem, path: string) {
    const widgetHint = normalizeWidgetHint(item);
    const key = path;

    if (widgetHint === 'heading') {
        return (
            <div key={key} className="usa-prose margin-bottom-2">
                <h2 className="margin-top-0">{item.label}</h2>
            </div>
        );
    }
    if (widgetHint === 'paragraph') {
        return (
            <div key={key} className="usa-prose">
                <p className="margin-top-0">{item.label}</p>
            </div>
        );
    }
    if (widgetHint === 'banner') {
        return <div key={key} className="margin-y-2">{renderAlert(item.label ?? '', 'info')}</div>;
    }
    if (widgetHint === 'divider') {
        return (
            <hr
                key={key}
                className="margin-y-4 width-full"
                style={{ border: 0, borderTop: '1px solid #dfe1e2' }}
            />
        );
    }

    return null;
}

function renderTextInput(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const multiline = Number(item.presentation?.maxLines ?? 1) > 1 || item.dataType === 'text';
    const hasError = Boolean(errorMessage);
    const describedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    const rootClass = hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group';
    const labelClass = hasError ? 'usa-label usa-label--error' : 'usa-label';
    const controlClass = multiline
        ? hasError ? 'usa-textarea usa-input--error' : 'usa-textarea'
        : hasError ? 'usa-input usa-input--error' : 'usa-input';

    return (
        <div className={rootClass}>
            <label className={labelClass} htmlFor={id}>
                {item.label}
                {requiredMark(item.required)}
            </label>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            {multiline ? (
                <textarea
                    className={controlClass}
                    id={id}
                    name={item.key}
                    data-real-uswds-path={path}
                    rows={Math.max(3, Number(item.presentation?.maxLines ?? 5))}
                    placeholder={item.presentation?.placeholder}
                    aria-describedby={describedBy}
                    aria-invalid={hasError}
                    defaultValue={value}
                    required={item.required}
                />
            ) : (
                <input
                    className={controlClass}
                    id={id}
                    name={item.key}
                    type={item.presentation?.inputType === 'email' ? 'email' : 'text'}
                    data-real-uswds-path={path}
                    placeholder={item.presentation?.placeholder}
                    aria-describedby={describedBy}
                    aria-invalid={hasError}
                    defaultValue={value}
                    required={item.required}
                />
            )}
        </div>
    );
}

function renderSelect(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const describedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    const rootClass = hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group';
    const labelClass = hasError ? 'usa-label usa-label--error' : 'usa-label';
    const selectClass = hasError ? 'usa-select usa-input--error' : 'usa-select';

    return (
        <div className={rootClass}>
            <label className={labelClass} htmlFor={id}>
                {item.label}
                {requiredMark(item.required)}
            </label>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <select
                className={selectClass}
                id={id}
                name={item.key}
                data-real-uswds-path={path}
                aria-describedby={describedBy}
                aria-invalid={hasError}
                defaultValue={value ?? ''}
                required={item.required}
            >
                <option value="" disabled={Boolean(item.required)}>
                    {item.presentation?.placeholder || '- Select -'}
                </option>
                {(item.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

/** USWDS combo box: `usa-combo-box` wrapper around `usa-select` (see USWDS component docs). */
function renderComboBox(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const describedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    const rootClass = hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group';
    const labelClass = hasError ? 'usa-label usa-label--error' : 'usa-label';
    const selectClass = hasError ? 'usa-select usa-input--error' : 'usa-select';

    return (
        <div className={rootClass}>
            <label className={labelClass} htmlFor={id}>
                {item.label}
                {requiredMark(item.required)}
            </label>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <div className="usa-combo-box">
                <select
                    className={selectClass}
                    id={id}
                    name={item.key}
                    data-real-uswds-path={path}
                    aria-describedby={describedBy}
                    aria-invalid={hasError}
                    defaultValue={value ?? ''}
                    required={item.required}
                >
                    <option value="" disabled={Boolean(item.required)}>
                        {item.presentation?.placeholder || '- Select -'}
                    </option>
                    {(item.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

function renderRadioGroup(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const radioDescribedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    return (
        <fieldset className={hasError ? 'usa-fieldset usa-form-group usa-form-group--error' : 'usa-fieldset'}>
            <legend className={hasError ? 'usa-legend usa-label--error' : 'usa-legend'}>
                {item.label}
                {requiredMark(item.required)}
            </legend>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            {(item.options ?? []).map((option) => {
                const optionId = `${id}-${option.value}`;
                return (
                    <div className="usa-radio" key={option.value}>
                        <input
                            className="usa-radio__input"
                            id={optionId}
                            type="radio"
                            name={item.key}
                            value={option.value}
                            data-real-uswds-path={path}
                            aria-describedby={radioDescribedBy}
                            aria-invalid={hasError}
                            defaultChecked={value === option.value}
                        />
                        <label className="usa-radio__label" htmlFor={optionId}>
                            {option.label}
                        </label>
                    </div>
                );
            })}
        </fieldset>
    );
}

function renderCheckbox(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const describedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    const rootClass = hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group';
    const labelClass = hasError ? 'usa-checkbox__label usa-label--error' : 'usa-checkbox__label';
    return (
        <div className={rootClass}>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <div className="usa-checkbox">
                <input
                    className="usa-checkbox__input"
                    id={id}
                    type="checkbox"
                    name={item.key}
                    value="true"
                    data-real-uswds-path={path}
                    defaultChecked={Boolean(value)}
                    aria-describedby={describedBy}
                    aria-invalid={hasError}
                />
                <label className={labelClass} htmlFor={id}>
                    {item.label}
                    {requiredMark(item.required)}
                </label>
            </div>
        </div>
    );
}

function renderCheckboxGroup(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const selected = Array.isArray(value) ? new Set(value) : new Set<string>();
    const hasError = Boolean(errorMessage);
    const groupDescribedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    const rootClass = hasError ? 'usa-fieldset usa-form-group usa-form-group--error' : 'usa-fieldset';
    const legendClass = hasError ? 'usa-legend usa-label--error' : 'usa-legend';
    return (
        <fieldset className={rootClass}>
            <legend className={legendClass}>
                {item.label}
                {requiredMark(item.required)}
            </legend>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            {(item.options ?? []).map((option) => {
                const optionId = `${id}-${option.value}`;
                return (
                    <div className="usa-checkbox" key={option.value}>
                        <input
                            className="usa-checkbox__input"
                            id={optionId}
                            type="checkbox"
                            name={item.key}
                            value={option.value}
                            data-real-uswds-path={path}
                            defaultChecked={selected.has(option.value)}
                            aria-describedby={groupDescribedBy}
                            aria-invalid={hasError}
                        />
                        <label className="usa-checkbox__label" htmlFor={optionId}>
                            {option.label}
                        </label>
                    </div>
                );
            })}
        </fieldset>
    );
}

function renderNumberInput(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const describedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    return (
        <div className={hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group'}>
            <label className={hasError ? 'usa-label usa-label--error' : 'usa-label'} htmlFor={id}>
                {item.label}
                {requiredMark(item.required)}
            </label>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <input
                className={hasError ? 'usa-input usa-input--error' : 'usa-input'}
                id={id}
                name={item.key}
                type="number"
                data-real-uswds-path={path}
                min={item.presentation?.min}
                max={item.presentation?.max}
                step={item.presentation?.step}
                aria-describedby={describedBy}
                aria-invalid={hasError}
                defaultValue={value}
                required={item.required}
            />
        </div>
    );
}

function renderMoneyInput(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const describedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    const currency = toCurrencyDisplay(item.presentation?.currency);
    const groupClass = hasError ? 'usa-input-group usa-input-group--error' : 'usa-input-group';
    return (
        <div className={hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group'}>
            <label className={hasError ? 'usa-label usa-label--error' : 'usa-label'} htmlFor={id}>
                {item.label}
                {requiredMark(item.required)}
            </label>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <div className={groupClass}>
                <div className="usa-input-prefix" aria-hidden="true">{currency}</div>
                <input
                    className="usa-input formspec-money-amount"
                    id={id}
                    name={item.key}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    data-real-uswds-path={path}
                    aria-describedby={describedBy}
                    aria-invalid={hasError}
                    defaultValue={value}
                    required={item.required}
                />
            </div>
        </div>
    );
}

function renderDatePicker(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hint = item.hint ?? 'MM/DD/YYYY';
    const hasError = Boolean(errorMessage);
    const dateDescribedBy = uswdsInputDescribedBy(id, true);
    return (
        <div className={hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group'}>
            <label className={hasError ? 'usa-label usa-label--error' : 'usa-label'} id={`${id}-label`} htmlFor={id}>
                {item.label}
                {requiredMark(item.required)}
            </label>
            {renderHint(item, id, hint)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <div className="usa-date-picker">
                <input
                    className={hasError ? 'usa-input usa-input--error' : 'usa-input'}
                    id={id}
                    name={item.key}
                    type="text"
                    data-real-uswds-path={path}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={dateDescribedBy}
                    aria-invalid={hasError}
                    defaultValue={value}
                    required={item.required}
                />
            </div>
        </div>
    );
}

function renderSlider(item: FormspecItem, id: string, path: string, value: any, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const describedBy = uswdsInputDescribedBy(id, Boolean(item.hint));
    return (
        <div className={hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group'}>
            <label className={hasError ? 'usa-label usa-label--error' : 'usa-label'} htmlFor={id}>
                {item.label}
            </label>
            {renderHint(item, id)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <input
                id={id}
                className={hasError ? 'usa-range usa-range--error' : 'usa-range'}
                type="range"
                data-real-uswds-path={path}
                min={item.presentation?.min ?? 0}
                max={item.presentation?.max ?? 100}
                step={item.presentation?.step ?? 1}
                aria-describedby={describedBy}
                aria-invalid={hasError}
                defaultValue={value ?? item.presentation?.min ?? 0}
            />
        </div>
    );
}

function renderFileUpload(item: FormspecItem, id: string, path: string, errorMessage?: string) {
    const hasError = Boolean(errorMessage);
    const hasHint = Boolean(item.hint || item.presentation?.accept);
    const describedBy = uswdsInputDescribedBy(id, hasHint);
    return (
        <div className={hasError ? 'usa-form-group usa-form-group--error' : 'usa-form-group'}>
            <label className={hasError ? 'usa-label usa-label--error' : 'usa-label'} htmlFor={id}>
                {item.label}
                {requiredMark(item.required)}
            </label>
            {renderHint(item, id, item.presentation?.accept ? `Accepted files: ${item.presentation.accept}` : undefined)}
            {renderUswdsErrorMessage(id, errorMessage ?? '')}
            <input
                id={id}
                className="usa-file-input"
                type="file"
                name={item.key}
                data-real-uswds-path={path}
                accept={item.presentation?.accept}
                aria-describedby={describedBy}
                aria-invalid={hasError}
            />
        </div>
    );
}

function renderField(item: FormspecItem, path: string, preset: RenderPreset, blurErrors: Record<string, string>) {
    const id = toId(path);
    const value = preset.values[path];
    const errorMessage = blurErrors[path];

    if (matchesWidgetHint(item, 'select', 'dropdown')) return renderSelect(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'radiogroup', 'radio')) return renderRadioGroup(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'checkbox', 'toggle')) return renderCheckbox(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'checkboxgroup')) return renderCheckboxGroup(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'numberinput')) return renderNumberInput(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'moneyinput')) return renderMoneyInput(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'datepicker')) return renderDatePicker(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'slider')) return renderSlider(item, id, path, value, errorMessage);
    if (matchesWidgetHint(item, 'fileupload')) return renderFileUpload(item, id, path, errorMessage);
    if (matchesWidgetHint(item, 'autocomplete')) return renderComboBox(item, id, path, value, errorMessage);

    return renderTextInput(item, id, path, value, errorMessage);
}

function RealUswdsRepeatableGroup({
    item,
    path,
    preset,
    blurErrors,
}: {
    item: FormspecItem;
    path: string;
    preset: RenderPreset;
    blurErrors: Record<string, string>;
}) {
    const repeatCount = preset.repeats[path] ?? Math.max(1, item.minRepeat ?? 1);
    const groupLabel = item.label || path;

    return (
        <div className="real-uswds-repeat">
            <div className="real-uswds-repeat__list">
                {Array.from({ length: repeatCount }).map((_, index) => {
                    const instancePath = `${path}[${index}]`;
                    return (
                        <div
                            key={instancePath}
                            className="real-uswds-repeat__instance"
                            role="group"
                            aria-label={`${groupLabel} ${index + 1} of ${repeatCount}`}
                        >
                            <div className="real-uswds-repeat__header">
                                <p className="real-uswds-repeat__label">{`${groupLabel} ${index + 1}`}</p>
                                {repeatCount > 1 ? (
                                    <button className="usa-button usa-button--unstyled" type="button">
                                        Remove {groupLabel}
                                    </button>
                                ) : null}
                            </div>
                            <div className="real-uswds-repeat__fields">
                                {renderItems(item.children ?? [], instancePath, preset, blurErrors)}
                            </div>
                        </div>
                    );
                })}
            </div>
            <button className="usa-button usa-button--outline real-uswds-repeat__add" type="button">
                Add {groupLabel}
            </button>
        </div>
    );
}

function renderGroup(item: FormspecItem, path: string, preset: RenderPreset, blurErrors: Record<string, string>) {
    if (item.repeatable) {
        return <RealUswdsRepeatableGroup key={path} item={item} path={path} preset={preset} blurErrors={blurErrors} />;
    }
    return (
        <fieldset className="usa-fieldset" key={path}>
            <legend className="usa-legend">{item.label}</legend>
            {renderItems(item.children ?? [], path, preset, blurErrors)}
        </fieldset>
    );
}

function renderItems(items: FormspecItem[], parentPath: string, preset: RenderPreset, blurErrors: Record<string, string>): React.ReactNode[] {
    return items.flatMap((item) => {
        const path = parentPath ? `${parentPath}.${item.key}` : item.key;

        if (item.relevant && preset.values.hasOther !== true && item.key === 'otherDetail') {
            return [];
        }

        if (item.type === 'display') {
            const node = renderDisplayItem(item, path);
            return node ? [node] : [];
        }

        if (item.type === 'group') return [renderGroup(item, path, preset, blurErrors)];
        if (item.type === 'field') {
            return [<React.Fragment key={path}>{renderField(item, path, preset, blurErrors)}</React.Fragment>];
        }

        return [];
    });
}

function renderValidationSummary(blurFieldErrors: Record<string, string>) {
    const entries = Object.entries(blurFieldErrors);
    if (entries.length === 0) return null;

    const n = entries.length;
    const intro =
        n === 1 ? 'There is 1 error on this form.' : `There are ${n} errors on this form.`;

    return (
        <div className="usa-alert usa-alert--error margin-bottom-2" role="alert">
            <div className="usa-alert__body">
                <h3 className="usa-alert__heading">Please correct the following</h3>
                <p className="usa-alert__text">{intro}</p>
                <ul className="usa-list">
                    {entries.map(([p, message]) => (
                        <li key={p}>{message}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function findItemByPath(items: FormspecItem[], path: string): FormspecItem | null {
    const segments: string[] = [];
    for (const segment of path.split('.')) {
        const m = /^(\w+)\[(\d+)\]$/.exec(segment);
        if (m) {
            segments.push(m[1]);
        } else {
            segments.push(segment);
        }
    }

    let currentItems = items;
    let found: FormspecItem | null = null;

    for (const part of segments) {
        found = currentItems.find((item) => item.key === part) ?? null;
        if (!found) return null;
        currentItems = found.children ?? [];
    }

    return found;
}

/**
 * Blur-time validation for the Real USWDS pane (mirrors preset demos + required/constraint where defined).
 * Story-only harness: `constraint` checks use substring heuristics (`includes`), not Formspec or USWDS normative rules.
 */
function computeRealUswdsBlurError(
    path: string,
    el: HTMLElement,
    item: FormspecItem | null,
    preset: RenderPreset,
    form: HTMLFormElement | null,
): string | undefined {
    if (!item || item.type === 'display') return undefined;

    if (matchesWidgetHint(item, 'radiogroup', 'radio')) {
        const name = item.key;
        const anyChecked = form?.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`);
        if (item.required && !anyChecked) {
            return `${item.label ?? 'This field'} is required`;
        }
        return undefined;
    }

    if (matchesWidgetHint(item, 'checkboxgroup')) {
        const boxes = form?.querySelectorAll<HTMLInputElement>(
            `input[type="checkbox"][name="${CSS.escape(item.key)}"]`,
        );
        let n = 0;
        boxes?.forEach((cb) => {
            if (cb.checked) n += 1;
        });
        if (item.required && n === 0) {
            return `${item.label ?? 'This field'} is required`;
        }
        return undefined;
    }

    let raw = '';
    let isEmpty = true;

    if (el instanceof HTMLTextAreaElement) {
        raw = el.value;
        isEmpty = !raw.trim();
    } else if (el instanceof HTMLSelectElement) {
        raw = el.value;
        isEmpty = !String(raw).trim();
    } else if (el instanceof HTMLInputElement) {
        const t = el.type;
        if (t === 'checkbox') {
            isEmpty = !el.checked;
            raw = el.checked ? 'true' : '';
        } else if (t === 'file') {
            isEmpty = !el.files?.length;
            raw = '';
        } else if (t === 'range') {
            isEmpty = false;
            raw = el.value;
        } else {
            raw = el.value;
            isEmpty = !String(raw).trim();
        }
    } else {
        return undefined;
    }

    if (path in preset.errors && String(raw) === String(preset.values[path] ?? '')) {
        return preset.errors[path];
    }

    if (item.constraintMessage && item.constraint) {
        const v = String(raw).trim();
        const len = v.length;
        const c = item.constraint;
        if (c.includes('>= 8') && len > 0 && len < 8) return item.constraintMessage;
        if (c.includes('>= 3') && c.includes('<= 20') && len > 0 && (len < 3 || len > 20)) {
            return item.constraintMessage;
        }
    }

    if (item.required) {
        if (el instanceof HTMLInputElement && el.type === 'checkbox') {
            if (!el.checked) return `${item.label ?? 'This field'} is required`;
        } else if (isEmpty && !(el instanceof HTMLInputElement && el.type === 'range')) {
            return `${item.label ?? 'This field'} is required`;
        }
    }

    return undefined;
}

function handleRealUswdsFormBlur(
    e: React.FocusEvent<HTMLFormElement>,
    definition: any,
    preset: RenderPreset,
    setBlurFieldErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const path = t.getAttribute('data-real-uswds-path');
    if (!path) return;

    const items = Array.isArray(definition?.items) ? (definition.items as FormspecItem[]) : [];
    const item = findItemByPath(items, path);
    const form = e.currentTarget;
    const msg = computeRealUswdsBlurError(path, t, item, preset, form);

    setBlurFieldErrors((prev) => {
        const next = { ...prev };
        if (msg) next[path] = msg;
        else delete next[path];
        return next;
    });
}

function renderBoundField(
    definition: any,
    bind: string,
    preset: RenderPreset,
    blurErrors: Record<string, string>,
    widgetHintOverride?: string,
) {
    const item = findItemByPath(Array.isArray(definition?.items) ? definition.items : [], bind);
    if (!item) return null;
    const patchedItem = widgetHintOverride
        ? {
            ...item,
            presentation: {
                ...(item.presentation ?? {}),
                widgetHint: widgetHintOverride,
            },
        }
        : item;
    return (
        <React.Fragment key={bind}>
            {renderField(patchedItem, bind, preset, blurErrors)}
        </React.Fragment>
    );
}

function renderCard(title: string, body: React.ReactNode) {
    return (
        <div className="usa-card">
            <div className="usa-card__container">
                <div className="usa-card__header">
                    <h2 className="usa-card__heading">{title}</h2>
                </div>
                <div className="usa-card__body">{body}</div>
            </div>
        </div>
    );
}

function flattenRenderableChildren(children: React.ReactNode): React.ReactNode[] {
    return React.Children.toArray(children).flatMap((child) => {
        if (React.isValidElement(child) && child.type === React.Fragment) {
            return React.Children.toArray(child.props.children);
        }
        return [child];
    });
}

function renderRealUswdsGrid(children: React.ReactNode, columns = 2, rowGap?: string) {
    const n = Math.max(1, Math.floor(columns));
    const cellClass =
        [2, 3, 4, 6].includes(n) ? `grid-col-12 tablet:grid-col-${12 / n}` : 'grid-col-12 tablet:grid-col-fill';
    const kids = flattenRenderableChildren(children);
    return (
        <div
            className="grid-row grid-gap real-uswds-grid"
            style={rowGap ? { rowGap } : undefined}
        >
            {kids.map((child, index) => (
                <div key={index} className={cellClass}>
                    {child}
                </div>
            ))}
        </div>
    );
}

function renderRealUswdsStack(children: React.ReactNode, gap = '16px') {
    const kids = flattenRenderableChildren(children);
    return (
        <div
            className="grid-row grid-gap real-uswds-stack"
            style={{ ['--real-uswds-stack-gap' as any]: gap }}
        >
            {kids.map((child, index) => (
                <div key={index} className="grid-col-12">
                    {child}
                </div>
            ))}
        </div>
    );
}

function renderAccordion(
    items: Array<{ title: string; content: React.ReactNode }>,
    options?: {
        allowMultiple?: boolean;
        idBase?: string;
        openIndices?: number[];
    },
) {
    const allowMultiple = options?.allowMultiple ?? false;
    const idBase = options?.idBase ?? 'accordion';
    const openIndices = new Set(
        options?.openIndices ?? (allowMultiple ? items.map((_, index) => index) : [0]),
    );

    return (
        <div className="usa-accordion" {...(allowMultiple ? { 'data-allow-multiple': 'true' } : {})}>
            {items.map((item, index) => {
                const contentId = `${idBase}-${index}`;
                const isOpen = openIndices.has(index);
                return (
                    <React.Fragment key={contentId}>
                        <h4 className="usa-accordion__heading">
                            <button
                                type="button"
                                className="usa-accordion__button"
                                aria-expanded={isOpen ? 'true' : 'false'}
                                aria-controls={contentId}
                            >
                                {item.title}
                            </button>
                        </h4>
                        <div id={contentId} className="usa-accordion__content usa-prose" hidden={!isOpen}>
                            {item.content}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

/** Adapter parity demo; USWDS guidance discourages complex forms inside modals (use sparingly). */
function renderModalDemo(definition: any, preset: RenderPreset, blurErrors: Record<string, string>) {
    return (
        <div>
            <button type="button" className="usa-button" aria-controls="real-uswds-modal" data-open-modal>
                Add More Details
            </button>
            <div className="usa-modal usa-modal--lg" id="real-uswds-modal" aria-labelledby="real-uswds-modal-heading" aria-describedby="real-uswds-modal-description">
                <div className="usa-modal__content">
                    <div className="usa-modal__main">
                        <h2 className="usa-modal__heading" id="real-uswds-modal-heading">Additional Details</h2>
                        <div className="usa-prose">
                            <p id="real-uswds-modal-description">Provide the contact details that do not fit in the main form.</p>
                        </div>
                        <div style={{ marginTop: '1rem' }}>
                            {renderRealUswdsStack(
                                <>
                                    {renderBoundField(definition, 'email', preset, blurErrors)}
                                    {renderBoundField(definition, 'phone', preset, blurErrors)}
                                </>,
                                '16px',
                            )}
                        </div>
                        <div className="usa-modal__footer">
                            <ul className="usa-button-group">
                                <li className="usa-button-group__item">
                                    <button type="button" className="usa-button" data-close-modal>Done</button>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <button type="button" className="usa-button usa-modal__close" aria-label="Close this window" data-close-modal>
                        <svg className="usa-icon" aria-hidden="true" focusable="false" role="img">
                            <use href="/assets/img/sprite.svg#close"></use>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}

function renderWizardDemo(definition: any, preset: RenderPreset, blurErrors: Record<string, string>) {
    const activeLabelId = 'real-uswds-wizard-step-1-label';

    return (
        <div className="real-uswds-wizard">
            <div className="real-uswds-wizard__content">
                <nav className="usa-step-indicator" aria-label="Form progress">
                    <ol className="usa-step-indicator__segments">
                        <li className="usa-step-indicator__segment usa-step-indicator__segment--current">
                            <span className="usa-step-indicator__segment-label">Personal Info</span>
                        </li>
                        <li className="usa-step-indicator__segment">
                            <span className="usa-step-indicator__segment-label">Contact</span>
                        </li>
                    </ol>
                    <div className="usa-step-indicator__header">
                        <h4 className="usa-step-indicator__heading">
                            <span className="usa-step-indicator__heading-counter">
                                <span className="usa-sr-only">Step</span>
                                <span className="usa-step-indicator__current-step">1</span>
                                <span className="usa-step-indicator__total-steps"> of 2</span>
                            </span>
                            <span className="usa-step-indicator__heading-text">Personal Info</span>
                        </h4>
                    </div>
                </nav>
                <div
                    className="real-uswds-wizard__panel"
                    role="region"
                    aria-labelledby={activeLabelId}
                >
                    <h2 id={activeLabelId} className="usa-step-indicator__heading real-uswds-wizard__panel-heading">
                        Personal Info
                    </h2>
                    {renderBoundField(definition, 'firstName', preset, blurErrors)}
                    {renderBoundField(definition, 'lastName', preset, blurErrors)}
                </div>
                <div className="usa-button-group real-uswds-wizard__nav">
                    <button className="usa-button usa-button--outline" type="button" disabled>Previous</button>
                    <button className="usa-button" type="button">Next</button>
                </div>
            </div>
        </div>
    );
}

function TabsDemo({ definition, preset, blurErrors }: { definition: any, preset: RenderPreset, blurErrors: Record<string, string> }) {
    const [activeTab, setActiveTab] = useState(0);

    return (
        <div className="real-uswds-tabs">
            <ul className="usa-button-group usa-button-group--segmented" role="tablist">
                <li className="usa-button-group__item">
                    <button 
                        type="button" 
                        className={`usa-button ${activeTab === 0 ? '' : 'usa-button--outline'}`}
                        onClick={() => setActiveTab(0)}
                        role="tab"
                        aria-selected={activeTab === 0}
                    >
                        Personal
                    </button>
                </li>
                <li className="usa-button-group__item">
                    <button 
                        type="button" 
                        className={`usa-button ${activeTab === 1 ? '' : 'usa-button--outline'}`}
                        onClick={() => setActiveTab(1)}
                        role="tab"
                        aria-selected={activeTab === 1}
                    >
                        Contact
                    </button>
                </li>
            </ul>
            <div className="real-uswds-tabs__panels">
                <div role="tabpanel" style={{ display: activeTab === 0 ? 'block' : 'none' }}>
                    {renderRealUswdsStack(
                        <>
                            {renderBoundField(definition, 'firstName', preset, blurErrors)}
                            {renderBoundField(definition, 'lastName', preset, blurErrors)}
                        </>,
                        '12px',
                    )}
                </div>
                <div role="tabpanel" style={{ display: activeTab === 1 ? 'block' : 'none' }}>
                    {renderRealUswdsStack(
                        <>
                            {renderBoundField(definition, 'email', preset, blurErrors)}
                            {renderBoundField(definition, 'phone', preset, blurErrors)}
                        </>,
                        '12px',
                    )}
                </div>
            </div>
        </div>
    );
}

function renderComponentDocumentUswds(
    definition: any,
    componentDocument: any,
    blurErrors: Record<string, string>,
) {
    const items = Array.isArray(definition?.items) ? definition.items as FormspecItem[] : [];
    const preset = getRealUswdsPreset(definition);
    const rootChildren = Array.isArray(componentDocument?.tree?.children) ? componentDocument.tree.children : [];

    switch (componentDocument?.name) {
    case 'contact-grid': {
        const contactGrid = rootChildren.find((child) => child?.component === 'Grid');
        const contactGridColumns =
            typeof contactGrid?.columns === 'number' ? contactGrid.columns : 2;
        const contactGridRowGap =
            typeof contactGrid?.rowGap === 'string'
                ? contactGrid.rowGap
                : typeof contactGrid?.gap === 'string'
                    ? contactGrid.gap
                    : undefined;
        return (
            <div>
                {renderCard('Contact Information', renderRealUswdsGrid(
                    <>
                        {renderBoundField(definition, 'firstName', preset, blurErrors)}
                        {renderBoundField(definition, 'lastName', preset, blurErrors)}
                        {renderBoundField(definition, 'email', preset, blurErrors)}
                        {renderBoundField(definition, 'phone', preset, blurErrors)}
                    </>,
                    contactGridColumns,
                    contactGridRowGap,
                ))}
            </div>
        );
    }
    case 'grouped-cards':
        return renderRealUswdsStack(
            <>
                {renderCard('Personal Information', renderRealUswdsGrid(
                    <>
                        {renderBoundField(definition, 'personal.name', preset, blurErrors)}
                        {renderBoundField(definition, 'personal.email', preset, blurErrors)}
                    </>,
                ))}
                {renderCard('Preferences', (
                    <>
                        {renderBoundField(definition, 'preferences.newsletter', preset, blurErrors, 'Toggle')}
                        {renderBoundField(definition, 'preferences.debug', preset, blurErrors, 'Toggle')}
                        {renderBoundField(definition, 'preferences.timeout', preset, blurErrors, 'NumberInput')}
                    </>
                ))}
            </>,
            '24px',
        );
    case 'collapsible-demo':
        return renderAccordion([
            {
                title: 'Personal Details',
                content: renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'firstName', preset, blurErrors)}
                        {renderBoundField(definition, 'lastName', preset, blurErrors)}
                    </>,
                    '12px',
                ),
            },
            {
                title: 'Contact Information',
                content: renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'email', preset, blurErrors)}
                        {renderBoundField(definition, 'phone', preset, blurErrors)}
                    </>,
                    '12px',
                ),
            },
        ], { allowMultiple: true, idBase: 'collapsible', openIndices: [0] });
    case 'accordion-demo':
        return renderAccordion([
            {
                title: 'Personal Details',
                content: renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'firstName', preset, blurErrors)}
                        {renderBoundField(definition, 'lastName', preset, blurErrors)}
                    </>,
                    '12px',
                ),
            },
            {
                title: 'Contact Information',
                content: renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'email', preset, blurErrors)}
                        {renderBoundField(definition, 'phone', preset, blurErrors)}
                    </>,
                    '12px',
                ),
            },
        ], { idBase: 'accordion', openIndices: [0] });
    case 'accordion-multi-demo':
        return renderAccordion([
            {
                title: 'Personal Details',
                content: renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'firstName', preset, blurErrors)}
                        {renderBoundField(definition, 'lastName', preset, blurErrors)}
                    </>,
                    '12px',
                ),
            },
            {
                title: 'Contact Information',
                content: renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'email', preset, blurErrors)}
                        {renderBoundField(definition, 'phone', preset, blurErrors)}
                    </>,
                    '12px',
                ),
            },
            {
                title: 'Preferences',
                content: renderRealUswdsStack(
                    renderBoundField(definition, 'newsletter', preset, blurErrors, 'Toggle'),
                    '12px',
                ),
            },
        ], { allowMultiple: true, idBase: 'accordion-multi', openIndices: [0] });
    case 'panel-demo':
        return (
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                <div style={{ margin: 0 }}>
                    {renderCard('Help', <p style={{ margin: 0 }}>Fill in your contact details. All fields are optional unless marked required.</p>)}
                </div>
                <div>
                    {renderRealUswdsStack(
                        <>
                            {renderBoundField(definition, 'firstName', preset, blurErrors)}
                            {renderBoundField(definition, 'lastName', preset, blurErrors)}
                            {renderBoundField(definition, 'email', preset, blurErrors)}
                            {renderBoundField(definition, 'phone', preset, blurErrors)}
                        </>,
                        '12px',
                    )}
                </div>
            </div>
        );
    case 'modal-demo':
        return (
            <>
                {renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'firstName', preset, blurErrors)}
                        {renderBoundField(definition, 'lastName', preset, blurErrors)}
                    </>,
                    '16px',
                )}
                {renderModalDemo(definition, preset, blurErrors)}
            </>
        );
    case 'popover-demo':
        return (
            <>
                {renderRealUswdsStack(
                    <>
                        {renderBoundField(definition, 'firstName', preset, blurErrors)}
                        {renderBoundField(definition, 'lastName', preset, blurErrors)}
                    </>,
                    '16px',
                )}
                <div style={{ marginTop: '1rem' }}>
                    <button
                        type="button"
                        className="usa-button usa-button--outline usa-tooltip"
                        data-position="right"
                        title="Enter your legal first and last name as they appear on official documents."
                    >
                        Need help?
                    </button>
                </div>
            </>
        );
    case 'wizard-demo':
        return renderWizardDemo(definition, preset, blurErrors);
    case 'tabs-demo':
        return <TabsDemo definition={definition} preset={preset} blurErrors={blurErrors} />;
    default:
        break;
    }

    const displayOnly = items.length > 0 && items.every((item) => item.type === 'display');
    const renderedItems = renderItems(items, '', preset, blurErrors);

    return (
        <>
            {renderValidationSummary(blurErrors)}
            {displayOnly ? renderRealUswdsStack(renderedItems, '24px') : renderRealUswdsStack(renderedItems, '16px')}
        </>
    );
}

function renderRealUSWDS(
    definition: any,
    componentDocument: any | undefined,
    blurErrors: Record<string, string>,
) {
    return renderComponentDocumentUswds(definition, componentDocument ?? null, blurErrors);
}

function usesWideRealUswdsShell(componentDocument?: any) {
    return [
        'contact-grid',
        'grouped-cards',
        'collapsible-demo',
        'accordion-demo',
        'accordion-multi-demo',
        'panel-demo',
        'modal-demo',
        'popover-demo',
        'wizard-demo',
        'tabs-demo',
    ].includes(componentDocument?.name ?? '');
}

function definitionHasRepeatableGroups(items: FormspecItem[]): boolean {
    return items.some((item) => item.repeatable || definitionHasRepeatableGroups(item.children ?? []));
}

function collectBehaviorNames(items: FormspecItem[], names: Set<string>) {
    items.forEach((item) => {
        const widgetHint = normalizeWidgetHint(item);
        if (widgetHint === 'datepicker') names.add('datePicker');
        if (widgetHint === 'slider') names.add('range');
        if (widgetHint === 'fileupload') names.add('fileInput');
        if (widgetHint === 'autocomplete') names.add('comboBox');
        if (item.children?.length) collectBehaviorNames(item.children, names);
    });
}

async function loadBehaviorsForDefinition(definition: any, componentDocument?: any): Promise<USWDSBehavior[]> {
    const names = new Set<string>();
    collectBehaviorNames(Array.isArray(definition?.items) ? definition.items : [], names);
    if (componentDocument?.name === 'modal-demo') {
        names.add('modal');
    }
    if (componentDocument?.name === 'popover-demo') {
        names.add('tooltip');
    }
    const loaders: Array<Promise<unknown>> = [];
    // Repeat Group uses `.usa-accordion` markup but must not load `usa-accordion` JS: `toggle.js`
    // calls `document.getElementById(aria-controls)`, which does not resolve IDs inside this pane’s
    // shadow root (see `useShadowRoot` + portal). Expansion is handled in React instead.
    for (const name of names) {
        if (name === 'datePicker') loaders.push(import('@uswds/uswds/js/usa-date-picker'));
        else if (name === 'range') loaders.push(import('@uswds/uswds/js/usa-range'));
        else if (name === 'fileInput') loaders.push(import('@uswds/uswds/js/usa-file-input'));
        else if (name === 'comboBox') loaders.push(import('@uswds/uswds/js/usa-combo-box'));
        else if (name === 'modal') loaders.push(import('@uswds/uswds/js/usa-modal'));
        else if (name === 'tooltip') loaders.push(import('@uswds/uswds/js/usa-tooltip'));
    }
    const modules = await Promise.all(loaders);
    return modules.map((mod) => (mod as { default?: USWDSBehavior }).default ?? mod) as USWDSBehavior[];
}

function useShadowRoot(stylesheets: string[], inlineStyles: string[]) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
        shadow.replaceChildren();

        stylesheets.forEach((href) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            shadow.appendChild(link);
        });

        inlineStyles.forEach((cssText) => {
            const style = document.createElement('style');
            style.textContent = cssText;
            shadow.appendChild(style);
        });

        const mount = document.createElement('div');
        mount.className = 'story-root';
        shadow.appendChild(mount);
        setMountNode(mount);

        return () => {
            setMountNode(null);
            shadow.replaceChildren();
        };
    }, [inlineStyles, stylesheets]);

    return { hostRef, mountNode };
}

export function RealUSWDSStory({ definition, componentDocument, showSubmit = true, maxWidth = 640 }: RealUSWDSStoryProps) {
    const preset = useMemo(() => getRealUswdsPreset(definition), [definition]);
    const [blurFieldErrors, setBlurFieldErrors] = useState<Record<string, string>>({});
    const items = useMemo(() => (Array.isArray(definition?.items) ? definition.items : []), [definition]);
    const allDisplayOnly = useMemo(
        () => items.length > 0 && items.every((item: { type?: string }) => item.type === 'display'),
        [items],
    );
    const hasRepeatableGroups = useMemo(
        () => definitionHasRepeatableGroups(items),
        [items],
    );

    useEffect(() => {
        setBlurFieldErrors({});
    }, [definition, componentDocument]);

    const rendered = useMemo(
        () => renderRealUSWDS(definition, componentDocument, blurFieldErrors),
        [definition, componentDocument, blurFieldErrors],
    );
    const stylesheets = useMemo(() => [uswdsCssUrl], []);
    const inlineStyles = useMemo(() => [
        `
            :host {
                display: block;
            }
            .story-root,
            .story-root *,
            .story-root *::before,
            .story-root *::after {
                box-sizing: border-box;
            }
            .story-root {
                display: block;
                padding: 0;
                color: #1b1b1b;
            }
            .story-root .usa-card__container {
                margin-left: 0.5rem;
                margin-right: 0.5rem;
            }
            .story-root .usa-card__header {
                padding: 1.5rem 1.5rem 0.5rem;
            }
            .story-root .usa-card__body {
                padding: 0.5rem 1.5rem 1.5rem;
            }
            .real-uswds-grid > [class*='grid-col'] > .usa-form-group,
            .real-uswds-stack > [class*='grid-col'] > .usa-form-group {
                display: flex;
                flex-direction: column;
                margin-top: 0;
            }
            .real-uswds-grid > [class*='grid-col'] > .usa-form-group > .usa-label,
            .real-uswds-stack > [class*='grid-col'] > .usa-form-group > .usa-label {
                margin-top: 0;
            }
            .real-uswds-stack > [class*='grid-col'] + [class*='grid-col'] {
                margin-top: var(--real-uswds-stack-gap, 1rem);
            }
            .real-uswds-repeat {
                display: flex;
                flex-direction: column;
            }
            .real-uswds-repeat__list {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            .real-uswds-repeat__instance {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                padding: 0.9375rem 1rem 1rem;
            }
            .real-uswds-repeat__header {
                align-items: flex-start;
                display: flex;
                gap: 0.75rem;
                justify-content: space-between;
            }
            .real-uswds-repeat__label {
                margin: 0;
            }
            .real-uswds-repeat__header .usa-button {
                margin-top: 0;
            }
            .real-uswds-repeat__fields {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            .real-uswds-repeat__fields > .usa-form-group {
                margin-top: 0;
            }
            .real-uswds-repeat__add {
                align-self: flex-start;
                margin-top: 1rem;
            }
            .real-uswds-tabs__panels {
                padding-top: ${tabsPanelTopPadding};
            }
            .real-uswds-wizard .usa-step-indicator__heading {
                font-size: 1rem;
            }
            .real-uswds-wizard .usa-step-indicator__current-step {
                width: 2rem;
                height: 2rem;
                padding: 0;
                font-size: 0.875rem;
                line-height: 2rem;
            }
            .real-uswds-wizard .usa-step-indicator__heading-text {
                font-weight: 700;
            }
            .real-uswds-wizard__content {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }
            .real-uswds-wizard__panel {
                border: 1px solid #dfe1e2;
                border-radius: 0.25rem;
                max-width: 32rem;
                padding: 1rem;
            }
            .real-uswds-wizard__panel-heading {
                margin-top: 0;
                margin-bottom: 1rem;
            }
            .real-uswds-wizard__nav.usa-button-group {
                align-items: center;
                flex-wrap: wrap;
                justify-content: space-between;
            }
        `,
    ], []);
    const { hostRef, mountNode } = useShadowRoot(stylesheets, inlineStyles);
    const enhancedRootRef = useRef<HTMLDivElement | null>(null);
    const shouldRenderOuterSubmit = showSubmit && componentDocument?.name !== 'wizard-demo';
    const formClassName = useMemo(
        () =>
            [
                'usa-form',
                'usa-form--large',
                usesWideRealUswdsShell(componentDocument) || allDisplayOnly || hasRepeatableGroups ? 'maxw-none' : '',
            ]
                .filter(Boolean)
                .join(' '),
        [allDisplayOnly, componentDocument, hasRepeatableGroups],
    );

    useEffect(() => {
        if (!enhancedRootRef.current) return;

        let cancelled = false;

        void loadBehaviorsForDefinition(definition, componentDocument).then((behaviors) => {
            if (cancelled || !enhancedRootRef.current) return;
            behaviors.forEach((behavior) => {
                behavior.off?.(enhancedRootRef.current as ParentNode);
                behavior.on?.(enhancedRootRef.current as ParentNode);
            });
        });

        return () => {
            cancelled = true;
        };
    }, [definition, componentDocument, mountNode]);

    return (
        <div style={{ ...paneStyle, maxWidth }}>
            <div ref={hostRef} />
            {mountNode ? createPortal(
                <div ref={enhancedRootRef}>
                    <form
                        className={formClassName}
                        onBlurCapture={(e) => handleRealUswdsFormBlur(e, definition, preset, setBlurFieldErrors)}
                    >
                        {definition?.title ? <h2 className={allDisplayOnly ? undefined : 'usa-sr-only'}>{definition.title}</h2> : null}
                        {rendered}
                        {shouldRenderOuterSubmit ? (
                            <button className="usa-button" type="submit" style={{ marginTop: '1.5rem' }}>
                                Submit
                            </button>
                        ) : null}
                    </form>
                </div>,
                mountNode,
            ) : null}
        </div>
    );
}
