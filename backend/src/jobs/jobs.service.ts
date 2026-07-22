import { Injectable, NotFoundException } from '@nestjs/common';
import { JobRecord, JobStatus } from './job.types';

@Injectable()
export class JobsService {
  private readonly jobs = new Map<string, JobRecord>();

  create(jobId: string, imagePath: string): JobRecord {
    const record: JobRecord = {
      jobId,
      status: 'queued',
      imagePath,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, record);
    return record;
  }

  get(jobId: string): JobRecord {
    const record = this.jobs.get(jobId);
    if (!record) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    return record;
  }

  setStatus(jobId: string, status: JobStatus): void {
    this.get(jobId).status = status;
  }

  setDone(jobId: string, resultPath: string): void {
    const record = this.get(jobId);
    record.status = 'done';
    record.resultPath = resultPath;
  }

  setFailed(jobId: string, error: string): void {
    const record = this.get(jobId);
    record.status = 'failed';
    record.error = error;
  }

  countByStatus(status: JobStatus): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === status) count++;
    }
    return count;
  }
}
