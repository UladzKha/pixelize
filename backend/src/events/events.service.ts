import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { PixelArtEvent } from './event.types';

@Injectable()
export class EventsService {
  private readonly subject = new Subject<PixelArtEvent>();

  emit(event: PixelArtEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<PixelArtEvent> {
    return this.subject.asObservable();
  }
}
