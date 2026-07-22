export interface QualityResult {
  passed: boolean;
  score: number;
  reason: string;
  suggestion?: string;
  tokens?: { promptEvalCount: number; evalCount: number };
  retryParams: {
    ditherStrength?: number;
    width?: number;
  };
}

export type ColorVariety = 'poor' | 'adequate' | 'good';

export interface LlmQualityResult {
  overall_score: number;
  banding_detected: boolean;
  silhouette_readable: boolean;
  color_variety: ColorVariety;
  suggestion: string;
}

const COLOR_VARIETIES: ColorVariety[] = ['poor', 'adequate', 'good'];

export function validateLlmQualityResult(value: unknown): LlmQualityResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('response is not a JSON object');
  }
  const v = value as Record<string, unknown>;

  if (typeof v.overall_score !== 'number' || v.overall_score < 1 || v.overall_score > 10) {
    throw new Error('overall_score must be a number between 1 and 10');
  }
  if (typeof v.banding_detected !== 'boolean') {
    throw new Error('banding_detected must be a boolean');
  }
  if (typeof v.silhouette_readable !== 'boolean') {
    throw new Error('silhouette_readable must be a boolean');
  }
  if (!COLOR_VARIETIES.includes(v.color_variety as ColorVariety)) {
    throw new Error(`color_variety must be one of ${COLOR_VARIETIES.join('|')}`);
  }
  if (typeof v.suggestion !== 'string' || v.suggestion.length === 0) {
    throw new Error('suggestion must be a non-empty string');
  }

  return {
    overall_score: v.overall_score,
    banding_detected: v.banding_detected,
    silhouette_readable: v.silhouette_readable,
    color_variety: v.color_variety as ColorVariety,
    suggestion: v.suggestion,
  };
}
