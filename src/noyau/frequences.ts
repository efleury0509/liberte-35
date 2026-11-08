// Fréquences de Liberté 35 (cahier 4.6 et 7, règles Q2 et Q4).
//
// Chaque occurrence est calculée directement à partir de la date de départ
// (« départ + k × intervalle »), jamais à partir de l'occurrence précédente :
// une date ramenée au 28 février ne fait donc jamais glisser les suivantes.

import {
  ajouterJours,
  ajouterMois,
  composer,
  ecartEnJours,
  parties,
  type DateCivile,
} from './dates';

export type Frequence =
  | { type: 'ponctuelle'; date: DateCivile }
  /** Personnalisée : tous les N jours (Q2). */
  | { type: 'jours'; n: number; depart: DateCivile }
  /** Toutes les N semaines ; la paie aux deux semaines est n = 2. */
  | { type: 'semaines'; n: number; depart: DateCivile }
  /** Tous les N mois : mensuelle (1), aux 2, 3 ou 6 mois, ou personnalisée. */
  | { type: 'mois'; n: number; depart: DateCivile }
  /** Semestrielle : identique à tous les 6 mois (Q4). */
  | { type: 'semestrielle'; depart: DateCivile }
  /**
   * Deux fois par mois, à deux jours fixes (31 = dernier jour du mois).
   * Le premier jour doit être au plus 27, pour que les deux dates restent
   * distinctes même en février.
   */
  | { type: 'deuxFoisParMois'; jours: readonly [number, number]; depart: DateCivile }
  /** Annuelle (1) ou tous les X ans. */
  | { type: 'annees'; n: number; depart: DateCivile }
  /** À chaque paie. */
  | { type: 'chaquePaie' }
  /** À la 1re ou à la 2e paie du mois, selon l'ordre chronologique réel (A8). */
  | { type: 'rangPaie'; rang: 1 | 2 };

export class ErreurFrequence extends Error {}

function verifierN(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new ErreurFrequence(`L'intervalle doit être un nombre entier d'au moins 1 (reçu : ${n}).`);
  }
  return n;
}

/**
 * Rang de chaque paie dans son mois civil : 1, 2, et 3 pour un mois à trois paies.
 * La liste doit contenir toutes les paies des mois concernés.
 */
export function rangsDesPaies(paies: readonly DateCivile[]): Map<DateCivile, number> {
  const rangs = new Map<DateCivile, number>();
  const triees = [...paies].sort();
  let moisCourant = '';
  let rang = 0;
  for (const p of triees) {
    const mois = p.slice(0, 7);
    rang = mois === moisCourant ? rang + 1 : 1;
    moisCourant = mois;
    rangs.set(p, rang);
  }
  return rangs;
}

function parJours(depart: DateCivile, pas: number, debut: DateCivile, fin: DateCivile): DateCivile[] {
  const resultat: DateCivile[] = [];
  const ecart = ecartEnJours(depart, debut);
  let k = ecart > 0 ? Math.ceil(ecart / pas) : 0;
  for (;;) {
    const d = ajouterJours(depart, k * pas);
    if (d > fin) break;
    if (d >= debut) resultat.push(d);
    k += 1;
  }
  return resultat;
}

function parMois(depart: DateCivile, pas: number, debut: DateCivile, fin: DateCivile): DateCivile[] {
  const resultat: DateCivile[] = [];
  const dep = parties(depart);
  const deb = parties(debut);
  const moisEcoules = (deb.annee - dep.annee) * 12 + (deb.mois - dep.mois);
  let k = Math.max(0, Math.floor(moisEcoules / pas) - 1);
  for (;;) {
    const d = ajouterMois(depart, k * pas, dep.jour);
    if (d > fin) break;
    if (d >= debut) resultat.push(d);
    k += 1;
  }
  return resultat;
}

function deuxFoisParMois(
  jours: readonly [number, number],
  depart: DateCivile,
  debut: DateCivile,
  fin: DateCivile,
): DateCivile[] {
  const [j1, j2] = jours;
  if (!Number.isInteger(j1) || !Number.isInteger(j2) || j1 < 1 || j1 > 27 || j2 <= j1 || j2 > 31) {
    throw new ErreurFrequence(
      'Deux fois par mois : le premier jour doit être entre 1 et 27, et le second après le premier (31 = dernier jour).',
    );
  }
  const resultat: DateCivile[] = [];
  const point = parties(depart > debut ? depart : debut);
  // Premier jour du mois où commencer ; chaque date est recalculée à partir
  // de son jour visé, ce qui évite tout glissement.
  for (let mois = composer(point.annee, point.mois, 1); mois <= fin; mois = ajouterMois(mois, 1, 1)) {
    for (const j of [j1, j2]) {
      const date = ajouterMois(mois, 0, j);
      if (date >= depart && date >= debut && date <= fin) resultat.push(date);
    }
  }
  return resultat;
}

/**
 * Toutes les dates d'une fréquence entre `debut` et `fin` inclus.
 * Les fréquences liées à la paie exigent la liste des dates de paie.
 */
export function datesDe(
  f: Frequence,
  debut: DateCivile,
  fin: DateCivile,
  paies?: readonly DateCivile[],
): DateCivile[] {
  if (debut > fin) return [];
  switch (f.type) {
    case 'ponctuelle':
      return f.date >= debut && f.date <= fin ? [f.date] : [];
    case 'jours':
      return parJours(f.depart, verifierN(f.n), debut, fin);
    case 'semaines':
      return parJours(f.depart, verifierN(f.n) * 7, debut, fin);
    case 'mois':
      return parMois(f.depart, verifierN(f.n), debut, fin);
    case 'semestrielle':
      return parMois(f.depart, 6, debut, fin);
    case 'deuxFoisParMois':
      return deuxFoisParMois(f.jours, f.depart, debut, fin);
    case 'annees':
      return parMois(f.depart, verifierN(f.n) * 12, debut, fin);
    case 'chaquePaie':
    case 'rangPaie': {
      if (!paies) {
        throw new ErreurFrequence('Cette fréquence dépend de la paie : le calendrier de paie est nécessaire.');
      }
      const dansPeriode = [...paies].sort().filter((p) => p >= debut && p <= fin);
      if (f.type === 'chaquePaie') return dansPeriode;
      const rangs = rangsDesPaies(paies);
      return dansPeriode.filter((p) => rangs.get(p) === f.rang);
    }
  }
}
