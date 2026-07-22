import type { ResultResponse } from '../types';

export interface UploadResponse {
  jobId: string;
  status: 'queued';
  queuePosition: number;
}

export async function uploadPhoto(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `upload failed (${res.status})`);
  }
  return res.json() as Promise<UploadResponse>;
}

export async function fetchResult(jobId: string): Promise<ResultResponse> {
  const res = await fetch(`/api/result/${jobId}`);
  if (!res.ok) {
    throw new Error(`result fetch failed (${res.status})`);
  }
  return res.json() as Promise<ResultResponse>;
}

export interface AppConfig {
  uploadUrl: string;
  lanIp: string;
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`config fetch failed (${res.status})`);
  }
  return res.json() as Promise<AppConfig>;
}
