/** @filedesc RadioGroup and CheckboxGroup option lists (fieldset children). */
import React from 'react';
import type { FieldComponentProps } from '../../component-map';

/** Renders radio/checkbox group options (ARIA matches default web component adapter). */
export function GroupControl({
    field,
    node,
    isReadonly,
    labelId,
    groupSupplementaryDescribedBy,
}: {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    isReadonly: boolean;
    labelId: string;
    groupSupplementaryDescribedBy: string | undefined;
}) {
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
