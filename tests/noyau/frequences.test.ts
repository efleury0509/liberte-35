// Cas témoins P1 à P4 (calendrier de paie fictif) et R1 à R17 (fréquences).
// Hypothèse : paie aux deux semaines, le jeudi, à partir du jeudi 7 janvier 2027.

import { describe, expect, it } from 'vitest';
import { dateCivile as d, type DateCivile } from '../../src/noyau/dates';
import { datesDe, rangsDesPaies, type Frequence } from '../../src/noyau/frequences';

const PAIE: Frequence = { type: 'semaines', n: 2, depart: d('2027-01-07') };
const paies = (debut: string, fin: string) => datesDe(PAIE, d(debut), d(fin));
const PAIES_2027 = paies('2027-01-01', '2027-12-31');
const entre = (f: Frequence, debut: string, fin: string, p: readonly DateCivile[] = PAIES_2027) =>
  datesDe(f, d(debut), d(fin), p);

describe('Calendrier de paie fictif', () => {
  it('P1 : 26 paies en 2027', () => {
    expect(PAIES_2027).toHaveLength(26);
  });

  it('P2 : mois à trois paies en 2027', () => {
    const parMois = new Map<string, string[]>();
    for (const p of PAIES_2027) {
      const mois = p.slice(0, 7);
      parMois.set(mois, [...(parMois.get(mois) ?? []), p]);
    }
    const aTrois = [...parMois].filter(([, v]) => v.length === 3);
    expect(aTrois).toEqual([
      ['2027-04', ['2027-04-01', '2027-04-15', '2027-04-29']],
      ['2027-09', ['2027-09-02', '2027-09-16', '2027-09-30']],
    ]);
  });

  it('P3 : rang des paies d’avril 2027', () => {
    const rangs = rangsDesPaies(PAIES_2027);
    expect(rangs.get(d('2027-04-01'))).toBe(1);
    expect(rangs.get(d('2027-04-15'))).toBe(2);
    expect(rangs.get(d('2027-04-29'))).toBe(3);
  });

  it('P4 : dernière paie de 2027 et la suivante', () => {
    expect(PAIES_2027.at(-1)).toBe('2027-12-23');
    expect(paies('2027-12-24', '2028-01-31')[0]).toBe('2028-01-06');
  });
});

describe('Fréquences — cas témoins', () => {
  const AVRIL: [string, string] = ['2027-04-01', '2027-04-30'];

  it('R1 : essence à chaque paie, avril 2027', () => {
    expect(entre({ type: 'chaquePaie' }, ...AVRIL)).toEqual(['2027-04-01', '2027-04-15', '2027-04-29']);
  });

  it('R2 : épicerie à la 1re paie du mois, avril 2027', () => {
    expect(entre({ type: 'rangPaie', rang: 1 }, ...AVRIL)).toEqual(['2027-04-01']);
  });

  it('R3 : paiement supplémentaire à la 2e paie du mois, avril 2027', () => {
    expect(entre({ type: 'rangPaie', rang: 2 }, ...AVRIL)).toEqual(['2027-04-15']);
  });

  it('R4 : la 3e paie d’avril ne reçoit que les éléments « à chaque paie » (A8)', () => {
    const le29 = (f: Frequence) => entre(f, '2027-04-29', '2027-04-29');
    expect(le29({ type: 'chaquePaie' })).toEqual(['2027-04-29']);
    expect(le29({ type: 'rangPaie', rang: 1 })).toEqual([]);
    expect(le29({ type: 'rangPaie', rang: 2 })).toEqual([]);
  });

  it('R5 : mêmes règles en septembre 2027', () => {
    const SEPT: [string, string] = ['2027-09-01', '2027-09-30'];
    expect(entre({ type: 'rangPaie', rang: 1 }, ...SEPT)).toEqual(['2027-09-02']);
    expect(entre({ type: 'rangPaie', rang: 2 }, ...SEPT)).toEqual(['2027-09-16']);
    expect(entre({ type: 'chaquePaie' }, ...SEPT)).toEqual(['2027-09-02', '2027-09-16', '2027-09-30']);
  });

  it('R6 : téléphone au début du mois, janvier à mars 2027', () => {
    const f: Frequence = { type: 'mois', n: 1, depart: d('2027-01-01') };
    expect(entre(f, '2027-01-01', '2027-03-31')).toEqual(['2027-01-01', '2027-02-01', '2027-03-01']);
  });

  it('R7 : facture mensuelle le 31, janvier à avril 2027', () => {
    const f: Frequence = { type: 'mois', n: 1, depart: d('2027-01-31') };
    expect(entre(f, '2027-01-01', '2027-04-30')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('R8 : la même facture en février 2028', () => {
    const f: Frequence = { type: 'mois', n: 1, depart: d('2027-01-31') };
    expect(entre(f, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('R9 : tous les 2 mois à partir du 31 août 2027, sans glissement', () => {
    const f: Frequence = { type: 'mois', n: 2, depart: d('2027-08-31') };
    expect(entre(f, '2027-08-01', '2028-02-29')).toEqual(['2027-08-31', '2027-10-31', '2027-12-31', '2028-02-29']);
    expect(entre(f, '2028-03-01', '2028-04-30')).toEqual(['2028-04-30']);
  });

  it('R10 : tous les 3 mois à partir du 15 janvier 2027', () => {
    const f: Frequence = { type: 'mois', n: 3, depart: d('2027-01-15') };
    expect(entre(f, '2027-01-01', '2028-01-31')).toEqual([
      '2027-01-15',
      '2027-04-15',
      '2027-07-15',
      '2027-10-15',
      '2028-01-15',
    ]);
  });

  it('R11 : semestrielle à partir du 31 mars 2027 (Q4 : même chose que tous les 6 mois)', () => {
    const f: Frequence = { type: 'semestrielle', depart: d('2027-03-31') };
    const attendu = ['2027-03-31', '2027-09-30', '2028-03-31', '2028-09-30'];
    expect(entre(f, '2027-01-01', '2028-12-31')).toEqual(attendu);
    expect(entre({ type: 'mois', n: 6, depart: d('2027-03-31') }, '2027-01-01', '2028-12-31')).toEqual(attendu);
  });

  it('R12 : annuelle le 15 mars', () => {
    const f: Frequence = { type: 'annees', n: 1, depart: d('2027-03-15') };
    expect(entre(f, '2027-01-01', '2028-12-31')).toEqual(['2027-03-15', '2028-03-15']);
  });

  it('R13 : annuelle le 29 février, à partir de 2028', () => {
    const f: Frequence = { type: 'annees', n: 1, depart: d('2028-02-29') };
    expect(entre(f, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('R14 : tous les 2 ans à partir du 20 mai 2027', () => {
    const f: Frequence = { type: 'annees', n: 2, depart: d('2027-05-20') };
    expect(entre(f, '2027-01-01', '2032-12-31')).toEqual(['2027-05-20', '2029-05-20', '2031-05-20']);
  });

  it('R15 : personnalisée, toutes les 10 semaines à partir du lundi 4 janvier 2027 (Q2)', () => {
    const f: Frequence = { type: 'semaines', n: 10, depart: d('2027-01-04') };
    expect(entre(f, '2027-01-01', '2027-06-30')).toEqual(['2027-01-04', '2027-03-15', '2027-05-24']);
  });

  it('R16 : ponctuelle le 12 juin 2027', () => {
    const f: Frequence = { type: 'ponctuelle', date: d('2027-06-12') };
    expect(entre(f, '2027-01-01', '2027-12-31')).toEqual(['2027-06-12']);
    expect(entre(f, '2027-07-01', '2027-12-31')).toEqual([]);
  });

  it('R17 : personnalisée, tous les 3 mois à partir du 31 janvier 2027, sans glissement', () => {
    const f: Frequence = { type: 'mois', n: 3, depart: d('2027-01-31') };
    expect(entre(f, '2027-01-01', '2028-01-31')).toEqual([
      '2027-01-31',
      '2027-04-30',
      '2027-07-31',
      '2027-10-31',
      '2028-01-31',
    ]);
  });
});

describe('Fréquences — règles générales', () => {
  it('personnalisée en jours : tous les 10 jours', () => {
    const f: Frequence = { type: 'jours', n: 10, depart: d('2027-02-20') };
    expect(entre(f, '2027-02-01', '2027-03-15')).toEqual(['2027-02-20', '2027-03-02', '2027-03-12']);
  });

  it('rien avant la date de départ', () => {
    const f: Frequence = { type: 'mois', n: 1, depart: d('2027-06-15') };
    expect(entre(f, '2027-01-01', '2027-06-14')).toEqual([]);
  });

  it('une période qui commence longtemps après le départ est calculée directement, sans glissement', () => {
    const f: Frequence = { type: 'mois', n: 1, depart: d('2027-01-31') };
    expect(entre(f, '2040-02-01', '2040-03-31')).toEqual(['2040-02-29', '2040-03-31']);
    const p: Frequence = { type: 'semaines', n: 2, depart: d('2027-01-07') };
    expect(entre(p, '2040-01-01', '2040-01-31')).toEqual(['2040-01-05', '2040-01-19']);
  });

  it('les fréquences liées à la paie exigent le calendrier de paie', () => {
    expect(() => datesDe({ type: 'chaquePaie' }, d('2027-01-01'), d('2027-01-31'))).toThrow();
  });

  it('refuse une fréquence invalide', () => {
    expect(() => datesDe({ type: 'mois', n: 0, depart: d('2027-01-01') }, d('2027-01-01'), d('2027-12-31'))).toThrow();
    expect(() => datesDe({ type: 'semaines', n: 1.5, depart: d('2027-01-01') }, d('2027-01-01'), d('2027-12-31'))).toThrow();
  });

  it('une période inversée ne produit rien', () => {
    expect(entre({ type: 'mois', n: 1, depart: d('2027-01-01') }, '2027-12-31', '2027-01-01')).toEqual([]);
  });
});
