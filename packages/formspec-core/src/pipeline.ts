/** @filedesc Phase-aware command execution pipeline with middleware support. */
import { deepEqual } from '@formspec-org/engine';
import { builtinHandlers } from './handlers/index.js';
import type { CommandHandler, ProjectState, AnyCommand, CommandResult, Middleware } from './types.js';

/**
 * Phase-aware command execution pipeline.
 *
 * Clones state once, runs commands across phases with inter-phase
 * reconciliation (when any command in a phase signals rebuild), and
 * returns the new state plus all results. Middleware wraps the full plan.
 */
export class CommandPipeline {
  constructor(
    private handlers: Readonly<Record<string, CommandHandler>>,
    private middleware: Middleware[],
  ) {}

  execute(
    state: ProjectState,
    phases: AnyCommand[][],
    reconcile: (clone: ProjectState) => void,
  ): { newState: ProjectState; results: CommandResult[] } {
    const core = (cmds: AnyCommand[][]): { newState: ProjectState; results: CommandResult[] } => {
      const clone = structuredClone(state);
      const allResults: CommandResult[] = [];

      for (const phase of cmds) {
        const phaseResults: CommandResult[] = [];
        for (const cmd of phase) {
          const handler = this.handlers[cmd.type];
          if (!handler) throw new Error(`Unknown command type: ${cmd.type}`);
          // Built-in commands outside theme.* only sync or clean up existing Theme state.
          const builtin = builtinHandlers[cmd.type as keyof typeof builtinHandlers];
          const mayAuthorTheme = cmd.type.startsWith('theme.') || handler !== builtin;
          const previousTheme = !clone.themeDeclared && mayAuthorTheme
            ? structuredClone(clone.theme)
            : undefined;
          phaseResults.push(handler(clone, cmd.payload));
          if (previousTheme && !deepEqual(previousTheme, clone.theme)) clone.themeDeclared = true;
        }
        allResults.push(...phaseResults);
        if (phaseResults.some(r => r.rebuildComponentTree)) {
          reconcile(clone);
        }
      }

      return { newState: clone, results: allResults };
    };

    if (this.middleware.length === 0) {
      return core(phases);
    }

    let chain = core;
    for (let i = this.middleware.length - 1; i >= 0; i--) {
      const mw = this.middleware[i];
      const next = chain;
      chain = (cmds) => mw(state, cmds, next);
    }
    return chain(phases);
  }
}
