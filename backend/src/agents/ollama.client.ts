export interface OllamaChatOptions {
  baseUrl: string;
  model: string;
  prompt: string;
  images?: string[];
  timeoutMs?: number;
}

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaChatResult {
  content: string;
  promptEvalCount?: number;
  evalCount?: number;
}

/** Calls Ollama's /api/chat with constrained JSON output and returns the message content plus token usage. */
export async function ollamaChatJson(options: OllamaChatOptions): Promise<OllamaChatResult> {
  const { baseUrl, model, prompt, images, timeoutMs = 60000 } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt, images }],
        stream: false,
        format: 'json',
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as OllamaChatResponse;
    const content = body.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error('Ollama response missing message.content');
    }
    return { content, promptEvalCount: body.prompt_eval_count, evalCount: body.eval_count };
  } finally {
    clearTimeout(timeout);
  }
}
