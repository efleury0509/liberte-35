// Calendrier de paie (cahier 4.1, décisions A8, A11, Q6, Q7, Q11).
//
// - Les dates « d'origine » viennent de la règle de récurrence ; elles ne
//   changent jamais. Une exception peut déplacer la date réelle de versement
//   ou changer le montant d'une paie, sans toucher à la règle.
// - Le rang d'une paie dans son mois (1re, 2e, 3e) se calcule sur sa date
//   d'origine (Q7) ; les dépenses à date fixe, elles, suivent la date réelle.
// - Le montant vient de l'exception si elle en fixe un ; sinon du salaire
//   en vigueur à la date d'origine. Aucun montant connu : null (à compléter).
// - Une paie déplacée reste strictement entre la précédente et la suivante
//   (Q11) : jamais de doublon ni de versement supplémentaire.

import { ajouterJours, ajouterMois, composer, parties, type DateCivile } from './dates';
import { datesDe, rangsDesPaies, type Frequence } from './frequences';
import type { Cents } from './montants';
import { montantEnVigueur, type MontantDate } from './regles';

export type FrequencePaie =
  | { type: 'hebdomadaire'; depart: DateCivile }
  | { type: 'deuxSemaines'; depart: DateCivile }
  | { type: 'deuxFoisParMois'; depart: DateCivile; jours: readonly [number, number] }
  | { type: 'mensuelle'; depart: DateCivile };

export interface ProfilPaie {
  frequence: FrequencePaie;
  /** Montant net habituel, avec ses changements datés. Vide : à compléter. */
  montants: readonly MontantDate[];
}

export interface ExceptionPaie {
  dateOrigine: DateCivile;
  /** Nouvelle date réelle de versement (A11). */
  dateReelle?: DateCivile;
  /** Montant différent pour cette paie seulement. */
  montant?: Cents;
}

export interface Paie {
  dateOrigine: DateCivile;
  /** Date réelle de versement. */
  date: DateCivile;
  montant: Cents | null;
  /** Rang dans le mois, selon la date d'origine. */
  rang: number;
  deplacee: boolean;
  montantModifie: boolean;
}

export class ErreurPaie extends Error {}

export function versFrequence(f: FrequencePaie): Frequence {
  switch (f.type) {
    case 'hebdomadaire':
      return { type: 'semaines', n: 1, depart: f.depart };
    case 'deuxSemaines':
      return { type: 'semaines', n: 2, depart: f.depart };
    case 'deuxFoisParMois':
      return { type: 'deuxFoisParMois', jours: f.jours, depart: f.depart };
    case 'mensuelle':
      return { type: 'mois', n: 1, depart: f.depart };
  }
}

/** Dernière exception connue pour chaque date d'origine (X11 : la plus récente remplace). */
function indexerExceptions(exceptions: readonly ExceptionPaie[]): Map<DateCivile, ExceptionPaie> {
  const index = new Map<DateCivile, ExceptionPaie>();
  for (const e of exceptions) {
    if (e.montant !== undefined && !Number.isSafeInteger(e.montant)) {
      throw new ErreurPaie(`Montant invalide pour la paie du ${e.dateOrigine}.`);
    }
    index.set(e.dateOrigine, e);
  }
  return index;
}

function premierDuMois(d: DateCivile): DateCivile {
  const { annee, mois } = parties(d);
  return composer(annee, mois, 1);
}

function dernierDuMois(d: DateCivile): DateCivile {
  return ajouterMois(premierDuMois(d), 0, 31);
}

/**
 * Toutes les paies dont la date RÉELLE tombe entre `debut` et `fin` inclus.
 * Lève une erreur si une paie déplacée sort de l'intervalle permis (Q11).
 */
export function paiesEntre(
  profil: ProfilPaie,
  exceptions: readonly ExceptionPaie[],
  debut: DateCivile,
  fin: DateCivile,
): Paie[] {
  // Fenêtre élargie à des mois complets, avec deux mois de marge : les rangs
  // exigent des mois entiers, et une paie déplacée reste près de son origine.
  const large = {
    debut: premierDuMois(ajouterMois(debut, -2, 1)),
    fin: dernierDuMois(ajouterMois(fin, 2, 1)),
  };
  const origines = datesDe(versFrequence(profil.frequence), large.debut, large.fin);
  const rangs = rangsDesPaies(origines);
  const index = indexerExceptions(exceptions);

  const toutes: Paie[] = origines.map((origine) => {
    const e = index.get(origine);
    const date = e?.dateReelle ?? origine;
    const montantException = e?.montant;
    return {
      dateOrigine: origine,
      date,
      montant: montantException ?? montantEnVigueur(profil.montants, origine),
      rang: rangs.get(origine) ?? 1,
      deplacee: date !== origine,
      montantModifie: montantException !== undefined,
    };
  });

  for (let i = 0; i < toutes.length; i++) {
    const p = toutes[i];
    if (!p?.deplacee) continue;
    const precedente = toutes[i - 1];
    const suivante = toutes[i + 1];
    if ((precedente && p.date <= precedente.date) || (suivante && p.date >= suivante.date)) {
      throw new ErreurPaie(
        `La paie du ${p.dateOrigine} ne peut pas être déplacée au ${p.date} : une paie reste entre la paie précédente et la suivante.`,
      );
    }
  }

  return toutes.filter((p) => p.date >= debut && p.date <= fin);
}

/**
 * Premier jour du calendrier : la date de départ, ou la toute première paie
 * si une exception l'a versée avant (0.4.3).
 */
export function debutDuCalendrier(profil: ProfilPaie, exceptions: readonly ExceptionPaie[]): DateCivile {
  const depart = profil.frequence.depart;
  const premiere = paiesEntre(profil, exceptions, ajouterJours(depart, -31), ajouterJours(depart, 31))[0]?.date ?? depart;
  return premiere < depart ? premiere : depart;
}
