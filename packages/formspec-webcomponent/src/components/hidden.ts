/** @filedesc Hidden field widget — the planner keeps the node so the engine keeps the value; nothing renders. */
import type { ComponentPlugin } from '../types';

/**
 * Theme §4.2 `Hidden`: a field whose value the form carries but the page never shows — row data other
 * questions read (`{{$payerName}}`), a value the Response must keep, a calculated field with no display.
 *
 * It emits no DOM at all, not even `<input type="hidden">`. The Response is assembled from engine state,
 * never from the page, so a hidden control would carry nothing; an empty node would only add a focus,
 * label-association and flex-gap surface to every consumer. Adapter-agnostic by construction: there is no
 * markup for a design system to own, so this is a plugin rather than a per-adapter render.
 */
export const HiddenPlugin: ComponentPlugin = {
    type: 'Hidden',
    render: () => {},
};
