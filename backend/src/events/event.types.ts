export interface JobQueuedEvent {
  type: 'job:queued';
  jobId: string;
  timestamp: string;
  queuePosition: number;
}

export interface JobProcessingEvent {
  type: 'job:processing';
  jobId: string;
  timestamp: string;
}

export interface JobStepEvent {
  type: 'job:step';
  jobId: string;
  timestamp: string;
  step: string;
  durationMs: number;
  decision: string;
  tokens?: { promptEvalCount: number; evalCount: number };
}

export interface JobDoneEvent {
  type: 'job:done';
  jobId: string;
  timestamp: string;
  resultUrl: string;
  originalUrl: string;
}

export interface JobFailedEvent {
  type: 'job:failed';
  jobId: string;
  timestamp: string;
  error: string;
}

export interface MetricsEvent {
  type: 'metrics';
  timestamp: string;
  queueLength: number;
  activeJobs: number;
  completedCount: number;
  gpuUtilization: number | null;
  vramUsed: number | null;
  vramTotal: number | null;
}

export type PixelArtEvent =
  | JobQueuedEvent
  | JobProcessingEvent
  | JobStepEvent
  | JobDoneEvent
  | JobFailedEvent
  | MetricsEvent;
