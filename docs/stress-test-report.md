# Stress Test Report — 10 Concurrent Uploads

Run: 2026-07-21, against a local `docker compose up` stack (Redis + backend +
frontend, host network) with `qwen3.6:27b-mtp-q4_K_M` on the RTX 3090.

## Result: AC7 met

| Metric | Value |
|---|---|
| Jobs submitted concurrently | 10 |
| Succeeded | 10 |
| Failed | 0 |
| Timed out | 0 |
| Lost / dropped | 0 |
| Wall clock (first upload → last job done) | 252.8s (~4.2 min) |

No job was lost or hung. `JOB_TIMEOUT_MS` (120s per job, orchestrator-level)
was never hit.

## Per-job processing time (vision + pixelize + quality gate, excludes queue wait)

Since `BullMQ` runs with `concurrency: 1` (deliberate — avoids concurrent
GPU/VRAM contention, see PROJECT.md risk register), jobs process strictly
sequentially. The wall-clock "total" time per job in the raw report includes
queue wait, which grows with queue position. The number that matters for
capacity planning is per-job processing time:

| Job | Vision latency | Total processing | Retries |
|---|---|---|---|
| 1 | 16s | 16s | 0 |
| 2 | 19s | 19s | 2 |
| 3 | 33s | 33s | 0 |
| 4 | 10s | 10s | 0 |
| 5 | 45s | 45s | 2 |
| 6 | 13s | 13s | 0 |
| 7 | 51s | 51s | 1 |
| 8 | 26s | 26s | 0 |
| 9 | 21s | 21s | 2 |
| 10 | 19s | 19s | 0 |

- **Avg processing time:** ~25.3s/job — matches the PROJECT.md capacity
  estimate (~20–30s/job).
- **Vision latency range:** 10–51s. The spread is Ollama inference variance
  under repeated back-to-back calls, not cold start (see caveat below).
- **Quality gate retries fired correctly** on 4/10 jobs (max 2 retries,
  per AC5) and all still converged to a passing result — the retry loop
  works under load, not just in isolation.

## Caveat: cold-start latency

The very first vision call after the model was idle took long enough to hit
the Ollama HTTP client's 60s per-call timeout (`ollamaChatJson` default in
`backend/src/agents/ollama.client.ts`) and the job failed with "operation was
aborted". Once the model was resident in VRAM, calls consistently completed
in 10–51s. This did not affect the 10-job stress run above (model was
already warm), but for the live demo Friday: **warm the model with one
throwaway upload before the audience starts scanning the QR code.**

## Extrapolated demo capacity

At ~25s/job sequential (concurrency 1 by design), the PROJECT.md demo
scenario of 20 jobs (10 people × 2 photos) is ~8–9 minutes end-to-end,
consistent with the original capacity math.

## How to reproduce

```bash
docker compose up -d
node scripts/stress-test.mts
```

Env overrides: `BACKEND_URL`, `STRESS_CONCURRENCY` (default 10),
`STRESS_TIMEOUT_MS` (default 600000 — generous per-job deadline to absorb
queue wait), `STRESS_POLL_INTERVAL_MS`. Full machine-readable results are
written to `docs/stress-test-report.json` on every run.
