/** Recursively constructs the standard n-order Bayer ordered-dithering matrix (2^n x 2^n, values 0..4^n-1). */
export function bayerMatrix(order: number): number[][] {
  if (order === 0) {
    return [[0]];
  }
  const prev = bayerMatrix(order - 1);
  const size = prev.length;
  const result: number[][] = Array.from({ length: size * 2 }, () =>
    new Array<number>(size * 2).fill(0),
  );
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = prev[y][x] * 4;
      result[y][x] = v;
      result[y][x + size] = v + 2;
      result[y + size][x] = v + 3;
      result[y + size][x + size] = v + 1;
    }
  }
  return result;
}

export const BAYER_8X8 = bayerMatrix(3);
