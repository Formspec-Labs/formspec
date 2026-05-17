/** @filedesc Searchable/multi Select combobox (WAI-ARIA listbox). */
'use client';
import { optionMatchesComboboxQuery } from '@formspec-org/engine';
import React, { useMemo, useRef, useEffect, useState } from 'react';
import type { CommonInputProps } from '../field-control-types';

function comboboxValuePresent(v: unknown): boolean {
    return v != null && v !== '';
}

export function ComboboxSelect({ field, node, common, isReadonly }: Pick<CommonInputProps, 'field' | 'node' | 'common' | 'isReadonly'>) {
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
