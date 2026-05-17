/** @filedesc Shared signature canvas drawing utility — used by default and external adapters. */

export interface SignatureCanvasConfig {
    /** Canvas height in CSS pixels. */
    height: number;
    /** Stroke color for drawing. */
    strokeColor: string;
    /** Element that receives `formspec-signature-drawn` and `formspec-signature-cleared` events. */
    eventTarget: HTMLElement;
}

export interface SignatureCanvasResult {
    /** The canvas element — append this to your adapter's DOM. */
    canvas: HTMLCanvasElement;
    /** Clear the canvas and dispatch `formspec-signature-cleared`. */
    clear(): void;
    /** Disconnect the ResizeObserver and clean up. */
    dispose(): void;
}

/**
 * Create a signature canvas with mouse + touch drawing, DPR-aware scaling,
 * and ResizeObserver. Dispatches custom events on the provided eventTarget.
 *
 * Adapters own the surrounding DOM (label, button, error); this utility
 * owns the canvas behavior.
 */
export function createSignatureCanvas(config: SignatureCanvasConfig): SignatureCanvasResult {
    const { height, strokeColor, eventTarget } = config;

    const canvas = document.createElement('canvas');
    canvas.className = 'formspec-signature-canvas';
    canvas.style.height = `${height}px`;

    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;

    // ── DPR-aware resize ───────────────────────────────────────────
    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        // setTransform sets an absolute (not cumulative) transform — safe across repeated resizes.
        if (ctx.setTransform) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else {
            ctx.scale(dpr, dpr);
        }
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);

    // ── Drawing state ──────────────────────────────────────────────
    let drawing = false;

    const getPos = (e: MouseEvent | Touch) => {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const beginStroke = (pos: { x: number; y: number }) => {
        drawing = true;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const continueStroke = (pos: { x: number; y: number }) => {
        if (!drawing) return;
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
    };

    const endStroke = () => {
        drawing = false;
        eventTarget.dispatchEvent(new CustomEvent('formspec-signature-drawn', {
            detail: { dataUrl: canvas.toDataURL() },
            bubbles: false,
        }));
    };

    const cancelStroke = () => { drawing = false; };

    const onMouseDown = (e: MouseEvent) => beginStroke(getPos(e));
    const onMouseMove = (e: MouseEvent) => continueStroke(getPos(e));
    const onMouseUp = () => endStroke();
    const onMouseLeave = () => cancelStroke();

    const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        beginStroke(getPos(e.touches[0]));
    };
    const onTouchMove = (e: TouchEvent) => {
        if (!drawing) return;
        e.preventDefault();
        continueStroke(getPos(e.touches[0]));
    };
    const onTouchEnd = () => endStroke();
    const onTouchCancel = () => cancelStroke();

    // ── Mouse events ───────────────────────────────────────────────
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    // ── Touch events ───────────────────────────────────────────────
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchCancel);

    // ── Clear + dispose ────────────────────────────────────────────
    const clear = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        eventTarget.dispatchEvent(new CustomEvent('formspec-signature-cleared', {
            bubbles: false,
        }));
    };

    const dispose = () => {
        ro.disconnect();
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseup', onMouseUp);
        canvas.removeEventListener('mouseleave', onMouseLeave);
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', onTouchMove);
        canvas.removeEventListener('touchend', onTouchEnd);
        canvas.removeEventListener('touchcancel', onTouchCancel);
    };

    return { canvas, clear, dispose };
}
