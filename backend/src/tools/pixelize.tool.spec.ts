import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { pixelize } from './pixelize.tool';

async function makeSolidColorPng(dir: string, rgb: [number, number, number]): Promise<string> {
  const imagePath = path.join(dir, 'original.png');
  const buffer = Buffer.alloc(4 * 4 * 3);
  for (let i = 0; i < 16; i++) {
    buffer[i * 3] = rgb[0];
    buffer[i * 3 + 1] = rgb[1];
    buffer[i * 3 + 2] = rgb[2];
  }
  await sharp(buffer, { raw: { width: 4, height: 4, channels: 3 } }).png().toFile(imagePath);
  return imagePath;
}

test('pixelize nes-flat quantizes a solid near-black input to the palette black entry', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelize-test-'));
  try {
    const imagePath = await makeSolidColorPng(dir, [5, 3, 4]);
    const outputPath = await pixelize(imagePath, 'nes-flat', { width: 2 });

    assert.equal(outputPath, path.join(dir, 'result.png'));
    const { data, info } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 2);
    assert.equal(info.height, 2);
    for (let i = 0; i < info.width * info.height; i++) {
      assert.deepEqual([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]], [0, 0, 0]);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pixelize pc98-dither only uses colors from the pc98 palette file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelize-test-'));
  try {
    const imagePath = await makeSolidColorPng(dir, [100, 120, 180]);
    const outputPath = await pixelize(imagePath, 'pc98-dither', { width: 8 });

    const palette = fs
      .readFileSync(path.join(process.cwd(), 'data', 'pc98-palette.txt'), 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const { data, info } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < info.width * info.height; i++) {
      const hex =
        '#' +
        [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]
          .map((c) => c.toString(16).padStart(2, '0'))
          .join('');
      assert.ok(palette.includes(hex), `${hex} not found in pc98 palette`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
