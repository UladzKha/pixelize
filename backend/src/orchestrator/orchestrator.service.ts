import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VisionAnalysisAgent, VisionAnalysisResult } from '../agents/vision-analysis.agent';
import { QualityGateAgent } from '../agents/quality-gate.agent';
import { QualityResult } from '../agents/quality.types';
import { pixelize, PixelizeOptions } from '../tools/pixelize.tool';
import { Style } from '../tools/palette';
import { TraceService } from '../trace/trace.service';
import { JobsService } from '../jobs/jobs.service';
import { EventsService } from '../events/events.service';

const MAX_RETRIES = 2;
const DEFAULT_JOB_TIMEOUT_MS = 120000;

function summarizeDecision(step: string, output: unknown): string {
  if (step === 'vision-analysis') {
    const { result } = output as VisionAnalysisResult;
    return `chose ${result.recommended_style} — ${result.reasoning}`;
  }
  if (step.startsWith('quality-gate')) {
    const q = output as QualityResult;
    return `${q.passed ? 'passed' : 'failed'} (score ${q.score.toFixed(1)}/10): ${q.reason}`;
  }
  if (step.startsWith('pixelize')) {
    return 'rendered pixel art';
  }
  return '';
}

function tokensOfStep(
  step: string,
  output: unknown,
): { promptEvalCount: number; evalCount: number } | undefined {
  if (step === 'vision-analysis') {
    return (output as VisionAnalysisResult).tokens;
  }
  if (step.startsWith('quality-gate')) {
    return (output as QualityResult).tokens;
  }
  return undefined;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly vision: VisionAnalysisAgent,
    private readonly qualityGate: QualityGateAgent,
    private readonly trace: TraceService,
    private readonly jobs: JobsService,
    private readonly events: EventsService,
    private readonly config: ConfigService,
  ) {}

  async process(jobId: string, imagePath: string): Promise<void> {
    const timeoutMs = Number(this.config.get('JOB_TIMEOUT_MS', DEFAULT_JOB_TIMEOUT_MS));
    let timeoutHandle: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`Job exceeded timeout of ${timeoutMs}ms`)), timeoutMs);
    });

    try {
      await Promise.race([this.runPipeline(jobId, imagePath), timeout]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }

  private async runPipeline(jobId: string, imagePath: string): Promise<void> {
    this.jobs.setStatus(jobId, 'processing');
    this.events.emit({ type: 'job:processing', jobId, timestamp: new Date().toISOString() });
    try {
      const vision = await this.timeStep(jobId, 'vision-analysis', { imagePath }, () =>
        this.vision.analyze(imagePath),
      );
      const style: Style = vision.result.recommended_style;

      let options: PixelizeOptions = {};
      let resultPath = '';
      let quality: QualityResult | undefined;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const suffix = attempt > 0 ? `-retry${attempt}` : '';
        resultPath = await this.timeStep(jobId, `pixelize${suffix}`, { style, options }, () =>
          pixelize(imagePath, style, options),
        );
        quality = await this.timeStep(jobId, `quality-gate${suffix}`, { resultPath, style }, () =>
          this.qualityGate.evaluate(resultPath, style, options),
        );
        if (quality.passed || attempt === MAX_RETRIES) {
          break;
        }
        options = quality.retryParams;
      }

      this.jobs.setDone(jobId, resultPath);
      this.events.emit({
        type: 'job:done',
        jobId,
        timestamp: new Date().toISOString(),
        resultUrl: `/api/result/${jobId}/image`,
        originalUrl: `/api/result/${jobId}/original`,
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Job ${jobId} failed: ${message}`);
      this.trace.record({
        jobId,
        step: 'error',
        timestamp: new Date().toISOString(),
        durationMs: 0,
        input: null,
        output: { error: message },
      });
      this.jobs.setFailed(jobId, message);
      this.events.emit({ type: 'job:failed', jobId, timestamp: new Date().toISOString(), error: message });
    }
  }

  private async timeStep<T>(
    jobId: string,
    step: string,
    input: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    const output = await fn();
    const durationMs = Date.now() - start;
    const timestamp = new Date().toISOString();
    this.trace.record({ jobId, step, timestamp, durationMs, input, output });
    this.events.emit({
      type: 'job:step',
      jobId,
      timestamp,
      step,
      durationMs,
      decision: summarizeDecision(step, output),
      tokens: tokensOfStep(step, output),
    });
    return output;
  }
}
