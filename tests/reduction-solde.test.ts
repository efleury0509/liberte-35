// Lot 1 : « Solde réduit de X % depuis le départ ». Seuls les soldes
// déclarés comptent ; ce n'est jamais du capital remboursé. Données fictives.
import { describe, expect, it } from 'vitest';
import { reductionSolde, texteReductionSolde } from '../src/actions/prets';

const s = (date: string, montant: number) => ({ date, montant });

describe('Lot 1 — réduction du solde', () => {
  it('départ le plus ancien, dernier le plus récent, arrondi vers le bas', () => {
    const r = reductionSolde([s('2026-06-01', 7_000_00), s('2025-01-02', 9_800_00), s('2026-01-15', 8_400_00)]);
    // (9 800 − 7 000) / 9 800 = 28,57 % → 28 %
    expect(r).toMatchObject({ etat: 'reduit', pourcent: 28, depart: { date: '2025-01-02', montant: 9_800_00 }, dernier: { date: '2026-06-01', montant: 7_000_00 } });
    expect(texteReductionSolde(r)).toBe('Solde réduit de 28 % depuis le départ');
  });

  it('données insuffisantes : « À compléter », jamais 0 %', () => {
    expect(reductionSolde([])).toMatchObject({ etat: 'a-completer', raison: 'Aucun solde déclaré.' });
    expect(reductionSolde([s('2025-01-02', 9_800_00)])).toMatchObject({ etat: 'a-completer' });
    expect(texteReductionSolde(reductionSolde([s('2025-01-02', 9_800_00)]))).toBe('À compléter');
  });

  it('solde de départ nul : aucun pourcentage calculable', () => {
    const r = reductionSolde([s('2025-01-02', 0), s('2025-06-01', 500_00)]);
    expect(r).toMatchObject({ etat: 'a-completer', raison: 'Le solde de départ est nul : aucun pourcentage n’est calculable.' });
  });

  it('un solde en hausse est montré tel quel', () => {
    const r = reductionSolde([s('2025-01-02', 1_000_00), s('2025-06-01', 1_150_00)]);
    expect(r).toMatchObject({ etat: 'augmente', pourcent: 15 });
    expect(texteReductionSolde(r)).toBe('Solde augmenté de 15 % depuis le départ');
  });

  it('inchangé, minime, remboursé en entier', () => {
    expect(texteReductionSolde(reductionSolde([s('2025-01-02', 1_000_00), s('2025-06-01', 1_000_00)]))).toBe('Solde inchangé depuis le départ');
    expect(texteReductionSolde(reductionSolde([s('2025-01-02', 1_000_00), s('2025-06-01', 999_50)]))).toBe('Solde réduit de moins de 1 % depuis le départ');
    expect(texteReductionSolde(reductionSolde([s('2025-01-02', 1_000_00), s('2025-06-01', 0)]))).toBe('Solde réduit de 100 % depuis le départ');
  });

  it('une correction : un nouveau solde déclaré devient le dernier ; un solde antérieur devient le départ', () => {
    const base = [s('2025-03-01', 9_000_00), s('2025-09-01', 8_100_00)];
    expect(reductionSolde(base)).toMatchObject({ pourcent: 10 });
    // Correction d'après un relevé plus récent : il devient la référence.
    expect(reductionSolde([...base, s('2025-10-01', 8_200_00)])).toMatchObject({ pourcent: 8 });
    // Un solde plus ancien déclaré après coup devient le départ.
    expect(reductionSolde([...base, s('2025-01-02', 9_800_00)])).toMatchObject({ pourcent: 17, depart: { date: '2025-01-02' } });
  });

  it('le texte ne parle jamais de capital remboursé', () => {
    for (const r of [reductionSolde([s('2025-01-02', 1_000_00), s('2025-06-01', 500_00)]), reductionSolde([s('2025-01-02', 1_000_00), s('2025-06-01', 1_500_00)])]) {
      expect(texteReductionSolde(r)).not.toMatch(/capital|rembours/i);
    }
  });
});
