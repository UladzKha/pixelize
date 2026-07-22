import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Queue } from 'bullmq';
import { JobsService } from '../jobs/jobs.service';
import { TraceService } from '../trace/trace.service';
import { TraceEntry } from '../trace/trace.types';
import { JobStatus } from '../jobs/job.types';
import { PIXEL_ART_QUEUE } from '../queue/queue.constants';
import { getQueuePosition } from '../queue/queue-position';

interface ResultResponse {
  status: JobStatus;
  resultUrl?: string;
  originalUrl: string;
  error?: string;
  trace: TraceEntry[];
  queuePosition?: number;
}

@Controller('api/result')
export class ResultController {
  constructor(
    private readonly jobs: JobsService,
    private readonly trace: TraceService,
    @Inject(PIXEL_ART_QUEUE) private readonly queue: Queue,
  ) {}

  @Get(':jobId')
  async get(@Param('jobId') jobId: string): Promise<ResultResponse> {
    const job = this.jobs.get(jobId);
    return {
      status: job.status,
      resultUrl: job.status === 'done' ? `/api/result/${jobId}/image` : undefined,
      originalUrl: `/api/result/${jobId}/original`,
      error: job.error,
      trace: this.trace.get(jobId),
      queuePosition: job.status === 'queued' ? await getQueuePosition(this.queue, jobId) : undefined,
    };
  }

  @Get(':jobId/image')
  getImage(@Param('jobId') jobId: string, @Res() res: Response): void {
    const job = this.jobs.get(jobId);
    if (job.status !== 'done' || !job.resultPath) {
      throw new NotFoundException(`Result image for job ${jobId} is not ready`);
    }
    res.sendFile(job.resultPath);
  }

  @Get(':jobId/original')
  getOriginal(@Param('jobId') jobId: string, @Res() res: Response): void {
    const job = this.jobs.get(jobId);
    res.sendFile(job.imagePath);
  }
}
