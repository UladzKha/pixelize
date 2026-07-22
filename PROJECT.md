# Agentic AI Demo Platform

## One-liner
Интерактивная демо-платформа, которая превращает фото в пиксель-арт через агентный пайплайн на локальных моделях — с живым дашбордом, где видно каждое решение агента.

## Тезис доклада
"Все строят агентов, но почти никто не может доказать, что они работают.
Мы покажем агента, которому можно доверять — потому что его видно."

---

## Constraints

### Hardware (production runtime)
- GPU 1: RTX 3090 24GB VRAM (primary — LLM inference)
- GPU 2: RTX 4060Ti 16GB VRAM (available for offload)
- Runtime model: qwen3.6:27b via Ollama (vision-capable)
- All inference LOCAL ONLY — no cloud API calls in demo runtime

### Build tools
- Claude Code (Sonnet) — строит платформу
- В рантайме демо — только локальные модели

### Audience
- 5–10 разработчиков, внутренний демо в компании
- Технически грамотные — будут смотреть на архитектуру, не только на результат
- Дата: пятница (5 рабочих дней)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)           │
│                                                     │
│   ┌──────────────┐          ┌─────────────────────┐ │
│   │ Upload Page   │          │ Live Dashboard      │ │
│   │ (QR → phone)  │          │ - Queue status      │ │
│   │               │          │ - Agent decisions   │ │
│   │               │          │ - GPU/VRAM metrics  │ │
│   │               │          │ - Result gallery    │ │
│   └──────┬───────┘          └──────────▲──────────┘ │
│          │                             │ SSE/WS     │
└──────────┼─────────────────────────────┼────────────┘
           │ POST /upload                │
┌──────────▼─────────────────────────────┼────────────┐
│                 Backend (NestJS)                      │
│                                                      │
│   ┌─────────────────────────────────────────────┐    │
│   │              Orchestrator                    │    │
│   │                                              │    │
│   │   Step 1: Vision Analysis Agent (LLM)        │    │
│   │   ┌─────────────────────────────────────┐    │    │
│   │   │ Input: photo                         │    │    │
│   │   │ Output: scene_type, dominant_colors, │    │    │
│   │   │   has_gradients, recommended_style,  │    │    │
│   │   │   parameters                         │    │    │
│   │   │ Decision: nes-flat vs pc98-dither    │    │    │
│   │   └──────────────┬──────────────────────┘    │    │
│   │                  ▼                            │    │
│   │   Step 2: Pixelize Tool (deterministic)       │    │
│   │   ┌─────────────────────────────────────┐    │    │
│   │   │ Input: photo + style + parameters    │    │    │
│   │   │ Tool: sharp + NES/PC-98 palette      │    │    │
│   │   │ Output: pixel art image (PNG)        │    │    │
│   │   │ sharp.concurrency(1) — deterministic │    │    │
│   │   └──────────────┬──────────────────────┘    │    │
│   │                  ▼                            │    │
│   │   Step 3: Quality Gate (TBD — see below)      │    │
│   │   ┌─────────────────────────────────────┐    │    │
│   │   │ Evaluate result                      │    │    │
│   │   │ Below threshold → retry Step 2       │    │    │
│   │   │   with adjusted parameters           │    │    │
│   │   │ Max 2 retries                        │    │    │
│   │   └──────────────┬──────────────────────┘    │    │
│   │                  ▼                            │    │
│   │   Done: result saved, event emitted           │    │
│   └──────────────────────────────────────────────┘    │
│                                                      │
│   ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│   │ BullMQ   │  │ Redis     │  │ Trace Store      │ │
│   │ Queue    │  │           │  │ (decisions log)  │ │
│   └──────────┘  └───────────┘  └──────────────────┘ │
│                                                      │
│   ┌──────────────────────────────────────────────┐   │
│   │ Ollama (qwen3.6:27b)                         │   │
│   │ RTX 3090 24GB — primary inference            │   │
│   └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Quality Gate — Variant C: Hybrid (decided)

**Gate (pass/fail):** deterministic metrics (<1s)
- Гистограмма: распределение цветов (нет ли 1–2 доминирующих кластеров = banding)
- Color count: количество уникальных цветов из палитры фактически использовано
- Threshold: configurable, fail → retry with adjusted parameters (max 2)

**Comment (display):** LLM generates human-readable description of the result
- "Пейзаж с закатом, dithering хорошо передал градиент неба"
- Показывается на дашборде — третье LLM-решение в пайплайне
- Не блокирует pipeline — fire-and-forget, результат отдаётся параллельно

---

## Acceptance Criteria

### AC1 — One Command Start
Весь стек поднимается одной командой (`docker compose up` или `make start`).
Redis, Ollama, backend, frontend — всё в compose.

### AC2 — Photo Upload
Пользователь открывает URL (или QR), загружает фото с телефона.
Фото попадает в очередь. Пользователь видит статус ("в очереди", "обрабатывается", "готово").

### AC3 — Vision Analysis (LLM Decision)
qwen3.6:27b анализирует фото и возвращает JSON с рекомендацией стиля.
JSON парсится без ошибок. Решение логировано в trace store.

### AC4 — Pixel Art Rendering
Фото конвертируется в пиксель-арт выбранным стилем.
Палитра загружается из файла (не из памяти модели).
sharp.concurrency(1). Результат — PNG.

### AC5 — Quality Gate
Результат проходит проверку качества.
Если не прошёл — автоматический ретрай с изменёнными параметрами (max 2).
Каждое решение (pass/fail/retry + причина) логировано в trace.

### AC6 — Live Dashboard
Дашборд на отдельном экране показывает в реальном времени:
- Очередь: длина, текущая джоба, completed count
- Агент: текущий шаг, decisions (какой стиль выбрал и почему)
- Метрики: processing time, tokens used
- GPU: VRAM usage, utilization (nvidia-smi)
- Галерея: последние результаты (до/после)
Обновление по SSE или WebSocket, не polling.

### AC7 — Concurrent Users
5 пользователей одновременно загружают фото.
Очередь обрабатывает последовательно, каждый видит свою позицию.
Ни один job не теряется, ни один не зависает (timeout 120s).

### AC8 — Trace / Observability
Каждый job порождает trace: timestamps, agent decisions, parameters, retries, errors.
Trace доступен на дашборде. Можно открыть детали конкретного job.

---

## Capacity Math

### Worst case per job (Variant C)
- Vision analysis: ~15–25s (27B on 3090)
- Pixelize render: ~3–5s (CPU + sharp)
- Quality gate (deterministic): <1s
- LLM comment (parallel, non-blocking): ~10–15s
- Total per job: ~20–30s (comment finishes while next job starts)

### Demo scenario: 10 people × 2 photos each = 20 jobs
- 20 × 25s avg = ~8 min
- Acceptable for 30-min demo slot

### Mitigation
- Limit: max 3 uploads per user
- Pre-loaded sample photos as fallback
- If Wi-Fi fails: presenter uploads from laptop

---

## Tech Stack

| Component       | Technology                    |
|----------------|-------------------------------|
| Backend        | NestJS + TypeScript            |
| Queue          | BullMQ                         |
| Cache/Broker   | Redis                          |
| Frontend       | React + Vite + TypeScript      |
| Realtime       | SSE (Server-Sent Events)       |
| LLM            | qwen3.6:27b via Ollama         |
| Image Tool     | sharp (pixel art rendering)    |
| GPU Metrics    | nvidia-smi (parsed)            |
| Containerization| Docker Compose                |

---

## Sprint Plan

### Monday — Foundation + Vision Test

**Morning: Vision capability test**
- Прогнать 10 фото через qwen3.6:27b с vision-промптом
- Критерии: JSON парсится 8+/10, рекомендации согласованы
- Замерить latency per call
- Результат: решение по Quality Gate (вариант A/B/C)
- Зафиксировать в этом документе

**Afternoon: Scaffold**
- Monorepo: backend (NestJS) + frontend (React+Vite)
- Docker Compose: Redis, Ollama
- Backend подключен к Ollama, health check проходит
- `docker compose up` — всё стартует

**Deliverable:** Стек запускается, vision-промпт проверен, архитектура quality gate зафиксирована.

### Tuesday — Pipeline End-to-End

- POST /upload принимает фото, кладёт job в BullMQ
- Orchestrator: vision analysis → pixelize tool → quality gate
- Pixelize: NES-палитра из файла, PC-98 dithering, sharp.concurrency(1)
- Палитры из файлов в /data (canonical source, не модель)
- Результат сохраняется, job помечен done
- Trace: каждый шаг пишет timestamp + input/output + decision

**Deliverable:** curl загружает фото → получает pixel art PNG. Trace в логе.

### Wednesday — Dashboard + Upload UI

- React: страница загрузки (drag & drop или камера телефона)
- React: дашборд с SSE — очередь, текущий агент, decisions, метрики
- GPU metrics: парсинг nvidia-smi по cron (каждые 2s)
- Галерея результатов (before/after карусель)

**Deliverable:** Два экрана работают в браузере, данные live.

### Thursday — Integration + Stress Test

**Morning:**
- QR-код на upload-страницу
- Мобильная загрузка работает
- Стили (NES-flat + PC-98 dithering) переключаются корректно

**Afternoon: Нагрузочный тест**
- 10 фото в очередь одновременно
- Проверить: ни один job не потерян, таймауты не сработали
- Замерить реальные цифры для слайда Metrics
- План Б: 5 предзагруженных фото на случай проблем с Wi-Fi/GPU

**Deliverable:** Полный прогон как на демо. Цифры записаны.

### Friday — Presentation

**Структура (20–25 мин):**

1. **Проблема** (2 мин)
   "Все подключают LLM, но никто не может доказать, что агент работает."

2. **Подход** (3 мин)
   Архитектура: оркестратор → агенты → инструменты.
   Два настоящих LLM-решения, а не шесть переименованных функций.

3. **Live Demo** (10 мин)
   QR-код → аудитория загружает фото → дашборд на большом экране.
   Все смотрят: какой стиль выбрал агент, прошёл ли quality gate.

4. **Что я узнал, когда измерял** (5 мин)
   Истории из экспериментов: галлюцинации палитры, фейковый self-review,
   игнорирование канонических данных. Вывод: observability — не роскошь.

5. **What's Next** (2 мин)
   Тот же оркестратор + другой tool = RAG / Code Review / Meeting Assistant.
   Архитектура не меняется.

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vision model unstable JSON | Pipeline breaks | Test Monday AM; fallback: Ollama format:json |
| qwen3.6:27b quality eval unreliable | No self-correction | Use deterministic metrics (variant B/C) |
| Job processing too slow | Audience bored | Pre-calculate capacity; limit uploads; pre-loaded fallback photos |
| Wi-Fi fails during demo | No audience uploads | Presenter uploads from laptop; pre-loaded queue |
| GPU OOM with concurrent vision calls | Crash | Sequential queue (BullMQ concurrency: 1); monitor VRAM |
| Docker compose fails on demo machine | No demo | Test full cold start Thursday; have non-Docker fallback |

---

## Decisions Log

- [x] Quality Gate: **Variant C (hybrid)** — deterministic gate + LLM comment
- [x] Vision model: **qwen3.6:27b confirmed** — JSON stable in 10-photo test
- [ ] Ollama port and GPU assignment (which model on which GPU)
- [ ] Citypop style: include as third option or keep NES + PC-98 only
