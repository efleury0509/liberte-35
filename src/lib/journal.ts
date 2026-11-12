// Accueil et journal (0.16.0) : le journal enregistré, mis en mots pour
// l'œil. Affichage seulement : l'entrée enregistrée n'est jamais modifiée,
// et un texte qui ne suit pas le format attendu est montré tel quel.

import type { EntreeJournalLue } from './plateforme';
import { partiesLocales, type PartiesLocales } from '../actions/sauvegardes';
import { ajouterJours, composer, formaterDateCourte, formaterDateLongue, type DateCivile } from '../noyau/dates';

/** Filtres de l'onglet Journal : libellé du menu → sections enregistrées. */
export const FILTRES_JOURNAL = [
  { id: 'toutes', libelle: 'Toutes', sections: [] as string[] },
  { id: 'paies', libelle: 'Mes paies', sections: ['Mes paies'] },
  { id: 'depenses', libelle: 'Dépenses', sections: ['Dépenses à prévoir'] },
  { id: 'epargne', libelle: 'Épargne', sections: ['Mon épargne'] },
  { id: 'dettes', libelle: 'Dettes', sections: ['Mes dettes'] },
  { id: 'parametres', libelle: 'Paramètres', sections: ['Paramètres'] },
] as const;
export type IdFiltreJournal = (typeof FILTRES_JOURNAL)[number]['id'];

const NOMS_SECTIONS: Record<string, string> = {
  'Mes paies': 'Mes paies',
  'Dépenses à prévoir': 'Dépenses',
  'Mon épargne': 'Épargne',
  'Mes dettes': 'Dettes',
  Paramètres: 'Paramètres',
};

/** Le nom de la section tel qu'il apparaît dans le menu. */
export function libelleSection(section: string): string {
  return NOMS_SECTIONS[section] ?? section;
}

/** « 2026-06-18 » → « 18 juin 2026 » ; le reste du texte ne change pas. */
export function datesLisibles(texte: string): string {
  return texte.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (brut, a: string, m: string, j: string) => {
    try {
      return `${formaterDateCourte(composer(Number(a), Number(m), Number(j)))} ${a}`;
    } catch {
      return brut;
    }
  });
}

const heureEcrite = (h: number, m: number) => `${h} h ${String(m).padStart(2, '0')}`;
const majuscule = (t: string) => (t ? t[0]!.toLocaleUpperCase('fr-CA') + t.slice(1) : t);

export interface EntreePresentee {
  id: number;
  /** Jour local du changement. */
  date: DateCivile;
  heure: string;
  section: string;
  marque: 'annulation' | 'restauration' | null;
  titre: string;
  /** « avant → après », « après » ou « avant → retiré » ; null sans valeur. */
  detail: string | null;
  motif: string | null;
  /** L'entrée telle qu'enregistrée, pour qui veut la voir. */
  brute: EntreeJournalLue;
}

const PREFIXE_ANNULATION = 'annulation — ';

export function presenterEntree(e: EntreeJournalLue, local: PartiesLocales = partiesLocales): EntreePresentee {
  const p = local(e.horodatage);
  const annulation = e.champ.startsWith(PREFIXE_ANNULATION);
  const champ = annulation ? e.champ.slice(PREFIXE_ANNULATION.length) : e.champ;
  const restauration = e.section === 'Paramètres' && e.objet === 'Sauvegardes' && e.champ === 'restauration';
  const avant = e.ancienneValeur === null ? null : datesLisibles(e.ancienneValeur);
  const apres = e.nouvelleValeur === null ? null : datesLisibles(e.nouvelleValeur);
  const detail = avant !== null && apres !== null ? `${avant} → ${apres}` : apres !== null ? apres : avant !== null ? `${avant} → retiré` : null;
  return {
    id: e.id,
    date: p.date,
    heure: heureEcrite(p.heure, p.minute),
    section: libelleSection(e.section),
    marque: annulation ? 'annulation' : restauration ? 'restauration' : null,
    titre: `${datesLisibles(e.objet)} — ${datesLisibles(champ)}`,
    detail,
    motif: e.motif === null ? null : datesLisibles(e.motif),
    brute: e,
  };
}

/** « Aujourd’hui — mercredi 11 novembre », « Hier — … », « Lundi 9 novembre 2026 ». */
export function titreJour(date: DateCivile, jour: DateCivile): string {
  const sansAnnee = formaterDateLongue(date).replace(/ \d{4}$/, '');
  if (date === jour) return `Aujourd’hui — ${sansAnnee}`;
  if (date === ajouterJours(jour, -1)) return `Hier — ${sansAnnee}`;
  return majuscule(formaterDateLongue(date));
}

export interface JourJournal {
  date: DateCivile;
  titre: string;
  entrees: EntreePresentee[];
}

/** Regroupe des entrées déjà triées (plus récentes d'abord) par jour local.
 * `precedente` : jour de la dernière entrée de la page d'avant ; si la page
 * commence par ce même jour, son titre porte « (suite) ». */
export function grouperParJour(entrees: readonly EntreePresentee[], jour: DateCivile, precedente: DateCivile | null = null): JourJournal[] {
  const jours: JourJournal[] = [];
  for (const e of entrees) {
    const dernier = jours.at(-1);
    if (dernier && dernier.date === e.date) dernier.entrees.push(e);
    else {
      const suite = jours.length === 0 && precedente === e.date;
      jours.push({ date: e.date, titre: titreJour(e.date, jour) + (suite ? ' (suite)' : ''), entrees: [e] });
    }
  }
  return jours;
}

// --- Pages et périodes (0.16.0, deuxième temps) ---

export const TAILLE_PAGE_JOURNAL = 50;

export const MOIS_JOURNAL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'] as const;

/** Instant (ms) du minuit local d'un jour ; `mois0` de 0 à 12 (12 = janvier suivant). */
export type MinuitLocal = (annee: number, mois0: number, jour: number) => number;
const minuitDuSysteme: MinuitLocal = (a, m, j) => new Date(a, m, j).getTime();
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19) + 'Z';

/** Bornes d'une année (ou d'un de ses mois, 1 à 12) en heure locale, traduites
 * en heure universelle : début compris, fin exclue. Les changements d'heure
 * sont pris en compte par le système. */
export function bornesPeriode(annee: number, mois: number | null, minuit: MinuitLocal = minuitDuSysteme): { debut: string; fin: string } {
  if (mois === null) return { debut: iso(minuit(annee, 0, 1)), fin: iso(minuit(annee + 1, 0, 1)) };
  return { debut: iso(minuit(annee, mois - 1, 1)), fin: iso(minuit(annee, mois, 1)) };
}

/** Années à vérifier : de l'année locale de la plus ancienne entrée à aujourd'hui. */
export function anneesCandidates(plusAncien: string | null, jour: DateCivile, local: PartiesLocales = partiesLocales): number[] {
  if (plusAncien === null) return [];
  const debut = Number(local(plusAncien).date.slice(0, 4));
  const fin = Math.max(debut, Number(jour.slice(0, 4)));
  const annees: number[] = [];
  for (let a = fin; a >= debut; a--) annees.push(a);
  return annees;
}

/** Nombre de pages (au moins 1). */
export const nombrePages = (total: number, taille = TAILLE_PAGE_JOURNAL) => Math.max(1, Math.ceil(total / taille));

/** « Page 2 sur 2 · changements 51 à 94 sur 94 ». */
export function texteCompte(page: number, total: number, taille = TAILLE_PAGE_JOURNAL): string {
  if (total === 0) return 'Aucun changement';
  const de = page * taille + 1;
  const a = Math.min(total, (page + 1) * taille);
  const changements = total === 1 ? '1 changement' : de === a ? `changement ${de} sur ${total}` : `changements ${de} à ${a} sur ${total}`;
  return `Page ${page + 1} sur ${nombrePages(total, taille)} · ${changements}`;
}

/** Accueil : « Aujourd’hui, 22 h 46 », « Hier, 9 h 05 », « 9 nov., 8 h 12 ». */
export function momentCourt(e: EntreePresentee, jour: DateCivile): string {
  const quand = e.date === jour ? 'Aujourd’hui' : e.date === ajouterJours(jour, -1) ? 'Hier' : e.date.slice(0, 4) === jour.slice(0, 4) ? formaterDateCourte(e.date) : `${formaterDateCourte(e.date)} ${e.date.slice(0, 4)}`;
  return `${quand}, ${e.heure}`;
}
