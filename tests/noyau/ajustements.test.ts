// Étape 4b — A : ajustements d'une occurrence (montant, date, autre paie,
// retrait) sans toucher la règle ; B : fréquence datée « à partir du ».
// Scénario de l'étape 4. Avril 2027 a trois paies : le 1er, le 15 et le 29.

import { describe, expect, it } from 'vitest';
import {
  ajustementsOrphelins,
  planifier,
  type AjustementOccurrence,
  type Cycle,
  type ElementPlanifie,
  type EntreePlan,
} from '../../src/noyau/cycles';
import { dateCivile as d } from '../../src/noyau/dates';
import { ELEMENTS_ETAPE4, PROFIL_ETAPE4 } from '../../src/exemple/scenarioEtape4';

const AVRIL = { debut: d('2027-04-01'), fin: d('2027-04-30') };

function plan(entree: Partial<EntreePlan> = {}, debut = AVRIL.debut, fin = AVRIL.fin) {
  return planifier({ profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4, ...entree }, debut, fin);
}
const cycle = (cycles: readonly Cycle[], debut: string) => {
  const c = cycles.find((x) => x.debut === debut);
  if (!c) throw new Error(`Aucun cycle au ${debut}`);
  return c;
};
const lignesDe = (c: Cycle, id: string) => c.lignes.filter((l) => l.elementId === id);
const aj = (a: Omit<AjustementOccurrence, 'origine'> & { origine: string }): AjustementOccurrence => ({ ...a, origine: d(a.origine) });
const avecRegle = (id: string, f: (e: ElementPlanifie) => ElementPlanifie) => ELEMENTS_ETAPE4.map((e) => (e.id === id ? f(e) : e));
const totalSorties = (cycles: readonly Cycle[]) => cycles.reduce((t, c) => t + (c.sorties ?? 0), 0);

describe('Référence : avril 2027 sans ajustement', () => {
  it('trois cycles ; le loyer du 1er mai va à la 3e paie (29 avril)', () => {
    const { cycles } = plan();
    expect(cycles.map((c) => c.debut)).toEqual(['2027-04-01', '2027-04-15', '2027-04-29']);
    expect(lignesDe(cycle(cycles, '2027-04-29'), 'loyer')[0]?.echeance).toBe('2027-05-01');
    expect(lignesDe(cycle(cycles, '2027-04-01'), 'epicerie')).toHaveLength(1);
  });
});

describe('A — ajustements d’occurrence', () => {
  it('A1 : épicerie à 350 $ pour la paie du 1er avril seulement ; mai reste à 300 $, la règle est intacte', () => {
    const ajustements = [aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })];
    const p = plan({ ajustements }, d('2027-04-01'), d('2027-05-20'));
    const ligne = lignesDe(cycle(p.cycles, '2027-04-01'), 'epicerie')[0];
    expect(ligne).toMatchObject({ montant: 35_000, ajuste: true, origine: '2027-04-01' });
    expect(lignesDe(cycle(p.cycles, '2027-05-13'), 'epicerie')[0]).toMatchObject({ montant: 30_000, ajuste: false });
    expect(cycle(p.cycles, '2027-04-01').sorties).toBe(cycle(plan().cycles, '2027-04-01').sorties! + 5_000);
    expect(ELEMENTS_ETAPE4.find((e) => e.id === 'epicerie')!.regle.montants).toEqual([{ aPartirDu: '2027-01-01', montant: 30_000 }]);
  });

  it('A2 : loyer du 1er mai payé avec la paie du 15 avril ; échéance gardée, une seule ligne, total inchangé', () => {
    const ajustements = [aj({ elementId: 'loyer', origine: '2027-05-01', paieOrigine: d('2027-04-15') })];
    const avant = plan();
    const apres = plan({ ajustements });
    expect(lignesDe(cycle(apres.cycles, '2027-04-15'), 'loyer')).toEqual([
      expect.objectContaining({ echeance: '2027-05-01', origine: '2027-05-01', manuel: true, ajuste: true }),
    ]);
    expect(lignesDe(cycle(apres.cycles, '2027-04-29'), 'loyer')).toEqual([]);
    expect(totalSorties(apres.cycles)).toBe(totalSorties(avant.cycles));
  });

  it('A2 : une occurrence venue d’après la période y entre si on la paie avec une paie de la période', () => {
    const ajustements = [aj({ elementId: 'loyer', origine: '2027-05-01', paieOrigine: d('2027-04-01') })];
    const p = plan({ ajustements }, d('2027-04-01'), d('2027-04-10'));
    expect(p.cycles.map((c) => c.debut)).toEqual(['2027-04-01']);
    expect(lignesDe(p.cycles[0]!, 'loyer').map((l) => l.echeance)).toEqual(['2027-04-01', '2027-05-01']);
  });

  it('A3 : Hydro du 10 avril déplacée au 16 ; elle suit sa nouvelle date (A1) et va au cycle du 15 avril', () => {
    const ajustements = [aj({ elementId: 'hydro', origine: '2027-04-10', date: d('2027-04-16') })];
    const { cycles } = plan({ ajustements });
    expect(lignesDe(cycle(cycles, '2027-04-01'), 'hydro')).toEqual([]);
    expect(lignesDe(cycle(cycles, '2027-04-15'), 'hydro')).toEqual([
      expect.objectContaining({ echeance: '2027-04-16', origine: '2027-04-10', ajuste: true, manuel: false }),
    ]);
  });

  it('A4 : essence retirée pour la 3e paie (29 avril) ; visible comme retirée, non comptée ; les autres paies inchangées', () => {
    const ajustements = [aj({ elementId: 'essence', origine: '2027-04-29', retire: true })];
    const avant = plan();
    const { cycles } = plan({ ajustements });
    expect(lignesDe(cycle(cycles, '2027-04-29'), 'essence')).toEqual([
      expect.objectContaining({ retiree: true, compte: false, ajuste: true, montant: 6_000 }),
    ]);
    expect(cycle(cycles, '2027-04-29').sorties).toBe(cycle(avant.cycles, '2027-04-29').sorties! - 6_000);
    expect(cycle(cycles, '2027-04-29').nonComptes).toBe(0);
    expect(cycle(cycles, '2027-04-15').sorties).toBe(cycle(avant.cycles, '2027-04-15').sorties);
  });

  it('A5 : épicerie de la 1re paie déplacée à la main vers la 3e paie du 29 avril : une seule fois, le 29', () => {
    const ajustements = [aj({ elementId: 'epicerie', origine: '2027-04-01', paieOrigine: d('2027-04-29') })];
    const p = plan({ ajustements }, d('2027-04-01'), d('2027-05-20'));
    expect(lignesDe(cycle(p.cycles, '2027-04-01'), 'epicerie')).toEqual([]);
    expect(lignesDe(cycle(p.cycles, '2027-04-29'), 'epicerie')).toHaveLength(1);
    expect(lignesDe(cycle(p.cycles, '2027-05-13'), 'epicerie')).toHaveLength(1);
    expect(p.cycles.flatMap((c) => lignesDe(c, 'epicerie'))).toHaveLength(2);
  });

  it('A6 : la paie du 15 avril est versée le 16 ; l’occurrence affectée à cette paie la suit, sans doublon', () => {
    const ajustements = [aj({ elementId: 'loyer', origine: '2027-05-01', paieOrigine: d('2027-04-15') })];
    const { cycles } = plan({ ajustements, exceptions: [{ dateOrigine: d('2027-04-15'), dateReelle: d('2027-04-16') }] });
    expect(cycles.map((c) => c.debut)).toEqual(['2027-04-01', '2027-04-16', '2027-04-29']);
    expect(lignesDe(cycle(cycles, '2027-04-16'), 'loyer')).toHaveLength(1);
    expect(cycles.flatMap((c) => lignesDe(c, 'loyer'))).toHaveLength(2);
  });

  it('A7 : changer le montant de la règle à partir du 1er avril garde l’ajustement du 1er avril', () => {
    const ajustements = [aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })];
    const elements = avecRegle('epicerie', (e) => ({
      ...e,
      regle: { ...e.regle, montants: [...e.regle.montants, { aPartirDu: d('2027-04-01'), montant: 32_000 }] },
    }));
    const p = plan({ ajustements, elements }, d('2027-04-01'), d('2027-05-20'));
    expect(lignesDe(cycle(p.cycles, '2027-04-01'), 'epicerie')[0]?.montant).toBe(35_000);
    expect(lignesDe(cycle(p.cycles, '2027-05-13'), 'epicerie')[0]?.montant).toBe(32_000);
    expect(ajustementsOrphelins({ profil: PROFIL_ETAPE4, elements, ajustements })).toEqual([]);
  });

  it('A8 : un ajustement dont l’occurrence n’existe plus (Hydro suspendue en avril) est repéré comme orphelin et n’agit plus', () => {
    const ajustements = [aj({ elementId: 'hydro', origine: '2027-04-10', date: d('2027-04-16') })];
    const elements = avecRegle('hydro', (e) => ({ ...e, regle: { ...e.regle, suspensions: [{ debut: d('2027-04-01'), fin: d('2027-04-30') }] } }));
    expect(ajustementsOrphelins({ profil: PROFIL_ETAPE4, elements, ajustements })).toEqual(ajustements);
    const { cycles } = plan({ ajustements, elements });
    expect(cycles.flatMap((c) => lignesDe(c, 'hydro'))).toEqual([]);
  });

  it('A8 : un ajustement sur un élément supprimé est orphelin', () => {
    const ajustements = [aj({ elementId: 'disparu', origine: '2027-04-01', montant: 1 })];
    expect(ajustementsOrphelins({ profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4, ajustements })).toEqual(ajustements);
  });

  it('A9 : un revenu incertain ajusté à 900 $ reste exclu du disponible', () => {
    const ajustements = [aj({ elementId: 'impot', origine: '2027-03-10', montant: 90_000 })];
    const sans = plan({}, d('2027-03-01'), d('2027-03-17'));
    const avec = plan({ ajustements }, d('2027-03-01'), d('2027-03-17'));
    const c = cycle(avec.cycles, '2027-03-04');
    expect(c.nonComptes).toBe(90_000);
    expect(c.disponible).toBe(cycle(sans.cycles, '2027-03-04').disponible);
  });

  it('un ajustement de montant sur une occurrence retirée ne la recompte pas', () => {
    const ajustements = [aj({ elementId: 'essence', origine: '2027-04-29', retire: true, montant: 9_999 })];
    const c = cycle(plan({ ajustements }).cycles, '2027-04-29');
    expect(lignesDe(c, 'essence')[0]).toMatchObject({ retiree: true, compte: false });
  });

  it('les rattachements manuels de l’étape 3 fonctionnent toujours', () => {
    const { cycles } = plan({ rattachementsManuels: [{ elementId: 'loyer', echeance: d('2027-05-01'), paieOrigine: d('2027-04-15') }] });
    expect(lignesDe(cycle(cycles, '2027-04-15'), 'loyer')).toHaveLength(1);
    expect(lignesDe(cycle(cycles, '2027-04-29'), 'loyer')).toHaveLength(0);
  });
});

describe('B — fréquence datée « à partir du »', () => {
  const epicerieChaquePaieDesMai = avecRegle('epicerie', (e) => ({
    ...e,
    regle: { ...e.regle, changements: [{ aPartirDu: d('2027-05-01'), frequence: { type: 'chaquePaie' } }] },
  }));

  it('B1 : épicerie « 1re paie » → « chaque paie » à partir du 1er mai ; avril intact (rien le 29 avril), chaque paie dès mai', () => {
    const p = plan({ elements: epicerieChaquePaieDesMai }, d('2027-04-01'), d('2027-06-30'));
    const avec = (debut: string) => lignesDe(cycle(p.cycles, debut), 'epicerie').length;
    expect([avec('2027-04-01'), avec('2027-04-15'), avec('2027-04-29')]).toEqual([1, 0, 0]);
    expect([avec('2027-05-13'), avec('2027-05-27'), avec('2027-06-10'), avec('2027-06-24')]).toEqual([1, 1, 1, 1]);
  });

  it('B2 : Allocation mensuelle le 20 → aux deux semaines à partir du 5 mars ; 20 février gardé, rien le 20 mars', () => {
    const elements = avecRegle('allocation', (e) => ({
      ...e,
      regle: { ...e.regle, changements: [{ aPartirDu: d('2027-03-05'), frequence: { type: 'semaines', n: 2, depart: d('2027-03-05') } }] },
    }));
    const p = plan({ elements }, d('2027-02-01'), d('2027-04-14'));
    const echeances = p.cycles.flatMap((c) => lignesDe(c, 'allocation').map((l) => l.echeance));
    expect(echeances).toEqual(['2027-02-20', '2027-03-05', '2027-03-19', '2027-04-02']);
  });

  it('B3 : tous les cycles d’avant le changement sont identiques, ajustements compris', () => {
    const ajustements = [aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })];
    const avant = plan({ ajustements }, d('2027-01-01'), d('2027-04-30'));
    const apres = plan({ ajustements, elements: epicerieChaquePaieDesMai }, d('2027-01-01'), d('2027-04-30'));
    expect(apres.cycles).toEqual(avant.cycles);
  });

  it('B : un ajustement d’avant le changement reste valide ; un ajustement devenu impossible est orphelin (mois à trois paies)', () => {
    const ajustements = [
      aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 }),
      aj({ elementId: 'essence', origine: '2027-04-29', retire: true }),
    ];
    // Essence : « chaque paie » → « 2e paie du mois » à partir du 15 avril ; le 29 avril est la 3e paie.
    const elements = epicerieChaquePaieDesMai.map((e) =>
      e.id === 'essence' ? { ...e, regle: { ...e.regle, changements: [{ aPartirDu: d('2027-04-15'), frequence: { type: 'rangPaie' as const, rang: 2 as const } }] } } : e,
    );
    expect(ajustementsOrphelins({ profil: PROFIL_ETAPE4, elements, ajustements })).toEqual([ajustements[1]]);
    const { cycles } = plan({ elements, ajustements });
    expect(lignesDe(cycle(cycles, '2027-04-15'), 'essence')).toHaveLength(1);
    expect(lignesDe(cycle(cycles, '2027-04-29'), 'essence')).toHaveLength(0);
  });

  it('B : pas de doublon le jour du changement (loyer mensuel le 1er → le 1er aussi, nouveau départ le 1er mai)', () => {
    const elements = avecRegle('loyer', (e) => ({
      ...e,
      regle: { ...e.regle, changements: [{ aPartirDu: d('2027-05-01'), frequence: { type: 'mois', n: 1, depart: d('2027-05-01') } }] },
    }));
    const p = plan({ elements }, d('2027-04-01'), d('2027-06-30'));
    expect(p.cycles.flatMap((c) => lignesDe(c, 'loyer').map((l) => l.echeance))).toEqual(['2027-04-01', '2027-05-01', '2027-06-01', '2027-07-01']);
  });
});
