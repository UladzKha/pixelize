import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { JobsModule } from '../jobs/jobs.module';
import { EventsModule } from '../events/events.module';
import { MetricsService } from './metrics.service';

@Module({
  imports: [QueueModule, JobsModule, EventsModule],
  providers: [MetricsService],
})
export class MetricsModule {}
