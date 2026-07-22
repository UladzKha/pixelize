import { useEffect, useRef, useState } from 'react';
import { usePixelArtEvents } from '../hooks/usePixelArtEvents';
import { friendlyStep } from '../lib/steps';
import { fetchConfig, type AppConfig } from '../lib/api';
import { QrCode } from '../components/QrCode';
import type { PixelArtEvent } from '../types';
import './DashboardPage.css';

interface GalleryItem {
  jobId: string;
  resultUrl: string;
  originalUrl: string;
}

interface QueueState {
  pending: number;
  active: number;
  completed: number;
}

interface GpuState {
  utilization: number | null;
  vramUsed: number | null;
  vramTotal: number | null;
}

interface AgentState {
  step: string | null;
  decision: string | null;
}

const MAX_GALLERY = 5;
const MAX_DURATIONS = 20;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

export function DashboardPage() {
  const [queue, setQueue] = useState<QueueState>({ pending: 0, active: 0, completed: 0 });
  const [gpu, setGpu] = useState<GpuState>({ utilization: null, vramUsed: null, vramTotal: null });
  const [agent, setAgent] = useState<AgentState>({ step: null, decision: null });
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [tokens, setTokens] = useState({ prompt: 0, eval: 0 });
  const [durations, setDurations] = useState<number[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [presentation, setPresentation] = useState(false);

  const queuedAt = useRef(new Map<string, number>());
  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  function togglePresentation(): void {
    setPresentation((prev) => {
      const next = !prev;
      if (next) setShowQr(true);
      return next;
    });
  }

  usePixelArtEvents((event: PixelArtEvent) => {
    switch (event.type) {
      case 'metrics':
        setQueue({ pending: event.queueLength, active: event.activeJobs, completed: event.completedCount });
        setGpu({ utilization: event.gpuUtilization, vramUsed: event.vramUsed, vramTotal: event.vramTotal });
        break;

      case 'job:queued':
        queuedAt.current.set(event.jobId, Date.parse(event.timestamp));
        break;

      case 'job:step':
        setAgent({ step: event.step, decision: event.decision });
        if (event.tokens) {
          const { promptEvalCount, evalCount } = event.tokens;
          setTokens((prev) => ({ prompt: prev.prompt + promptEvalCount, eval: prev.eval + evalCount }));
        }
        break;

      case 'job:done': {
        const start = queuedAt.current.get(event.jobId);
        if (start != null) {
          setDurations((prev) => [...prev.slice(-(MAX_DURATIONS - 1)), Date.now() - start]);
          queuedAt.current.delete(event.jobId);
        }
        setGallery((prev) =>
          [{ jobId: event.jobId, resultUrl: event.resultUrl, originalUrl: event.originalUrl }, ...prev].slice(
            0,
            MAX_GALLERY,
          ),
        );
        requestAnimationFrame(() => galleryRef.current?.scrollTo({ left: 0, behavior: 'smooth' }));
        break;
      }

      case 'job:failed':
        queuedAt.current.delete(event.jobId);
        break;
    }
  });

  const lastDuration = durations.length ? durations[durations.length - 1] : null;
  const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const vramPct = gpu.vramUsed != null && gpu.vramTotal ? Math.round((gpu.vramUsed / gpu.vramTotal) * 100) : null;

  return (
    <div className={`dashboard ${presentation ? 'dashboard--presentation' : ''}`}>
      <header className="dashboard__header">
        <h1>Pixelize — Live</h1>
        <div className="dashboard__toolbar">
          <button onClick={() => setShowQr((v) => !v)}>{showQr ? 'Hide QR' : 'Show QR'}</button>
          <button onClick={togglePresentation}>
            {presentation ? 'Exit presentation' : 'Presentation mode'}
          </button>
        </div>
      </header>

      <div className="dashboard__grid">
        {showQr && config && (
          <section className="panel panel--qr">
            <h2>Scan to upload</h2>
            <QrCode value={config.uploadUrl} size={presentation ? 320 : 160} />
            <p className="qr__url">{config.uploadUrl}</p>
          </section>
        )}

        <section className="panel panel--queue">
          <h2>Queue</h2>
          <div className="stat-row">
            <Stat label="Pending" value={queue.pending} />
            <Stat label="Active" value={queue.active} />
            <Stat label="Completed" value={queue.completed} />
          </div>
        </section>

        <section className="panel panel--agent">
          <h2>Current Agent</h2>
          {agent.step ? (
            <>
              <p className="agent__step">{friendlyStep(agent.step)}</p>
              <p className="agent__decision">{agent.decision}</p>
            </>
          ) : (
            <p className="agent__idle">Waiting for jobs…</p>
          )}
        </section>

        <section className="panel panel--metrics">
          <h2>Metrics</h2>
          <div className="stat-row">
            <Stat label="Last job" value={lastDuration != null ? `${(lastDuration / 1000).toFixed(1)}s` : '—'} />
            <Stat label="Avg job" value={avgDuration != null ? `${(avgDuration / 1000).toFixed(1)}s` : '—'} />
            <Stat label="Tokens" value={tokens.prompt + tokens.eval} />
          </div>
          <div className="gauge">
            <div className="gauge__label">
              GPU utilization {gpu.utilization != null ? `${gpu.utilization}%` : 'n/a'}
            </div>
            <div className="gauge__track">
              <div className="gauge__fill" style={{ width: `${gpu.utilization ?? 0}%` }} />
            </div>
          </div>
          <div className="gauge">
            <div className="gauge__label">
              VRAM{' '}
              {gpu.vramUsed != null && gpu.vramTotal != null
                ? `${(gpu.vramUsed / 1024).toFixed(1)} / ${(gpu.vramTotal / 1024).toFixed(1)} GB`
                : 'n/a'}
            </div>
            <div className="gauge__track">
              <div className="gauge__fill gauge__fill--vram" style={{ width: `${vramPct ?? 0}%` }} />
            </div>
          </div>
        </section>

        <section className="panel panel--gallery">
          <h2>Gallery</h2>
          <div className="gallery" ref={galleryRef}>
            {gallery.length === 0 && <p className="agent__idle">No results yet</p>}
            {gallery.map((item) => (
              <div className="gallery__card" key={item.jobId}>
                <img src={item.originalUrl} alt="original" />
                <img src={item.resultUrl} alt="pixel art" className="pixel-image" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
