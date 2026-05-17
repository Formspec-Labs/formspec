/** @filedesc Rating stars/hearts with keyboard and half-step support. */
'use client';
import React from 'react';
import type { FieldComponentProps } from '../../../component-map';

const RATING_ICON_MAP: Record<string, [string, string]> = {
    star: ['\u2605', '\u2606'],
    heart: ['\u2665', '\u2661'],
    circle: ['\u25cf', '\u25cb'],
};

function resolveRatingIcons(icon?: string): [string, string] {
    if (!icon) return RATING_ICON_MAP.star;
    return RATING_ICON_MAP[icon] || [icon, icon];
}

export function RatingControl({
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
