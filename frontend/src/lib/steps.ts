const STEP_LABELS: Record<string, string> = {
  'vision-analysis': 'vision analysis',
  pixelize: 'rendering pixel art',
  'quality-gate': 'quality check',
};

export function friendlyStep(step: string): string {
  const retryMatch = step.match(/-retry(\d+)$/);
  const base = step.replace(/-retry\d+$/, '');
  const label = STEP_LABELS[base] ?? base;
  return retryMatch ? `${label} (retry ${retryMatch[1]})` : label;
}
