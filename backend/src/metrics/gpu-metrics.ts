import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GpuMetrics {
  utilization: number;
  vramUsed: number;
  vramTotal: number;
}

/** Reads live GPU stats via nvidia-smi. Returns null if unavailable (e.g. no NVIDIA GPU on this host). */
export async function readGpuMetrics(): Promise<GpuMetrics | null> {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits',
    );
    const firstLine = stdout.trim().split('\n')[0];
    if (!firstLine) return null;
    const [utilization, vramUsed, vramTotal] = firstLine.split(',').map((v) => Number(v.trim()));
    if ([utilization, vramUsed, vramTotal].some((v) => Number.isNaN(v))) {
      return null;
    }
    return { utilization, vramUsed, vramTotal };
  } catch {
    return null;
  }
}
