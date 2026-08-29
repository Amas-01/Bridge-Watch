import React, { type ReactNode } from "react";
import HelpIcon from "../help/HelpIcon";
import type { PopoverProps } from "../help/Popover";

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    /** The text to display in the label */
    children: React.ReactNode;
    /** Whether the field is required, which will render a required indicator */
    required?: boolean;
    /** Whether the field is disabled, affecting label styling */
    disabled?: boolean;
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

/**
 * Accessible label component for form fields.
 * Links to the associated input via the `htmlFor` prop, which must match the input's `id`.
 * Optionally renders an inline help popover via `helpContent`.
 */
export function FormLabel({
    children,
    required,
    disabled,
    helpContent,
    helpTitle,
    helpLink,
    className = "",
    ...props
}: FormLabelProps) {
    return (
        <label
            className={`flex items-center gap-1.5 text-sm font-medium mb-1.5 transition-colors
        ${disabled ? "text-stellar-text-secondary opacity-60 cursor-not-allowed" : "text-stellar-text-primary"}
        ${className}`}
            {...props}
        >
            <span>
                {children}
                {required && (
                    <span className="text-red-500 ml-1" aria-hidden="true">
                        *
                    </span>
                )}
            </span>
            {helpContent && (
                <HelpIcon
                    content={helpContent}
                    title={helpTitle}
                    link={helpLink}
                    placement="auto"
                />
            )}
        </label>
    );
}
