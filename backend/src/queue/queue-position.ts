import { Queue } from 'bullmq';

export async function getQueuePosition(queue: Queue, jobId: string): Promise<number | undefined> {
  const waiting = await queue.getWaiting(0, -1);
  const index = waiting.findIndex((job) => job.data?.jobId === jobId);
  return index === -1 ? undefined : index + 1;
}
