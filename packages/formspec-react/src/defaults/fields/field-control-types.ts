/** @filedesc Shared prop types for default field control renderers. */
import type { FieldComponentProps } from '../../component-map';

export type ExtensionAttrs = {
    placeholder?: string;
    inputMode?: string;
    autoComplete?: string;
    maxLength?: number;
    pattern?: string;
    type?: string;
};

/** ARIA + identity attrs shared by native inputs and combobox. */
export type CommonInputAttrs = {
    id: string;
    name: string;
    'aria-describedby'?: string;
    'aria-invalid': boolean;
    'aria-required': boolean | undefined;
    required: boolean | undefined;
    'aria-disabled': boolean | undefined;
    onBlur: () => void;
    autoComplete?: string;
    placeholder?: string;
};

export interface CommonInputProps {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    common: CommonInputAttrs;
    isReadonly: boolean;
}

export type ResolvePlaceholder = (componentPlaceholder?: string) => string | undefined;
