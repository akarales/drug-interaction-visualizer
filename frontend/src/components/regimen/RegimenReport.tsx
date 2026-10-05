import { useMemo } from 'react';

import { FAMILY_LABEL, SEVERITIES, SEVERITY_LABEL, basisLabel, familyOf, kindLabel } from '@/lib/domain';
import { regimenPairs } from '@/lib/regimen';
import { pairKey, pickedIds, useExplorer } from '@/state/explorer';

/**
 * Print-only regimen report (window.print → paper / PDF). Hidden on screen;
 * index.css @media print shows only #print-report. Uses plain black-on-white
 * for print fidelity rather than the dark theme tokens.
 */
export function RegimenReport() {
  const slots = useExplorer((s) => s.slots);
  const neighbors = useExplorer((s) => s.neighbors);
  const byId = useExplorer((s) => s.byId);
  const overrides = useExplorer((s) => s.overrides);
  const picks = useMemo(() => [...new Set(pickedIds(slots))], [slots]);
  const pairs = useMemo(() => regimenPairs(picks, neighbors), [picks, neighbors]);
  const name = (id: string) => byId.get(id)?.name ?? id;

  if (picks.length === 0) return null;
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, pairs.filter((p) => p.severity === s).length]));
  const missing = pairs.filter((p) => !p.info).length;

  return (
    <div id="print-report" className="hidden bg-white p-0 font-sans text-[11px] leading-snug text-black">
      <header className="mb-4 border-b-2 border-black pb-2">
        <h1 className="text-lg font-bold">Medication interaction check</h1>
        <p>
          Generated {new Date().toLocaleString()} · Drug Interaction Visualizer (demo) ·{' '}
          <span className="break-all">{window.location.href}</span>
        </p>
      </header>

      <section className="mb-4">
        <h2 className="mb-1 text-sm font-bold">Medications ({picks.length})</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="w-6 py-1">#</th>
              <th className="py-1">Drug</th>
              <th className="py-1">Interaction profile</th>
              <th className="py-1">Also known as</th>
            </tr>
          </thead>
          <tbody>
            {picks.map((id, i) => {
              const d = byId.get(id);
              return (
                <tr key={id} className="border-b border-neutral-300 align-top">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1 font-semibold">{name(id)}</td>
                  <td className="py-1">{d ? `${FAMILY_LABEL[familyOf(d.category)]} · ${kindLabel(d.category)}` : ''}</td>
                  <td className="py-1">{(d?.aliases ?? []).slice(0, 4).join(', ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="mb-4">
        <h2 className="mb-1 text-sm font-bold">Summary</h2>
        <p>
          {pairs.length} pairs checked ·{' '}
          {SEVERITIES.filter((s) => counts[s] > 0)
            .map((s) => `${counts[s]} ${SEVERITY_LABEL[s].toLowerCase()}`)
            .join(' · ') || 'no interactions found'}
          {missing > 0 && ` · ${missing} not found in this dataset`}
        </p>
        {counts.contraindicated > 0 && (
          <p className="mt-1 border-2 border-black p-1.5 font-bold">
            ⚠ {counts.contraindicated} contraindicated combination(s) present — see overrides below.
          </p>
        )}
      </section>

      <section className="mb-4">
        <h2 className="mb-1 text-sm font-bold">Pairs (worst first)</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="w-24 py-1">Severity</th>
              <th className="w-40 py-1">Drugs</th>
              <th className="py-1">Consequence / mechanism (source text)</th>
              <th className="w-40 py-1">Evidence · override</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const override = overrides[pairKey(p.a, p.b)];
              return (
                <tr key={pairKey(p.a, p.b)} className="break-inside-avoid border-b border-neutral-300 align-top">
                  <td className="py-1 font-bold uppercase">{p.severity ? SEVERITY_LABEL[p.severity] : '—'}</td>
                  <td className="py-1">
                    {name(p.a)} + {name(p.b)}
                  </td>
                  <td className="py-1">
                    {p.info ? (
                      <>
                        <span className="font-semibold">{kindLabel(p.info.kind)}.</span> {p.info.mechanism}
                      </>
                    ) : (
                      'Not found in this dataset — absence is not a safety claim.'
                    )}
                  </td>
                  <td className="py-1">
                    {p.info ? basisLabel(p.info.severity_basis) : ''}
                    {override && (
                      <span className="mt-0.5 block font-semibold">
                        Overridden: {override.reason} ({new Date(override.at).toLocaleString()})
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <footer className="border-t border-black pt-2 text-[9.5px]">
        <p>
          <span className="font-semibold">Method.</span> Interactions are DrugBank-derived descriptions
          (Kaggle). Severity is editorial: a reviewed table by interaction type plus the ONC
          high-priority (contraindicated) pairs (Phansalkar et al., JAMIA 2012). Pairwise only: dose,
          duration, patient factors and multi-drug effects are not modelled.
        </p>
        <p className="mt-1 font-semibold">
          Demonstration software — not medical advice. Review all medication decisions with a
          physician or pharmacist.
        </p>
      </footer>
    </div>
  );
}
