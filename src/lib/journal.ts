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

/** Regroupe des entrées déjà triées (plus récentes d'abord) par jour local. */
export function grouperParJour(entrees: readonly EntreePresentee[], jour: DateCivile): JourJournal[] {
  const jours: JourJournal[] = [];
  for (const e of entrees) {
    const dernier = jours.at(-1);
    if (dernier && dernier.date === e.date) dernier.entrees.push(e);
    else jours.push({ date: e.date, titre: titreJour(e.date, jour), entrees: [e] });
  }
  return jours;
}

/** Accueil : « Aujourd’hui, 22 h 46 », « Hier, 9 h 05 », « 9 nov., 8 h 12 ». */
export function momentCourt(e: EntreePresentee, jour: DateCivile): string {
  const quand = e.date === jour ? 'Aujourd’hui' : e.date === ajouterJours(jour, -1) ? 'Hier' : e.date.slice(0, 4) === jour.slice(0, 4) ? formaterDateCourte(e.date) : `${formaterDateCourte(e.date)} ${e.date.slice(0, 4)}`;
  return `${quand}, ${e.heure}`;
}
