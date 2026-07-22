import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import { PIXEL_ART_QUEUE } from './queue.constants';
import { OrchestratorService } from '../orchestrator/orchestrator.service';

interface PixelArtJobData {
  jobId: string;
  imagePath: string;
}

@Injectable()
export class QueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueWorkerService.name);
  private worker?: Worker<PixelArtJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const url = new URL(redisUrl);

    this.worker = new Worker<PixelArtJobData>(
      PIXEL_ART_QUEUE,
      async (job: Job<PixelArtJobData>) => {
        await this.orchestrator.process(job.data.jobId, job.data.imagePath);
      },
      {
        connection: { host: url.hostname, port: Number(url.port || 6379) },
        // Sequential processing: avoids concurrent GPU/VRAM contention on the vision model (see risk register).
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log(`Worker listening on queue "${PIXEL_ART_QUEUE}" (concurrency 1)`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
