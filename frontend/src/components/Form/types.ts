import { ReactNode } from "react";
import type { PopoverProps } from "../help/Popover";

export interface BaseFieldProps {
    /** Unique identifier for the field, used to link label and input */
    id: string;
    /** Name attribute for the form field */
    name: string;
    /** Visible label text */
    label: string;
    /** Optional validation error message */
    error?: string;
    /** Optional help text displayed below the input */
    helperText?: string;
    /** Whether the field is required */
    required?: boolean;
    /** Whether the field is disabled */
    disabled?: boolean;
    /** Whether the field is in a loading state */
    loading?: boolean;
    /** Optional additional CSS classes */
    className?: string;
    /**
     * When provided, renders a HelpIcon next to the label that opens an inline
     * help popover with contextual copy.
     */
    helpContent?: ReactNode;
    /** Optional title for the help popover */
    helpTitle?: string;
    /** Optional "learn more" link for the help popover */
    helpLink?: PopoverProps["link"];
}

export interface SelectOption {
    value: string | number;
    label: string;
    disabled?: boolean;
}

export interface RadioOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface FormGroupProps extends BaseFieldProps {
    children: ReactNode;
}
