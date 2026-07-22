import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Queue } from 'bullmq';
import { PIXEL_ART_QUEUE } from '../queue/queue.constants';
import { JobsService } from '../jobs/jobs.service';
import { EventsService } from '../events/events.service';
import { uploadRoot } from './upload.constants';

const MAX_SIZE_BYTES = Number(process.env.UPLOAD_MAX_SIZE_MB ?? 10) * 1024 * 1024;

function extensionFor(file: Express.Multer.File): string {
  const fromName = path.extname(file.originalname);
  if (fromName) return fromName;
  const fromMime = file.mimetype.split('/')[1];
  return fromMime ? `.${fromMime}` : '.png';
}

@Controller('api/upload')
export class UploadController {
  constructor(
    @Inject(PIXEL_ART_QUEUE) private readonly queue: Queue,
    private readonly jobs: JobsService,
    private readonly events: EventsService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new BadRequestException('file must be an image'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ jobId: string; status: 'queued'; queuePosition: number }> {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const jobId = randomUUID();
    const jobDir = path.join(uploadRoot(), jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    const imagePath = path.join(jobDir, `original${extensionFor(file)}`);
    fs.writeFileSync(imagePath, file.buffer);

    this.jobs.create(jobId, imagePath);

    // Emit job:queued and only then enqueue — the worker can pick up the job as soon as it's
    // added, and if that race wins, job:processing would otherwise arrive before job:queued.
    const queuePosition = (await this.queue.getWaitingCount()) + 1;
    this.events.emit({ type: 'job:queued', jobId, timestamp: new Date().toISOString(), queuePosition });
    await this.queue.add('pixelize', { jobId, imagePath });

    return { jobId, status: 'queued', queuePosition };
  }
}
