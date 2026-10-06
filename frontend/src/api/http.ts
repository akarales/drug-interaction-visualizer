import type { z } from 'zod/mini';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Fetch `/api/v1{path}` and validate the JSON body against `schema`. */
export async function api<S extends z.ZodMiniType>(path: string, schema: S, init?: RequestInit): Promise<z.infer<S>> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(res.status, `Unexpected response from ${path}: ${issue?.path.join('.') || '(root)'} ${issue?.message ?? ''}`.trim());
  }
  return parsed.data;
}
