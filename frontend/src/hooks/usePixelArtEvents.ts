import { useEffect, useRef } from 'react';
import type { PixelArtEvent } from '../types';

/** Subscribes to the backend's SSE stream for the lifetime of the component. */
export function usePixelArtEvents(onEvent: (event: PixelArtEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onmessage = (message) => {
      try {
        handlerRef.current(JSON.parse(message.data) as PixelArtEvent);
      } catch {
        // ignore malformed events
      }
    };
    return () => source.close();
  }, []);
}
