import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PIXEL_ART_QUEUE } from '../queue/queue.constants';
import { JobsService } from '../jobs/jobs.service';
import { EventsService } from '../events/events.service';
import { readGpuMetrics } from './gpu-metrics';

const DEFAULT_INTERVAL_MS = 2000;

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private timer?: NodeJS.Timeout;
  private gpuWarningLogged = false;

  constructor(
    @Inject(PIXEL_ART_QUEUE) private readonly queue: Queue,
    private readonly jobs: JobsService,
    private readonly events: EventsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(this.config.get('GPU_METRICS_INTERVAL_MS', DEFAULT_INTERVAL_MS));
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`Metrics tick failed: ${(err as Error).message}`));
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    const [queueLength, activeJobs, gpu] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      readGpuMetrics(),
    ]);

    if (!gpu && !this.gpuWarningLogged) {
      this.logger.warn('nvidia-smi unavailable — GPU metrics will report null');
      this.gpuWarningLogged = true;
    }

    this.events.emit({
      type: 'metrics',
      timestamp: new Date().toISOString(),
      queueLength,
      activeJobs,
      completedCount: this.jobs.countByStatus('done'),
      gpuUtilization: gpu?.utilization ?? null,
      vramUsed: gpu?.vramUsed ?? null,
      vramTotal: gpu?.vramTotal ?? null,
    });
  }
}
