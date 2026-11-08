// Cas témoins de l'étape 4 (validés le 8 novembre 2026) : autres revenus,
// dépenses fixes et enveloppes, dépenses ponctuelles, modifier, suspendre,
// terminer. Montants en cents.

import { describe, expect, it } from 'vitest';
import { comparerRattachements, planifier, type Cycle, type ElementPlanifie, type EntreePlan } from '../../src/noyau/cycles';
import { dateCivile as d } from '../../src/noyau/dates';
import { ELEMENTS_ETAPE4, PERIODE_ETAPE4, PROFIL_ETAPE4 } from '../../src/exemple/scenarioEtape4';

const base: EntreePlan = { profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4 };

function plan(entree: Partial<EntreePlan> = {}, debut = PERIODE_ETAPE4.debut, fin = PERIODE_ETAPE4.fin) {
  return planifier({ ...base, ...entree }, debut, fin);
}
function cycle(cycles: readonly Cycle[], debut: string): Cycle {
  const c = cycles.find((x) => x.debut === debut);
  if (!c) throw new Error(`Aucun cycle au ${debut}`);
  return c;
}
const ids = (c: Cycle) => c.lignes.map((l) => l.elementId);
const avec = (...ajouts: ElementPlanifie[]) => [...ELEMENTS_ETAPE4, ...ajouts];
const remplacer = (id: string, f: (e: ElementPlanifie) => ElementPlanifie) =>
  ELEMENTS_ETAPE4.map((e) => (e.id === id ? f(e) : e));

describe('Scénario M1 à M4', () => {
  const { cycles } = plan();

  it('quatre cycles, du 4 février au 31 mars', () => {
    expect(cycles.map((c) => [c.debut, c.fin])).toEqual([
      ['2027-02-04', '2027-02-17'],
      ['2027-02-18', '2027-03-03'],
      ['2027-03-04', '2027-03-17'],
      ['2027-03-18', '2027-03-31'],
    ]);
  });

  it('M1 : 635,00 $ de sorties, disponible 1 465,00 $, Estimation (Hydro estimée)', () => {
    const c = cycle(cycles, '2027-02-04');
    expect(ids(c).sort()).toEqual(['assurances', 'epicerie', 'essence', 'gym', 'hydro']);
    expect(c.revenus).toBe(210_000);
    expect(c.autresRevenus).toBe(0);
    expect(c.sorties).toBe(63_500);
    expect(c.disponible).toBe(146_500);
    expect(c.estimation).toBe(true);
  });

  it('M2 : pige estimée comptée, loyer du 1er mars ici (A1), disponible 1 160,00 $, Estimation', () => {
    const c = cycle(cycles, '2027-02-18');
    expect(ids(c).sort()).toEqual(['allocation', 'cadeau', 'cellulaire', 'essence', 'loyer', 'pige']);
    expect(c.autresRevenus).toBe(45_000);
    expect(c.revenus).toBe(255_000);
    expect(c.sorties).toBe(139_000);
    expect(c.disponible).toBe(116_000);
    expect(c.estimation).toBe(true);
  });

  it('M3 : remboursement incertain visible mais non compté (A3), gym suspendu, coupe au cycle choisi, précis', () => {
    const c = cycle(cycles, '2027-03-04');
    expect(ids(c).sort()).toEqual(['assurances', 'coupe', 'epicerie', 'essence', 'impot']);
    const impot = c.lignes.find((l) => l.elementId === 'impot');
    expect(impot).toMatchObject({ nature: 'revenu', incertain: true, compte: false, montant: 80_000 });
    expect(c.nonComptes).toBe(80_000);
    expect(c.revenus).toBe(210_000);
    expect(c.sorties).toBe(54_500);
    expect(c.disponible).toBe(155_500);
    // L'estimation du remboursement n'entre pas dans le calcul : le disponible reste précis.
    expect(c.estimation).toBe(false);
  });

  it('M4 : dernière occurrence du cellulaire, loyer du 1er avril absent (A1), disponible 2 135,00 $', () => {
    const c = cycle(cycles, '2027-03-18');
    expect(ids(c).sort()).toEqual(['allocation', 'cellulaire', 'essence']);
    expect(c.revenus).toBe(225_000);
    expect(c.sorties).toBe(11_500);
    expect(c.disponible).toBe(213_500);
    expect(c.estimation).toBe(false);
  });

  it('aucun report : changer M1 ne change rien aux autres cycles', () => {
    const autre = plan({ elements: remplacer('hydro', (e) => ({ ...e, regle: { ...e.regle, montants: [{ aPartirDu: d('2027-01-01'), montant: 50_000 }] } })) });
    expect(cycle(autre.cycles, '2027-02-04').disponible).toBe(106_000);
    expect(autre.cycles.slice(1).map((c) => c.disponible)).toEqual(cycles.slice(1).map((c) => c.disponible));
  });

  it('chaque ligne porte sa nature et son genre', () => {
    const m3 = cycle(cycles, '2027-03-04');
    expect(m3.lignes.find((l) => l.elementId === 'epicerie')).toMatchObject({ nature: 'depense', genre: 'enveloppe', compte: true });
    expect(m3.lignes.find((l) => l.elementId === 'assurances')).toMatchObject({ nature: 'depense', genre: 'fixe', compte: true });
  });
});

describe('Revenus (R)', () => {
  const revenu = (id: string, date: string, montant: number | null, extra: Partial<ElementPlanifie> = {}): ElementPlanifie => ({
    id,
    libelle: id,
    nature: 'revenu',
    regle: { frequence: { type: 'ponctuelle', date: d(date) }, montants: montant === null ? [] : [{ aPartirDu: d('2027-01-01'), montant }] },
    ...extra,
  });

  it('R1-R2 : un revenu va au cycle qui contient sa date ; le jour d’une paie, au cycle de cette paie', () => {
    const { cycles } = plan({ elements: [revenu('le4', '2027-03-04', 1_000), revenu('le3', '2027-03-03', 1_000)] });
    expect(ids(cycle(cycles, '2027-03-04'))).toEqual(['le4']);
    expect(ids(cycle(cycles, '2027-02-18'))).toEqual(['le3']);
  });

  it('R4, R5, R12 : un revenu incertain reste hors du disponible, même après sa date', () => {
    for (const jour of ['2027-03-01', '2027-03-11', '2027-12-31']) {
      const c = cycle(plan({ aujourdhui: d(jour) }).cycles, '2027-03-04');
      expect(c.disponible).toBe(155_500);
      expect(c.lignes.find((l) => l.elementId === 'impot')?.compte).toBe(false);
    }
  });

  it('R4 : un revenu incertain sans montant ne rend pas le disponible « À compléter »', () => {
    const { cycles } = plan({ elements: avec(revenu('peut-etre', '2027-03-12', null, { incertain: true })) });
    expect(cycle(cycles, '2027-03-04').disponible).toBe(155_500);
  });

  it('R6 (Q15) : un revenu certain sans montant rend le disponible « À compléter » ; le reste demeure connu', () => {
    const c = cycle(plan({ elements: avec(revenu('meuble', '2027-03-25', null)) }).cycles, '2027-03-18');
    expect(c.disponible).toBeNull();
    expect(c.revenus).toBeNull();
    expect(c.autresRevenus).toBeNull();
    expect(c.sorties).toBe(11_500);
    expect(c.paie.montant).toBe(210_000);
    expect(c.lignes.find((l) => l.elementId === 'allocation')?.montant).toBe(15_000);
  });

  it('R8 : un revenu avant la toute première paie est listé à part', () => {
    const p = plan({ elements: [revenu('avant', '2027-01-02', 5_000)] }, d('2027-01-01'), d('2027-01-31'));
    expect(p.avantPremierCycle).toEqual([expect.objectContaining({ elementId: 'avant', nature: 'revenu' })]);
  });

  it('R9 : un revenu mensuel le 31 tombe le dernier jour de chaque mois', () => {
    const fin31: ElementPlanifie = {
      id: 'fin',
      libelle: 'fin',
      nature: 'revenu',
      regle: { frequence: { type: 'mois', n: 1, depart: d('2027-01-31') }, montants: [{ aPartirDu: d('2027-01-01'), montant: 1_000 }] },
    };
    const { cycles } = plan({ elements: [fin31] });
    const echeances = cycles.flatMap((c) => c.lignes.map((l) => l.echeance));
    expect(echeances).toEqual(['2027-02-28', '2027-03-31']);
  });

  it('R10 : un revenu « à chaque paie » suit la paie déplacée, sans doublon', () => {
    const prime: ElementPlanifie = {
      id: 'prime',
      libelle: 'Prime',
      nature: 'revenu',
      regle: { frequence: { type: 'chaquePaie' }, montants: [{ aPartirDu: d('2027-01-01'), montant: 5_000 }] },
    };
    const { cycles } = plan({ elements: [prime], exceptions: [{ dateOrigine: d('2027-02-18'), dateReelle: d('2027-02-21') }] });
    expect(cycles.map((c) => [c.debut, ids(c)])).toEqual([
      ['2027-02-04', ['prime']],
      ['2027-02-21', ['prime']],
      ['2027-03-04', ['prime']],
      ['2027-03-18', ['prime']],
    ]);
  });

  it('R11 : un revenu aux deux semaines reste juste dans un mois à trois paies, sans perte ni doublon', () => {
    const quinzaine: ElementPlanifie = {
      id: 'q',
      libelle: 'q',
      nature: 'revenu',
      regle: { frequence: { type: 'semaines', n: 2, depart: d('2027-01-08') }, montants: [{ aPartirDu: d('2027-01-01'), montant: 1_000 }] },
    };
    const { cycles } = plan({ elements: [quinzaine] }, d('2027-04-01'), d('2027-04-30'));
    expect(cycles.map((c) => [c.debut, c.lignes.map((l) => l.echeance)])).toEqual([
      ['2027-04-01', ['2027-04-02']],
      ['2027-04-15', ['2027-04-16']],
      ['2027-04-29', ['2027-04-30']],
    ]);
  });
});

describe('Dépenses (D)', () => {
  it('D1-D3 : une enveloppe compte à son montant prévu et ne rend pas le disponible estimé (Q14)', () => {
    const { cycles } = plan({ elements: ELEMENTS_ETAPE4.filter((e) => e.genre === 'enveloppe') });
    const m3 = cycle(cycles, '2027-03-04');
    expect(m3.sorties).toBe(36_000);
    expect(m3.estimation).toBe(false);
  });

  it('D2 : rien ne passe d’un cycle à l’autre ; l’épicerie vaut toujours 300,00 $', () => {
    const { cycles } = plan();
    const epiceries = cycles.flatMap((c) => c.lignes.filter((l) => l.elementId === 'epicerie').map((l) => l.montant));
    expect(epiceries).toEqual([30_000, 30_000]);
  });

  it('D5 : une dépense sans montant rend le disponible « À compléter »', () => {
    const inconnue: ElementPlanifie = { id: 'x', libelle: 'x', regle: { frequence: { type: 'ponctuelle', date: d('2027-03-06') }, montants: [] } };
    const c = cycle(plan({ elements: avec(inconnue) }).cycles, '2027-03-04');
    expect(c.sorties).toBeNull();
    expect(c.disponible).toBeNull();
    expect(c.revenus).toBe(210_000);
  });

  it('D6 : une dépense ponctuelle n’apparaît qu’une fois, même sur un an', () => {
    const p = plan({}, d('2027-01-01'), d('2027-12-31'));
    expect(p.cycles.flatMap((c) => c.lignes).filter((l) => l.elementId === 'cadeau')).toHaveLength(1);
  });

  it('D7 : une dépense rattachée à un cycle suit la paie, même déplacée', () => {
    const { cycles } = plan({ exceptions: [{ dateOrigine: d('2027-03-04'), dateReelle: d('2027-03-06') }] });
    expect(ids(cycle(cycles, '2027-03-06'))).toContain('coupe');
    expect(cycles.flatMap(ids).filter((i) => i === 'coupe')).toHaveLength(1);
  });

  it('D7 : rattachée à un cycle hors de la période, elle n’apparaît pas', () => {
    const p = plan({}, d('2027-04-01'), d('2027-04-30'));
    expect(p.cycles.flatMap(ids)).not.toContain('coupe');
  });

  it('D8 : une dépense aux 3 mois et une annuelle', () => {
    const elements: ElementPlanifie[] = [
      { id: 'trim', libelle: 't', regle: { frequence: { type: 'mois', n: 3, depart: d('2027-01-12') }, montants: [{ aPartirDu: d('2027-01-01'), montant: 100 }] } },
      { id: 'an', libelle: 'a', regle: { frequence: { type: 'annees', n: 1, depart: d('2026-03-08') }, montants: [{ aPartirDu: d('2026-01-01'), montant: 100 }] } },
    ];
    const p = plan({ elements }, d('2027-01-01'), d('2027-12-31'));
    const echeances = (id: string) => p.cycles.flatMap((c) => c.lignes.filter((l) => l.elementId === id).map((l) => l.echeance));
    expect(echeances('trim')).toEqual(['2027-01-12', '2027-04-12', '2027-07-12', '2027-10-12']);
    expect(echeances('an')).toEqual(['2027-03-08']);
  });
});

describe('Modifier, suspendre, terminer (H)', () => {
  it('H1 : épicerie à 350,00 $ à partir du 1er mars ; M1 et M2 identiques', () => {
    const elements = remplacer('epicerie', (e) => ({
      ...e,
      regle: { ...e.regle, montants: [...e.regle.montants, { aPartirDu: d('2027-03-01'), montant: 35_000 }] },
    }));
    const { cycles } = plan({ elements });
    expect(cycles.map((c) => c.disponible)).toEqual([146_500, 116_000, 150_500, 213_500]);
    expect(cycle(cycles, '2027-03-04').sorties).toBe(59_500);
  });

  it('H2 : gym présent le 5 févr. et le 5 mai, absent pendant la suspension', () => {
    const p = plan({ elements: ELEMENTS_ETAPE4.filter((e) => e.id === 'gym') }, d('2027-02-01'), d('2027-05-20'));
    expect(p.cycles.flatMap((c) => c.lignes.map((l) => l.echeance))).toEqual(['2027-02-05', '2027-05-05']);
  });

  it('H3 : cellulaire jusqu’au 22 mars inclus, plus rien ensuite', () => {
    const p = plan({ elements: ELEMENTS_ETAPE4.filter((e) => e.id === 'cellulaire') }, d('2027-02-01'), d('2027-06-30'));
    expect(p.cycles.flatMap((c) => c.lignes.map((l) => l.echeance))).toEqual(['2027-02-22', '2027-03-22']);
  });

  it('H5 : la pige devient incertaine ; le disponible de M2 passe à 860,00 $', () => {
    const { cycles } = plan({ elements: remplacer('pige', (e) => ({ ...e, incertain: true })) });
    const m2 = cycle(cycles, '2027-02-18');
    expect(m2.disponible).toBe(86_000);
    expect(m2.nonComptes).toBe(30_000);
    expect(m2.estimation).toBe(false);
  });

  it('H6 : paie du 18 févr. déplacée au 21 ; l’Allocation du 20 change de cycle et c’est signalé', () => {
    const avant = plan();
    const apres = plan({ exceptions: [{ dateOrigine: d('2027-02-18'), dateReelle: d('2027-02-21') }] });
    expect(cycle(apres.cycles, '2027-02-04').disponible).toBe(161_500);
    expect(cycle(apres.cycles, '2027-02-21').disponible).toBe(101_000);
    expect(comparerRattachements(avant, apres)).toEqual([
      { elementId: 'allocation', libelle: 'Allocation', echeance: '2027-02-20', dePaie: '2027-02-18', versPaie: '2027-02-04' },
    ]);
  });
});
