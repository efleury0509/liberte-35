// Étape 5 : statuts et confirmations dans le moteur (cas témoins S, C,
// validés le 8 novembre 2026). Scénario M1 à M4, aujourd'hui = 10 mars 2027.

import { describe, expect, it } from 'vitest';
import { planifier, type ConfirmationOccurrence, type Cycle, type EntreePlan } from '../../src/noyau/cycles';
import { dateCivile as d } from '../../src/noyau/dates';
import { ELEMENTS_ETAPE4, PERIODE_ETAPE4, PROFIL_ETAPE4 } from '../../src/exemple/scenarioEtape4';

const AUJOURDHUI = d('2027-03-10');

function plan(confirmations: ConfirmationOccurrence[] = [], aujourdhui = AUJOURDHUI, extra: Partial<EntreePlan> = {}) {
  return planifier({ profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4, confirmations, aujourdhui, ...extra }, PERIODE_ETAPE4.debut, PERIODE_ETAPE4.fin);
}
const cycle = (cs: readonly Cycle[], debut: string) => cs.find((c) => c.debut === debut)!;
const ligne = (c: Cycle, id: string) => c.lignes.find((l) => l.elementId === id)!;
const conf = (elementId: string | null, origine: string, montant: number, date = '2027-03-10'): ConfirmationOccurrence => ({
  elementId,
  origine: d(origine),
  date: d(date),
  montant,
});

describe('Statuts (S)', () => {
  const { cycles } = plan();
  const m2 = cycle(cycles, '2027-02-18');
  const m3 = cycle(cycles, '2027-03-04');

  it('S1 : loyer dû le 1er mars, rien de confirmé : à vérifier, toujours compté', () => {
    expect(ligne(m2, 'loyer')).toMatchObject({ statut: 'aVerifier', compte: true, montant: 120_000 });
    expect(m2.disponible).toBe(116_000);
  });

  it('S2 : assurances dues le 15 mars : à venir', () => {
    expect(ligne(m3, 'assurances').statut).toBe('aVenir');
  });

  it('S3 : revenu incertain dû le 10 mars : à venir le jour même, à vérifier le lendemain, jamais compté', () => {
    expect(ligne(m3, 'impot')).toMatchObject({ statut: 'aVenir', compte: false });
    const lendemain = cycle(plan([], d('2027-03-11')).cycles, '2027-03-04');
    expect(ligne(lendemain, 'impot')).toMatchObject({ statut: 'aVerifier', compte: false });
    expect(lendemain.disponible).toBe(155_500);
  });

  it('S4 : sans échéance, à vérifier le lendemain de la fin du cycle', () => {
    expect(ligne(m3, 'coupe').statut).toBe('aVenir');
    expect(ligne(cycle(plan([], d('2027-03-17')).cycles, '2027-03-04'), 'coupe').statut).toBe('aVenir');
    expect(ligne(cycle(plan([], d('2027-03-18')).cycles, '2027-03-04'), 'coupe').statut).toBe('aVerifier');
  });

  it('S5 : les enveloppes n’ont pas de statut et ne sont jamais à vérifier', () => {
    for (const c of cycles) for (const l of c.lignes.filter((x) => x.genre === 'enveloppe')) expect(l.statut).toBe('enveloppe');
  });

  it('S5 : une enveloppe retirée cette fois est « retirée », pas « enveloppe »', () => {
    const p = plan([], AUJOURDHUI, { ajustements: [{ elementId: 'epicerie', origine: d('2027-03-04'), retire: true }] });
    expect(ligne(cycle(p.cycles, '2027-03-04'), 'epicerie')).toMatchObject({ statut: 'retiree', compte: false });
  });

  it('S6 : la paie a aussi un statut : 18 février à vérifier, 4 mars à vérifier, 18 mars à venir', () => {
    expect(cycles.map((c) => c.paieStatut)).toEqual(['aVerifier', 'aVerifier', 'aVerifier', 'aVenir']);
  });

  it('S7 : nombre d’éléments à vérifier par cycle (paie comprise, enveloppes exclues)', () => {
    // M1 : paie, gym, hydro, assurances ; M2 : paie, cellulaire, cadeau, loyer, allocation, pige ; M3 : paie.
    expect(cycles.map((c) => c.aVerifier)).toEqual([4, 6, 1, 0]);
  });

  it('sans date du jour, tout est à venir', () => {
    const p = planifier({ profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4 }, PERIODE_ETAPE4.debut, PERIODE_ETAPE4.fin);
    expect(p.cycles.every((c) => c.aVerifier === 0 && c.paieStatut === 'aVenir')).toBe(true);
  });
});

describe('Confirmer (C)', () => {
  it('C1 : loyer confirmé au montant prévu : confirmé, disponible inchangé', () => {
    const m2 = cycle(plan([conf('loyer', '2027-03-01', 120_000)]).cycles, '2027-02-18');
    expect(ligne(m2, 'loyer')).toMatchObject({ statut: 'confirme', montant: 120_000, montantPrevu: 120_000, confirmation: { date: '2027-03-10', montant: 120_000 } });
    expect(m2.disponible).toBe(116_000);
    expect(m2.aVerifier).toBe(5);
  });

  it('C2 : Hydro estimée 95 $ confirmée 102,40 $ : M1 à 1 457,60 $ et plus d’« Estimation »', () => {
    const m1 = cycle(plan([conf('hydro', '2027-02-10', 10_240)]).cycles, '2027-02-04');
    expect(ligne(m1, 'hydro')).toMatchObject({ montant: 10_240, montantPrevu: 9_500, estimation: false });
    expect(m1.disponible).toBe(145_760);
    expect(m1.estimation).toBe(false);
  });

  it('C3 : paie du 4 mars reçue 2 050 $ : M3 à 1 505 $, montant prévu gardé', () => {
    const m3 = cycle(plan([conf(null, '2027-03-04', 205_000)]).cycles, '2027-03-04');
    expect(m3.paieStatut).toBe('confirme');
    expect(m3.paieConfirmation).toEqual({ date: '2027-03-10', montant: 205_000 });
    expect(m3.paie.montant).toBe(210_000);
    expect(m3.revenus).toBe(205_000);
    expect(m3.disponible).toBe(150_500);
  });

  it('C4 : revenu incertain confirmé reçu 812,35 $ : compté, plus rien de non compté', () => {
    const m3 = cycle(plan([conf('impot', '2027-03-10', 81_235, '2027-03-12')], d('2027-03-12')).cycles, '2027-03-04');
    expect(ligne(m3, 'impot')).toMatchObject({ statut: 'confirme', compte: true, montant: 81_235, incertain: true });
    expect(m3.nonComptes).toBe(0);
    expect(m3.disponible).toBe(236_735);
  });

  it('C5 : la date confirmée ne déplace rien (loyer payé le 28 février reste dans M2)', () => {
    const m2 = cycle(plan([conf('loyer', '2027-03-01', 120_000, '2027-02-28')]).cycles, '2027-02-18');
    expect(ligne(m2, 'loyer').confirmation?.date).toBe('2027-02-28');
  });

  it('une confirmation pour une occurrence absente de la période n’a aucun effet', () => {
    const p = plan([conf('loyer', '2027-07-01', 1)]);
    expect(p.cycles.map((c) => c.disponible)).toEqual(plan().cycles.map((c) => c.disponible));
  });

  it('une occurrence ajustée puis confirmée : le prévu est l’ajusté, le compté est le confirmé', () => {
    const p = plan([conf('cadeau', '2027-02-27', 9_000)], AUJOURDHUI, {
      ajustements: [{ elementId: 'cadeau', origine: d('2027-02-27'), montant: 8_000 }],
    });
    expect(ligne(cycle(p.cycles, '2027-02-18'), 'cadeau')).toMatchObject({ montantPrevu: 8_000, montant: 9_000, ajuste: true, statut: 'confirme' });
  });
});

describe('Mois à trois paies (C7)', () => {
  it('confirmer la paie du 29 avril et ses éléments ne change ni les cycles ni les rangs', () => {
    const avril = (confirmations: ConfirmationOccurrence[]) =>
      planifier({ profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4, confirmations, aujourdhui: d('2027-05-20') }, d('2027-04-01'), d('2027-04-30'));
    const sans = avril([]);
    const avec = avril([conf(null, '2027-04-29', 210_000), conf('loyer', '2027-05-01', 120_000), conf('essence', '2027-04-29', 6_000)]);
    expect(avec.cycles.map((c) => [c.debut, c.fin, c.lignes.map((l) => l.elementId).sort()])).toEqual(
      sans.cycles.map((c) => [c.debut, c.fin, c.lignes.map((l) => l.elementId).sort()]),
    );
    const c29 = avec.cycles.find((c) => c.paie.dateOrigine === '2027-04-29')!;
    expect(c29.paieStatut).toBe('confirme');
    expect(ligne(c29, 'loyer').statut).toBe('confirme');
    // Une enveloppe ne se confirme pas : la confirmation est ignorée.
    expect(ligne(c29, 'essence').statut).toBe('enveloppe');
    expect(avec.cycles.find((c) => c.paie.dateOrigine === '2027-04-01')!.lignes.some((l) => l.elementId === 'epicerie')).toBe(true);
  });
});
