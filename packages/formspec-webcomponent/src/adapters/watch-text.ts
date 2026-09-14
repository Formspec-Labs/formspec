/** @filedesc watchText — keep a DOM text write current with a localized string signal, disposed with the render scope. */
import { effect, type ReadonlySignal } from '@preact/signals-core';
import type { AdapterContext } from './types';

/**
 * Call `write` with `text` now and whenever it changes (locale switch, `{{}}` values). The effect is disposed with
 * the component's render scope, so a repeat row's strings go away with the row.
 */
export function watchText(
    actx: Pick<AdapterContext, 'onDispose'>,
    text: ReadonlySignal<string>,
    write: (value: string) => void,
): void {
    actx.onDispose(effect(() => write(text.value)));
}
