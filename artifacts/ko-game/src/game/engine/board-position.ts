import type { Board } from '../types/game-state';

export type BoardSlot = 0 | 1 | 2 | 3;

export function getLeftAdjacentSlot(slot: BoardSlot): BoardSlot | null {
  return slot > 0 ? ((slot - 1) as BoardSlot) : null;
}

export function getRightAdjacentSlot(slot: BoardSlot): BoardSlot | null {
  return slot < 3 ? ((slot + 1) as BoardSlot) : null;
}

export function getAdjacentSlots(slot: BoardSlot): BoardSlot[] {
  return [getLeftAdjacentSlot(slot), getRightAdjacentSlot(slot)].filter(
    (adjacent): adjacent is BoardSlot => adjacent !== null,
  );
}

export function isBoardFull(board: Board): boolean {
  return board.every((card) => card !== null);
}