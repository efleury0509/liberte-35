// V1 lot 6b : « + N autres opérations » sur les cartes de Mes paies.
import { describe, expect, it } from 'vitest';
import { autresOperations, nombreOperations, principales, texteAutresOperations, titresCartes } from '../src/lib/operations';
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

describe('Lot 1 — intitulés des cartes de paie', () => {
  it('une paie a commencé : Paie actuelle, Prochaine paie, Paie suivante, Paie d’après', () => {
    expect(titresCartes(true)).toEqual(['Paie actuelle', 'Prochaine paie', 'Paie suivante', 'Paie d’après']);
  });
  it('aucune période commencée : la première carte est la première paie à venir', () => {
    expect(titresCartes(false)).toEqual(['Première paie à venir', 'Prochaine paie', 'Paie suivante', 'Paie d’après']);
  });
  it('aucune durée ni cadence dans les intitulés', () => {
    for (const t of [...titresCartes(true), ...titresCartes(false)]) expect(t).not.toMatch(/semaine|mois|jour|\d/);
  });
});
