/** @filedesc Stops retired React data loads before they dispatch another host operation. */
import type { LoadWidgetDataInputsRequest } from '@formspec-org/surface';

export type EffectDataSourcePorts = Pick<LoadWidgetDataInputsRequest, 'authorize' | 'loader' | 'validatePayload'>;

/** Stop later owner phases when this effect retires; host authority stays in the ports. */
export function currentEffectDataSourcePorts(
  isCurrent: () => boolean,
  { loader, authorize, validatePayload }: EffectDataSourcePorts,
): EffectDataSourcePorts {
  const check = () => {
    if (!isCurrent()) throw new Error('Surface data load effect retired');
  };
  const invoke = <T,>(dispatch: () => T | Promise<T>): T | Promise<T> => {
    check();
    const result = dispatch();
    const complete = (value: T): T => { check(); return value; };
    // Preserve synchronous ports; only asynchronous results need a continuation.
    return typeof (result as Promise<T>)?.then === 'function'
      ? Promise.resolve(result).then(complete)
      : complete(result as T);
  };
  return {
    loader: loader ? request => invoke(() => loader(request)) : undefined,
    authorize: authorize ? request => invoke(() => authorize(request)) : undefined,
    validatePayload: validatePayload ? request => invoke(() => validatePayload(request)) : undefined,
  };
}
