import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface HealthStatus {
  status: 'ok';
  ollama: boolean;
  redis: boolean;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly config: ConfigService) {}

  async check(): Promise<HealthStatus> {
    const [ollama, redis] = await Promise.all([
      this.checkOllama(),
      this.checkRedis(),
    ]);
    return { status: 'ok', ollama, redis };
  }

  private async checkOllama(): Promise<boolean> {
    const baseUrl = this.config.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11436',
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      return res.ok;
    } catch (err) {
      this.logger.warn(`Ollama health check failed: ${(err as Error).message}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkRedis(): Promise<boolean> {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    const client = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG';
    } catch (err) {
      this.logger.warn(`Redis health check failed: ${(err as Error).message}`);
      return false;
    } finally {
      client.disconnect();
    }
  }
}
