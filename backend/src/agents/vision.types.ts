export type SceneType = 'landscape' | 'portrait' | 'architecture' | 'object' | 'other';
export type DetailLevel = 'low' | 'medium' | 'high';
export type RecommendedStyle = 'nes-flat' | 'pc98-dither';

export interface VisionResult {
  scene_type: SceneType;
  dominant_colors: string[];
  has_gradients: boolean;
  detail_level: DetailLevel;
  recommended_style: RecommendedStyle;
  reasoning: string;
}

const SCENE_TYPES: SceneType[] = ['landscape', 'portrait', 'architecture', 'object', 'other'];
const DETAIL_LEVELS: DetailLevel[] = ['low', 'medium', 'high'];
const RECOMMENDED_STYLES: RecommendedStyle[] = ['nes-flat', 'pc98-dither'];

export function validateVisionResult(value: unknown): VisionResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('response is not a JSON object');
  }
  const v = value as Record<string, unknown>;

  if (!SCENE_TYPES.includes(v.scene_type as SceneType)) {
    throw new Error(`scene_type must be one of ${SCENE_TYPES.join('|')}`);
  }
  if (
    !Array.isArray(v.dominant_colors) ||
    v.dominant_colors.length === 0 ||
    !v.dominant_colors.every((c) => typeof c === 'string')
  ) {
    throw new Error('dominant_colors must be a non-empty array of strings');
  }
  if (typeof v.has_gradients !== 'boolean') {
    throw new Error('has_gradients must be a boolean');
  }
  if (!DETAIL_LEVELS.includes(v.detail_level as DetailLevel)) {
    throw new Error(`detail_level must be one of ${DETAIL_LEVELS.join('|')}`);
  }
  if (!RECOMMENDED_STYLES.includes(v.recommended_style as RecommendedStyle)) {
    throw new Error(`recommended_style must be one of ${RECOMMENDED_STYLES.join('|')}`);
  }
  if (typeof v.reasoning !== 'string' || v.reasoning.length === 0) {
    throw new Error('reasoning must be a non-empty string');
  }

  return {
    scene_type: v.scene_type as SceneType,
    dominant_colors: v.dominant_colors as string[],
    has_gradients: v.has_gradients,
    detail_level: v.detail_level as DetailLevel,
    recommended_style: v.recommended_style as RecommendedStyle,
    reasoning: v.reasoning,
  };
}
