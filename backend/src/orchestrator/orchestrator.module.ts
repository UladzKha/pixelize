import { Module } from '@nestjs/common';
import { VisionAnalysisAgent } from '../agents/vision-analysis.agent';
import { QualityGateAgent } from '../agents/quality-gate.agent';
import { TraceModule } from '../trace/trace.module';
import { JobsModule } from '../jobs/jobs.module';
import { EventsModule } from '../events/events.module';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [TraceModule, JobsModule, EventsModule],
  providers: [OrchestratorService, VisionAnalysisAgent, QualityGateAgent],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
