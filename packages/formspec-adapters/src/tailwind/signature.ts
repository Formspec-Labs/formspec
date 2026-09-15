/** @filedesc Tailwind adapter for Signature — canvas drawing with styled clear button. */
import type { SignatureBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { createSignatureCanvas, uiText, watchText } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { createTailwindFieldDOM, TW } from './shared';

export const renderSignature: AdapterRenderFn<SignatureBehavior> = (
    behavior, parent, actx
) => {
    const { root, label, hint, error, describedBy } = createTailwindFieldDOM(behavior, { labelFor: false });

    const { canvas, clear, dispose: canvasDispose } = createSignatureCanvas({
        height: behavior.height,
        strokeColor: behavior.strokeColor,
        eventTarget: root,
    });
    canvas.style.width = '100%';
    canvas.classList.add('rounded-md', 'border', 'border-[color:var(--formspec-tw-border)]');
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'img');
    watchText(actx, uiText(actx.engine, 'signature.canvas'), (text) => { canvas.setAttribute('aria-label', text); });
    canvas.setAttribute('aria-describedby', describedBy);

    root.appendChild(canvas);
    actx.onDispose(canvasDispose);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = TW.buttonOutline + ' mt-2';
    watchText(actx, uiText(actx.engine, 'signature.clear'), (text) => { clearBtn.textContent = text; });
    clearBtn.addEventListener('click', clear);
    root.appendChild(clearBtn);

    root.appendChild(error);
    parent.appendChild(root);

    const dispose = behavior.bind({
        root, label, control: canvas, hint, error,
        onValidationChange: (hasError) => {
            canvas.style.borderColor = hasError ? 'var(--formspec-tw-danger)' : '';
        },
    });
    actx.onDispose(dispose);
};
