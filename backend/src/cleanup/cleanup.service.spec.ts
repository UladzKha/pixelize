import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { JobsService } from '../jobs/jobs.service';
import { CleanupService } from './cleanup.service';

function fakeConfig(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

test('cleanup sweep deletes old, inactive upload dirs but keeps recent and active ones', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-test-'));
  const originalUploadRoot = process.env.UPLOAD_ROOT;
  process.env.UPLOAD_ROOT = root;

  try {
    const oldDir = path.join(root, 'old-job');
    const recentDir = path.join(root, 'recent-job');
    const activeDir = path.join(root, 'active-job');
    for (const dir of [oldDir, recentDir, activeDir]) fs.mkdirSync(dir, { recursive: true });

    const oldTime = new Date(Date.now() - 2 * 3600_000);
    fs.utimesSync(oldDir, oldTime, oldTime);
    fs.utimesSync(activeDir, oldTime, oldTime); // old on disk but still "processing" — must survive

    const jobs = new JobsService();
    jobs.create('active-job', path.join(activeDir, 'original.jpg'));
    jobs.setStatus('active-job', 'processing');

    const config = fakeConfig({ CLEANUP_MAX_AGE_MS: '3600000' });
    const cleanup = new CleanupService(config, jobs);
    (cleanup as unknown as { sweep(): void }).sweep();

    assert.equal(fs.existsSync(oldDir), false, 'old, inactive upload should be deleted');
    assert.equal(fs.existsSync(recentDir), true, 'recent upload should survive');
    assert.equal(fs.existsSync(activeDir), true, 'active job upload should survive even if old on disk');
  } finally {
    process.env.UPLOAD_ROOT = originalUploadRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
