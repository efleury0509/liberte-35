// Étape 5 : actions de confirmation (cas C, A, P validés le 8 novembre 2026).
// Scénario M1 à M4 ; aujourd'hui = mercredi 10 mars 2027.

import { describe, expect, it } from 'vitest';
import {
  proposerAnnulationConfirmation,
  proposerConfirmation,
  proposerCorrection,
  proposerToutConfirmer,
} from '../src/actions/confirmations';
import { proposerFin, proposerFrequence, proposerMontant, proposerSuppression, proposerSuspension } from '../src/actions/elements';
import { versElementStocke } from '../src/actions/elementsStockes';
import { proposerAjustement, proposerRetrait } from '../src/actions/occurrences';
import { ErreurSaisie, proposerException, proposerProfil, versNoyau } from '../src/actions/paie';
import { aVerifierAvant, cyclesAffiches } from '../src/actions/analyse';
import { appliquerChangements, donneesVides, inverser } from '../src/lib/appliquer';
import type { DonneesPaie } from '../src/lib/plateforme';
import { dateCivile as d } from '../src/noyau/dates';
import { ELEMENTS_ETAPE4 } from '../src/exemple/scenarioEtape4';

const ESP = ' ';
const JOUR = d('2027-03-10');

function donnees(): DonneesPaie {
  return {
    ...donneesVides(),
    profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
    salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
    elements: ELEMENTS_ETAPE4.map(versElementStocke),
  };
}
const apres = (d0: DonneesPaie, p: { changements: Parameters<typeof appliquerChangements>[1] }) => appliquerChangements(d0, p.changements);
function cycles(d0: DonneesPaie) {
  const n = versNoyau(d0);
  return cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, seuil: n.seuil }, JOUR, 26).plan.cycles;
}
const cycle = (d0: DonneesPaie, debut: string) => cycles(d0).find((c) => c.debut === debut)!;
const LOYER = { elementId: 'loyer', origine: '2027-03-01' };
const HYDRO = { elementId: 'hydro', origine: '2027-02-10' };

describe('Confirmer (C)', () => {
  it('C1 : un clic confirme au montant prévu, à la date du jour (Q20) ; direct ; journal', () => {
    const p = proposerConfirmation(donnees(), LOYER, null, JOUR);
    expect(p.apercu).toBe(false);
    expect(p.titre).toBe('Confirmer « Loyer » (1er mars)');
    expect(p.changements).toEqual([{ type: 'definirConfirmation', confirmation: { elementId: 'loyer', origine: '2027-03-01', date: '2027-03-10', montant: 120_000 } }]);
    expect(p.journal).toEqual([expect.objectContaining({ objet: 'Dépense « Loyer »', champ: 'confirmation du 2027-03-01', ancienneValeur: null, nouvelleValeur: `1${ESP}200,00${ESP}$ le 2027-03-10` })]);
    const m2 = cycle(apres(donnees(), p), '2027-02-18');
    expect(m2.lignes.find((l) => l.elementId === 'loyer')?.statut).toBe('confirme');
    expect(m2.disponible).toBe(116_000);
  });

  it('Q20 : même pour une échéance future, la date proposée est celle du jour', () => {
    const p = proposerConfirmation(donnees(), { elementId: 'assurances', origine: '2027-03-15' }, null, JOUR);
    expect(p.changements[0]).toMatchObject({ confirmation: { date: '2027-03-10' } });
  });

  it('C2 : Hydro confirmée à 102,40 $ : la différence est dite, M1 suit et perd « Estimation »', () => {
    const p = proposerConfirmation(donnees(), HYDRO, { montant: '102,40', date: '2027-02-11' }, JOUR);
    expect(p.consequences).toContain(`Différence avec le prévu : +7,40${ESP}$. Rien n’est réparti : le disponible du cycle en tient compte.`);
    expect(p.consequences).toContain(`Cycle du 4 févr. : disponible planifié 1${ESP}465,00${ESP}$ → 1${ESP}457,60${ESP}$`);
    const m1 = cycle(apres(donnees(), p), '2027-02-04');
    expect(m1.disponible).toBe(145_760);
    expect(m1.estimation).toBe(false);
  });

  it('C3 : paie reçue 2 050 $ : confirmation de la paie, rien de réparti (Q21)', () => {
    const p = proposerConfirmation(donnees(), { elementId: null, origine: '2027-03-04' }, { montant: '2050', date: '2027-03-04' }, JOUR);
    expect(p.titre).toBe('Confirmer la paie du 4 mars');
    expect(p.journal[0]).toMatchObject({ objet: 'Paie du 2027-03-04', champ: 'confirmation' });
    expect(p.consequences[0]).toBe(`Différence avec le prévu : −50,00${ESP}$. Rien n’est réparti : le disponible du cycle en tient compte.`);
    expect(cycle(apres(donnees(), p), '2027-03-04').disponible).toBe(150_500);
  });

  it('C4 : revenu incertain confirmé reçu : il compte', () => {
    const p = proposerConfirmation(donnees(), { elementId: 'impot', origine: '2027-03-10' }, { montant: '812,35', date: '2027-03-12' }, JOUR);
    expect(cycle(apres(donnees(), p), '2027-03-04').disponible).toBe(236_735);
  });

  it('S5 : une enveloppe ne se confirme pas ; une occurrence retirée non plus', () => {
    expect(() => proposerConfirmation(donnees(), { elementId: 'epicerie', origine: '2027-03-04' }, null, JOUR)).toThrow('enveloppe');
    const retiree = apres(donnees(), proposerRetrait(donnees(), { elementId: 'cadeau', origine: '2027-02-27' }, true, JOUR));
    expect(() => proposerConfirmation(retiree, { elementId: 'cadeau', origine: '2027-02-27' }, null, JOUR)).toThrow(ErreurSaisie);
  });

  it('montant ou date invalides : refus clairs', () => {
    expect(() => proposerConfirmation(donnees(), LOYER, { montant: '-5', date: '2027-03-01' }, JOUR)).toThrow('négatif');
    expect(() => proposerConfirmation(donnees(), LOYER, { montant: '', date: '2027-03-01' }, JOUR)).toThrow(ErreurSaisie);
    expect(() => proposerConfirmation(donnees(), LOYER, { montant: '1200', date: '' }, JOUR)).toThrow(ErreurSaisie);
  });

  it('C6 : « Tout confirmer » sur M2 : un aperçu qui dit ce qui est inclus et exclu, puis une seule action', () => {
    const p = proposerToutConfirmer(donnees(), '2027-02-18', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.titre).toBe('Tout confirmer — cycle du 18 févr.');
    expect(p.lignes.map((l) => l.libelle)).toEqual(['Paie du 18 févr.', 'Allocation', 'Cellulaire', 'Contrat à la pige', 'Cadeau d’anniversaire', 'Loyer']);
    expect(p.consequences).toContain('Exclu : Essence (enveloppe, jamais réconciliée).');
    expect(p.changements).toHaveLength(6);
    const m2 = cycle(apres(donnees(), p), '2027-02-18');
    expect(m2.aVerifier).toBe(0);
    expect(m2.disponible).toBe(116_000);
  });

  it('C6 : les revenus incertains sont exclus et nommés', () => {
    const p = proposerToutConfirmer(donnees(), '2027-03-04', JOUR);
    expect(p.consequences).toContain('Exclu : Remboursement d’impôt (revenu incertain : à confirmer individuellement).');
    expect(p.lignes.map((l) => l.libelle)).not.toContain('Remboursement d’impôt');
  });

  it('C6 : rien à confirmer : message clair', () => {
    const tout = apres(donnees(), proposerToutConfirmer(donnees(), '2027-02-18', JOUR));
    expect(() => proposerToutConfirmer(tout, '2027-02-18', JOUR)).toThrow('Rien à confirmer');
  });
});

describe('Corriger et annuler (A)', () => {
  const confirmee = () => apres(donnees(), proposerConfirmation(donnees(), HYDRO, { montant: '102,40', date: '2027-02-11' }, JOUR));

  it('A1 : corriger : ancienne et nouvelle valeur au journal ; M1 suit', () => {
    const p = proposerCorrection(confirmee(), HYDRO, { montant: '104,10', date: '2027-02-11' }, JOUR);
    expect(p.apercu).toBe(false);
    expect(p.journal[0]).toMatchObject({ champ: 'correction de la confirmation du 2027-02-10', ancienneValeur: `102,40${ESP}$ le 2027-02-11`, nouvelleValeur: `104,10${ESP}$ le 2027-02-11` });
    expect(cycle(apres(confirmee(), p), '2027-02-04').disponible).toBe(145_590);
    expect(() => proposerCorrection(confirmee(), HYDRO, { montant: '102,40', date: '2027-02-11' }, JOUR)).toThrow('Rien ne change');
  });

  it('A2 : annuler la confirmation : retour exact (1 465 $, « Estimation », à vérifier), trace au journal', () => {
    const p = proposerAnnulationConfirmation(confirmee(), HYDRO, JOUR);
    expect(p.changements).toEqual([{ type: 'retirerConfirmation', elementId: 'hydro', origine: '2027-02-10' }]);
    expect(p.journal[0]).toMatchObject({ champ: 'annulation de la confirmation du 2027-02-10', nouvelleValeur: null });
    const retour = apres(confirmee(), p);
    expect(retour).toEqual(donnees());
    const m1 = cycle(retour, '2027-02-04');
    expect([m1.disponible, m1.estimation, m1.lignes.find((l) => l.elementId === 'hydro')?.statut]).toEqual([146_500, true, 'aVerifier']);
  });

  it('« Annuler » juste après une confirmation rétablit l’état exact', () => {
    const p = proposerConfirmation(donnees(), LOYER, null, JOUR);
    const inverse = inverser(donnees(), p.changements);
    expect(appliquerChangements(apres(donnees(), p), inverse)).toEqual(donnees());
  });

  it('A3 : « N’a pas eu lieu » = retirer cette fois ; M2 à 1 235 $', () => {
    const p = proposerRetrait(donnees(), { elementId: 'cadeau', origine: '2027-02-27' }, true, JOUR);
    expect(cycle(apres(donnees(), p), '2027-02-18').disponible).toBe(123_500);
  });

  it('A4 : une occurrence confirmée ne s’ajuste plus et ne se retire plus', () => {
    const c = apres(donnees(), proposerConfirmation(donnees(), LOYER, null, JOUR));
    expect(() => proposerAjustement(c, LOYER, { montant: '1300', date: '', paie: '' }, JOUR)).toThrow('confirmée');
    expect(() => proposerRetrait(c, LOYER, true, JOUR)).toThrow('confirmée');
  });

  it('corriger ou annuler sans confirmation : refus clair', () => {
    expect(() => proposerCorrection(donnees(), LOYER, { montant: '1', date: '2027-03-01' }, JOUR)).toThrow(ErreurSaisie);
    expect(() => proposerAnnulationConfirmation(donnees(), LOYER, JOUR)).toThrow(ErreurSaisie);
  });
});

describe('Protection des faits confirmés (P)', () => {
  const avecLoyer = () => apres(donnees(), proposerConfirmation(donnees(), LOYER, null, JOUR));

  it('P1 : loyer à 1 250 $ à partir du 1er mars : la confirmation garde 1 200 $ ; l’aperçu le dit', () => {
    const p = proposerMontant(avecLoyer(), 'loyer', '2027-03-01', '1250', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain('1 opération confirmée garde son montant confirmé.');
    const m2 = cycle(apres(avecLoyer(), p), '2027-02-18');
    expect(m2.lignes.find((l) => l.elementId === 'loyer')).toMatchObject({ montant: 120_000, montantPrevu: 125_000 });
  });

  it('P2 : une suspension, une fin ou un changement de fréquence qui ferait disparaître le loyer confirmé : refusés, avec explication', () => {
    const message = 'Cette modification ferait disparaître une opération confirmée : « Loyer » du 1er mars. Choisis une date qui la garde, ou annule d’abord la confirmation.';
    expect(() => proposerSuspension(avecLoyer(), 'loyer', '2027-03-01', '2027-03-31', JOUR)).toThrow(message);
    expect(() => proposerFin(avecLoyer(), 'loyer', '2027-02-28', JOUR)).toThrow(message);
    expect(() => proposerFrequence(avecLoyer(), 'loyer', 'chaquePaie', '2027-02-15', JOUR)).toThrow(message);
  });

  it('P2 : les modifications qui gardent la confirmation restent permises', () => {
    expect(() => proposerSuspension(avecLoyer(), 'loyer', '2027-04-01', '2027-04-30', JOUR)).not.toThrow();
    expect(() => proposerFin(avecLoyer(), 'loyer', '2027-03-01', JOUR)).not.toThrow();
    expect(() => proposerFrequence(avecLoyer(), 'loyer', 'chaquePaie', '2027-03-02', JOUR)).not.toThrow();
  });

  it('P3 : supprimer un élément confirmé est refusé ; « Terminer » est proposé', () => {
    expect(() => proposerSuppression(avecLoyer(), 'loyer', JOUR)).toThrow('termine-le plutôt');
  });

  it('P4 : déplacer la paie avec des éléments confirmés : aperçu, confirmation gardée et signalée', () => {
    const d0 = avecLoyer();
    const paie = cycles(d0).find((c) => c.paie.dateOrigine === '2027-02-18')!.paie;
    const p = proposerException(d0, paie, { dateReelle: '2027-03-02', montant: '' }, undefined, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain('À vérifier : Loyer (1er mars, confirmé) passerait de la paie du 18 févr. à celle du 4 févr.');
    expect(apres(d0, p).confirmations).toEqual(d0.confirmations);
  });

  it('un changement de calendrier qui ferait disparaître une paie confirmée est refusé', () => {
    const d0 = apres(donnees(), proposerConfirmation(donnees(), { elementId: null, origine: '2027-03-04' }, null, JOUR));
    expect(() => proposerProfil(d0, { frequence: 'mensuelle', depart: '2027-01-07', montant: '' })).toThrow('opération confirmée');
  });
});

describe('Cycles précédents (étape 5)', () => {
  const vue = (precedents: number) => {
    const n = versNoyau(donnees());
    const entree = { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, seuil: n.seuil };
    const v = cyclesAffiches(n.profil!, entree, JOUR, 13, precedents);
    // H1 : le rappel est calculé à part, sur tout l'historique.
    return { ...v, aVerifierAvant: aVerifierAvant(n.profil!, entree, JOUR, v.cycles[0]!.debut) };
  };

  it('par défaut, l’écran commence au cycle actuel et compte ce qui reste à vérifier avant', () => {
    const v = vue(0);
    expect(v.cycles[0]!.debut).toBe('2027-03-04');
    expect(v.cycles).toHaveLength(13);
    expect(v.aVerifierAvant).toBe(v.plan.cycles.filter((c) => c.debut < '2027-03-04').reduce((n, c) => n + c.aVerifier, 0));
    expect(v.aVerifierAvant).toBeGreaterThan(0);
  });

  it('« Voir les paies précédentes » ajoute deux cycles avant, sans rien retirer après', () => {
    const v = vue(2);
    expect(v.cycles.map((c) => c.debut).slice(0, 3)).toEqual(['2027-02-04', '2027-02-18', '2027-03-04']);
    expect(v.cycles).toHaveLength(15);
    expect(v.aVerifierAvant).toBe(vue(0).aVerifierAvant - 4 - 6);
  });
});
