/** @filedesc Tailwind adapter for Toggle — switch with correct peer ordering for knob motion. */
import type { ToggleBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';
import { el, applyCascadeClasses, applyCascadeAccessibility } from '../helpers';
import { createTailwindError, TW, applyErrorStyling, createTailwindHint } from './shared';

export const renderToggle: AdapterRenderFn<ToggleBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;

    const root = el('div', { class: TW.group, 'data-name': behavior.fieldPath });
    applyCascadeClasses(root, p);
    applyCascadeAccessibility(root, p);

    const row = el('div', {
        class: TW.controlContainer,
    });

    const copy = el('div', { class: 'min-w-0 flex-1' });
    const title = el('span', {
        class: p.labelPosition === 'hidden'
            ? 'sr-only'
            : 'block text-sm font-semibold text-[var(--formspec-tw-text)]',
    });
    title.textContent = behavior.label;
    copy.appendChild(title);
    // Track: input (peer) then knob span — peer-checked translate works on immediate sibling
    const track = el('span', {
        class: 'relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full bg-[var(--formspec-tw-track)] p-1 transition-colors duration-200 has-[:checked]:bg-[var(--formspec-tw-accent)] has-[:checked]:shadow-inner',
    });

    const input = document.createElement('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.id = behavior.id;
    input.name = behavior.fieldPath;
    input.setAttribute('role', 'switch');
    input.className =
        'peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0';

    const knob = el('span', {
        class: 'pointer-events-none inline-block h-6 w-6 rounded-full bg-[var(--formspec-tw-surface)] shadow-[var(--formspec-tw-shadow-md)] ring-1 ring-[color:var(--formspec-tw-knob-ring)] transition-transform duration-200 ease-out translate-x-0 peer-checked:translate-x-6',
        'aria-hidden': 'true',
    });

    const describedBy = [
        behavior.hint ? `${behavior.id}-hint` : '',
        `${behavior.id}-error`,
    ].filter(Boolean).join(' ');
    input.setAttribute('aria-describedby', describedBy);

    track.appendChild(input);
    track.appendChild(knob);

    row.appendChild(copy);
    row.appendChild(track);
    root.appendChild(row);

    const hint = createTailwindHint(behavior);
    root.appendChild(hint);

    const error = createTailwindError(behavior.id);
    root.appendChild(error);

    parent.appendChild(root);

    const dispose = behavior.bind({
        root,
        label: title,
        control: input,
        hint,
        error,
        onValidationChange: (hasError) => {
            applyErrorStyling(row, hasError);
        },
    });
    actx.onDispose(dispose);
};
