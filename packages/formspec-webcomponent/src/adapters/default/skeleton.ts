/** @filedesc Default pre-engine placeholder — neutral blocks at the widget's nominal height. */
import type { AdapterRenderFn } from '../types';
import type { SkeletonBehavior } from '../layout-behaviors';

export const renderSkeleton: AdapterRenderFn<SkeletonBehavior> = (behavior, parent) => {
    const block = document.createElement('div');
    block.className = `formspec-skeleton-${behavior.kind}`;
    block.setAttribute('aria-hidden', 'true');

    if (behavior.kind === 'field') {
        const label = document.createElement('div');
        label.className = 'formspec-skeleton-line';
        block.appendChild(label);
        const control = document.createElement('div');
        control.className = 'formspec-skeleton-control';
        control.style.height = `${behavior.height}rem`;
        block.appendChild(control);
    }

    parent.appendChild(block);
};
