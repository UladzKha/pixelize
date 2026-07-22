import * as path from 'path';
import sharp from 'sharp';
import { BAYER_8X8 } from './bayer';
import { loadPalette, nearestColor, RGB, Style } from './palette';

sharp.concurrency(1);

export interface PixelizeOptions {
  width?: number;
  ditherStrength?: number;
}

const DEFAULT_WIDTH = 128;
const DEFAULT_DITHER_STRENGTH = 32;

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, value));
}

export async function pixelize(
  imagePath: string,
  style: Style,
  options: PixelizeOptions = {},
): Promise<string> {
  const width = options.width ?? DEFAULT_WIDTH;
  const ditherStrength = options.ditherStrength ?? DEFAULT_DITHER_STRENGTH;
  const palette = loadPalette(style);

  const { data, info } = await sharp(imagePath)
    .resize({ width })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels } = info;
  const out = Buffer.alloc(w * h * 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pixelIndex = y * w + x;
      const srcIndex = pixelIndex * channels;
      let rgb: RGB = [data[srcIndex], data[srcIndex + 1], data[srcIndex + 2]];

      if (style === 'pc98-dither') {
        const bayerValue = BAYER_8X8[y % 8][x % 8];
        const offset = (bayerValue / 64 - 0.5) * ditherStrength;
        rgb = [
          clamp255(rgb[0] + offset),
          clamp255(rgb[1] + offset),
          clamp255(rgb[2] + offset),
        ];
      }

      const quantized = nearestColor(rgb, palette);
      const outIndex = pixelIndex * 3;
      out[outIndex] = quantized[0];
      out[outIndex + 1] = quantized[1];
      out[outIndex + 2] = quantized[2];
    }
  }

  const outputPath = path.join(path.dirname(imagePath), 'result.png');
  await sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(outputPath);

  return outputPath;
}
