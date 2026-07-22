import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { fetchResult, uploadPhoto } from '../lib/api';
import { usePixelArtEvents } from '../hooks/usePixelArtEvents';
import { friendlyStep } from '../lib/steps';
import type { PixelArtEvent, ResultResponse } from '../types';
import './UploadPage.css';

type Stage =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'error'; message: string }
  | { kind: 'queued'; jobId: string; position: number }
  | { kind: 'processing'; jobId: string; step?: string; decision?: string }
  | { kind: 'done'; jobId: string; resultUrl: string; originalUrl: string }
  | { kind: 'failed'; jobId: string; error: string };

const JOB_STORAGE_KEY = 'pixelize:lastJobId';

function readStoredJobId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('job');
  if (fromUrl) return fromUrl;
  return localStorage.getItem(JOB_STORAGE_KEY);
}

function rememberJobId(jobId: string): void {
  localStorage.setItem(JOB_STORAGE_KEY, jobId);
  const url = new URL(window.location.href);
  url.searchParams.set('job', jobId);
  window.history.replaceState(null, '', url.toString());
}

function forgetJobId(): void {
  localStorage.removeItem(JOB_STORAGE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete('job');
  window.history.replaceState(null, '', url.toString());
}

function stageFromResult(jobId: string, result: ResultResponse): Stage {
  if (result.status === 'done' && result.resultUrl) {
    return { kind: 'done', jobId, resultUrl: result.resultUrl, originalUrl: result.originalUrl };
  }
  if (result.status === 'failed') {
    return { kind: 'failed', jobId, error: result.error ?? 'unknown error' };
  }
  if (result.status === 'processing') {
    const lastStep = [...result.trace].reverse().find((entry) => entry.step !== 'error');
    return { kind: 'processing', jobId, step: lastStep?.step };
  }
  return { kind: 'queued', jobId, position: 0 };
}

export function UploadPage() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [dragActive, setDragActive] = useState(false);
  const trackedJobId = useRef<string | null>(null);

  useEffect(() => {
    const existing = readStoredJobId();
    if (!existing) return;
    trackedJobId.current = existing;
    rememberJobId(existing);
    fetchResult(existing)
      .then((result) => setStage(stageFromResult(existing, result)))
      .catch(() => {
        forgetJobId();
        trackedJobId.current = null;
      });
  }, []);

  usePixelArtEvents((event: PixelArtEvent) => {
    if (event.type === 'metrics') return;
    if (event.jobId !== trackedJobId.current) return;

    switch (event.type) {
      case 'job:queued':
        setStage({ kind: 'queued', jobId: event.jobId, position: event.queuePosition });
        break;
      case 'job:processing':
        setStage({ kind: 'processing', jobId: event.jobId });
        break;
      case 'job:step':
        setStage({ kind: 'processing', jobId: event.jobId, step: event.step, decision: event.decision });
        break;
      case 'job:done':
        setStage({ kind: 'done', jobId: event.jobId, resultUrl: event.resultUrl, originalUrl: event.originalUrl });
        break;
      case 'job:failed':
        setStage({ kind: 'failed', jobId: event.jobId, error: event.error });
        break;
    }
  });

  const handleFile = useCallback(async (file: File) => {
    setStage({ kind: 'uploading' });
    try {
      const { jobId } = await uploadPhoto(file);
      trackedJobId.current = jobId;
      rememberJobId(jobId);
      setStage({ kind: 'queued', jobId, position: 0 });
    } catch (err) {
      setStage({ kind: 'error', message: (err as Error).message });
    }
  }, []);

  function reset(): void {
    trackedJobId.current = null;
    forgetJobId();
    setStage({ kind: 'idle' });
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="upload-page">
      <h1>Pixelize</h1>

      {(stage.kind === 'idle' || stage.kind === 'error') && (
        <>
          <label
            className={`dropzone ${dragActive ? 'dropzone--active' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
          >
            <input type="file" accept="image/*" capture="environment" onChange={onInputChange} hidden />
            <span className="dropzone__icon">📷</span>
            <span>Tap to take or choose a photo</span>
          </label>
          {stage.kind === 'error' && <p className="status status--error">{stage.message}</p>}
        </>
      )}

      {stage.kind === 'uploading' && <p className="status">Uploading…</p>}

      {stage.kind === 'queued' && (
        <p className="status">In queue{stage.position ? ` — position ${stage.position}` : ''}</p>
      )}

      {stage.kind === 'processing' && (
        <p className="status">
          Processing{stage.step ? ` — ${friendlyStep(stage.step)}` : '…'}
          {stage.decision && <span className="status__detail">{stage.decision}</span>}
        </p>
      )}

      {stage.kind === 'failed' && (
        <>
          <p className="status status--error">Failed: {stage.error}</p>
          <button onClick={reset}>Try again</button>
        </>
      )}

      {stage.kind === 'done' && (
        <>
          <div className="before-after">
            <div>
              <p className="before-after__label">Before</p>
              <img src={stage.originalUrl} alt="original upload" />
            </div>
            <div>
              <p className="before-after__label">After</p>
              <img src={stage.resultUrl} alt="pixel art result" className="pixel-image" />
            </div>
          </div>
          <button onClick={reset}>Upload another</button>
        </>
      )}
    </div>
  );
}
