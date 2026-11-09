// Étape 7b-1 : ce qu'on peut affirmer sur un prêt sans calcul d'intérêts.
// V : versements à venir (Q49) ; T : somme des versements prévus (Q50) ;
// M : ce qui manque pour projeter ; J : journal uniformisé (Q51).
// Données fictives. Profil : aux deux semaines dès le jeudi 7 janv. 2027.
import { describe, expect, it } from 'vitest';
import { proposerAjustement } from '../src/actions/occurrences';
import { proposerAnnulationConfirmation, proposerConfirmation, proposerCorrection, proposerToutConfirmer } from '../src/actions/confirmations';
import { type Proposition } from '../src/actions/paie';
import { proposerAjoutPret, proposerRemboursement, proposerRenseignements, proposerVersement, vuePret, type SaisiePret } from '../src/actions/prets';
import { proposerAjout } from '../src/actions/elements';
import { appliquerChangements, donneesVides } from '../src/lib/appliquer';
import type { DonneesPaie } from '../src/lib/plateforme';
import { dateCivile } from '../src/noyau/dates';

const ESP = '\u00a0';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const J = (t: string) => dateCivile(t);
const JOUR = J('2026-11-08');

const base = (): DonneesPaie => ({
  ...donneesVides(),
  profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
  salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
});
const appliquer = (d: DonneesPaie, p: Proposition) => appliquerChangements(d, p.changements);
const saisie = (s: Partial<SaisiePret>): SaisiePret => ({
  nom: '',
  versement: '',
  quand: '',
  prochaine: '',
  minimum: '',
  echeanceFinale: '',
  solde: '',
  soldeLe: '',
  taux: '',
  ...s,
});
const SAISIE_B = saisie({ nom: 'Prêt auto (fictif)', versement: '205', quand: 'deuxSemaines', prochaine: '2027-01-14' });
const SAISIE_A = saisie({ nom: 'Prêt perso (fictif)', versement: '200', quand: 'mois', prochaine: '2027-02-15', minimum: '185' });

function avecPret(d: DonneesPaie, s: SaisiePret): { d: DonneesPaie; id: string } {
  const apres = appliquer(d, proposerAjoutPret(d, s, JOUR));
  return { d: apres, id: apres.prets.find((x) => !d.prets.some((y) => y.id === x.id))!.id };
}
const confirmer = (d: DonneesPaie, id: string, origine: string, montant = '205') =>
  appliquer(d, proposerConfirmation(d, { elementId: id, origine }, { montant, date: origine }, JOUR));
const dates = (v: ReturnType<typeof vuePret>) => v.aVenir.map((x) => x.date);

describe('V — Les 6 prochains versements (Q49)', () => {
  it('V1 : prêt B aux deux semaines, les 6 prochains, comme dans Mes paies', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    const v = vuePret(d, id, JOUR);
    expect(dates(v)).toEqual(['14 janv. 2027', '28 janv. 2027', '11 févr. 2027', '25 févr. 2027', '11 mars 2027', '25 mars 2027']);
    expect(v.aVenir.every((x) => x.montant === $('205,00 $') && !x.ajuste)).toBe(true);
  });

  it('V2 : un versement déjà confirmé n’est plus « à venir »', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    d = confirmer(d, id, '2027-01-14');
    expect(dates(vuePret(d, id, JOUR))).toEqual(['28 janv. 2027', '11 févr. 2027', '25 févr. 2027', '11 mars 2027', '25 mars 2027', '8 avr. 2027']);
  });

  it('V3 : un ajustement ponctuel (date et montant) est repris tel quel', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    d = appliquer(d, proposerAjustement(d, { elementId: id, origine: J('2027-02-11') }, { montant: '250', date: '2027-02-13', paie: '' }, JOUR));
    const v = vuePret(d, id, JOUR);
    expect(v.aVenir[2]).toEqual({ date: '13 févr. 2027', montant: $('250,00 $'), ajuste: true });
    expect(v.aVenir.filter((x) => x.ajuste)).toHaveLength(1);
  });

  it('V4 : rien après l’échéance finale, rien après « remboursé »', () => {
    let { d, id } = avecPret(base(), { ...SAISIE_B, echeanceFinale: '2027-02-25' });
    expect(dates(vuePret(d, id, JOUR))).toEqual(['14 janv. 2027', '28 janv. 2027', '11 févr. 2027', '25 févr. 2027']);
    d = confirmer(d, id, '2027-01-14');
    d = appliquer(d, proposerRemboursement(d, id, '2027-01-14', JOUR));
    expect(vuePret(d, id, JOUR).aVenir).toEqual([]);
  });

  it('V5 : prêt A chaque mois, le 15 : six mois de versements', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    expect(dates(vuePret(d, id, JOUR))).toEqual(['15 févr. 2027', '15 mars 2027', '15 avr. 2027', '15 mai 2027', '15 juin 2027', '15 juill. 2027']);
  });

  it('V6 : à partir d’aujourd’hui seulement ; un versement passé non confirmé reste dans Mes paies (« À vérifier »), pas ici', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    expect(dates(vuePret(d, id, J('2027-01-20')))[0]).toBe('28 janv. 2027');
  });
});

describe('T — Somme des versements prévus jusqu’à l’échéance (Q50)', () => {
  const LIBELLE = 'Ce n’est ni le solde restant ni le coût total du prêt.';

  it('T1 : prêt A, échéance 15 déc. 2027 : 11 versements, 2 200,00 $, avec le libellé exact', () => {
    const { d, id } = avecPret(base(), { ...SAISIE_A, echeanceFinale: '2027-12-15' });
    expect(vuePret(d, id, JOUR).totalPrevu).toBe(
      $(`Somme des versements prévus d’ici l’échéance du 15 déc. 2027 : 11 versements, 2 200,00 $. ${LIBELLE}`),
    );
  });

  it('T2 : un changement de versement daté est compté (5 × 200 $ + 6 × 250 $)', () => {
    let { d, id } = avecPret(base(), { ...SAISIE_A, echeanceFinale: '2027-12-15' });
    d = appliquer(d, proposerVersement(d, id, '2027-07-15', '250', JOUR));
    expect(vuePret(d, id, JOUR).totalPrevu).toBe(
      $(`Somme des versements prévus d’ici l’échéance du 15 déc. 2027 : 11 versements, 2 500,00 $. ${LIBELLE}`),
    );
  });

  it('T3 : sans échéance finale, aucun total (aucune fin supposée)', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    expect(vuePret(d, id, JOUR).totalPrevu).toBeNull();
  });

  it('T4 : un versement déjà confirmé n’est plus compté ; un ajustement l’est à son montant', () => {
    let { d, id } = avecPret(base(), { ...SAISIE_A, echeanceFinale: '2027-12-15' });
    d = confirmer(d, id, '2027-02-15', '200');
    d = appliquer(d, proposerAjustement(d, { elementId: id, origine: J('2027-03-15') }, { montant: '300', date: '2027-03-15', paie: '' }, JOUR));
    expect(vuePret(d, id, JOUR).totalPrevu).toBe(
      $(`Somme des versements prévus d’ici l’échéance du 15 déc. 2027 : 10 versements, 2 100,00 $. ${LIBELLE}`),
    );
  });

  it('T5 : échéance ajoutée plus tard ; remboursé : plus de total', () => {
    let { d, id } = avecPret(base(), SAISIE_A);
    d = appliquer(d, proposerRenseignements(d, id, { minimum: '185', echeanceFinale: '2027-04-15', taux: '', solde: '', soldeLe: '' }, JOUR));
    expect(vuePret(d, id, JOUR).totalPrevu).toBe($(`Somme des versements prévus d’ici l’échéance du 15 avr. 2027 : 3 versements, 600,00 $. ${LIBELLE}`));
    d = appliquer(d, proposerRemboursement(d, id, '2027-01-01', JOUR));
    expect(vuePret(d, id, JOUR).totalPrevu).toBeNull();
  });

  it('T6 : un seul versement restant s’accorde au singulier', () => {
    const { d, id } = avecPret(base(), { ...SAISIE_A, echeanceFinale: '2027-02-15' });
    expect(vuePret(d, id, JOUR).totalPrevu).toBe($(`Somme des versements prévus d’ici l’échéance du 15 févr. 2027 : 1 versement, 200,00 $. ${LIBELLE}`));
  });
});

describe('M — Ce qui manque pour projeter (aucun chiffre d’intérêt)', () => {
  it('M1 : création minimale : solde, taux et méthode', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    expect(vuePret(d, id, JOUR).manque).toBe(
      'Pour estimer la date de remboursement et les intérêts, il manque : le solde, le taux et la méthode d’intérêts du contrat.',
    );
  });

  it('M2 : solde et taux connus : il ne manque que la méthode', () => {
    const { d, id } = avecPret(base(), { ...SAISIE_A, solde: '6000', soldeLe: '2027-01-15', taux: '9,90' });
    expect(vuePret(d, id, JOUR).manque).toBe('Pour estimer la date de remboursement et les intérêts, il manque : la méthode d’intérêts du contrat.');
  });

  it('M3 : taux connu, pas de solde', () => {
    const { d, id } = avecPret(base(), { ...SAISIE_A, taux: '9,90' });
    expect(vuePret(d, id, JOUR).manque).toBe('Pour estimer la date de remboursement et les intérêts, il manque : le solde et la méthode d’intérêts du contrat.');
  });

  it('M4 : un prêt remboursé n’a plus rien à projeter', () => {
    let { d, id } = avecPret(base(), SAISIE_A);
    d = appliquer(d, proposerRemboursement(d, id, '2027-01-01', JOUR));
    expect(vuePret(d, id, JOUR).manque).toBeNull();
  });

  it('M5 : la fiche ne contient aucun montant d’intérêt ni date de remboursement estimée', () => {
    const { d, id } = avecPret(base(), { ...SAISIE_A, solde: '6000', soldeLe: '2027-01-15', taux: '9,90', echeanceFinale: '2027-12-15' });
    const v = vuePret(d, id, JOUR);
    expect(v.capitalRembourse).toBe('À compléter');
    expect(JSON.stringify(v)).not.toMatch(/\(est\.\)|estimée|estimés|intérêts futurs/i);
  });
});

describe('J — Journal des versements sous « Prêt « … » » (Q51)', () => {
  it('J1 : confirmer, corriger et annuler un versement de prêt', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    const cible = { elementId: id, origine: '2027-01-14' };
    const c = proposerConfirmation(d, cible, null, JOUR);
    expect(c.journal[0]).toMatchObject({ objet: 'Prêt « Prêt auto (fictif) »', champ: 'confirmation du 2027-01-14' });
    d = appliquer(d, c);
    const corr = proposerCorrection(d, cible, { montant: '210', date: '2027-01-14' }, JOUR);
    expect(corr.journal[0]!.objet).toBe('Prêt « Prêt auto (fictif) »');
    d = appliquer(d, corr);
    expect(proposerAnnulationConfirmation(d, cible, JOUR).journal[0]!.objet).toBe('Prêt « Prêt auto (fictif) »');
  });

  it('J2 : « Tout confirmer » nomme aussi le prêt ; une dépense ordinaire garde son nom', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    void id;
    d = appliquer(
      d,
      proposerAjout(d, { libelle: 'Loyer', nature: 'depense', genre: 'fixe', montant: '1200', quand: 'mois', date: '2027-01-15', incertain: false, estimation: false, cyclePaie: '' }, JOUR),
    );
    const p = proposerToutConfirmer(d, '2027-01-07', JOUR);
    const objets = p.journal.map((e) => e.objet);
    expect(objets).toContain('Prêt « Prêt auto (fictif) »');
    expect(objets).toContain('Dépense « Loyer »');
  });
});
