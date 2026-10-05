import type {
  ChainResponse,
  ExplanationResponse,
  GraphData,
  NeighborInfo,
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

export function fetchGraph(top: number): Promise<GraphData> {
  return api<GraphData>(`/graph?top=${top}`);
}

export function fetchEgo(drug: string, hops = 1): Promise<GraphData> {
  return api<GraphData>(`/graph/ego?drug=${encodeURIComponent(drug)}&hops=${hops}`);
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

export function postExplain(
  drugA: string,
  drugB: string,
  maxHops = 3,
): Promise<ExplanationResponse> {
  return api<ExplanationResponse>('/explain', {
    method: 'POST',
    body: JSON.stringify({ drug_a: drugA, drug_b: drugB, max_hops: maxHops }),
  });
}
