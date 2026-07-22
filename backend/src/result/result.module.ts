import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { TraceModule } from '../trace/trace.module';
import { ResultController } from './result.controller';

@Module({
  imports: [JobsModule, TraceModule],
  controllers: [ResultController],
})
export class ResultModule {}
