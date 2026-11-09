// Étape 7a : historique d'un prêt (cahier 5.1, 5.2 ; décisions Q37, Q40, Q46).
//
// L'historique n'est pas une deuxième saisie : il découle des versements
// confirmés (étape 5) et des soldes de référence datés (solde de départ, puis
// mises à jour d'après un relevé). Rien n'est réécrit : une nouvelle
// référence s'ajoute, les lignes d'avant restent telles quelles.
//
// Départ en H0 : aucune méthode d'intérêts n'est supposée. Intérêts, capital
// et nouveau solde restent inconnus (null) ; seuls les faits sont calculés.

import type { DateCivile } from './dates';
import { additionner, type Cents } from './montants';
import { montantEnVigueur, type MontantDate } from './regles';

export interface VersementConfirme {
  /** Date d'origine de l'occurrence (identité stable). */
  origine: DateCivile;
  /** Date confirmée : une information (Q19). */
  date: DateCivile;
  montant: Cents;
}

export interface SoldeReference {
  date: DateCivile;
  montant: Cents;
  note: string | null;
}

export interface ParametresPret {
  /** Minimum obligatoire ; absent : le versement de la règle (Q46). */
  minimum: Cents | null;
  /** Montants datés du versement planifié (la règle). */
  montants: readonly MontantDate[];
  soldes: readonly SoldeReference[];
}

export interface LigneVersement {
  genre: 'versement';
  origine: DateCivile;
  dateConfirmee: DateCivile;
  paye: Cents;
  /** Minimum applicable à ce versement ; null si inconnu. */
  minimum: Cents | null;
  /** Part obligatoire payée : min(payé, minimum). */
  obligatoire: Cents;
  /** Part au-delà du minimum. */
  supplementaire: Cents;
  /** Ce qui manque pour atteindre le minimum (0 si atteint). */
  sousMinimum: Cents;
  /** H0 : inconnus tant que la méthode du contrat n'est pas précisée. */
  interets: null;
  capital: null;
  nouveauSolde: null;
}

export interface LigneSolde {
  genre: 'solde';
  date: DateCivile;
  montant: Cents;
  note: string | null;
  /** Premier solde connu (solde de départ) ou mise à jour. */
  depart: boolean;
}

export type LigneHistorique = LigneVersement | LigneSolde;

export interface Historique {
  /** Ordre chronologique ; un versement passe avant un solde du même jour. */
  lignes: LigneHistorique[];
  soldeInitial: SoldeReference | null;
  /** Dernière référence connue. */
  reference: SoldeReference | null;
  payeDepuisAjout: Cents;
  /** Versements dont l'origine suit la référence. */
  payeDepuisReference: Cents;
  /** H0 : pas de répartition, donc pas de capital remboursé ni de solde estimé. */
  capitalRembourse: null;
  soldeActuel: null;
}

export function historiquePret(p: ParametresPret, confirmes: readonly VersementConfirme[]): Historique {
  const soldes = [...p.soldes].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const versements: LigneVersement[] = [...confirmes]
    .sort((a, b) => (a.origine < b.origine ? -1 : a.origine > b.origine ? 1 : 0))
    .map((v) => {
      const minimum = p.minimum ?? montantEnVigueur(p.montants, v.origine);
      const obligatoire = minimum === null ? v.montant : Math.min(v.montant, minimum);
      return {
        genre: 'versement',
        origine: v.origine,
        dateConfirmee: v.date,
        paye: v.montant,
        minimum,
        obligatoire,
        supplementaire: v.montant - obligatoire,
        sousMinimum: minimum === null ? 0 : Math.max(0, minimum - v.montant),
        interets: null,
        capital: null,
        nouveauSolde: null,
      };
    });
  const lignesSolde: LigneSolde[] = soldes.map((s, i) => ({ genre: 'solde', date: s.date, montant: s.montant, note: s.note, depart: i === 0 }));
  const cle = (l: LigneHistorique) => `${l.genre === 'versement' ? l.origine : l.date}|${l.genre === 'versement' ? 0 : 1}`;
  const lignes = [...versements, ...lignesSolde].sort((a, b) => (cle(a) < cle(b) ? -1 : 1));
  const reference = soldes.at(-1) ?? null;
  return {
    lignes,
    soldeInitial: soldes[0] ?? null,
    reference,
    payeDepuisAjout: additionner(0, ...versements.map((v) => v.paye)),
    payeDepuisReference: additionner(0, ...versements.filter((v) => reference === null || v.origine > reference.date).map((v) => v.paye)),
    capitalRembourse: null,
    soldeActuel: null,
  };
}
