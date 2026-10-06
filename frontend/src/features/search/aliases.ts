/** Common names → dataset ids (DrugBank uses INN / chemical names). */
const ALIASES: Record<string, string> = {
  aspirin: 'acetylsalicylic-acid',
  asa: 'acetylsalicylic-acid',
  paracetamol: 'acetaminophen',
  adrenaline: 'epinephrine',
  noradrenaline: 'norepinephrine',
  albuterol: 'salbutamol',
  ciclosporin: 'cyclosporine',
  glibenclamide: 'glyburide',
  frusemide: 'furosemide',
  lignocaine: 'lidocaine',
  rifampin: 'rifampicin',
  valproate: 'valproic-acid',
};

/** Dataset ids whose common name starts with the query. */
export function aliasIds(query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const out = new Set<string>();
  if (q.length < 2) return out;
  for (const [alias, id] of Object.entries(ALIASES)) if (alias.startsWith(q)) out.add(id);
  return out;
}
