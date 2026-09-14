/** @filedesc Accessible character count for TextInput theme widgetConfig.maxLength (a display, not a hard cap). */
'use client';
import React, { useEffect, useState } from 'react';

/** Count copy (USWDS usa-character-count wording). */
function characterCountStatus(length: number, maxLength: number): string {
    if (length === 0) return `${maxLength} characters allowed`;
    const remaining = maxLength - length;
    const count = Math.abs(remaining);
    return `${count} character${count === 1 ? '' : 's'} ${remaining < 0 ? 'over limit' : 'left'}`;
}

/** Id of the sr-only limit message; the control's aria-describedby must name it. */
export const characterCountInfoId = (fieldId: string) => `${fieldId}-count-info`;

/**
 * Theme `widgetConfig.maxLength` (theme §4.2): an sr-only limit message (linked from the control's
 * aria-describedby), a visual status (aria-hidden), and a polite live status updated after a 1s typing
 * pause. Same markup and copy as the default webcomponent TextInput adapter.
 */
export function CharacterCount({ fieldId, length, maxLength }: { fieldId: string; length: number; maxLength: number }) {
    const status = characterCountStatus(length, maxLength);
    const [announced, setAnnounced] = useState(status);
    useEffect(() => {
        const timer = setTimeout(() => setAnnounced(status), 1000);
        return () => clearTimeout(timer);
    }, [status]);

    return (
        <>
            <span id={characterCountInfoId(fieldId)} className="formspec-sr-only">
                {`You can enter up to ${maxLength} characters`}
            </span>
            <p
                className={`formspec-hint formspec-character-count${length > maxLength ? ' formspec-character-count--over-limit' : ''}`}
                aria-hidden="true"
            >
                {status}
            </p>
            <div className="formspec-sr-only formspec-character-count-sr-status" aria-live="polite">{announced}</div>
        </>
    );
}
