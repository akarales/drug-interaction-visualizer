import type {
  Audience,
  ChainResponse,
  DrugsResponse,
  ExplanationResponse,
  LlmProvider,
  ModelsResponse,
  NeighborInfo,
  ResolveResponse,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  return (await res.json()) as T;
}

/** Every drug (id, name, category, degree) + dataset stats — ~140 KB. */
export function fetchDrugs(signal?: AbortSignal): Promise<DrugsResponse> {
  return api<DrugsResponse>('/drugs', { signal });
}

export function fetchNeighbors(drug: string): Promise<NeighborInfo[]> {
  return api<{ drug: string; neighbors: NeighborInfo[] }>(
    `/drugs/${encodeURIComponent(drug)}/neighbors`,
  ).then((body) => body.neighbors);
}

export function fetchChain(
  from: string,
  to: string,
  maxHops = 3,
): Promise<ChainResponse> {
  return api<ChainResponse>(
    `/interactions/chain?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max_hops=${maxHops}`,
  );
}

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
  return api<ExplanationResponse>('/explain', {
    method: 'POST',
    body: JSON.stringify({ drug_a: drugA, drug_b: drugB, max_hops: maxHops, audience, ...choice }),
  });
}

/** Hybrid name resolution: offline aliases, then RxNav for typos/brands. */
export function resolveDrug(q: string, signal?: AbortSignal): Promise<ResolveResponse> {
  return api<ResolveResponse>(`/resolve?q=${encodeURIComponent(q)}`, { signal });
}

export function fetchModels(signal?: AbortSignal): Promise<ModelsResponse> {
  return api<ModelsResponse>('/llm/models', { signal });
}
