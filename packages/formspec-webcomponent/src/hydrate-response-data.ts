/** @filedesc Load a Formspec response `data` tree into a FormEngine through `loadResponseData`. */
import type { IFormEngine } from '@formspec-org/engine/render';

/**
 * Apply a response `data` object to the engine after `definition` is loaded. The engine walks the Definition:
 * every saved repeat row is kept (past `maxRepeat` included, reported as MAX_REPEAT); undeclared keys (e.g.
 * top-level screener keys) and calculated fields are ignored.
 */
export function applyResponseDataToEngine(engine: IFormEngine, data: Record<string, any>): void {
    engine.loadResponseData(data);
}
