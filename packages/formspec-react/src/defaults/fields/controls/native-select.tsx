/** @filedesc Shared native select structure, skin and early value commit for respondent controls. */
'use client';
import React from 'react';
import { useNativeSelect } from '../../../use-native-select';

export interface NativeSelectControlProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'onInput'> {
    afterControl?: React.ReactNode;
    onValueChange?: (value: string) => void;
}

/** Commit before a host's bubbling input handler can rerender the old controlled value. */
export function NativeSelectControl({ children, afterControl, className, onValueChange, ...props }: NativeSelectControlProps) {
    const select = useNativeSelect(onValueChange);
    return <div className="formspec-select-wrapper">
        <select {...props} {...select}
            className={`formspec-input formspec-select-native${className ? ` ${className}` : ''}`}>{children}</select>
        {afterControl}
    </div>;
}
