/** @filedesc Shared native select structure, skin and focus treatment for all respondent controls. */
'use client';
import React from 'react';

export interface NativeSelectControlProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    afterControl?: React.ReactNode;
}

/** A semantic native select using the maintained wrapper and input primitives. */
export function NativeSelectControl({ children, afterControl, className, ...props }: NativeSelectControlProps) {
    return <div className="formspec-select-wrapper">
        <select {...props} className={`formspec-input formspec-select-native${className ? ` ${className}` : ''}`}>{children}</select>
        {afterControl}
    </div>;
}
