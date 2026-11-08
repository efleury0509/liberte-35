// Cas témoins de l'étape 3 (validés le 8 novembre 2026, onglet « Étape 3 — Cas témoins »).

import { describe, expect, it } from 'vitest';
import { ELEMENTS_FICTIFS, PERIODE_FICTIVE, PROFIL_FICTIF } from '../../src/exemple/scenarioFictif';
import { comparerRattachements, planifier, type ElementPlanifie, type Plan } from '../../src/noyau/cycles';
import { dateCivile as d, type DateCivile } from '../../src/noyau/dates';
import { paiesEntre, type ExceptionPaie, type ProfilPaie } from '../../src/noyau/paie';

const base = (options: Partial<Parameters<typeof planifier>[0]> = {}, debut = PERIODE_FICTIVE.debut, fin = PERIODE_FICTIVE.fin) =>
  planifier({ profil: PROFIL_FICTIF, elements: ELEMENTS_FICTIFS, ...options }, debut, fin);

const resume = (plan: Plan) =>
  plan.cycles.map((c) => ({
    debut: c.debut,
    fin: c.fin,
    paie: c.paie.montant,
    lignes: c.lignes.map((l) => (l.echeance ? `${l.elementId}@${l.echeance}` : l.elementId)).sort(),
    sorties: c.sorties,
    disponible: c.disponible,
  }));

const cycleDu = (plan: Plan, debut: string) => plan.cycles.find((c) => c.debut === debut);

describe('Cycles et rattachement — C1 à C9', () => {
  const plan = base();

  it('produit exactement neuf cycles', () => {
    expect(plan.cycles).toHaveLength(9);
  });

  it.each([
    ['C1', '2027-01-07', '2027-01-20', ['assurances@2027-01-15', 'epicerie', 'essence'], 50_000, 160_000],
    ['C2', '2027-01-21', '2027-02-03', ['essence', 'loyer@2027-02-01', 'supplement'], 136_000, 74_000],
    ['C3', '2027-02-04', '2027-02-17', ['assurances@2027-02-15', 'epicerie', 'essence'], 50_000, 160_000],
    ['C4', '2027-02-18', '2027-03-03', ['essence', 'loyer@2027-03-01', 'supplement'], 136_000, 74_000],
    ['C5', '2027-03-04', '2027-03-17', ['assurances@2027-03-15', 'epicerie', 'essence'], 50_000, 160_000],
    ['C6', '2027-03-18', '2027-03-31', ['essence', 'supplement'], 16_000, 194_000],
    ['C7', '2027-04-01', '2027-04-14', ['epicerie', 'essence', 'loyer@2027-04-01'], 156_000, 54_000],
    ['C8', '2027-04-15', '2027-04-28', ['assurances@2027-04-15', 'essence', 'supplement'], 30_000, 180_000],
    ['C9', '2027-04-29', '2027-05-12', ['essence', 'loyer@2027-05-01'], 126_000, 84_000],
  ])('%s : %s au %s', (_n, debut, fin, lignes, sorties, disponible) => {
    expect(resume(plan).find((c) => c.debut === debut)).toEqual({ debut, fin, paie: 210_000, lignes, sorties, disponible });
  });

  it('tout est « Prévu » : aucune ligne n’est confirmée', () => {
    for (const c of plan.cycles) for (const l of c.lignes) expect(l.statut).toBe('prevu');
  });
});

describe('Cas particuliers — K1 à K6', () => {
  it('K1 : le loyer du 1er janvier, avant la première paie, est listé à part (Q9)', () => {
    const plan = base();
    expect(plan.avantPremierCycle.map((l) => `${l.elementId}@${l.echeance}`)).toEqual(['loyer@2027-01-01']);
    expect(plan.cycles.some((c) => c.lignes.some((l) => l.echeance === '2027-01-01'))).toBe(false);
  });

  it('K2 : aucun report d’un cycle à l’autre', () => {
    const plan = base();
    expect(cycleDu(plan, '2027-03-18')?.disponible).toBe(194_000);
    expect(cycleDu(plan, '2027-04-01')?.disponible).toBe(54_000);
  });

  it('K3 : déplacer à la main le loyer du 1er avril vers la paie du 18 mars', () => {
    const plan = base({
      rattachementsManuels: [{ elementId: 'loyer', echeance: d('2027-04-01'), paieOrigine: d('2027-03-18') }],
    });
    expect(cycleDu(plan, '2027-03-18')?.disponible).toBe(74_000);
    expect(cycleDu(plan, '2027-04-01')?.disponible).toBe(174_000);
    const ligne = cycleDu(plan, '2027-03-18')?.lignes.find((l) => l.elementId === 'loyer');
    expect(ligne?.manuel).toBe(true);
  });

  it('K4 : des cycles passés restent « Prévu » (aujourd’hui fictif : 20 mai 2027)', () => {
    const plan = base({ aujourdhui: d('2027-05-20') });
    expect(plan.cycles.every((c) => c.fin < '2027-05-20')).toBe(true);
    for (const c of plan.cycles) for (const l of c.lignes) expect(l.statut).toBe('prevu');
  });

  it('K5 : un profil sans montant net ne produit jamais de revenu inventé', () => {
    const profil: ProfilPaie = { ...PROFIL_FICTIF, montants: [] };
    const plan = planifier({ profil, elements: ELEMENTS_FICTIFS }, PERIODE_FICTIVE.debut, PERIODE_FICTIVE.fin);
    expect(plan.cycles).toHaveLength(9);
    for (const c of plan.cycles) {
      expect(c.paie.montant).toBeNull();
      expect(c.disponible).toBeNull();
      expect(c.signal).toBeNull();
    }
    expect(plan.cycles[0]?.sorties).toBe(50_000);
  });

  it('K6 : aucun cycle avant la date de départ du profil', () => {
    const plan = base({}, d('2026-06-01'), d('2027-01-06'));
    expect(plan.cycles).toEqual([]);
  });
});

describe('Changement de salaire et exceptions — S1 à S4', () => {
  const avecHausse: ProfilPaie = {
    ...PROFIL_FICTIF,
    montants: [...PROFIL_FICTIF.montants, { aPartirDu: d('2027-06-10'), montant: 218_000 }],
  };
  const montantDu = (profil: ProfilPaie, exceptions: ExceptionPaie[], date: string) =>
    paiesEntre(profil, exceptions, d(date), d(date))[0]?.montant;

  it('S1 : 2 180 $ à partir du 10 juin 2027, date incluse', () => {
    expect(montantDu(avecHausse, [], '2027-05-27')).toBe(210_000);
    expect(montantDu(avecHausse, [], '2027-06-10')).toBe(218_000);
    expect(montantDu(avecHausse, [], '2027-06-24')).toBe(218_000);
  });

  it('S2 : les cycles de janvier à mai ne changent pas', () => {
    const avant = resume(base());
    const apres = resume(planifier({ profil: avecHausse, elements: ELEMENTS_FICTIFS }, PERIODE_FICTIVE.debut, PERIODE_FICTIVE.fin));
    expect(apres).toEqual(avant);
  });

  it('S3 : une exception déjà définie n’est pas écrasée par le changement de salaire', () => {
    const exceptions: ExceptionPaie[] = [{ dateOrigine: d('2027-06-24'), montant: 230_000 }];
    expect(montantDu(avecHausse, exceptions, '2027-06-24')).toBe(230_000);
    expect(montantDu(avecHausse, exceptions, '2027-06-10')).toBe(218_000);
  });

  it('S4 : paie du 1er avril réduite à 1 500 $ : disponible négatif, cycle signalé sans seuil', () => {
    const plan = base({ exceptions: [{ dateOrigine: d('2027-04-01'), montant: 150_000 }] });
    const c7 = cycleDu(plan, '2027-04-01');
    expect(c7?.disponible).toBe(-6_000);
    expect(c7?.signal).toBe('negatif');
  });
});

describe('Paie déplacée — X1 à X12 (A11)', () => {
  const deplace15au16: ExceptionPaie[] = [{ dateOrigine: d('2027-04-15'), dateReelle: d('2027-04-16') }];

  it('X1 : essence et supplément suivent la paie du 15 avril déplacée au 16', () => {
    const plan = base({ exceptions: deplace15au16 });
    const c7 = plan.cycles.find((c) => c.paie.dateOrigine === '2027-04-01');
    const c8 = plan.cycles.find((c) => c.paie.dateOrigine === '2027-04-15');
    expect([c7?.debut, c7?.fin]).toEqual(['2027-04-01', '2027-04-15']);
    expect([c8?.debut, c8?.fin]).toEqual(['2027-04-16', '2027-04-28']);
    expect(c8?.lignes.map((l) => l.elementId).sort()).toEqual(['essence', 'supplement']);
  });

  it('X2 : les assurances du 15 avril passent à la paie du 1er avril, et c’est signalé', () => {
    const changements = comparerRattachements(base(), base({ exceptions: deplace15au16 }));
    expect(changements).toEqual([
      { elementId: 'assurances', libelle: 'Assurances', echeance: '2027-04-15', dePaie: '2027-04-15', versPaie: '2027-04-01' },
    ]);
  });

  it('X3 : disponibles après ce déplacement', () => {
    const plan = base({ exceptions: deplace15au16 });
    expect(plan.cycles.find((c) => c.paie.dateOrigine === '2027-04-01')?.disponible).toBe(40_000);
    expect(plan.cycles.find((c) => c.paie.dateOrigine === '2027-04-15')?.disponible).toBe(194_000);
  });

  it('X4 : la règle de récurrence ne change pas ; la paie suivante reste le jeudi 29 avril', () => {
    const plan = base({ exceptions: deplace15au16 });
    expect(plan.cycles.at(-1)?.paie.date).toBe('2027-04-29');
  });

  it('X5 : la paie du 1er avril déplacée au 31 mars reste la 1re paie d’avril (Q7)', () => {
    const plan = base({ exceptions: [{ dateOrigine: d('2027-04-01'), dateReelle: d('2027-03-31') }] });
    const paie = plan.cycles.find((c) => c.paie.dateOrigine === '2027-04-01');
    expect(paie?.paie.date).toBe('2027-03-31');
    expect(paie?.paie.rang).toBe(1);
    expect(paie?.lignes.some((l) => l.elementId === 'epicerie')).toBe(true);
  });

  it('X6 : déplacer la paie du 15 avril au 30 avril, après la suivante, est refusé (Q11)', () => {
    expect(() => base({ exceptions: [{ dateOrigine: d('2027-04-15'), dateReelle: d('2027-04-30') }] })).toThrow(
      /entre la paie précédente et la suivante/,
    );
  });

  const ABONNEMENT: ElementPlanifie = {
    id: 'abonnement',
    libelle: 'Abonnement',
    regle: { frequence: { type: 'ponctuelle', date: d('2027-03-31') }, montants: [{ aPartirDu: d('2027-01-01'), montant: 2_000 }] },
  };
  const avecAbonnement = (exceptions: ExceptionPaie[] = []) =>
    planifier(
      { profil: PROFIL_FICTIF, elements: [...ELEMENTS_FICTIFS, ABONNEMENT], exceptions },
      PERIODE_FICTIVE.debut,
      PERIODE_FICTIVE.fin,
    );
  const vers31mars: ExceptionPaie[] = [{ dateOrigine: d('2027-04-01'), dateReelle: d('2027-03-31') }];

  it('X7 : avant tout déplacement, l’abonnement du 31 mars est dans C6', () => {
    const plan = avecAbonnement();
    expect(cycleDu(plan, '2027-03-18')?.lignes.some((l) => l.elementId === 'abonnement')).toBe(true);
    expect(cycleDu(plan, '2027-03-18')?.disponible).toBe(192_000);
    expect(cycleDu(plan, '2027-04-01')?.disponible).toBe(54_000);
  });

  it('X8 : déplacée au 31 mars, la paie garde son rang ; l’abonnement suit la date réelle, et c’est signalé', () => {
    const avant = avecAbonnement();
    const apres = avecAbonnement(vers31mars);
    const paie = apres.cycles.find((c) => c.paie.dateOrigine === '2027-04-01');
    expect(paie?.paie.rang).toBe(1);
    expect(paie?.lignes.map((l) => l.elementId).sort()).toEqual(['abonnement', 'epicerie', 'essence', 'loyer']);
    expect(comparerRattachements(avant, apres)).toEqual([
      { elementId: 'abonnement', libelle: 'Abonnement', echeance: '2027-03-31', dePaie: '2027-03-18', versPaie: '2027-04-01' },
    ]);
  });

  it('X9 : cycles voisins cohérents, sans trou ni chevauchement', () => {
    const plan = avecAbonnement(vers31mars);
    const c6 = cycleDu(plan, '2027-03-18');
    const c7 = plan.cycles.find((c) => c.paie.dateOrigine === '2027-04-01');
    expect([c6?.debut, c6?.fin, c6?.disponible]).toEqual(['2027-03-18', '2027-03-30', 194_000]);
    expect([c7?.debut, c7?.fin, c7?.disponible]).toEqual(['2027-03-31', '2027-04-14', 52_000]);
    for (let i = 1; i < plan.cycles.length; i++) {
      const precedent = plan.cycles[i - 1];
      const courant = plan.cycles[i];
      expect((courant?.debut ?? '') > (precedent?.fin ?? '')).toBe(true);
      expect(joursEntre(precedent?.fin, courant?.debut)).toBe(1);
    }
  });

  const annee = (exceptions: ExceptionPaie[]) => paiesEntre(PROFIL_FICTIF, exceptions, d('2027-01-01'), d('2027-12-31'));

  it('X10 : toujours 26 paies en 2027, aucune en double', () => {
    const paies = annee(vers31mars);
    expect(paies).toHaveLength(26);
    expect(new Set(paies.map((p) => p.date)).size).toBe(26);
    expect(new Set(paies.map((p) => p.dateOrigine)).size).toBe(26);
    expect(paies.filter((p) => p.date.startsWith('2027-03')).map((p) => p.date)).toEqual(['2027-03-04', '2027-03-18', '2027-03-31']);
  });

  it('X11 : un nouveau déplacement de la même paie remplace l’ancien', () => {
    const paies = annee([
      { dateOrigine: d('2027-04-01'), dateReelle: d('2027-03-31') },
      { dateOrigine: d('2027-04-01'), dateReelle: d('2027-03-30') },
    ]);
    expect(paies).toHaveLength(26);
    expect(paies.find((p) => p.dateOrigine === '2027-04-01')?.date).toBe('2027-03-30');
  });

  it('X12 : sur la date d’une autre paie : refusé ; à sa date d’origine : sans effet', () => {
    expect(() => annee([{ dateOrigine: d('2027-04-01'), dateReelle: d('2027-03-18') }])).toThrow();
    const retour = annee([{ dateOrigine: d('2027-04-01'), dateReelle: d('2027-04-01') }]);
    expect(retour).toEqual(annee([]));
  });
});

function joursEntre(a: DateCivile | undefined, b: DateCivile | undefined): number {
  if (!a || !b) return Number.NaN;
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}

describe('Seuil d’attention — T1 à T3 (A9)', () => {
  const signales = (seuil: number | null) =>
    base({ seuil })
      .cycles.filter((c) => c.signal !== null)
      .map((c) => c.debut);

  it('T1 : sans seuil, aucun cycle signalé', () => {
    expect(signales(null)).toEqual([]);
  });

  it('T2 : seuil de 750 $', () => {
    expect(signales(75_000)).toEqual(['2027-01-21', '2027-02-18', '2027-04-01']);
  });

  it('T3 : seuil de 740 $ : un disponible égal au seuil n’est pas signalé (Q8)', () => {
    expect(signales(74_000)).toEqual(['2027-04-01']);
  });
});

describe('Fréquences de paie — F1 à F5 (Q6)', () => {
  const deuxFois: ProfilPaie = {
    frequence: { type: 'deuxFoisParMois', depart: d('2027-01-01'), jours: [15, 31] },
    montants: [{ aPartirDu: d('2027-01-01'), montant: 227_500 }],
  };
  const dates = (profil: ProfilPaie, debut: string, fin: string) => paiesEntre(profil, [], d(debut), d(fin)).map((p) => p.date);

  it('F1 : deux fois par mois, le 15 et le dernier jour', () => {
    expect(dates(deuxFois, '2027-02-01', '2027-02-28')).toEqual(['2027-02-15', '2027-02-28']);
    expect(dates(deuxFois, '2028-02-01', '2028-02-29')).toEqual(['2028-02-15', '2028-02-29']);
    expect(dates(deuxFois, '2027-04-01', '2027-04-30')).toEqual(['2027-04-15', '2027-04-30']);
    expect(dates(deuxFois, '2027-01-01', '2027-12-31')).toHaveLength(24);
  });

  it('F2 : le loyer du 1er mars va à la paie du 28 février', () => {
    const plan = planifier({ profil: deuxFois, elements: ELEMENTS_FICTIFS }, d('2027-02-01'), d('2027-03-31'));
    const c = plan.cycles.find((x) => x.lignes.some((l) => l.elementId === 'loyer' && l.echeance === '2027-03-01'));
    expect(c?.paie.date).toBe('2027-02-28');
  });

  const hebdo: ProfilPaie = {
    frequence: { type: 'hebdomadaire', depart: d('2027-01-01') },
    montants: [{ aPartirDu: d('2027-01-01'), montant: 105_000 }],
  };

  it('F3 : chaque semaine, le vendredi, à partir du 1er janvier 2027', () => {
    const toutes = dates(hebdo, '2027-01-01', '2027-12-31');
    expect(toutes).toHaveLength(53);
    expect(toutes.at(-1)).toBe('2027-12-31');
    const parMois = new Map<string, number>();
    for (const p of toutes) parMois.set(p.slice(5, 7), (parMois.get(p.slice(5, 7)) ?? 0) + 1);
    expect([...parMois].filter(([, n]) => n === 5).map(([m]) => m)).toEqual(['01', '04', '07', '10', '12']);
  });

  it('F4 : 1re et 2e paie en janvier 2027 avec la paie hebdomadaire', () => {
    const plan = planifier({ profil: hebdo, elements: ELEMENTS_FICTIFS }, d('2027-01-01'), d('2027-01-29'));
    const avec = (id: string) => plan.cycles.filter((c) => c.lignes.some((l) => l.elementId === id)).map((c) => c.paie.date);
    expect(avec('epicerie')).toEqual(['2027-01-01']);
    expect(avec('supplement')).toEqual(['2027-01-08']);
    expect(avec('essence')).toEqual(['2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29']);
  });

  it('F5 : paie mensuelle le 25 : la règle « 2e paie » est signalée comme jamais appliquée', () => {
    const mensuelle: ProfilPaie = {
      frequence: { type: 'mensuelle', depart: d('2027-01-25') },
      montants: [{ aPartirDu: d('2027-01-25'), montant: 455_000 }],
    };
    const plan = planifier({ profil: mensuelle, elements: ELEMENTS_FICTIFS }, d('2027-01-01'), d('2027-12-31'));
    expect(plan.cycles).toHaveLength(12);
    expect(plan.reglesSansOccurrence).toEqual(['supplement']);
  });
});

describe('Cas limites du moteur', () => {
  it('la toute première paie du profil, avancée d’un jour, reste comptée et garde ses éléments', () => {
    const plan = planifier(
      { profil: PROFIL_FICTIF, elements: ELEMENTS_FICTIFS, exceptions: [{ dateOrigine: d('2027-01-07'), dateReelle: d('2027-01-06') }] },
      d('2027-01-01'),
      d('2027-01-31'),
    );
    expect(plan.cycles.map((c) => c.debut)).toEqual(['2027-01-06', '2027-01-21']);
    expect(plan.cycles[0]?.lignes.map((l) => l.elementId).sort()).toEqual(['assurances', 'epicerie', 'essence']);
    expect(plan.avantPremierCycle.map((l) => l.echeance)).toEqual(['2027-01-01']);
  });

  it('une règle sans montant connu laisse le disponible « à compléter », sans l’inventer', () => {
    const inconnu: ElementPlanifie = {
      id: 'inconnu',
      libelle: 'Montant à compléter',
      regle: { frequence: { type: 'chaquePaie' }, montants: [] },
    };
    const plan = planifier({ profil: PROFIL_FICTIF, elements: [inconnu] }, d('2027-01-01'), d('2027-01-31'));
    expect(plan.cycles[0]?.lignes[0]?.montant).toBeNull();
    expect(plan.cycles[0]?.disponible).toBeNull();
  });
});
