import { z } from 'zod/mini';

import { api, ApiError } from './http';
import {
  AuditSchema,
  OverrideAppendedSchema,
  RegimenDetailSchema,
  RegimenListSchema,
  RegimenSavedSchema,
  type OverrideEvent,
  type Regimen,
  type RegimenDetail,
} from './schemas';

export interface OverrideInput {
  drug_a: string;
  drug_b: string;
  reason: string;
  action?: 'override' | 'revoke';
  regimen_id?: string | null;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export function listRegimens(signal?: AbortSignal): Promise<{ store: string; regimens: Regimen[] }> {
  return api('/regimens', RegimenListSchema, { signal });
}

export function getRegimen(id: string): Promise<RegimenDetail> {
  return api(`/regimens/${encodeURIComponent(id)}`, RegimenDetailSchema);
}

/** Save a new regimen with the overrides decided so far (one transaction server-side). */
export function createRegimen(label: string, drugIds: string[], overrides: OverrideInput[]): Promise<Regimen> {
  return api('/regimens', RegimenSavedSchema, json('POST', { label, drug_ids: drugIds, overrides })).then((b) => b.regimen);
}

export function updateRegimen(id: string, label: string, drugIds: string[]): Promise<Regimen> {
  return api(`/regimens/${encodeURIComponent(id)}`, RegimenSavedSchema, json('PUT', { label, drug_ids: drugIds })).then(
    (b) => b.regimen,
  );
}

export async function deleteRegimen(id: string): Promise<void> {
  const res = await fetch(`/api/v1/regimens/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new ApiError(res.status, (await res.text()) || res.statusText);
}

/** Append one override / revoke event to the audit trail (never edits). */
export function appendOverride(input: OverrideInput): Promise<OverrideEvent> {
  return api('/overrides', OverrideAppendedSchema, json('POST', input)).then((b) => b.event);
}

export function fetchAudit(regimenId: string | null): Promise<OverrideEvent[]> {
  const q = regimenId ? `?regimen_id=${encodeURIComponent(regimenId)}` : '';
  return api(`/overrides${q}`, AuditSchema).then((b) => b.events);
}

/** Human message from an API error body ({"error": …}), for toasts. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const parsed = z.object({ error: z.string() }).safeParse((() => {
      try {
        return JSON.parse(err.message) as unknown;
      } catch {
        return null;
      }
    })());
    return parsed.success ? parsed.data.error : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
