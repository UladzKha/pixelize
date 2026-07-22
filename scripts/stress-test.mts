/**
 * Phase 4 stress test: uploads N photos concurrently and verifies every job
 * completes without being lost or timing out (AC7). Run with:
 *   node scripts/stress-test.mts
 */
import sharp from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY ?? 10);
const POLL_INTERVAL_MS = Number(process.env.STRESS_POLL_INTERVAL_MS ?? 1500);
const TIMEOUT_MS = Number(process.env.STRESS_TIMEOUT_MS ?? 600_000);

const BASE_COLORS: Array<[number, number, number]> = [
  [220, 90, 60],
  [60, 140, 220],
  [90, 200, 120],
  [230, 200, 60],
  [180, 90, 200],
  [240, 140, 40],
  [50, 180, 190],
  [200, 60, 140],
  [120, 120, 220],
  [180, 220, 90],
];

interface JobResult {
  index: number;
  jobId?: string;
  uploadMs?: number;
  totalMs?: number;
  status: 'done' | 'failed' | 'timeout' | 'upload-error';
  error?: string;
  retries?: number;
}

interface ResultApiResponse {
  status: 'queued' | 'processing' | 'done' | 'failed';
  error?: string;
  trace: Array<{ step: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Synthetic gradient photo — gives the vision model something with color + a gradient to react to, without depending on real sample photos. */
async function makeTestImage(index: number): Promise<Buffer> {
  const width = 320;
  const height = 240;
  const [r, g, b] = BASE_COLORS[index % BASE_COLORS.length];
  const buffer = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = x / width;
      const i = (y * width + x) * 3;
      buffer[i] = Math.round(r * t + 30 * (1 - t));
      buffer[i + 1] = Math.round(g * t + 30 * (1 - t));
      buffer[i + 2] = Math.round(b * (1 - t) + 200 * t);
    }
  }
  return sharp(buffer, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function uploadJob(index: number): Promise<JobResult> {
  const result: JobResult = { index, status: 'upload-error' };
  const start = Date.now();

  try {
    const imageBuffer = await makeTestImage(index);
    const form = new FormData();
    form.append('file', new Blob([imageBuffer], { type: 'image/jpeg' }), `stress-${index}.jpg`);
    const res = await fetch(`${BACKEND_URL}/api/upload`, { method: 'POST', body: form });
    if (!res.ok) {
      result.error = `upload failed: HTTP ${res.status}`;
      return result;
    }
    const body = (await res.json()) as { jobId: string };
    result.jobId = body.jobId;
    result.uploadMs = Date.now() - start;
  } catch (err) {
    result.error = `upload threw: ${(err as Error).message}`;
    return result;
  }

  const deadline = start + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${BACKEND_URL}/api/result/${result.jobId}`);
      if (!res.ok) continue;
      const body = (await res.json()) as ResultApiResponse;

      if (body.status === 'done') {
        result.status = 'done';
        result.totalMs = Date.now() - start;
        result.retries = body.trace.filter((t) => t.step.includes('retry')).length;
        return result;
      }
      if (body.status === 'failed') {
        result.status = 'failed';
        result.totalMs = Date.now() - start;
        result.error = body.error;
        return result;
      }
    } catch {
      // transient network hiccup while polling — keep trying until the deadline
    }
  }

  result.status = 'timeout';
  result.totalMs = Date.now() - start;
  return result;
}

async function main(): Promise<void> {
  console.log(`Stress test: ${CONCURRENCY} concurrent uploads -> ${BACKEND_URL}`);
  const wallStart = Date.now();
  const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => uploadJob(i)));
  const wallMs = Date.now() - wallStart;

  const done = results.filter((r) => r.status === 'done');
  const failed = results.filter((r) => r.status === 'failed');
  const timedOut = results.filter((r) => r.status === 'timeout');
  const uploadErrors = results.filter((r) => r.status === 'upload-error');

  const totalDurations = done.map((r) => r.totalMs as number).sort((a, b) => a - b);
  const avgMs = totalDurations.length ? totalDurations.reduce((a, b) => a + b, 0) / totalDurations.length : 0;
  const minMs = totalDurations[0] ?? 0;
  const maxMs = totalDurations[totalDurations.length - 1] ?? 0;

  console.log('');
  console.log('=== Stress Test Results ===');
  console.log(`Total jobs:      ${results.length}`);
  console.log(`Succeeded:       ${done.length}`);
  console.log(`Failed:          ${failed.length}`);
  console.log(`Timed out:       ${timedOut.length}`);
  console.log(`Upload errors:   ${uploadErrors.length}`);
  console.log(`Wall clock:      ${(wallMs / 1000).toFixed(1)}s`);
  console.log(
    `Job duration:    min ${(minMs / 1000).toFixed(1)}s / avg ${(avgMs / 1000).toFixed(1)}s / max ${(maxMs / 1000).toFixed(1)}s`,
  );
  console.log('');
  for (const r of results) {
    const total = r.totalMs != null ? `${(r.totalMs / 1000).toFixed(1)}s` : '-';
    const errSuffix = r.error ? ` error=${r.error}` : '';
    console.log(`#${r.index} ${r.jobId ?? '-'} status=${r.status} total=${total} retries=${r.retries ?? 0}${errSuffix}`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    backendUrl: BACKEND_URL,
    concurrency: CONCURRENCY,
    wallClockMs: wallMs,
    summary: {
      total: results.length,
      done: done.length,
      failed: failed.length,
      timedOut: timedOut.length,
      uploadErrors: uploadErrors.length,
    },
    durations: { minMs, avgMs, maxMs },
    jobs: results,
  };

  const reportDir = path.join(process.cwd(), 'docs');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'stress-test-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${reportPath}`);

  const allOk = timedOut.length === 0 && uploadErrors.length === 0 && failed.length === 0;
  process.exit(allOk ? 0 : 1);
}

main();
