/** @filedesc Generic undo/redo stack and command log manager. */
import type { LogEntry } from './types.js';

/** A stack slot: the state to restore, plus the label of the command it belongs to. */
interface HistoryEntry<T, L> {
  snapshot: T;
  label?: L;
}

/**
 * Manages undo/redo stacks and command log.
 * Pure data structure — no knowledge of commands or state shape.
 *
 * Each stack slot carries an opaque `label` supplied at {@link push} time. The
 * label travels with the slot across `popUndo`/`popRedo`, so
 * {@link nextUndoLabel} always names the command the next `undo()` reverses and
 * {@link nextRedoLabel} names the one the next `redo()` re-executes. Depth
 * pruning, redo invalidation, and `clear()` move label and snapshot together —
 * that single bookkeeping site is what makes the label trustworthy to callers
 * who gate on it (ADR 0152 §5.2 treats replay as a write).
 */
export class HistoryManager<T, L = unknown> {
  private _undoStack: HistoryEntry<T, L>[] = [];
  private _redoStack: HistoryEntry<T, L>[] = [];
  private _log: LogEntry[] = [];
  private _maxDepth: number;

  constructor(maxDepth = 50) {
    this._maxDepth = maxDepth;
  }

  get canUndo(): boolean { return this._undoStack.length > 0; }
  get canRedo(): boolean { return this._redoStack.length > 0; }
  get log(): readonly LogEntry[] { return this._log; }

  /** Label of the command the next `popUndo` reverses; `undefined` when none. */
  get nextUndoLabel(): L | undefined {
    return this._undoStack[this._undoStack.length - 1]?.label;
  }

  /** Label of the command the next `popRedo` re-executes; `undefined` when none. */
  get nextRedoLabel(): L | undefined {
    return this._redoStack[this._redoStack.length - 1]?.label;
  }

  push(snapshot: T, label?: L): void {
    this._undoStack.push(label === undefined ? { snapshot } : { snapshot, label });
    if (this._undoStack.length > this._maxDepth) {
      this._undoStack.shift();
    }
    this._redoStack.length = 0;
  }

  popUndo(current: T): T | null {
    const entry = this._undoStack.pop();
    if (!entry) return null;
    // `current` is the state AFTER the labelled command; redoing it re-executes
    // the same command, so the label rides along.
    this._redoStack.push(entry.label === undefined ? { snapshot: current } : { snapshot: current, label: entry.label });
    return entry.snapshot;
  }

  popRedo(current: T): T | null {
    const entry = this._redoStack.pop();
    if (!entry) return null;
    this._undoStack.push(entry.label === undefined ? { snapshot: current } : { snapshot: current, label: entry.label });
    return entry.snapshot;
  }

  clear(): void {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
  }

  clearRedo(): void {
    this._redoStack.length = 0;
  }

  appendLog(entry: LogEntry): void {
    this._log.push(entry);
  }

  clearLog(): void {
    this._log.length = 0;
  }
}
