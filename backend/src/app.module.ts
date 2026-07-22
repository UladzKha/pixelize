import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { UploadModule } from './upload/upload.module';
import { ResultModule } from './result/result.module';
import { EventsModule } from './events/events.module';
import { MetricsModule } from './metrics/metrics.module';
import { AppConfigModule } from './config/config.module';
import { CleanupModule } from './cleanup/cleanup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    QueueModule,
    UploadModule,
    ResultModule,
    EventsModule,
    MetricsModule,
    AppConfigModule,
    CleanupModule,
  ],
})
export class AppModule {}
