import { ApiError, api } from './http';
import {
  ExplanationResponseSchema,
  ModelsResponseSchema,
  StreamEventSchema,
  type Audience,
  type StreamEvent,
  type ExplanationResponse,
  type LlmProvider,
  type ModelsResponse,
} from './schemas';

export interface ModelChoice {
  provider: LlmProvider;
  model: string;
}

export function postExplain(
  drugA: string,
  drugB: string,
  choice: ModelChoice | null,
  audience: Audience = 'both',
  maxHops = 3,
): Promise<ExplanationResponse> {
  return api('/explain', ExplanationResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ drug_a: drugA, drug_b: drugB, max_hops: maxHops, audience, ...choice }),
  });
}

export function fetchModels(signal?: AbortSignal): Promise<ModelsResponse> {
  return api('/llm/models', ModelsResponseSchema, { signal });
}

/**
 * POST /explain/stream: calls `onEvent` for each NDJSON line (start → delta…
 * → done | error). Abort with `signal` (Stop) — the server then drops the
 * upstream model request. Validation errors before streaming throw ApiError.
 */
export async function streamExplain(
  drugA: string,
  drugB: string,
  choice: ModelChoice | null,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
  audience: Audience = 'both',
): Promise<void> {
  const res = await fetch('/api/v1/explain/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ drug_a: drugA, drug_b: drugB, audience, ...choice }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(res.status, (await res.text()) || res.statusText);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const emit = (line: string) => {
    if (!line.trim()) return;
    const parsed = StreamEventSchema.safeParse(JSON.parse(line));
    if (!parsed.success) throw new Error('Unexpected stream event from the server');
    onEvent(parsed.data);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      emit(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');
    }
  }
  emit(buffer);
}
