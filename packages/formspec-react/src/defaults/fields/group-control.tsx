/** @filedesc RadioGroup and CheckboxGroup option lists (fieldset children). */
import React from 'react';
import type { FieldComponentProps } from '../../component-map';
import { needTraceAttrs } from '../../projection-metadata.js';
import { useChromeText } from '../../use-chrome-text';

/**
 * `readonly` has no effect on radios or checkboxes. While read-only, cancel the click that would change an option
 * (label clicks and keyboard selection dispatch one too) so the DOM keeps its state, and each onChange (which React
 * fires from that click) ignores it: options stay enabled, focusable, and announced read-only, but the value cannot
 * change (core §4.3 Bind `readonly`). Same guard as webcomponent bindSharedFieldEffects.
 */
function blockReadonlyChange(event: React.MouseEvent<HTMLElement>): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox')) {
        event.preventDefault();
    }
}

/**
 * Renders radio/checkbox group options (ARIA matches the webcomponent adapters). A radiogroup carries required,
 * invalid, and read-only state (WAI-ARIA radiogroup supports all three). A checkbox `group` supports neither
 * aria-required nor aria-readonly: it carries aria-invalid, each checkbox aria-readonly, and DefaultField's legend
 * says "required".
 */
export function GroupControl({
    field,
    node,
    isReadonly,
    invalid,
    labelId,
    describedBy,
}: {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    isReadonly: boolean;
    invalid: boolean;
    labelId: string;
    describedBy: string | undefined;
}) {
    const chrome = useChromeText();
    const onClickCapture = isReadonly ? blockReadonlyChange : undefined;

    if (node.component === 'RadioGroup') {
        const orientation = node.props?.orientation as string | undefined;
        return (
            <div
                className="formspec-radio-group"
                role="radiogroup"
                aria-labelledby={labelId}
                aria-required={field.required}
                aria-invalid={invalid}
                aria-readonly={isReadonly}
                {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                {...(orientation === 'horizontal' ? { 'data-orientation': 'horizontal' as const } : {})}
                onClickCapture={onClickCapture}
            >
                {field.options.map((opt) => (
                    <label key={opt.value} {...needTraceAttrs(opt.needAnchors)}>
                        <input
                            type="radio"
                            name={field.path}
                            value={opt.value}
                            checked={field.value === opt.value}
                            onChange={() => {
                                if (isReadonly) return;
                                field.setValue(opt.value);
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
            aria-invalid={invalid}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            style={columnStyle}
            {...dataColumns}
            onClickCapture={onClickCapture}
        >
            {selectAll && (
                <label className="formspec-select-all" data-select-all>
                    <input
                        type="checkbox"
                        aria-label={chrome('select.selectAll')}
                        aria-readonly={isReadonly}
                        checked={allSelected}
                        onChange={(e) => {
                            if (isReadonly) return;
                            field.setValue(e.target.checked ? [...allValues] : []);
                            field.touch();
                        }}
                    />
                    {chrome('select.selectAll')}
                </label>
            )}
            {field.options.map((opt) => (
                <label key={opt.value} {...needTraceAttrs(opt.needAnchors)}>
                    <input
                        type="checkbox"
                        name={field.path}
                        value={opt.value}
                        aria-readonly={isReadonly}
                        checked={current.includes(opt.value)}
                        onChange={(e) => {
                            if (isReadonly) return;
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
