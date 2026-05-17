/** @filedesc Signature pad canvas with clear control. */
'use client';
import React, { useRef, useEffect } from 'react';
import type { FieldComponentProps } from '../../../component-map';

export function SignatureControl({
    field,
    node,
    supplementaryDescribedBy,
}: {
    field: FieldComponentProps['field'];
    node: FieldComponentProps['node'];
    supplementaryDescribedBy?: string;
}) {
    const showError = !!(field.error && field.touched);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const height = (node.props?.height as number) || 200;
    const penColor = (node.props?.penColor as string) || '#000000';

    // Stable refs — field.setValue and field.touch don't change identity across renders,
    // but the `field` object itself is recreated by useField on every render.
    const { setValue, touch } = field;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // DPR-aware canvas sizing — use setTransform (absolute) not scale (cumulative)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.strokeStyle = penColor;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        const getPos = (e: MouseEvent | TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            if ('touches' in e) {
                return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
            }
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        };

        const onStart = (e: MouseEvent | TouchEvent) => {
            e.preventDefault();
            isDrawingRef.current = true;
            const { x, y } = getPos(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
        };

        const onMove = (e: MouseEvent | TouchEvent) => {
            if (!isDrawingRef.current) return;
            e.preventDefault();
            const { x, y } = getPos(e);
            ctx.lineTo(x, y);
            ctx.stroke();
        };

        const onEnd = () => {
            if (!isDrawingRef.current) return;
            isDrawingRef.current = false;
            setValue(canvas.toDataURL());
            touch();
        };

        canvas.addEventListener('mousedown', onStart);
        canvas.addEventListener('mousemove', onMove);
        canvas.addEventListener('mouseup', onEnd);
        canvas.addEventListener('touchstart', onStart, { passive: false });
        canvas.addEventListener('touchmove', onMove, { passive: false });
        canvas.addEventListener('touchend', onEnd);

        return () => {
            canvas.removeEventListener('mousedown', onStart);
            canvas.removeEventListener('mousemove', onMove);
            canvas.removeEventListener('mouseup', onEnd);
            canvas.removeEventListener('touchstart', onStart);
            canvas.removeEventListener('touchmove', onMove);
            canvas.removeEventListener('touchend', onEnd);
        };
    }, [penColor, setValue, touch]);

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        field.setValue(null);
        field.touch();
    };

    return (
        <div className="formspec-signature">
            <canvas
                ref={canvasRef}
                id={field.id}
                // Item 1: WCAG 2.1.1 / 4.1.2 — canvas needs role, label, and keyboard focus
                role="img"
                aria-label={`Signature pad for ${field.label}`}
                aria-invalid={showError}
                {...(supplementaryDescribedBy ? { 'aria-describedby': supplementaryDescribedBy } : {})}
                tabIndex={0}
                className="formspec-signature-canvas"
                style={{ width: '100%', height, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
            />
            <button
                type="button"
                className="formspec-signature-clear"
                // Item 1: include field label so clear button has context for screen readers
                aria-label={`Clear ${field.label}`}
                onClick={handleClear}
            >
                Clear
            </button>
        </div>
    );
}
