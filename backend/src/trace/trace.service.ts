import { Injectable } from '@nestjs/common';
import { TraceEntry } from './trace.types';

@Injectable()
export class TraceService {
  private readonly entries = new Map<string, TraceEntry[]>();

  record(entry: TraceEntry): void {
    const list = this.entries.get(entry.jobId) ?? [];
    list.push(entry);
    this.entries.set(entry.jobId, list);
  }

  get(jobId: string): TraceEntry[] {
    return this.entries.get(jobId) ?? [];
  }
}
