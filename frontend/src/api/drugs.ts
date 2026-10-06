import { api } from './http';
import {
  DrugsResponseSchema,
  NeighborsResponseSchema,
  ResolveResponseSchema,
  type DrugsResponse,
  type NeighborInfo,
  type ResolveResponse,
} from './schemas';

/** Every drug (id, name, category, degree) + dataset stats — ~140 KB. */
export function fetchDrugs(signal?: AbortSignal): Promise<DrugsResponse> {
  return api('/drugs', DrugsResponseSchema, { signal });
}

export function fetchNeighbors(drug: string): Promise<NeighborInfo[]> {
  return api(`/drugs/${encodeURIComponent(drug)}/neighbors`, NeighborsResponseSchema).then((body) => body.neighbors);
}

/** Hybrid name resolution: offline aliases, then RxNav for typos/brands. */
export function resolveDrug(q: string, signal?: AbortSignal): Promise<ResolveResponse> {
  return api(`/resolve?q=${encodeURIComponent(q)}`, ResolveResponseSchema, { signal });
}
