// V1 lot 6b : « + N autres opérations » sur les cartes de Mes paies.
import { describe, expect, it } from 'vitest';
import { autresOperations, nombreOperations, principales, texteAutresOperations } from '../src/lib/operations';
import type { Cycle, Ligne } from '../src/noyau/cycles';

const ligne = (id: string, nature: 'revenu' | 'depense', montant: number | null, retiree = false) =>
  ({ elementId: id, origine: '2027-01-07', nature, montant, retiree }) as unknown as Ligne;
const cycle = (lignes: Ligne[]) => ({ lignes }) as unknown as Cycle;

describe('V1 lot 6b — opérations des cartes', () => {
  it('compte la paie et chaque ligne du détail', () => {
    const c = cycle([ligne('a', 'depense', 100), ligne('b', 'revenu', 50)]);
    expect(nombreOperations(c)).toBe(3);
    expect(principales(c).map((l) => l.elementId)).toEqual(['a']);
    expect(autresOperations(c)).toBe(2);
  });
  it('au plus quatre dépenses principales, les inconnues d’abord ; les retirées sont comptées dans le détail', () => {
    const c = cycle([
      ligne('a', 'depense', 100),
      ligne('b', 'depense', 900),
      ligne('c', 'depense', null),
      ligne('d', 'depense', 300),
      ligne('e', 'depense', 200),
      ligne('f', 'depense', 999, true),
    ]);
    expect(principales(c).map((l) => l.elementId)).toEqual(['c', 'b', 'd', 'e']);
    expect(autresOperations(c)).toBe(1 + 6 - 4);
  });
  it('le texte suit le nombre exact, et disparaît à zéro', () => {
    expect(texteAutresOperations(0)).toBeNull();
    expect(texteAutresOperations(1)).toBe('+ 1 autre opération');
    expect(texteAutresOperations(5)).toBe('+ 5 autres opérations');
  });
});
