import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PIXEL_ART_QUEUE } from './queue.constants';

export function PixelArtQueueProvider(config: ConfigService): Queue {
  const logger = new Logger('PixelArtQueue');
  const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
  const url = new URL(redisUrl);

  const queue = new Queue(PIXEL_ART_QUEUE, {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
    },
  });

  queue.on('error', (err) => {
    logger.error(`Queue connection error: ${err.message}`);
  });

  queue.waitUntilReady().then(() => {
    logger.log(`Connected to Redis, queue "${PIXEL_ART_QUEUE}" ready`);
  });

  return queue;
}
