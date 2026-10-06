import { describe, expect, it } from 'vitest';

import type { DrugSummary } from '@/api/schemas';

import { aliasIds } from './aliases';
import { matchDrugs } from './match';

const d = (id: string, name: string, aliases: string[] = []): DrugSummary => ({ id, name, category: 'metabolism', degree: 1, aliases });
const drugs = [
  d('warfarin', 'Warfarin', ['Coumadin', 'Jantoven']),
  d('acetylsalicylic-acid', 'Acetylsalicylic acid', ['Bayer Aspirin']),
  d('acetaminophen', 'Acetaminophen', ['Tylenol']),
  d('trimethoprim', 'Trimethoprim'),
];
const ranks = (q: string) => Object.fromEntries(matchDrugs(drugs, q).map((m) => [m.drug.id, [m.rank, m.via]]));

describe('matchDrugs', () => {
  it('ranks name prefix, alias prefix, name contains, alias contains', () => {
    expect(ranks('war')).toEqual({ warfarin: [0, undefined] });
    expect(ranks('couma')).toEqual({ warfarin: [1, 'Coumadin'] });
    expect(ranks('rim')).toEqual({ trimethoprim: [2, undefined] });
    expect(ranks('aspirin')).toEqual({ 'acetylsalicylic-acid': [3, 'Bayer Aspirin'] });
  });

  it('prefers the dataset name over aliases for the same drug', () => {
    expect(ranks('acet')).toEqual({ 'acetylsalicylic-acid': [0, undefined], acetaminophen: [0, undefined] });
  });

  it('falls back to built-in common names (rank 1, via the query)', () => {
    expect(ranks('paracet')).toEqual({ acetaminophen: [1, 'paracet'] });
  });

  it('is case-insensitive, trims, and returns nothing for an empty query', () => {
    expect(ranks('  TYLE ')).toEqual({ acetaminophen: [1, 'Tylenol'] });
    expect(matchDrugs(drugs, '   ')).toEqual([]);
  });
});

describe('aliasIds', () => {
  it('resolves common names by prefix, ignoring very short input', () => {
    expect(aliasIds('aspir')).toEqual(new Set(['acetylsalicylic-acid']));
    expect(aliasIds('para')).toEqual(new Set(['acetaminophen']));
    expect(aliasIds('a').size).toBe(0);
  });
});
