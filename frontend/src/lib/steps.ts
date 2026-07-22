const STEP_LABELS: Record<string, string> = {
  'vision-analysis': 'vision analysis',
  pixelize: 'rendering pixel art',
  'quality-gate': 'quality check',
};

const AGENT_LABELS: Record<string, string> = {
  'vision-analysis': 'Vision Analysis Agent',
  pixelize: 'Pixelize Tool',
  'quality-gate': 'Quality Gate Agent',
};

function baseStep(step: string): string {
  return step.replace(/-retry\d+$/, '');
}

export function friendlyStep(step: string): string {
  const retryMatch = step.match(/-retry(\d+)$/);
  const label = STEP_LABELS[baseStep(step)] ?? baseStep(step);
  return retryMatch ? `${label} (retry ${retryMatch[1]})` : label;
}

export function agentForStep(step: string): string {
  return AGENT_LABELS[baseStep(step)] ?? baseStep(step);
}
