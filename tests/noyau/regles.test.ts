// Cas témoins E1 à E7 : dates d'effet, suspension et fin.
// Règle Q3 : les dates d'effet, de fin et de suspension sont toujours incluses.

import { describe, expect, it } from 'vitest';
import { dateCivile as d } from '../../src/noyau/dates';
import { occurrences, type Regle } from '../../src/noyau/regles';

const montantsDe = (r: Regle, debut: string, fin: string) =>
  occurrences(r, d(debut), d(fin)).map((o) => [o.date, o.montant] as const);

const INTERNET: Regle = {
  frequence: { type: 'mois', n: 1, depart: d('2027-01-22') },
  montants: [
    { aPartirDu: d('2027-01-22'), montant: 8_500 },
    { aPartirDu: d('2027-03-01'), montant: 9_000 },
  ],
};

const ABONNEMENT = (suspensions: Regle['suspensions'], fin?: string): Regle => ({
  frequence: { type: 'mois', n: 1, depart: d('2027-01-05') },
  montants: [{ aPartirDu: d('2027-01-05'), montant: 1_500 }],
  suspensions,
  ...(fin ? { fin: d(fin) } : {}),
});

describe('Dates d’effet, suspension et fin — cas témoins', () => {
  it('E1 : Internet passe de 85 $ à 90 $ à partir du 1er mars 2027', () => {
    expect(montantsDe(INTERNET, '2027-01-01', '2027-03-31')).toEqual([
      ['2027-01-22', 8_500],
      ['2027-02-22', 8_500],
      ['2027-03-22', 9_000],
    ]);
  });

  it('E2 : une hausse qui prend effet le jour même d’une occurrence s’y applique (Q3)', () => {
    const r: Regle = {
      ...INTERNET,
      montants: [
        { aPartirDu: d('2027-01-22'), montant: 8_500 },
        { aPartirDu: d('2027-03-22'), montant: 9_000 },
      ],
    };
    expect(montantsDe(r, '2027-03-01', '2027-03-31')).toEqual([['2027-03-22', 9_000]]);
  });

  it('E3 : abonnement suspendu du 1er juin au 31 août 2027', () => {
    const r = ABONNEMENT([{ debut: d('2027-06-01'), fin: d('2027-08-31') }]);
    expect(montantsDe(r, '2027-05-01', '2027-09-30').map(([date]) => date)).toEqual(['2027-05-05', '2027-09-05']);
  });

  it('E3 bis : la suspension n’efface rien avant elle', () => {
    const sans = ABONNEMENT(undefined);
    const avec = ABONNEMENT([{ debut: d('2027-06-01'), fin: d('2027-08-31') }]);
    expect(montantsDe(avec, '2027-01-01', '2027-05-31')).toEqual(montantsDe(sans, '2027-01-01', '2027-05-31'));
  });

  it('E4 : abonnement terminé le 15 octobre 2027', () => {
    const r = ABONNEMENT(undefined, '2027-10-15');
    expect(montantsDe(r, '2027-09-01', '2027-12-31').map(([date]) => date)).toEqual(['2027-09-05', '2027-10-05']);
  });

  it('E5 : terminé le 5 octobre, jour même d’une occurrence : elle est incluse (Q3)', () => {
    const r = ABONNEMENT(undefined, '2027-10-05');
    expect(montantsDe(r, '2027-09-01', '2027-12-31').map(([date]) => date)).toEqual(['2027-09-05', '2027-10-05']);
  });

  it('E6 : passer à 95 $ en juillet ne réécrit pas mars à juin', () => {
    const avant = montantsDe(INTERNET, '2027-03-01', '2027-06-30');
    const r: Regle = { ...INTERNET, montants: [...INTERNET.montants, { aPartirDu: d('2027-07-01'), montant: 9_500 }] };
    expect(montantsDe(r, '2027-03-01', '2027-06-30')).toEqual(avant);
    expect(montantsDe(r, '2027-07-01', '2027-07-31')).toEqual([['2027-07-22', 9_500]]);
  });

  it('E7 : suspension du 5 juin au 5 août, bornes sur des occurrences : toutes exclues', () => {
    const r = ABONNEMENT([{ debut: d('2027-06-05'), fin: d('2027-08-05') }]);
    expect(montantsDe(r, '2027-05-01', '2027-09-30').map(([date]) => date)).toEqual(['2027-05-05', '2027-09-05']);
  });
});

describe('Règles — protections', () => {
  it('une occurrence antérieure au premier montant connu est signalée, pas inventée', () => {
    const r: Regle = {
      frequence: { type: 'mois', n: 1, depart: d('2027-01-05') },
      montants: [{ aPartirDu: d('2027-03-01'), montant: 1_000 }],
    };
    const [janvier] = occurrences(r, d('2027-01-01'), d('2027-01-31'));
    expect(janvier?.montant).toBeNull();
  });

  it('refuse une suspension dont la fin précède le début', () => {
    const r = ABONNEMENT([{ debut: d('2027-08-31'), fin: d('2027-06-01') }]);
    expect(() => occurrences(r, d('2027-01-01'), d('2027-12-31'))).toThrow();
  });

  it('refuse un montant qui n’est pas un nombre entier de cents', () => {
    const r: Regle = {
      frequence: { type: 'mois', n: 1, depart: d('2027-01-05') },
      montants: [{ aPartirDu: d('2027-01-05'), montant: 10.5 }],
    };
    expect(() => occurrences(r, d('2027-01-01'), d('2027-01-31'))).toThrow();
  });
});
