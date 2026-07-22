import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { JobsModule } from '../jobs/jobs.module';
import { EventsModule } from '../events/events.module';
import { UploadController } from './upload.controller';

@Module({
  imports: [QueueModule, JobsModule, EventsModule],
  controllers: [UploadController],
})
export class UploadModule {}
