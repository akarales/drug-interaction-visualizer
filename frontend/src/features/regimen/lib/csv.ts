import { basisLabel, directionText, kindLabel } from '@/shared/domain';
import { pairKey, type Override } from '@/state';

import type { RegimenPair } from './pairs';

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 CSV of the regimen check (one row per pair). */
export function regimenCsv(
  pairs: readonly RegimenPair[],
  name: (id: string) => string,
  overrides: Readonly<Record<string, Override>>,
): string {
  const header = [
    'drug_a',
    'drug_b',
    'severity',
    'severity_basis',
    'consequence',
    'mechanism',
    'override_reason',
    'override_at',
    'direction_fda',
  ];
  const rows = pairs.map((p) => {
    const override = overrides[pairKey(p.a, p.b)];
    return [
      name(p.a),
      name(p.b),
      p.severity ?? 'not found in dataset',
      p.info ? basisLabel(p.info.severity_basis) : '',
      p.info ? kindLabel(p.info.kind) : '',
      p.info?.mechanism ?? '',
      override?.reason ?? '',
      override?.at ?? '',
      p.info ? directionText(p.info.roles, name) : '',
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
