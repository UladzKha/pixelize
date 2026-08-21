import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ollamaChatJson } from './ollama.client';
import { validateVisionResult, VisionResult } from './vision.types';

/** Max long-edge (px) sent to the vision model. Full-res phone photos are needlessly slow to process. */
const VISION_MAX_EDGE = 1024;

const BASE_PROMPT = `You are an image analysis agent in a pixel art conversion pipeline.
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
- nes-flat: graphic, high-contrast, illustration-like inputs, simple shapes`;

export interface VisionAnalysisResult {
  result: VisionResult;
  rawResponses: string[];
  retried: boolean;
  tokens: { promptEvalCount: number; evalCount: number };
}

@Injectable()
export class VisionAnalysisAgent {
  private readonly logger = new Logger(VisionAnalysisAgent.name);

  constructor(private readonly config: ConfigService) { }

  async analyze(imagePath: string): Promise<VisionAnalysisResult> {
    const baseUrl = this.config.get<string>('OLLAMA_BASE_URL', 'http://localhost:11436');
    const model = this.config.get<string>('OLLAMA_MODEL', 'qwen3.6:27b-mtp-q4_K_M');
    const timeoutMs = Number(this.config.get('OLLAMA_TIMEOUT_MS', 120000));
    const image = (
      await sharp(imagePath)
        .resize({ width: VISION_MAX_EDGE, height: VISION_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer()
    ).toString('base64');

    const first = await ollamaChatJson({ baseUrl, model, prompt: BASE_PROMPT, images: [image], timeoutMs });
    let parseError: string;
    try {
      return {
        result: validateVisionResult(JSON.parse(first.content)),
        rawResponses: [first.content],
        retried: false,
        tokens: tokensOf(first),
      };
    } catch (err) {
      parseError = (err as Error).message;
      this.logger.warn(`Vision response invalid, retrying once: ${parseError}`);
    }

    const retryPrompt = `${BASE_PROMPT}

Your previous response was invalid JSON for this schema: ${parseError}
Previous response: ${first.content}
Respond again with ONLY the corrected JSON object.`;
    const second = await ollamaChatJson({ baseUrl, model, prompt: retryPrompt, images: [image], timeoutMs });

    let data = {
      recommended_style: 'nes-flat' as const,
    }
    try {
      data = JSON.parse(second.content)
    }
    catch (err) {
      parseError = (err as Error).message;
      this.logger.warn(`Vision response invalid for the second attempt, using default: ${parseError}`);
    }

    const result = validateVisionResult(data);
    return {
      result,
      rawResponses: [first.content, second.content],
      retried: true,
      tokens: {
        promptEvalCount: tokensOf(first).promptEvalCount + tokensOf(second).promptEvalCount,
        evalCount: tokensOf(first).evalCount + tokensOf(second).evalCount,
      },
    };
  }
}

function tokensOf(result: { promptEvalCount?: number; evalCount?: number }): {
  promptEvalCount: number;
  evalCount: number;
} {
  return { promptEvalCount: result.promptEvalCount ?? 0, evalCount: result.evalCount ?? 0 };
}
