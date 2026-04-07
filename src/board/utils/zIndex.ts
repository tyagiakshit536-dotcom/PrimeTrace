let zIndexCursor = 100;

export function primeBoardZIndex(value: number): void {
  if (Number.isFinite(value) && value > zIndexCursor) {
    zIndexCursor = value;
  }
}

export function nextBoardZIndex(): number {
  zIndexCursor += 1;
  return zIndexCursor;
}
