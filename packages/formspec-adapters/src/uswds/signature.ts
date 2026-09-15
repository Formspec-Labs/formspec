/** @filedesc USWDS v3 adapter for Signature — canvas drawing with USWDS button for clear. */
import type { SignatureBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createSignatureCanvas, uiText, watchText } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM } from './shared';

export const renderSignature: AdapterRenderFn<SignatureBehavior> = (
    behavior, parent, actx
) => {
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior, { labelFor: false });

    // Canvas — shared utility handles drawing, resize, touch, events
    const { canvas, clear, dispose: canvasDispose } = createSignatureCanvas({
        height: behavior.height,
        strokeColor: behavior.strokeColor,
        eventTarget: root,
    });
    canvas.style.width = '100%';
    canvas.style.border = '1px solid';
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'img');
    watchText(actx, uiText(actx.engine, 'signature.canvas'), (text) => { canvas.setAttribute('aria-label', text); });

    root.appendChild(canvas);
    actx.onDispose(canvasDispose);

    // Clear button — USWDS outline button
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'usa-button usa-button--outline';
    watchText(actx, uiText(actx.engine, 'signature.clear'), (text) => { clearBtn.textContent = text; });
    clearBtn.addEventListener('click', clear);
    root.appendChild(clearBtn);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: canvas, hint, error,
        onValidationChange: (hasError) => {
            applyUSWDSValidationState(root, label, hasError);
        },
    });
    actx.onDispose(dispose);
};
