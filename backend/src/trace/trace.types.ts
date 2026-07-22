export interface TraceEntry {
  jobId: string;
  step: string;
  timestamp: string;
  durationMs: number;
  input: unknown;
  output: unknown;
}
