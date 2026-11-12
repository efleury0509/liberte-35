// Étape 7a : cas témoins des prêts (F, E, C, P, S, H, L, D). Données fictives.
// Profil fictif : aux deux semaines à partir du jeudi 7 janvier 2027, 2 100,00 $.
import { describe, expect, it } from 'vitest';
import { proposerAjustement } from '../src/actions/occurrences';
import { proposerAnnulationConfirmation, proposerConfirmation, proposerCorrection, proposerToutConfirmer } from '../src/actions/confirmations';
import { cyclesAffiches } from '../src/actions/analyse';
import { ErreurSaisie, versNoyau, type Proposition } from '../src/actions/paie';
import {
  estPret,
  listePrets,
  proposerAjoutPret,
  proposerMiseAJourSolde,
  proposerRemboursement,
  proposerRenseignements,
  proposerSuppressionPret,
  proposerVersement,
  reductionSolde,
  vuePret,
  type SaisiePret,
} from '../src/actions/prets';
import { appliquerChangements, donneesVides, inverser } from '../src/lib/appliquer';
import type { DonneesPaie } from '../src/lib/plateforme';
import { dateCivile } from '../src/noyau/dates';

const ESP = ' ';
// Espaces insécables seulement dans les montants (« 6 000,00 $ »).
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const J = (t: string) => dateCivile(t);

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
const SAISIE_A = saisie({
  nom: 'Prêt perso (fictif)',
  versement: '200',
  quand: 'mois',
  prochaine: '2027-02-15',
  minimum: '185',
  solde: '6000',
  soldeLe: '2027-01-15',
  taux: '9,90',
});

function avecPret(d: DonneesPaie, s: SaisiePret, jour = J('2026-11-08')): { d: DonneesPaie; id: string } {
  const p = proposerAjoutPret(d, s, jour);
  const apres = appliquer(d, p);
  const id = apres.prets.find((x) => !d.prets.some((y) => y.id === x.id))!.id;
  return { d: apres, id };
}

function confirmer(d: DonneesPaie, id: string, origine: string, montant: string, jour = '2027-06-01'): DonneesPaie {
  return appliquer(d, proposerConfirmation(d, { elementId: id, origine }, { montant, date: origine }, J(jour)));
}

/** Lignes des cycles affichés pour un élément, avec la paie du cycle. */
function lignes(d: DonneesPaie, id: string, jour = '2027-01-08') {
  const n = versNoyau(d);
  const { cycles } = cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations }, J(jour), 8);
  return cycles.flatMap((c) => c.lignes.filter((l) => l.elementId === id).map((l) => ({ cycle: c.paie.dateOrigine as string, echeance: l.echeance as string | null, montant: l.montant, statut: l.statut, libelle: l.libelle })));
}

describe('F — Création et fiche', () => {
  it('F1 : création minimale (nom, versement, fréquence, prochaine échéance)', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    expect(d.prets).toEqual([{ id, minimum: null, echeanceFinale: null, taux: null, rembourseLe: null, soldes: [] }]);
    const e = d.elements.find((x) => x.id === id)!;
    expect(e).toMatchObject({ libelle: 'Prêt auto (fictif)', nature: 'depense', genre: 'fixe', fin: null });
    expect(e.frequence).toEqual({ type: 'semaines', n: 2, depart: '2027-01-14' });
    const v = vuePret(d, id, J('2027-01-08'));
    expect(v.versement).toBe($('205,00 $ — aux deux semaines'));
    expect(v.minimum).toBe('Identique au versement');
    expect(v.soldeActuel).toBe('À compléter');
    expect(v.soldeInitial).toBe('À compléter');
    expect(v.capitalRembourse).toBe('À compléter');
    expect(v.taux).toBe('À compléter');
    expect(v.methode).toBe('À compléter');
    expect(v.echeanceFinale).toBe('À compléter');
  });

  it('F2 : fiche presque complète', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    expect(d.prets[0]).toEqual({
      id,
      minimum: 18_500,
      echeanceFinale: null,
      taux: '9.90',
      rembourseLe: null,
      soldes: [{ date: '2027-01-15', montant: 600_000, note: null }],
    });
    const v = vuePret(d, id, J('2027-01-08'));
    expect(v.minimum).toBe($('185,00 $'));
    expect(v.taux).toBe('9,90 %');
    expect(v.soldeInitial).toBe($('6 000,00 $ au 15 janv. 2027'));
    expect(v.soldeActuel).toBe($('6 000,00 $ au 15 janv. 2027'));
    expect(v.methode).toBe('À compléter');
    expect(v.noteRepartition).toBe('Intérêts et capital : à compléter tant que la méthode de calcul du contrat n’est pas précisée.');
  });

  it('F3 : refus clairs', () => {
    const d = base();
    const msg = (s: Partial<SaisiePret>) => {
      try {
        proposerAjoutPret(d, { ...SAISIE_B, ...s }, J('2026-11-08'));
        return 'accepté';
      } catch (e) {
        expect(e).toBeInstanceOf(ErreurSaisie);
        return (e as Error).message;
      }
    };
    expect(msg({ nom: '  ' })).toBe('Donne un nom à ce prêt.');
    expect(msg({ versement: '' })).toBe('Indique le montant du versement.');
    expect(msg({ versement: '0' })).toBe('Le versement doit être plus grand que 0.');
    expect(msg({ quand: '' })).toBe('Choisis la fréquence des versements.');
    expect(msg({ prochaine: '' })).toBe('Indique la date du prochain versement.');
    expect(msg({ versement: '150', minimum: '185' })).toBe($('Le minimum (185,00 $) dépasse le versement planifié (150,00 $).'));
    expect(msg({ solde: '6000' })).toBe('Indique la date de ce solde.');
    expect(msg({ soldeLe: '2027-01-15' })).toBe('Indique le montant de ce solde.');
    expect(msg({ taux: 'neuf' })).toBe('Taux invalide : écris-le comme 9,90.');
    expect(msg({ echeanceFinale: '2027-01-01' })).toBe('L’échéance finale ne peut pas venir avant le prochain versement.');
    expect(() => proposerAjoutPret(donneesVides(), SAISIE_B, J('2026-11-08'))).toThrow('Crée d’abord le profil de paie');
  });

  it('F4 : compléter plus tard sans rien perdre ni réécrire', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    for (const o of ['2027-01-14', '2027-01-28', '2027-02-11']) d = confirmer(d, id, o, '205');
    const avant = vuePret(d, id, J('2027-02-12')).historique;
    d = appliquer(d, proposerRenseignements(d, id, { minimum: '', echeanceFinale: '', taux: '6,49', solde: '17500', soldeLe: '2027-02-11' }, J('2027-02-12')));
    expect(d.confirmations.filter((c) => c.elementId === id)).toHaveLength(3);
    const v = vuePret(d, id, J('2027-02-12'));
    // Les trois lignes de versement sont identiques ; une ligne de solde s'ajoute.
    expect(v.historique.filter((l) => l.genre === 'versement')).toEqual(avant.filter((l) => l.genre === 'versement'));
    expect(v.historique.at(-1)).toMatchObject({ genre: 'solde', texte: $('Solde de départ : 17 500,00 $') });
    expect(v.soldeActuel).toBe($('17 500,00 $ au 11 févr. 2027'));
    expect(v.taux).toBe('6,49 %');
  });

  it('F5 : changer le versement à partir d’une date', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    d = confirmer(d, id, '2027-01-14', '205');
    d = appliquer(d, proposerVersement(d, id, '2027-03-11', '215', J('2027-02-01')));
    const l = lignes(d, id, '2027-02-01');
    expect(l.find((x) => x.echeance === '2027-02-25')!.montant).toBe(20_500);
    expect(l.find((x) => x.echeance === '2027-03-11')!.montant).toBe(21_500);
    expect(d.confirmations).toHaveLength(1);
    expect(vuePret(d, id, J('2027-03-12')).versement).toBe($('215,00 $ — aux deux semaines'));
  });
});

describe('E — Échéance finale facultative', () => {
  it('E1 : sans échéance, les versements continuent ; aucune fin inventée', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    expect(lignes(d, id, '2029-01-01').length).toBeGreaterThan(5);
    expect(vuePret(d, id, J('2029-01-01')).echeanceFinale).toBe('À compléter');
  });

  it('E2 : échéance indiquée, plus de versement planifié après', () => {
    let { d, id } = avecPret(base(), { ...SAISIE_A, echeanceFinale: '2029-12-15' });
    expect(d.elements.find((e) => e.id === id)!.fin).toBe('2029-12-15');
    const l = lignes(d, id, '2029-11-01');
    expect(l.at(-1)!.echeance).toBe('2029-12-15');
    expect(vuePret(d, id, J('2029-11-01')).echeanceFinale).toBe('Dernier versement prévu : 15 déc. 2029 (échéance indiquée)');
    // Ajoutée plus tard : même effet.
    ({ d, id } = avecPret(base(), SAISIE_A));
    d = appliquer(d, proposerRenseignements(d, id, { minimum: '185', echeanceFinale: '2029-12-15', taux: '9,90', solde: '6000', soldeLe: '2027-01-15' }, J('2027-01-08')));
    expect(d.elements.find((e) => e.id === id)!.fin).toBe('2029-12-15');
  });

  it('E3 : échéance passée sans remboursement : le prêt reste en cours', () => {
    const { d, id } = avecPret(base(), { ...SAISIE_A, echeanceFinale: '2029-12-15' });
    const v = vuePret(d, id, J('2030-01-10'));
    expect(v.rembourse).toBe(false);
    expect(v.note).toBe('L’échéance prévue est passée. Marque le prêt comme remboursé quand c’est fait.');
    expect(listePrets(d, J('2030-01-10')).actifs.map((x) => x.id)).toEqual([id]);
  });

  it('E4 : jamais d’arrêt sur une estimation (rien n’arrête les versements sans action)', () => {
    let { d, id } = avecPret(base(), { ...SAISIE_B, solde: '100', soldeLe: '2027-01-01' });
    d = confirmer(d, id, '2027-01-14', '205');
    expect(d.prets[0]!.rembourseLe).toBeNull();
    expect(d.elements.find((e) => e.id === id)!.fin).toBeNull();
    expect(lignes(d, id, '2027-06-01').length).toBeGreaterThan(5);
  });
});

describe('C — Dans Mes paies', () => {
  it('C1, C4 : prêt B aux deux semaines, une ligne par cycle, création minimale suffisante', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    const l = lignes(d, id);
    expect(l.slice(0, 2)).toEqual([
      { cycle: '2027-01-07', echeance: '2027-01-14', montant: 20_500, statut: 'aVenir', libelle: 'Prêt auto (fictif)' },
      { cycle: '2027-01-21', echeance: '2027-01-28', montant: 20_500, statut: 'aVenir', libelle: 'Prêt auto (fictif)' },
    ]);
    expect(estPret(d, id)).toBe(true);
  });

  it('C2 : prêt A mensuel le 15, jamais deux fois', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    const l = lignes(d, id);
    expect(l.slice(0, 2).map((x) => [x.cycle, x.echeance])).toEqual([
      ['2027-02-04', '2027-02-15'],
      ['2027-03-04', '2027-03-15'],
    ]);
    const parCycle = new Map<string, number>();
    for (const x of l) parCycle.set(x.cycle, (parCycle.get(x.cycle) ?? 0) + 1);
    expect([...parCycle.values()].every((n) => n === 1)).toBe(true);
  });

  it('C3 : sorties et disponible du cycle du 4 au 17 févr.', () => {
    const sans = base();
    let { d } = avecPret(sans, SAISIE_A);
    ({ d } = avecPret(d, SAISIE_B));
    const cycle = (x: DonneesPaie) => {
      const n = versNoyau(x);
      return cyclesAffiches(n.profil!, { exceptions: [], elements: n.elements, ajustements: [], confirmations: [] }, J('2027-02-05'), 1).cycles[0]!;
    };
    expect(cycle(d).paie.dateOrigine).toBe('2027-02-04');
    expect(cycle(d).sorties! - (cycle(sans).sorties ?? 0)).toBe(40_500);
    expect(cycle(d).disponible).toBe(210_000 - 40_500);
  });

  it('C5 : statut, confirmation, « Tout confirmer », corriger et annuler', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    expect(lignes(d, id, '2027-01-15')[0]!.statut).toBe('aVerifier');
    const tout = proposerToutConfirmer(d, '2027-01-07', J('2027-01-15'));
    expect(tout.changements.some((c) => c.type === 'definirConfirmation' && c.confirmation.elementId === id)).toBe(true);
    d = confirmer(d, id, '2027-01-14', '205', '2027-01-15');
    expect(vuePret(d, id, J('2027-01-15')).historique).toHaveLength(1);
    d = appliquer(d, proposerCorrection(d, { elementId: id, origine: '2027-01-14' }, { montant: '230', date: '2027-01-14' }, J('2027-01-15')));
    expect(vuePret(d, id, J('2027-01-15')).historique[0]).toMatchObject({ paye: $('230,00 $'), supplementaire: $('25,00 $') });
    d = appliquer(d, proposerAnnulationConfirmation(d, { elementId: id, origine: '2027-01-14' }, J('2027-01-15')));
    expect(vuePret(d, id, J('2027-01-15')).historique).toHaveLength(0);
  });

  it('C6 : ajustement une seule fois (date puis montant)', () => {
    let { d, id } = avecPret(base(), SAISIE_A);
    d = appliquer(d, proposerAjustement(d, { elementId: id, origine: J('2027-02-15') }, { montant: '', date: '2027-02-20', paie: '' }, J('2027-01-08')));
    const l = lignes(d, id);
    expect(l.filter((x) => x.echeance === '2027-02-20')).toEqual([expect.objectContaining({ cycle: '2027-02-18' })]);
    expect(l.filter((x) => x.echeance === '2027-02-15')).toHaveLength(0);
    d = appliquer(d, proposerAjustement(d, { elementId: id, origine: J('2027-03-15') }, { montant: '250', date: '2027-03-15', paie: '' }, J('2027-01-08')));
    const l2 = lignes(d, id);
    expect(l2.find((x) => x.echeance === '2027-03-15')!.montant).toBe(25_000);
    expect(l2.find((x) => x.echeance === '2027-04-15')!.montant).toBe(20_000);
  });

  it('C7 : un prêt ne figure pas parmi les dépenses fixes (une seule source)', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    expect(listePrets(d, J('2027-01-08')).actifs.map((v) => v.id)).toEqual([id]);
    expect(estPret(d, 'autre')).toBe(false);
  });
});

describe('P — Les trois montants (Q37, Q46)', () => {
  const versement = (d: DonneesPaie, id: string) => vuePret(d, id, J('2027-03-01')).historique.find((l) => l.genre === 'versement')!;

  it('P1, P2, P3 : prêt A (minimum 185 $)', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    expect(versement(confirmer(d, id, '2027-02-15', '200'), id)).toMatchObject({
      paye: $('200,00 $'),
      obligatoire: $('185,00 $'),
      supplementaire: $('15,00 $'),
      sousMinimum: null,
    });
    expect(versement(confirmer(d, id, '2027-02-15', '185'), id)).toMatchObject({ obligatoire: $('185,00 $'), supplementaire: $('0,00 $') });
    expect(versement(confirmer(d, id, '2027-02-15', '170'), id)).toMatchObject({
      obligatoire: $('170,00 $'),
      supplementaire: $('0,00 $'),
      sousMinimum: $('15,00 $ sous le minimum'),
    });
  });

  it('P4 : prêt B, minimum non indiqué = versement, sans supplément présumé', () => {
    const { d, id } = avecPret(base(), SAISIE_B);
    expect(versement(confirmer(d, id, '2027-01-14', '205'), id)).toMatchObject({ obligatoire: $('205,00 $'), supplementaire: $('0,00 $') });
    expect(versement(confirmer(d, id, '2027-01-14', '230'), id)).toMatchObject({ obligatoire: $('205,00 $'), supplementaire: $('25,00 $') });
  });

  it('P5 (H0) : intérêts, capital et nouveau solde restent à compléter', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    expect(versement(confirmer(d, id, '2027-02-15', '200'), id)).toMatchObject({
      interets: 'À compléter',
      capital: 'À compléter',
      nouveauSolde: 'À compléter',
    });
  });
});

describe('S — Soldes (Q40)', () => {
  it('S1 : sans solde, seul le total payé est un fait', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    for (const o of ['2027-01-14', '2027-01-28', '2027-02-11']) d = confirmer(d, id, o, '205');
    const v = vuePret(d, id, J('2027-02-12'));
    expect([v.soldeInitial, v.capitalRembourse, v.soldeActuel]).toEqual(['À compléter', 'À compléter', 'À compléter']);
    expect(v.payeDepuisAjout).toBe($('Payé depuis l’ajout : 615,00 $'));
  });

  it('S2 : solde connu, méthode non précisée : aucune baisse inventée', () => {
    let { d, id } = avecPret(base(), SAISIE_A);
    d = confirmer(d, id, '2027-02-15', '200');
    d = confirmer(d, id, '2027-03-15', '200');
    const v = vuePret(d, id, J('2027-03-20'));
    expect(v.soldeActuel).toBe($('6 000,00 $ au 15 janv. 2027 — 400,00 $ payés depuis, répartition à compléter'));
    expect(v.capitalRembourse).toBe('À compléter');
  });

  it('S3 : mise à jour du solde = nouvelle référence, ligne distincte, rien d’autre ne change', () => {
    let { d, id } = avecPret(base(), SAISIE_A);
    d = confirmer(d, id, '2027-02-15', '200');
    d = confirmer(d, id, '2027-03-15', '200');
    const lignesAvant = vuePret(d, id, J('2027-03-20')).historique;
    const confirmationsAvant = d.confirmations;
    const cyclesAvant = lignes(d, id, '2027-03-20');
    const p = proposerMiseAJourSolde(d, id, '2027-03-15', '5700', 'relevé de mars', J('2027-03-20'));
    expect(p.journal[0]).toMatchObject({ section: 'Mes dettes', objet: 'Prêt « Prêt perso (fictif) »', champ: 'solde', nouvelleValeur: $('5 700,00 $ au 2027-03-15') });
    d = appliquer(d, p);
    const v = vuePret(d, id, J('2027-03-20'));
    expect(v.historique.slice(0, lignesAvant.length)).toEqual(lignesAvant);
    expect(v.historique.at(-1)).toMatchObject({ genre: 'solde', texte: $('Solde mis à jour : 5 700,00 $ (relevé de mars)') });
    expect(v.soldeActuel).toBe($('5 700,00 $ au 15 mars 2027'));
    expect(v.soldeInitial).toBe($('6 000,00 $ au 15 janv. 2027'));
    expect(d.confirmations).toEqual(confirmationsAvant);
    expect(lignes(d, id, '2027-03-20')).toEqual(cyclesAvant);
  });

  it('S5 : annuler une confirmation plus ancienne ne déplace pas la référence', () => {
    let { d, id } = avecPret(base(), SAISIE_A);
    d = confirmer(d, id, '2027-02-15', '200');
    d = appliquer(d, proposerMiseAJourSolde(d, id, '2027-03-15', '5700', '', J('2027-03-20')));
    d = appliquer(d, proposerAnnulationConfirmation(d, { elementId: id, origine: '2027-02-15' }, J('2027-03-20')));
    const v = vuePret(d, id, J('2027-03-20'));
    expect(v.historique.filter((l) => l.genre === 'versement')).toHaveLength(0);
    expect(v.soldeActuel).toBe($('5 700,00 $ au 15 mars 2027'));
  });

  it('une mise à jour de solde à une date déjà utilisée est refusée ; montant requis', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    expect(() => proposerMiseAJourSolde(d, id, '2027-01-15', '5900', '', J('2027-03-20'))).toThrow('Un solde existe déjà au 15 janv. 2027.');
    expect(() => proposerMiseAJourSolde(d, id, '2027-03-15', '', '', J('2027-03-20'))).toThrow('Indique le solde.');
  });
});

describe('H — Intérêts et capital (H0 seulement à cette étape)', () => {
  it('H6 : les lignes antérieures à la référence restent à compléter', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    d = confirmer(d, id, '2027-01-14', '205');
    d = appliquer(d, proposerRenseignements(d, id, { minimum: '', echeanceFinale: '', taux: '6,49', solde: '17500', soldeLe: '2027-02-11' }, J('2027-02-12')));
    const l = vuePret(d, id, J('2027-02-12')).historique.find((x) => x.genre === 'versement')!;
    expect(l).toMatchObject({ interets: 'À compléter', capital: 'À compléter', nouveauSolde: 'À compléter' });
  });
});

describe('L — Prêt remboursé (Q41)', () => {
  it('L2 : aperçu, versements futurs retirés, montant libéré nommé', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    d = confirmer(d, id, '2027-01-14', '205');
    d = confirmer(d, id, '2027-01-28', '205');
    const p = proposerRemboursement(d, id, '', J('2027-02-05'));
    expect(p.apercu).toBe(true);
    expect(p.titre).toBe('Marquer « Prêt auto (fictif) » comme remboursé');
    // Par défaut : la date du dernier versement confirmé.
    expect(p.lignes).toContainEqual({ libelle: 'Statut', avant: 'En cours', apres: 'Remboursé le 28 janv. 2027' });
    expect(p.consequences).toContain('Les versements prévus après le 28 janv. 2027 ne seront plus planifiés.');
    expect(p.consequences).toContain($('205,00 $ aux deux semaines deviennent libres. L’app ne décide pas où va cet argent.'));
    const apres = appliquer(d, p);
    expect(apres.prets[0]!.rembourseLe).toBe('2027-01-28');
    expect(lignes(apres, id, '2027-01-08').map((x) => x.echeance)).toEqual(['2027-01-14', '2027-01-28']);
    // L3 : dans « Dettes libérées », historique intact.
    const liste = listePrets(apres, J('2027-02-05'));
    expect(liste.actifs).toHaveLength(0);
    expect(liste.liberes.map((v) => v.id)).toEqual([id]);
    expect(liste.liberes[0]!.historique).toHaveLength(2);
    expect(liste.liberes[0]!.statut).toBe('Remboursé le 28 janv. 2027');
    // L3 : « Annuler » ramène tout.
    const retour = appliquerChangements(apres, inverser(d, p.changements));
    expect(retour.prets).toEqual(d.prets);
    expect(retour.elements).toEqual(d.elements);
  });

  it('L2 : date choisie ; refus d’une date qui ferait disparaître un versement confirmé', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    d = confirmer(d, id, '2027-01-28', '205');
    expect(() => proposerRemboursement(d, id, '2027-01-20', J('2027-02-05'))).toThrow('opération confirmée');
    expect(proposerRemboursement(d, id, '2027-02-11', J('2027-02-05')).lignes[0]!.apres).toBe('Remboursé le 11 févr. 2027');
    // Sans versement confirmé, la date du jour.
    const { d: d2, id: id2 } = avecPret(base(), SAISIE_A);
    expect(proposerRemboursement(d2, id2, '', J('2027-02-05')).lignes[0]!.apres).toBe('Remboursé le 5 févr. 2027');
  });

  it('L4 : rien n’est réaffecté', () => {
    let { d, id } = avecPret(base(), SAISIE_B);
    const p = proposerRemboursement(d, id, '', J('2027-02-05'));
    expect(p.changements.map((c) => c.type).sort()).toEqual(['definirElement', 'definirPret']);
    d = appliquer(d, p);
    expect(d.elements).toHaveLength(1);
  });
});

describe('D — Suppression (Q44)', () => {
  it('D1 : sans versement confirmé, suppression avec aperçu', () => {
    const { d, id } = avecPret(base(), SAISIE_A);
    const p = proposerSuppressionPret(d, id, J('2027-01-08'));
    expect(p.apercu).toBe(true);
    expect(p.changements).toEqual([{ type: 'supprimerPret', id }, { type: 'supprimerElement', id }]);
    const apres = appliquer(d, p);
    expect(apres.prets).toHaveLength(0);
    expect(apres.elements).toHaveLength(0);
    expect(appliquerChangements(apres, inverser(d, p.changements)).prets).toEqual(d.prets);
  });

  it('D2 : avec un versement confirmé, refus', () => {
    let { d, id } = avecPret(base(), SAISIE_A);
    d = confirmer(d, id, '2027-02-15', '200');
    expect(() => proposerSuppressionPret(d, id, J('2027-03-01'))).toThrow(
      'Ce prêt a des versements confirmés : marque-le comme remboursé plutôt que de le supprimer.',
    );
  });
});

describe('Journal', () => {
  it('chaque action est consignée dans « Mes dettes », sous « Prêt « … » »', () => {
    const d = base();
    const p = proposerAjoutPret(d, SAISIE_B, J('2026-11-08'));
    expect(p.journal).toEqual([
      { section: 'Mes dettes', objet: 'Prêt « Prêt auto (fictif) »', champ: 'création', ancienneValeur: null, nouvelleValeur: $('205,00 $ — aux deux semaines à partir du 14 janv. 2027'), motif: null },
    ]);
    expect(p.apercu).toBe(false);
  });
});

describe('Lot 1 — le solde de départ reste la référence', () => {
  it('mises à jour, correction et « Annuler » ne touchent jamais le solde de départ', () => {
    let { d, id } = avecPret(base(), SAISIE_A); // départ : 6 000 $ au 15 janv. 2027
    const depart = { date: '2027-01-15', montant: 6_000_00 };
    const reduction = (x: DonneesPaie) => reductionSolde(x.prets.find((p) => p.id === id)!.soldes);

    d = appliquer(d, proposerMiseAJourSolde(d, id, '2027-03-15', '5600', 'relevé', J('2027-03-16')));
    expect(reduction(d)).toMatchObject({ etat: 'reduit', pourcent: 6, depart });

    // Correction : un solde plus récent devient le dernier ; le départ ne bouge pas.
    const avantCorrection = d;
    const correction = proposerMiseAJourSolde(d, id, '2027-03-20', '5500', 'correction', J('2027-03-21'));
    d = appliquer(d, correction);
    expect(reduction(d)).toMatchObject({ etat: 'reduit', pourcent: 8, depart, dernier: { date: '2027-03-20', montant: 5_500_00 } });
    expect(d.prets.find((p) => p.id === id)!.soldes).toHaveLength(3);

    // « Annuler » retire seulement la correction.
    d = appliquerChangements(d, inverser(avantCorrection, correction.changements));
    expect(d.prets.find((p) => p.id === id)!.soldes).toEqual(avantCorrection.prets.find((p) => p.id === id)!.soldes);

    // Les renseignements ne réécrivent pas un solde déjà déclaré.
    d = appliquer(d, proposerRenseignements(d, id, { minimum: '190', echeanceFinale: '', taux: '9,90', solde: '1', soldeLe: '2027-04-01' }, J('2027-04-02')));
    expect(reduction(d)).toMatchObject({ depart });

    // Même date qu'un solde existant : refusé, rien n'est remplacé.
    expect(() => proposerMiseAJourSolde(d, id, '2027-01-15', '1', '', J('2027-04-02'))).toThrow(ErreurSaisie);
  });
});
