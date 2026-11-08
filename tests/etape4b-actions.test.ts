// Étape 4b — actions : C (saisie directe, aperçu ciblé, Annuler),
// A (ajuster une occurrence), B (fréquence datée), orphelins.
// Scénario fictif de l'étape 4 ; « aujourd'hui » : 10 février 2027.

import { describe, expect, it } from 'vitest';
import {
  decrireQuand,
  proposerAjout,
  proposerFrequence,
  proposerMontant,
  proposerSuppression,
  proposerSuspension,
  type SaisieElement,
} from '../src/actions/elements';
import { versElementStocke } from '../src/actions/elementsStockes';
import { lireOccurrence, proposerAjustement, proposerRetourRegle, proposerRetrait } from '../src/actions/occurrences';
import { ErreurSaisie, proposerException, proposerSalaire, proposerSeuil, versNoyau, type Proposition } from '../src/actions/paie';
import { ELEMENTS_ETAPE4 } from '../src/exemple/scenarioEtape4';
import { appliquerChangements, inverser } from '../src/lib/appliquer';
import type { AjustementStocke, DonneesPaie } from '../src/lib/plateforme';
import { planifier } from '../src/noyau/cycles';
import { dateCivile as d } from '../src/noyau/dates';

const JOUR = d('2027-02-10');

function donnees(ajustements: AjustementStocke[] = []): DonneesPaie {
  return {
    profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
    salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
    exceptions: [],
    seuil: null,
    elements: ELEMENTS_ETAPE4.map(versElementStocke),
    ajustements,
    confirmations: [],
  };
}
const aj = (a: Partial<AjustementStocke> & { elementId: string; origine: string }): AjustementStocke => ({
  montant: null,
  date: null,
  paieOrigine: null,
  retire: false,
  ...a,
});
const saisie = (s: Partial<SaisieElement>): SaisieElement => ({
  nature: 'depense',
  libelle: 'Abonnement',
  genre: 'fixe',
  montant: '20',
  estimation: false,
  incertain: false,
  quand: 'mois',
  date: '2027-02-12',
  cyclePaie: '',
  ...s,
});
const appliquer = (dd: DonneesPaie, p: Proposition) => appliquerChangements(dd, p.changements);
const lignesAvril = (dd: DonneesPaie, id: string) => {
  const n = versNoyau(dd);
  return planifier({ profil: n.profil!, elements: n.elements, ajustements: n.ajustements }, d('2027-04-01'), d('2027-05-20')).cycles.flatMap((c) =>
    c.lignes.filter((l) => l.elementId === id).map((l) => ({ cycle: c.debut, ...l })),
  );
};

describe('C — l’aperçu seulement quand il protège', () => {
  it('ajout ordinaire (dès cette semaine) : enregistrement direct', () => {
    expect(proposerAjout(donnees(), saisie({}), JOUR).apercu).toBe(false);
  });
  it('ajout qui touche des cycles passés : aperçu, avec un avertissement en tête', () => {
    const p = proposerAjout(donnees(), saisie({ date: '2027-01-10' }), JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences[0]).toBe('Attention : des cycles déjà passés changeraient.');
  });
  it('montant futur : direct ; suppression et changement de fréquence : toujours un aperçu', () => {
    expect(proposerMontant(donnees(), 'epicerie', '2027-03-01', '350', JOUR).apercu).toBe(false);
    expect(proposerSuppression(donnees(), 'cadeau', JOUR).apercu).toBe(true);
    expect(proposerFrequence(donnees(), 'epicerie', 'chaquePaie', '2027-05-01', JOUR).apercu).toBe(true);
  });
  it('seuil : direct ; salaire futur : direct ; salaire dans le passé : aperçu', () => {
    expect(proposerSeuil(donnees(), '500').apercu).toBe(false);
    expect(proposerSalaire(donnees(), '2027-03-01', '2200', JOUR).apercu).toBe(false);
    expect(proposerSalaire(donnees(), '2027-01-21', '2200', JOUR).apercu).toBe(true);
  });
  it('C2 : une paie déplacée : toujours un aperçu (A11, 0.4.3) ; un montant de paie seul : direct', () => {
    const plan = (dd: DonneesPaie) => {
      const n = versNoyau(dd);
      return planifier({ profil: n.profil!, elements: n.elements }, d('2027-02-01'), d('2027-03-31'));
    };
    const paie18 = plan(donnees()).cycles[1]!.paie;
    const avecEffet = proposerException(donnees(), paie18, { dateReelle: '2027-02-21', montant: '' }, undefined, JOUR);
    expect(avecEffet.apercu).toBe(true);
    const paie4mars = plan(donnees()).cycles[2]!.paie;
    const sansEffet = proposerException(donnees(), paie4mars, { dateReelle: '2027-03-05', montant: '' }, undefined, JOUR);
    expect(sansEffet.apercu).toBe(true);
    const montantSeul = proposerException(donnees(), paie4mars, { dateReelle: '2027-03-04', montant: '2200' }, undefined, JOUR);
    expect(montantSeul.apercu).toBe(false);
  });
});

describe('C1 — « Annuler » rétablit l’état exact', () => {
  const cas: [string, (dd: DonneesPaie) => Proposition][] = [
    ['ajout', (dd) => proposerAjout(dd, saisie({}), JOUR)],
    ['montant', (dd) => proposerMontant(dd, 'epicerie', '2027-03-01', '350', JOUR)],
    ['suspension', (dd) => proposerSuspension(dd, 'loyer', '2027-06-01', '2027-06-30', JOUR)],
    ['fréquence', (dd) => proposerFrequence(dd, 'epicerie', 'chaquePaie', '2027-05-01', JOUR)],
    ['ajustement', (dd) => proposerAjustement(dd, { elementId: 'loyer', origine: '2027-05-01' }, { montant: '1250', date: '', paie: '' }, JOUR)],
    ['retour à la règle', (dd) => proposerRetourRegle(dd, { elementId: 'epicerie', origine: '2027-04-01' }, JOUR)],
    ['seuil', (dd) => proposerSeuil(dd, '500')],
    ['salaire', (dd) => proposerSalaire(dd, '2027-03-01', '2200', JOUR)],
  ];
  for (const [nom, f] of cas) {
    it(nom, () => {
      const depart = appliquerChangements(donnees([aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })]), []);
      const p = f(depart);
      const apres = appliquer(depart, p);
      expect(apres).not.toEqual(depart);
      expect(appliquerChangements(apres, inverser(depart, p.changements))).toEqual(depart);
    });
  }
});

describe('C1 — après une suppression (toujours avec aperçu, donc sans « Annuler » à l’écran)', () => {
  it('l’inverse restaure l’élément et ses ajustements ; seule sa place dans la liste change', () => {
    const depart = appliquerChangements(donnees([aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })]), []);
    const p = proposerSuppression(depart, 'epicerie', JOUR);
    const retabli = appliquerChangements(appliquer(depart, p), inverser(depart, p.changements));
    const trier = (dd: DonneesPaie) => ({ ...dd, elements: [...dd.elements].sort((a, b) => (a.id < b.id ? -1 : 1)) });
    expect(trier(retabli)).toEqual(trier(depart));
  });
});

describe('A — ajuster une occurrence depuis le détail d’un cycle', () => {
  it('A1 : montant pour cette fois ; direct ; la règle ne bouge pas', () => {
    const p = proposerAjustement(donnees(), { elementId: 'epicerie', origine: '2027-04-01' }, { montant: '350', date: '', paie: '' }, JOUR);
    expect(p.apercu).toBe(false);
    expect(p.changements).toEqual([{ type: 'definirAjustement', ajustement: aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 }) }]);
    expect(p.journal[0]).toMatchObject({ objet: 'Dépense « Épicerie »', champ: 'occurrence du 2027-04-01', ancienneValeur: 'selon la règle' });
    const apres = appliquer(donnees(), p);
    expect(apres.elements).toEqual(donnees().elements);
    expect(lignesAvril(apres, 'epicerie').map((l) => [l.cycle, l.montant])).toEqual([
      ['2027-04-01', 35_000],
      ['2027-05-13', 30_000],
    ]);
  });

  it('A2 : payer le loyer du 1er mai avec la paie du 15 avril ; la paie identique à celle par défaut n’est pas enregistrée', () => {
    const cible = { elementId: 'loyer', origine: '2027-05-01' };
    expect(lireOccurrence(donnees(), cible).paie).toBe('2027-04-29');
    expect(() => proposerAjustement(donnees(), cible, { montant: '', date: '', paie: '2027-04-29' }, JOUR)).toThrow('Rien ne change');
    const p = proposerAjustement(donnees(), cible, { montant: '', date: '', paie: '2027-04-15' }, JOUR);
    expect(p.changements[0]).toEqual({ type: 'definirAjustement', ajustement: aj({ ...cible, paieOrigine: '2027-04-15' }) });
    expect(lignesAvril(appliquer(donnees(), p), 'loyer').map((l) => [l.cycle, l.echeance])).toEqual([
      ['2027-04-01', '2027-04-01'],
      ['2027-04-15', '2027-05-01'],
    ]);
  });

  it('A3 : changer la date ; un montant égal à la règle n’est pas un ajustement', () => {
    const p = proposerAjustement(donnees(), { elementId: 'hydro', origine: '2027-04-10' }, { montant: '95', date: '2027-04-16', paie: '2027-04-01' }, JOUR);
    // La paie affichée (1er avril) n'a pas été changée volontairement : seule la date compte.
    expect(p.changements[0]).toEqual({ type: 'definirAjustement', ajustement: aj({ elementId: 'hydro', origine: '2027-04-10', date: '2027-04-16', paieOrigine: '2027-04-01' }) });
  });

  it('A4 : retirer cette fois, puis remettre : on revient exactement à la règle', () => {
    const cible = { elementId: 'essence', origine: '2027-04-29' };
    const retirer = proposerRetrait(donnees(), cible, true, JOUR);
    expect(retirer.apercu).toBe(false);
    const apres = appliquer(donnees(), retirer);
    expect(apres.ajustements).toEqual([aj({ ...cible, retire: true })]);
    const remettre = proposerRetrait(apres, cible, false, JOUR);
    expect(remettre.changements).toEqual([{ type: 'retirerAjustement', ...cible }]);
    expect(appliquer(apres, remettre)).toEqual(appliquerChangements(donnees(), []));
  });

  it('revenir à la règle efface l’ajustement ; sans ajustement, rien à faire', () => {
    const avec = donnees([aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })]);
    expect(proposerRetourRegle(avec, { elementId: 'epicerie', origine: '2027-04-01' }, JOUR).changements).toEqual([
      { type: 'retirerAjustement', elementId: 'epicerie', origine: '2027-04-01' },
    ]);
    expect(() => proposerRetourRegle(donnees(), { elementId: 'epicerie', origine: '2027-04-01' }, JOUR)).toThrow(ErreurSaisie);
  });

  it('A9 : un revenu incertain ajusté reste non compté', () => {
    const p = proposerAjustement(donnees(), { elementId: 'impot', origine: '2027-03-10' }, { montant: '900', date: '', paie: '' }, JOUR);
    const apres = appliquer(donnees(), p);
    const n = versNoyau(apres);
    const c = planifier({ profil: n.profil!, elements: n.elements, ajustements: n.ajustements }, d('2027-03-01'), d('2027-03-17')).cycles[0]!;
    expect(c.nonComptes).toBe(90_000);
    expect(c.disponible).toBe(155_500);
  });

  it('A7 : changer le montant de la règle garde les ajustements, et l’aperçu le dit', () => {
    const avec = donnees([aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })]);
    const p = proposerMontant(avec, 'epicerie', '2027-04-01', '320', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain('1 occurrence(s) ajustée(s) à la main gardent leur montant.');
    expect(appliquer(avec, p).ajustements).toEqual(avec.ajustements);
  });

  it('A8 : une suspension qui rend un ajustement orphelin le nomme, le retire et le consigne', () => {
    const avec = donnees([aj({ elementId: 'hydro', origine: '2027-04-10', date: '2027-04-16' })]);
    const p = proposerSuspension(avec, 'hydro', '2027-04-01', '2027-04-30', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain('À vérifier : l’ajustement de « Hydro » du 10 avr. ne correspondrait plus à aucune occurrence ; il sera retiré.');
    expect(p.changements.at(-1)).toEqual({ type: 'retirerAjustement', elementId: 'hydro', origine: '2027-04-10' });
    expect(p.journal.at(-1)).toMatchObject({ champ: 'ajustement du 2027-04-10', nouvelleValeur: 'retiré (occurrence disparue)' });
  });

  it('A8 : supprimer une règle annonce ses ajustements supprimés avec elle', () => {
    const avec = donnees([aj({ elementId: 'epicerie', origine: '2027-04-01', montant: 35_000 })]);
    expect(proposerSuppression(avec, 'epicerie', JOUR).consequences).toContain('Ses 1 ajustement(s) d’occurrence sont supprimés avec lui.');
  });
});

describe('B — changer la fréquence à partir d’une date', () => {
  it('B1 : épicerie « 1re paie » → « chaque paie » au 1er mai ; avril intact', () => {
    const p = proposerFrequence(donnees(), 'epicerie', 'chaquePaie', '2027-05-01', JOUR);
    const c = p.changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.id).toBe('epicerie');
    expect(c.element.frequence).toEqual({ type: 'rangPaie', rang: 1 });
    expect(c.element.changementsFrequence).toEqual([{ aPartirDu: '2027-05-01', frequence: { type: 'chaquePaie' } }]);
    expect(p.lignes).toEqual([{ libelle: 'Fréquence à partir du samedi 1er mai 2027', avant: '1re paie du mois', apres: 'À chaque paie' }]);
    expect(p.consequences[0]).toBe('Les occurrences d’avant le samedi 1er mai 2027 ne changent pas.');
    expect(lignesAvril(appliquer(donnees(), p), 'epicerie').map((l) => l.cycle)).toEqual(['2027-04-01', '2027-05-13']);
  });

  it('B : un ajustement devenu impossible (3e paie) est nommé et retiré ; celui d’avant le changement reste', () => {
    const avec = donnees([
      aj({ elementId: 'essence', origine: '2027-04-29', retire: true }),
      aj({ elementId: 'essence', origine: '2027-04-01', montant: 7_000 }),
    ]);
    const p = proposerFrequence(avec, 'essence', 'paie2', '2027-04-15', JOUR);
    expect(p.changements.filter((c) => c.type === 'retirerAjustement')).toEqual([
      { type: 'retirerAjustement', elementId: 'essence', origine: '2027-04-29' },
    ]);
    expect(appliquer(avec, p).ajustements).toEqual([aj({ elementId: 'essence', origine: '2027-04-01', montant: 7_000 })]);
  });

  it('B : refus clairs (ponctuelle, même fréquence, date avant le début, revenu au rang de paie)', () => {
    expect(() => proposerFrequence(donnees(), 'cadeau', 'mois', '2027-05-01', JOUR)).toThrow('ponctuelle');
    expect(() => proposerFrequence(donnees(), 'essence', 'chaquePaie', '2027-05-01', JOUR)).toThrow('déjà la fréquence');
    expect(() => proposerFrequence(donnees(), 'loyer', 'deuxMois', '2026-12-01', JOUR)).toThrow('après le début');
    expect(() => proposerFrequence(donnees(), 'allocation', 'paie1', '2027-05-01', JOUR)).toThrow(ErreurSaisie);
  });

  it('la description montre la fréquence en vigueur et le changement à venir', () => {
    const apres = appliquer(donnees(), proposerFrequence(donnees(), 'epicerie', 'chaquePaie', '2027-05-01', JOUR));
    const e = apres.elements.find((x) => x.id === 'epicerie')!;
    expect(decrireQuand(e, '2027-02-10')).toBe('1re paie du mois ; à partir du 1er mai : à chaque paie');
    expect(decrireQuand(e, '2027-06-10')).toBe('À chaque paie (depuis le 1er mai)');
  });
});
