/** @filedesc Reusable wrapper for stories that render a single Formspec definition. */
import React, { useMemo, useState } from 'react';
import { FormspecForm } from '@formspec-org/react';
import type { SubmitResult, ComponentMap } from '@formspec-org/react';
import { createDemoSubmitResponseActions } from '@formspec-org/engine';

export interface FormStoryProps {
    /** The Formspec definition JSON. */
    definition: any;
    /** Optional theme document. */
    theme?: any;
    /** Optional component map overrides. */
    components?: ComponentMap;
    /** Optional component document for layout planning. */
    componentDocument?: any;
    /** Optional initial data. */
    initialData?: Record<string, any>;
    /** Whether to show a submit button. Defaults to true. */
    showSubmit?: boolean;
    /** Optional className on the form container. */
    className?: string;
}

/** Renders a FormspecForm with an optional submit result panel. */
export function FormStory({
    definition,
    theme,
    components,
    componentDocument,
    initialData,
    showSubmit = true,
    className,
}: FormStoryProps) {
    const [result, setResult] = useState<SubmitResult | null>(null);
    const responseActionsDocument = useMemo(
        () => (showSubmit && definition?.url
            ? createDemoSubmitResponseActions({ definitionUrl: definition.url })
            : undefined),
        [definition?.url, showSubmit],
    );

    return (
        <div>
            <FormspecForm
                definition={definition}
                themeDocument={theme}
                components={components}
                componentDocument={componentDocument}
                initialData={initialData}
                responseActionsDocument={responseActionsDocument}
                onSubmit={showSubmit ? setResult : undefined}
                className={className}
            />
            {result && (
                <details style={{ marginTop: 16 }}>
                    <summary>
                        {result.validationReport?.valid ? 'Valid' : 'Invalid'} — Submit Result
                    </summary>
                    <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: 300 }}>
                        {JSON.stringify(result, null, 2)}
                    </pre>
                </details>
            )}
        </div>
    );
}
