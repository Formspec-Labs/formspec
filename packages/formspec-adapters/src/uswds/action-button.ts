/** @filedesc USWDS v3 adapter for ActionButton — usa-button primary action. */
import type { AdapterRenderFn } from '@formspec-org/webcomponent';

export const renderActionButton: AdapterRenderFn<any> = (
    behavior,
    parent,
    actx,
) => {
    const button = document.createElement('button');
    if (behavior.id) button.id = behavior.id;
    button.type = 'button';
    button.className = 'formspec-action formspec-submit usa-button';
    button.textContent = behavior.defaultLabel || 'Submit';
    button.style.alignSelf = 'flex-start';

    if (behavior.compOverrides?.cssClass) actx.applyCssClass(button, behavior.compOverrides);
    if (behavior.compOverrides?.accessibility) actx.applyAccessibility(button, behavior.compOverrides);
    if (behavior.compOverrides?.style) actx.applyStyle(button, behavior.compOverrides.style);

    parent.appendChild(button);
    const dispose = behavior.bind({ root: button });
    actx.onDispose(dispose);
};
