# Vision Model Test — qwen3.6:27b

## Goal
Проверить, что qwen3.6:27b стабильно выдаёт structured JSON по фото.
Результат определяет архитектуру Quality Gate.

## Test Prompt

```
You are an image analysis agent in a pixel art conversion pipeline.
Analyze the attached photo and respond with ONLY valid JSON, no markdown fences, no commentary.

{
  "scene_type": "landscape" | "portrait" | "architecture" | "object" | "other",
  "dominant_colors": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "has_gradients": true | false,
  "detail_level": "low" | "medium" | "high",
  "recommended_style": "nes-flat" | "pc98-dither",
  "reasoning": "one sentence why this style fits"
}

Rules:
- pc98-dither: photos with gradients, smooth lighting, skies, soft shadows
- nes-flat: graphic, high-contrast, illustration-like inputs, simple shapes
```

## Quick Test via curl

```bash
# Single photo test
curl -s http://localhost:11436/api/chat -d '{
  "model": "qwen3.6:27b",
  "messages": [
    {
      "role": "user",
      "content": "You are an image analysis agent in a pixel art conversion pipeline.\nAnalyze the attached photo and respond with ONLY valid JSON, no markdown fences, no commentary.\n\n{\"scene_type\": \"landscape|portrait|architecture|object|other\", \"dominant_colors\": [\"#RRGGBB\"], \"has_gradients\": true|false, \"detail_level\": \"low|medium|high\", \"recommended_style\": \"nes-flat|pc98-dither\", \"reasoning\": \"one sentence\"}\n\nRules:\n- pc98-dither: photos with gradients, smooth lighting, skies\n- nes-flat: graphic, high-contrast, simple shapes",
      "images": ["BASE64_ENCODED_IMAGE"]
    }
  ],
  "stream": false,
  "format": "json"
}' | jq '.message.content' -r | jq .
```

Заметь `"format": "json"` — это Ollama constrained output, повышает стабильность JSON.

## Encode photo to base64

```bash
base64 -w0 photo.jpg
# or inline:
# "images": ["$(base64 -w0 photo.jpg)"]
```

## What to Record

Для каждого из 10 фото записать:

| # | Photo description | Valid JSON? | Style correct? | Latency (s) | Notes |
|---|-------------------|-------------|----------------|-------------|-------|
| 1 |                   | yes/no      | yes/no/debatable |           |       |
| 2 |                   |             |                |             |       |
| ... |                 |             |                |             |       |

## Pass Criteria

- **JSON stability:** 8+ / 10 парсится JSON.parse() без ошибок
- **Style logic:** рекомендации согласованы с правилами (градиенты → dither)
- **Latency:** записать среднюю — нужна для capacity math

## Decision Matrix

| Result | Quality Gate Decision |
|--------|---------------------|
| JSON 10/10, style logic OK | Variant A (LLM quality) worth trying |
| JSON 8-9/10, style OK | Variant C (hybrid): deterministic gate + LLM comment |
| JSON < 8/10 or style random | Variant B (deterministic only), fix JSON with retries |

## Bonus: Quality Eval Test (if Test 1 passes)

Скормить qwen3.6:27b готовый пиксель-арт и спросить оценку:

```
You are a quality evaluation agent for pixel art output.
Analyze this pixel art image and respond with ONLY valid JSON:

{
  "overall_score": 1-10,
  "banding_detected": true | false,
  "silhouette_readable": true | false,
  "color_variety": "poor" | "adequate" | "good",
  "suggestion": "one sentence improvement or 'acceptable'"
}
```

Если этот тест тоже стабилен — Variant A, полный LLM quality loop.
Если нет — Variant C, детерминированный gate + LLM комментарий для зрелищности.
