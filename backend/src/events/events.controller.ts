import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { EventsService } from './events.service';

@Controller('api')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('events')
  stream(): Observable<MessageEvent> {
    return this.events.stream().pipe(map((event) => ({ data: event })));
  }
}
