export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface JobRecord {
  jobId: string;
  status: JobStatus;
  imagePath: string;
  resultPath?: string;
  error?: string;
  createdAt: string;
}
