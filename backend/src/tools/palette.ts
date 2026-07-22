import * as fs from 'fs';
import * as path from 'path';

export type Style = 'nes-flat' | 'pc98-dither';

export type RGB = [number, number, number];

const PALETTE_FILES: Record<Style, string> = {
  'nes-flat': 'nes-palette.txt',
  'pc98-dither': 'pc98-palette.txt',
};

function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.trim().replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

/** Reads the palette from disk on every call — canonical source is the file, never in-memory state (AGENTS.md rule 3). */
export function loadPalette(style: Style): RGB[] {
  const filePath = path.join(dataDir(), PALETTE_FILES[style]);
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(hexToRgb);
}

export function nearestColor(rgb: RGB, palette: RGB[]): RGB {
  let best = palette[0];
  let bestDist = Infinity;
  for (const candidate of palette) {
    const dist =
      (rgb[0] - candidate[0]) ** 2 +
      (rgb[1] - candidate[1]) ** 2 +
      (rgb[2] - candidate[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}
