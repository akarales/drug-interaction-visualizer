import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamExplain } from '@/api/llm';
import type { StreamEvent } from '@/api/schemas';

import { partialSections, runSections } from './useExplainStream';

const meta = {
  drug_a: 'warfarin',
  drug_b: 'aspirin',
  direct_interaction: true,
  chain_length: 1,
  dataset_severity: 'severe',
  severity_basis: 'kind:anticoagulant',
  provider: 'stub',
  model: 'stub',
  audience: 'both',
  stub: true,
  disclaimer: 'Not medical advice.',
};
const section = { explanation: 'Bleeding risk rises.', severity: 'severe', mechanism: 'm', recommendation: 'r' };
const lines = [
  { type: 'start', ...meta },
  { type: 'delta', field: 'clinician.explanation', text: 'Bleeding ' },
  { type: 'delta', field: 'clinician.explanation', text: 'risk rises.' },
  { type: 'done', ...meta, payload: section, sections: { clinician: section, patient: section } },
].map((l) => JSON.stringify(l) + '\n');

function streamOf(text: string, chunk: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(i, i + chunk));
      i += chunk;
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('streamExplain', () => {
  it.each([1, 7, 64, 4096])('parses NDJSON split into %i-byte chunks', async (chunk) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamOf(lines.join(''), chunk), { status: 200 })));
    const events: StreamEvent[] = [];
    await streamExplain('warfarin', 'aspirin', null, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(['start', 'delta', 'delta', 'done']);
    expect(events[0].type === 'start' && events[0].disclaimer).toBe('Not medical advice.');
  });

  it('throws the server error when validation fails before streaming', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unknown drug id: nope","code":"unknown_drug"}', { status: 404 })));
    await expect(streamExplain('warfarin', 'nope', null, () => {})).rejects.toThrow(/unknown drug/);
  });
});

describe('streamed sections', () => {
  it('assembles fields into sections as they arrive', () => {
    expect(partialSections({ 'clinician.explanation': 'Blee', 'patient.mechanism': 'One medicine' })).toEqual({
      clinician: { explanation: 'Blee' },
      patient: { mechanism: 'One medicine' },
    });
    // single-audience documents have no section prefix
    expect(partialSections({ explanation: 'x' })).toEqual({ clinician: { explanation: 'x' } });
  });

  it('the validated result replaces the streamed text', () => {
    const run = {
      status: 'done' as const,
      partial: { 'clinician.explanation': 'streamed draft' },
      result: { ...meta, provider: 'stub' as const, audience: 'both' as const, payload: section, sections: { clinician: section } },
    };
    expect(runSections(run).clinician?.explanation).toBe('Bleeding risk rises.');
  });
});
