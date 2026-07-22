import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { JobsService } from '../jobs/jobs.service';
import { uploadRoot } from '../upload/upload.constants';

const DEFAULT_MAX_AGE_MS = 3600000;
const DEFAULT_INTERVAL_MS = 300000;

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(this.config.get('CLEANUP_INTERVAL_MS', DEFAULT_INTERVAL_MS));
    this.timer = setInterval(() => this.sweep(), intervalMs);
    this.logger.log(`Cleanup sweep scheduled every ${intervalMs}ms`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Deletes upload directories older than CLEANUP_MAX_AGE_MS. Never touches JobsService/TraceService — dashboard history survives for the demo session. */
  private sweep(): void {
    const maxAgeMs = Number(this.config.get('CLEANUP_MAX_AGE_MS', DEFAULT_MAX_AGE_MS));
    const root = uploadRoot();
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      return;
    }

    const now = Date.now();
    for (const jobId of entries) {
      if (this.isActive(jobId)) continue;
      const jobDir = path.join(root, jobId);
      let mtimeMs: number;
      try {
        mtimeMs = fs.statSync(jobDir).mtimeMs;
      } catch {
        continue;
      }
      const ageMs = now - mtimeMs;
      if (ageMs >= maxAgeMs) {
        fs.rmSync(jobDir, { recursive: true, force: true });
        this.logger.log(`Cleaned up upload ${jobId} (age ${Math.round(ageMs / 60000)}min)`);
      }
    }
  }

  private isActive(jobId: string): boolean {
    try {
      const status = this.jobs.get(jobId).status;
      return status === 'queued' || status === 'processing';
    } catch {
      return false;
    }
  }
}
