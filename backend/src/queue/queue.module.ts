import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { PIXEL_ART_QUEUE } from './queue.constants';
import { PixelArtQueueProvider } from './queue.provider';
import { QueueWorkerService } from './queue-worker.service';

@Module({
  imports: [ConfigModule, OrchestratorModule],
  providers: [
    {
      provide: PIXEL_ART_QUEUE,
      inject: [ConfigService],
      useFactory: PixelArtQueueProvider,
    },
    QueueWorkerService,
  ],
  exports: [PIXEL_ART_QUEUE],
})
export class QueueModule {}
