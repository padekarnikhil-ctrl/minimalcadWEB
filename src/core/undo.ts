/**
 * MinimalCAD Web
 * core/undo.ts
 *
 * Whole-document snapshot-based undo/redo, ported from undo.py. Every
 * command's commit path follows the same convention as the Python source:
 * snapshot document.toDict() BEFORE mutating, mutate, THEN push that
 * pre-mutation snapshot.
 */

import type { DocumentSnapshot } from "./document";

const MAX_UNDO_DEPTH = 100;

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class Undo {
  private undoStack: DocumentSnapshot[] = [];
  private redoStack: DocumentSnapshot[] = [];
  dirty = false;

  push(snapshot: DocumentSnapshot): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top !== undefined && deepEqual(top, snapshot)) return;

    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_UNDO_DEPTH) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.dirty = true;
  }

  undo(currentState: DocumentSnapshot): DocumentSnapshot | null {
    const previous = this.undoStack.pop();
    if (previous === undefined) return null;
    this.redoStack.push(currentState);
    this.dirty = true;
    return previous;
  }

  redo(currentState: DocumentSnapshot): DocumentSnapshot | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(currentState);
    this.dirty = true;
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = false;
  }

  markClean(): void {
    this.dirty = false;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
