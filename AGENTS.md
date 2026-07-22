# AGENTS.md — Instructions for the Coding Agent

You are building an Agentic AI Demo Platform. Read PROJECT.md first for full context.

## Rules (never violate)

1. Run `tsc --noEmit && npm test` after every change. Never commit red.
2. Never modify existing passing tests without explicit human approval.
3. Canonical data (palettes, configs) lives in files under `/data`. Never hardcode color values, palette arrays, or config from memory — always read from disk at runtime.
4. `sharp.concurrency(1)` — always. Required for deterministic output.
5. One step at a time. Finish current step's Definition of Done before starting next.
6. All code in TypeScript, strict mode.
7. Do not add dependencies without stating why. Prefer stdlib and already-installed packages.
8. Every agent decision (LLM call input/output, tool parameters, quality score) must be written to the trace store. No silent steps.

---

## Project Structure

```
agentic-demo/
├── docker-compose.yml
├── package.json                  # workspace root
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.ts               # NestJS bootstrap
│   │   ├── app.module.ts
│   │   ├── upload/               # upload endpoint
│   │   ├── queue/                # BullMQ job processor
│   │   ├── orchestrator/         # pipeline orchestrator
│   │   ├── agents/
│   │   │   ├── vision-analysis.agent.ts
│   │   │   └── quality-gate.agent.ts
│   │   ├── tools/
│   │   │   └── pixelize.tool.ts  # sharp-based pixel art renderer
│   │   ├── trace/                # trace store (decisions log)
│   │   ├── metrics/              # GPU metrics (nvidia-smi parser)
│   │   └── events/               # SSE endpoint for dashboard
│   └── data/
│       ├── nes-palette.txt       # 55 colors, canonical source
│       └── pc98-palette.txt      # 16 colors for dithering
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       │   ├── UploadPage.tsx     # photo upload (mobile-friendly)
│       │   └── DashboardPage.tsx  # live dashboard (big screen)
│       └── components/
└── samples/                      # test photos
```

---

## Build Phases

### Phase 1 — Scaffold (Monday PM)

**Goal:** `docker compose up` starts Redis, backend, frontend. Backend connects to Ollama.

**Tasks:**
- Initialize monorepo with npm workspaces (backend + frontend)
- Backend: NestJS with TypeScript strict
- Frontend: React + Vite + TypeScript
- docker-compose.yml: Redis (port 6379), backend (port 3000), frontend (port 5173)
- Backend health endpoint: GET /health → { status: "ok", ollama: true/false, redis: true/false }
- Backend connects to Ollama at configurable URL (env: OLLAMA_BASE_URL, default http://localhost:11436)
- BullMQ connected to Redis, one queue "pixel-art-jobs"

**Definition of Done:**
- `docker compose up` — all services start, no errors
- GET /health returns ollama: true (Ollama must be running on host)
- BullMQ dashboard or log shows queue connected

**Do NOT do yet:** upload endpoint, pixelize, agents, frontend pages.

---

### Phase 2 — Pipeline Core (Tuesday)

**Goal:** POST a photo → get pixel art PNG back.

**Tasks:**

**2a: Upload endpoint**
- POST /api/upload — accepts multipart image (max 10MB)
- Saves to /tmp/uploads/{jobId}/original.{ext}
- Creates BullMQ job with { jobId, imagePath, status: "queued" }
- Returns { jobId, status: "queued" }

**2b: Pixelize tool**
- `pixelize.tool.ts` — function that takes (imagePath, style, options) → outputPath
- Styles: "nes-flat" (nearest color, NES palette from /data/nes-palette.txt) and "pc98-dither" (ordered 8x8 Bayer dithering, PC-98 palette from /data/pc98-palette.txt)
- Output size: configurable, default 128px wide, aspect ratio preserved
- sharp.concurrency(1) at module level
- Palette loaded from file on each call (rule 3)
- Output: PNG saved to /tmp/uploads/{jobId}/result.png

**2c: Vision analysis agent**
- Calls Ollama chat API with image (base64) and vision prompt
- Uses `format: "json"` for constrained output
- Parses response, validates required fields
- On parse failure: one retry with error feedback
- Returns: { scene_type, dominant_colors, has_gradients, recommended_style, reasoning }

**2d: Quality gate (Variant C — hybrid)**

Deterministic gate (pass/fail):
- Analyze result PNG: color histogram distribution, banding detection
- Color count: how many unique palette colors actually used
- Returns: { passed: boolean, score: number, reason: string }
- If failed and retries < 2: adjust parameters (e.g., change output size, toggle dithering strength), re-run pixelize

LLM comment (non-blocking, fire-and-forget):
- Send result PNG to qwen3.6:27b with prompt: "Describe this pixel art in one sentence: what scene, what style, what works well"
- Store comment in trace, emit via SSE for dashboard display
- Do NOT block pipeline on this — result is returned to user as soon as deterministic gate passes
- If LLM comment fails or times out, skip silently — it's cosmetic

**2e: Orchestrator**
- Processes BullMQ job through: vision → pixelize → quality gate (→ retry loop if needed)
- Each step writes to trace store: { jobId, step, timestamp, input, output, duration_ms }
- On completion: job status → "done", result path saved
- On failure: job status → "failed", error logged in trace

**2f: Result endpoint**
- GET /api/result/{jobId} → { status, resultUrl?, trace }
- GET /api/result/{jobId}/image → serves result PNG

**Definition of Done:**
- `curl -F "file=@photo.jpg" http://localhost:3000/api/upload` returns jobId
- Poll GET /api/result/{jobId} → eventually status: "done"
- GET /api/result/{jobId}/image → valid PNG pixel art
- Trace contains 3+ entries (vision, pixelize, quality)

---

### Phase 3 — Frontend + Dashboard (Wednesday)

**Goal:** Two working pages: upload (mobile) and dashboard (big screen).

**Tasks:**

**3a: SSE event stream**
- GET /api/events — SSE stream
- Events: job:queued, job:processing, job:step (with agent name + decision), job:done, job:failed
- Metrics event every 2s: { queue_length, active_jobs, completed_count, gpu_utilization, vram_used, vram_total }
- GPU metrics: parse `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits`

**3b: Upload page**
- Mobile-first design, works on phone
- Drag & drop or camera capture
- Shows: upload progress → "in queue (position N)" → "processing (step: vision analysis)" → result (before/after)
- Each user tracks their own job by jobId (stored in URL or localStorage)

**3c: Dashboard page**
- Designed for large monitor / TV
- Layout sections:
  - Queue: pending count, active job, completed count
  - Current Agent: which step is running, last decision ("chose pc98-dither because: smooth sky gradients")
  - Metrics: processing time (avg/last), tokens used, GPU utilization gauge, VRAM bar
  - Gallery: last 5 results as before/after cards
- All data from SSE, no polling
- Auto-scrolls gallery as new results arrive

**Definition of Done:**
- Open upload page on phone → upload photo → see status updates → see result
- Dashboard on desktop shows live queue, agent decisions, GPU metrics
- Two browser windows simultaneously: upload + dashboard, both update in real time

---

### Phase 4 — QR + Stress Test (Thursday)

**Tasks:**

**4a: QR code**
- Generate QR code pointing to upload page URL
- Display QR on dashboard page (toggle-able, for presentation mode)
- URL uses host machine's LAN IP (auto-detected or configurable via env)

**4b: Presentation mode**
- Dashboard has a "presentation" toggle: larger fonts, darker background, QR prominent
- Gallery shows before/after side by side, large

**4c: Stress test**
- Script that uploads 10 photos in parallel
- Verify: all 10 complete, no timeouts, no lost jobs
- Record metrics for presentation slide

**4d: Cleanup**
- Auto-delete uploads older than 1 hour
- Job data retained for dashboard history during demo session

**Definition of Done:**
- Scan QR from phone → opens upload page → full flow works
- 10 concurrent uploads all complete successfully
- Dashboard shows correct metrics throughout stress test

---

## Palette Files

### /data/nes-palette.txt
55 colors, one hex per line (#RRGGBB), no comments. Source of truth for nes-flat style.
This file must be created from the canonical NES palette. The agent must NOT generate colors from memory.

### /data/pc98-palette.txt
16 colors, one hex per line (#RRGGBB). Source of truth for pc98-dither style.
Same rule: from reference, not from memory.

---

## Environment Variables

```
OLLAMA_BASE_URL=http://localhost:11434
REDIS_URL=redis://localhost:6379
QUALITY_GATE_VARIANT=deterministic  # llm | deterministic | hybrid
UPLOAD_MAX_SIZE_MB=10
JOB_TIMEOUT_MS=120000
GPU_METRICS_INTERVAL_MS=2000
CLEANUP_MAX_AGE_MS=3600000
LAN_IP=auto  # or explicit IP for QR code
```

---

## Testing Strategy

- Unit tests: pixelize tool (known input → known output with fixed palette)
- Integration tests: upload → queue → result cycle
- E2E: not required for demo, manual testing Thursday covers this
- Stress test: 10 concurrent uploads script (Phase 4)

Tests run in CI-less mode: `npm test` from root runs all workspace tests.
