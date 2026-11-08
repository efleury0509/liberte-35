// Moteur des cycles (cahier 4.2 à 4.4 ; décisions A1, A8, A9, A11, Q7 à Q9).
//
// Un cycle va du jour de versement d'une paie à la veille du versement
// suivant. Chaque élément planifié y est rattaché :
// - un élément lié à la paie (« à chaque paie », « 1re/2e paie ») suit SA paie,
//   identifiée par sa date d'origine, même si elle est déplacée ;
// - un élément à date fixe va à la dernière paie VERSÉE au plus tard le jour
//   de son échéance (A1), d'après les dates réelles ;
// - un rattachement choisi à la main l'emporte.
//
// Le disponible est un résultat de PLANIFICATION : revenus prévus moins
// sorties prévues du cycle. Aucun report d'un cycle à l'autre. Si un montant
// manque, le disponible reste inconnu (null) au lieu d'être inventé.
// À cette étape, toute ligne est « Prévu » ; les confirmations viennent à l'étape 5.

import { ajouterJours, type DateCivile } from './dates';
import { additionner, type Cents } from './montants';
import { paiesEntre, type ExceptionPaie, type Paie, type ProfilPaie } from './paie';
import { occurrences, type Regle } from './regles';

export interface ElementPlanifie {
  id: string;
  libelle: string;
  regle: Regle;
}

export interface RattachementManuel {
  elementId: string;
  /** Échéance de l'occurrence déplacée. */
  echeance: DateCivile;
  /** Paie choisie, identifiée par sa date d'origine. */
  paieOrigine: DateCivile;
}

export type Statut = 'prevu';

export interface Ligne {
  elementId: string;
  libelle: string;
  /** Échéance pour un élément à date fixe ; null pour un élément lié à la paie. */
  echeance: DateCivile | null;
  montant: Cents | null;
  statut: Statut;
  manuel: boolean;
}

export type Signal = 'negatif' | 'seuil' | null;

export interface Cycle {
  paie: Paie;
  debut: DateCivile;
  fin: DateCivile;
  lignes: Ligne[];
  /** Total des sorties ; null si un montant manque. */
  sorties: Cents | null;
  /** Disponible planifié ; null si la paie ou une sortie n'a pas de montant. */
  disponible: Cents | null;
  signal: Signal;
}

export interface Plan {
  cycles: Cycle[];
  /** Éléments dus avant la toute première paie du profil (Q9). */
  avantPremierCycle: Ligne[];
  /** Règles « 1re/2e paie » qui ne s'appliquent à aucune paie de la période (F5). */
  reglesSansOccurrence: string[];
}

export interface EntreePlan {
  profil: ProfilPaie;
  exceptions?: readonly ExceptionPaie[];
  elements?: readonly ElementPlanifie[];
  rattachementsManuels?: readonly RattachementManuel[];
  /** Seuil d'attention (A9) ; null ou absent : seul un disponible négatif est signalé. */
  seuil?: Cents | null;
  /** Date du jour ; n'influence aucun montant ni aucun statut à cette étape. */
  aujourdhui?: DateCivile;
}

const estLieeALaPaie = (r: Regle) => r.frequence.type === 'chaquePaie' || r.frequence.type === 'rangPaie';

/** Plan des cycles dont la paie est VERSÉE entre `debut` et `fin` inclus. */
export function planifier(entree: EntreePlan, debut: DateCivile, fin: DateCivile): Plan {
  const exceptions = entree.exceptions ?? [];
  const elements = entree.elements ?? [];
  const seuil = entree.seuil ?? null;

  // Paies de la période, plus la suivante pour connaître la fin du dernier cycle.
  const etendues = paiesEntre(entree.profil, exceptions, debut, ajouterJours(fin, 62));
  const paies = etendues.filter((p) => p.date <= fin);
  const suivante = etendues[paies.length];

  const cycles: Cycle[] = paies.map((paie, i) => ({
    paie,
    debut: paie.date,
    fin: ajouterJours(paies[i + 1]?.date ?? suivante?.date ?? ajouterJours(paie.date, 1), -1),
    lignes: [],
    sorties: null,
    disponible: null,
    signal: null,
  }));
  if (cycles.length === 0) return { cycles, avantPremierCycle: [], reglesSansOccurrence: [] };

  const parOrigine = new Map(cycles.map((c) => [c.paie.dateOrigine, c] as const));
  const finPeriode = cycles.at(-1)?.fin ?? fin;
  const avantPremierCycle: Ligne[] = [];
  const reglesSansOccurrence: string[] = [];

  // Pour le rattachement des dates fixes : toutes les paies réelles connues
  // jusqu'à la fin de la période, y compris celles d'avant la période. On
  // part un peu avant la date de départ : la toute première paie peut avoir
  // été avancée par une exception.
  const paiesReelles = paiesEntre(entree.profil, exceptions, ajouterJours(entree.profil.frequence.depart, -62), finPeriode);
  const premiereDuProfil = paiesReelles[0]?.date ?? entree.profil.frequence.depart;

  for (const el of elements) {
    if (estLieeALaPaie(el.regle)) {
      // Dates d'origine des paies de mois complets : le rang en dépend (Q7).
      const origines = paiesReelles.map((p) => p.dateOrigine);
      const occ = occurrences(el.regle, cycles[0]?.paie.dateOrigine ?? debut, cycles.at(-1)?.paie.dateOrigine ?? fin, origines)
        .filter((o) => parOrigine.has(o.date));
      if (el.regle.frequence.type === 'rangPaie' && occ.length === 0) reglesSansOccurrence.push(el.id);
      for (const o of occ) {
        parOrigine.get(o.date)?.lignes.push(ligne(el, null, o.montant, false));
      }
      continue;
    }

    for (const o of occurrences(el.regle, debut, finPeriode)) {
      const manuel = entree.rattachementsManuels?.find((r) => r.elementId === el.id && r.echeance === o.date);
      const cibleManuelle = manuel ? parOrigine.get(manuel.paieOrigine) : undefined;
      if (cibleManuelle) {
        cibleManuelle.lignes.push(ligne(el, o.date, o.montant, true));
        continue;
      }
      if (o.date < premiereDuProfil) {
        avantPremierCycle.push(ligne(el, o.date, o.montant, false));
        continue;
      }
      // A1 : dernière paie versée au plus tard le jour de l'échéance.
      const paie = [...paiesReelles].reverse().find((p) => p.date <= o.date);
      const cible = paie ? parOrigine.get(paie.dateOrigine) : undefined;
      cible?.lignes.push(ligne(el, o.date, o.montant, false));
    }
  }

  for (const c of cycles) {
    const montants = c.lignes.map((l) => l.montant);
    c.sorties = montants.every((m): m is Cents => m !== null) ? additionner(...montants) : null;
    c.disponible = c.paie.montant !== null && c.sorties !== null ? c.paie.montant - c.sorties : null;
    c.signal = signal(c.disponible, seuil);
  }

  return { cycles, avantPremierCycle, reglesSansOccurrence };
}

function ligne(el: ElementPlanifie, echeance: DateCivile | null, montant: Cents | null, manuel: boolean): Ligne {
  return { elementId: el.id, libelle: el.libelle, echeance, montant, statut: 'prevu', manuel };
}

/** A9 et Q8 : négatif, ou strictement sous le seuil. */
export function signal(disponible: Cents | null, seuil: Cents | null): Signal {
  if (disponible === null) return null;
  if (disponible < 0) return 'negatif';
  if (seuil !== null && disponible < seuil) return 'seuil';
  return null;
}

export interface ChangementRattachement {
  elementId: string;
  libelle: string;
  echeance: DateCivile;
  /** Paies identifiées par leur date d'origine. */
  dePaie: DateCivile;
  versPaie: DateCivile;
}

/**
 * Liste les éléments à date fixe qui changeraient de paie entre deux plans,
 * pour les montrer avant d'enregistrer un changement (A11, 14.2).
 */
export function comparerRattachements(avant: Plan, apres: Plan): ChangementRattachement[] {
  const position = (plan: Plan) => {
    const m = new Map<string, { paie: DateCivile; libelle: string }>();
    for (const c of plan.cycles) {
      for (const l of c.lignes) {
        if (l.echeance) m.set(`${l.elementId}|${l.echeance}`, { paie: c.paie.dateOrigine, libelle: l.libelle });
      }
    }
    return m;
  };
  const a = position(avant);
  const b = position(apres);
  const changements: ChangementRattachement[] = [];
  for (const [cle, { paie, libelle }] of a) {
    const nouvelle = b.get(cle);
    if (nouvelle && nouvelle.paie !== paie) {
      const [elementId = '', echeance = ''] = cle.split('|');
      changements.push({ elementId, libelle, echeance: echeance as DateCivile, dePaie: paie, versPaie: nouvelle.paie });
    }
  }
  return changements.sort((x, y) => (x.echeance < y.echeance ? -1 : 1));
}
