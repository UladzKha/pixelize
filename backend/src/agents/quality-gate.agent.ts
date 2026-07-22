import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import sharp from 'sharp';
import { ollamaChatJson } from './ollama.client';
import { QualityResult, validateLlmQualityResult } from './quality.types';
import { loadPalette, Style } from '../tools/palette';

const BANDING_THRESHOLD = 0.85;
const MIN_UNIQUE_COLORS = 3;
const LLM_PASS_SCORE = 6;

const LLM_QUALITY_PROMPT = `You are a quality evaluation agent for pixel art output.
Analyze this pixel art image and respond with ONLY valid JSON:

{
  "overall_score": 1-10,
  "banding_detected": true | false,
  "silhouette_readable": true | false,
  "color_variety": "poor" | "adequate" | "good",
  "suggestion": "one sentence improvement or 'acceptable'"
}`;

interface HistogramMetrics {
  uniqueColors: number;
  dominantRatio: number;
  totalPixels: number;
}

async function computeHistogram(imagePath: string): Promise<HistogramMetrics> {
  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const totalPixels = width * height;
  const counts = new Map<string, number>();

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * channels;
    const key = `${data[idx]},${data[idx + 1]},${data[idx + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let dominantCount = 0;
  for (const count of counts.values()) {
    if (count > dominantCount) dominantCount = count;
  }

  return { uniqueColors: counts.size, dominantRatio: dominantCount / totalPixels, totalPixels };
}

function deterministicResult(metrics: HistogramMetrics, style: Style, paletteSize: number, currentOptions: {ditherStrength?: number, width?: number}): QualityResult {
  const { uniqueColors, dominantRatio } = metrics;
  const bandingDetected = dominantRatio > BANDING_THRESHOLD;
  const tooFewColors = uniqueColors < MIN_UNIQUE_COLORS;
  const passed = !bandingDetected && !tooFewColors;

  const varietyRatio = Math.min(1, uniqueColors / Math.min(paletteSize, 16));
  const bandingPenalty = bandingDetected ? (dominantRatio - BANDING_THRESHOLD) * 10 : 0;
  const score = Math.max(0, Math.min(10, varietyRatio * 10 - bandingPenalty));

  let reason = `${uniqueColors} unique colors, dominant color covers ${(dominantRatio * 100).toFixed(1)}% of pixels`;
  let suggestion: string | undefined;
  const retryParams: Pick<QualityResult, 'retryParams'>['retryParams']= {};
    if (bandingDetected) {
    reason += ' — banding detected';
    suggestion =
      style === 'pc98-dither' ? 'increase dithering strength' : 'switch to pc98-dither for smoother gradients';
      retryParams.ditherStrength = (currentOptions.ditherStrength ?? 32) + 16;
    } else if (tooFewColors) {
    reason += ' — too few colors used';
    suggestion = 'increase output width for more detail';
    retryParams.width = (currentOptions.width ?? 128) + 32;

  }

  return { passed, score, reason, suggestion , retryParams};
}

@Injectable()
export class QualityGateAgent {
  private readonly logger = new Logger(QualityGateAgent.name);

  constructor(private readonly config: ConfigService) {}

  async evaluate(resultImagePath: string, style: Style, currentOptions: {ditherStrength?: number, width?: number}): Promise<QualityResult> {
    const variant = this.config.get<string>('QUALITY_GATE_VARIANT', 'deterministic');
    const metrics = await computeHistogram(resultImagePath);
    const paletteSize = loadPalette(style).length;
    const deterministic = deterministicResult(metrics, style, paletteSize, currentOptions);

    if (variant === 'deterministic') {
      return deterministic;
    }

    let llm: QualityResult | undefined;
    try {
      llm = await this.evaluateWithLlm(resultImagePath);
    } catch (err) {
      this.logger.warn(`LLM quality eval failed, falling back to deterministic: ${(err as Error).message}`);
    }

    if (variant === 'llm') {
      return llm ?? { ...deterministic, reason: `${deterministic.reason} (LLM eval unavailable, deterministic fallback)` };
    }

    // hybrid: deterministic gate decides pass/fail, LLM only supplies a human-readable comment.
    if (llm) {
      return { ...deterministic, reason: llm.reason, suggestion: llm.suggestion ?? deterministic.suggestion };
    }
    return deterministic;
  }

  private async evaluateWithLlm(resultImagePath: string): Promise<QualityResult> {
    const baseUrl = this.config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11436');
    const model = this.config.get<string>('OLLAMA_MODEL', 'qwen3.6:27b-mtp-q4_K_M');
    const image = fs.readFileSync(resultImagePath).toString('base64');

    const chatResult = await ollamaChatJson({ baseUrl, model, prompt: LLM_QUALITY_PROMPT, images: [image] });
    const parsed = validateLlmQualityResult(JSON.parse(chatResult.content));

    return {
      passed: parsed.overall_score >= LLM_PASS_SCORE && !parsed.banding_detected,
      score: parsed.overall_score,
      reason: `banding: ${parsed.banding_detected}, silhouette readable: ${parsed.silhouette_readable}, color variety: ${parsed.color_variety}`,
      suggestion: parsed.suggestion === 'acceptable' ? undefined : parsed.suggestion,
      tokens: {
        promptEvalCount: chatResult.promptEvalCount ?? 0,
        evalCount: chatResult.evalCount ?? 0,
      },
      retryParams: {},
    };
  }
}
