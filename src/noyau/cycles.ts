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
// - une dépense ponctuelle rattachée à un cycle choisi suit la paie de ce
//   cycle, identifiée par sa date d'origine (D7).
//
// Le disponible est un résultat de PLANIFICATION : paie + autres revenus
// certains − sorties du cycle. Aucun report d'un cycle à l'autre. Si un
// montant compté manque, le disponible reste inconnu (null) au lieu d'être
// inventé (A6, Q15). Un revenu incertain est affiché mais jamais compté tant
// que sa réception n'est pas confirmée (A3). Un montant estimé compté rend le
// disponible « Estimation » ; une enveloppe, montant choisi, non (Q14).
// À cette étape, toute ligne est « Prévu » ; les confirmations viennent à l'étape 5.

import { ajouterJours, type DateCivile } from './dates';
import { additionner, type Cents } from './montants';
import { paiesEntre, type ExceptionPaie, type Paie, type ProfilPaie } from './paie';
import { montantEnVigueur, occurrences, periodesDe, type Regle } from './regles';

export type Nature = 'revenu' | 'depense';
export type Genre = 'fixe' | 'enveloppe';

export interface ElementPlanifie {
  id: string;
  libelle: string;
  regle: Regle;
  /** Par défaut : dépense. */
  nature?: Nature;
  /** Dépense fixe (par défaut) ou enveloppe variable, jamais réconciliée. */
  genre?: Genre;
  /** Revenu incertain : visible, jamais compté avant sa réception confirmée (A3). */
  incertain?: boolean;
  /** Montant estimé plutôt que connu avec précision. */
  estimation?: boolean;
  /** Dépense ponctuelle rattachée au cycle de cette paie (date d'origine). */
  cyclePaie?: DateCivile;
}

/**
 * Ajustement d'UNE occurrence (étape 4b, A) : la règle ne change pas.
 * L'occurrence est identifiée par son élément et sa date d'origine :
 * l'échéance d'origine pour un élément daté, la date d'origine de la paie
 * pour un élément lié à la paie ou rattaché à un cycle choisi. Cette clé ne
 * bouge jamais, même si la paie ou l'échéance est déplacée.
 */
export interface AjustementOccurrence {
  elementId: string;
  origine: DateCivile;
  /** Montant pour cette fois seulement. */
  montant?: Cents;
  /** Nouvelle échéance (élément daté) : rattachée selon A1, sauf paie choisie. */
  date?: DateCivile;
  /** Payée avec cette paie (date d'origine), échéance inchangée. */
  paieOrigine?: DateCivile;
  /** Retirée cette fois-ci : visible, jamais comptée. */
  retire?: boolean;
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
  nature: Nature;
  genre: Genre;
  incertain: boolean;
  estimation: boolean;
  /** Entre dans le disponible ; faux pour un revenu incertain ou une occurrence retirée. */
  compte: boolean;
  /** Date d'origine : identité stable de l'occurrence (avec l'élément). */
  origine: DateCivile;
  /** L'occurrence porte un ajustement. */
  ajuste: boolean;
  /** Retirée cette fois-ci. */
  retiree: boolean;
}

export type Signal = 'negatif' | 'seuil' | null;

export interface Cycle {
  paie: Paie;
  debut: DateCivile;
  fin: DateCivile;
  lignes: Ligne[];
  /** Autres revenus comptés ; null si l'un d'eux n'a pas de montant. */
  autresRevenus: Cents | null;
  /** Paie + autres revenus comptés ; null si un montant manque. */
  revenus: Cents | null;
  /** Total des sorties ; null si un montant manque. */
  sorties: Cents | null;
  /** Disponible planifié ; null si un montant compté manque. */
  disponible: Cents | null;
  /** Le disponible inclut au moins un montant estimé. */
  estimation: boolean;
  /** Revenus incertains connus, affichés mais non comptés. */
  nonComptes: Cents;
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
  ajustements?: readonly AjustementOccurrence[];
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
    autresRevenus: null,
    revenus: null,
    sorties: null,
    disponible: null,
    estimation: false,
    nonComptes: 0,
    signal: null,
  }));
  if (cycles.length === 0) return { cycles, avantPremierCycle: [], reglesSansOccurrence: [] };

  const parOrigine = new Map(cycles.map((c) => [c.paie.dateOrigine, c] as const));
  const finPeriode = cycles.at(-1)?.fin ?? fin;
  const avantPremierCycle: Ligne[] = [];
  const reglesSansOccurrence: string[] = [];

  // On génère les occurrences un peu au-delà de la période : un ajustement
  // peut y faire entrer (ou en faire sortir) une occurrence voisine.
  const debutGen = ajouterJours(debut, -62);
  const finGen = ajouterJours(finPeriode, 62);
  // Pour le rattachement des dates fixes : toutes les paies réelles connues,
  // y compris celles d'avant la période. On part un peu avant la date de
  // départ : la toute première paie peut avoir été avancée par une exception.
  const paiesReelles = paiesEntre(entree.profil, exceptions, ajouterJours(entree.profil.frequence.depart, -62), finGen);
  const premiereDuProfil = paiesReelles[0]?.date ?? entree.profil.frequence.depart;
  // Dates d'origine des paies de mois complets : le rang en dépend (Q7).
  const origines = paiesReelles.map((p) => p.dateOrigine);
  const ajustements = indexerAjustements(entree);

  for (const el of elements) {
    let placees = 0;
    for (const occ of occurrencesElement(el, origines, debutGen, finGen)) {
      const a = ajustements.get(cle(el.id, occ.origine));
      const echeance = occ.echeance !== null && a?.date !== undefined ? a.date : occ.echeance;
      const montant = a?.montant !== undefined ? a.montant : occ.montant;
      const l = ligne(el, echeance, montant, a?.paieOrigine !== undefined, occ.origine, a);
      let cible: Cycle | undefined;
      if (a?.paieOrigine !== undefined) {
        cible = parOrigine.get(a.paieOrigine);
      } else if (occ.paie !== null) {
        cible = parOrigine.get(occ.paie);
      } else if (echeance !== null) {
        if (echeance < premiereDuProfil) {
          if (echeance >= debut && echeance <= finPeriode) avantPremierCycle.push(l);
          continue;
        }
        // A1 : dernière paie versée au plus tard le jour de l'échéance.
        const paie = [...paiesReelles].reverse().find((p) => p.date <= echeance);
        cible = paie ? parOrigine.get(paie.dateOrigine) : undefined;
      }
      if (cible) {
        cible.lignes.push(l);
        placees += 1;
      }
    }
    if (el.regle.frequence.type === 'rangPaie' && !el.regle.changements?.length && !el.cyclePaie && placees === 0) {
      reglesSansOccurrence.push(el.id);
    }
  }

  const total = (montants: (Cents | null)[]): Cents | null =>
    montants.every((m): m is Cents => m !== null) ? additionner(0, ...montants) : null;
  for (const c of cycles) {
    const comptees = c.lignes.filter((l) => l.compte);
    c.sorties = total(comptees.filter((l) => l.nature === 'depense').map((l) => l.montant));
    c.autresRevenus = total(comptees.filter((l) => l.nature === 'revenu').map((l) => l.montant));
    c.revenus = c.paie.montant !== null && c.autresRevenus !== null ? c.paie.montant + c.autresRevenus : null;
    c.disponible = c.revenus !== null && c.sorties !== null ? c.revenus - c.sorties : null;
    c.estimation = comptees.some((l) => l.estimation);
    c.nonComptes = additionner(0, ...c.lignes.filter((l) => l.incertain && !l.retiree && l.montant !== null).map((l) => l.montant ?? 0));
    c.signal = signal(c.disponible, seuil);
  }

  return { cycles, avantPremierCycle, reglesSansOccurrence };
}

function ligne(
  el: ElementPlanifie,
  echeance: DateCivile | null,
  montant: Cents | null,
  manuel: boolean,
  origine: DateCivile,
  a: AjustementOccurrence | undefined,
): Ligne {
  const nature = el.nature ?? 'depense';
  // Une enveloppe est toujours une dépense ; seul un revenu peut être incertain.
  const genre = nature === 'depense' ? (el.genre ?? 'fixe') : 'fixe';
  const incertain = nature === 'revenu' && el.incertain === true;
  const retiree = a?.retire === true;
  return {
    elementId: el.id,
    libelle: el.libelle,
    echeance,
    montant,
    statut: 'prevu',
    manuel,
    nature,
    genre,
    incertain,
    estimation: el.estimation === true,
    // A3 : un revenu incertain n'est jamais compté, même ajusté.
    compte: !incertain && !retiree,
    origine,
    ajuste: a !== undefined,
    retiree,
  };
}

const cle = (elementId: string, origine: DateCivile) => `${elementId}|${origine}`;

function indexerAjustements(entree: EntreePlan): Map<string, AjustementOccurrence> {
  const m = new Map<string, AjustementOccurrence>();
  // Rattachements manuels de l'étape 3 : un ajustement « payée avec cette paie ».
  for (const r of entree.rattachementsManuels ?? []) {
    m.set(cle(r.elementId, r.echeance), { elementId: r.elementId, origine: r.echeance, paieOrigine: r.paieOrigine });
  }
  for (const a of entree.ajustements ?? []) m.set(cle(a.elementId, a.origine), a);
  return m;
}

interface OccurrenceBrute {
  origine: DateCivile;
  /** Échéance d'origine ; null pour un élément lié à la paie. */
  echeance: DateCivile | null;
  montant: Cents | null;
  /** Paie (date d'origine) d'un élément lié à la paie ; null pour un élément daté. */
  paie: DateCivile | null;
}

/** Toutes les occurrences d'un élément, période de fréquence par période (B). */
function occurrencesElement(
  el: ElementPlanifie,
  origines: readonly DateCivile[],
  debutGen: DateCivile,
  finGen: DateCivile,
): OccurrenceBrute[] {
  if (el.cyclePaie !== undefined) {
    // D7 : une seule ligne, dans le cycle de la paie choisie (même déplacée).
    return [{ origine: el.cyclePaie, echeance: null, montant: montantEnVigueur(el.regle.montants, el.cyclePaie), paie: el.cyclePaie }];
  }
  const resultat: OccurrenceBrute[] = [];
  for (const p of periodesDe(el.regle)) {
    const regle: Regle = {
      frequence: p.frequence,
      montants: el.regle.montants,
      suspensions: el.regle.suspensions,
      ...(minimum(el.regle.fin ?? null, p.fin) !== null ? { fin: minimum(el.regle.fin ?? null, p.fin)! } : {}),
    };
    const depuis = (d: DateCivile) => (p.debut === null || d >= p.debut ? d : p.debut);
    if (estLieeALaPaie(regle)) {
      if (origines.length === 0) continue;
      for (const o of occurrences(regle, depuis(origines[0]!), origines.at(-1)!, origines)) {
        resultat.push({ origine: o.date, echeance: null, montant: o.montant, paie: o.date });
      }
    } else {
      for (const o of occurrences(regle, depuis(debutGen), finGen)) {
        resultat.push({ origine: o.date, echeance: o.date, montant: o.montant, paie: null });
      }
    }
  }
  return resultat;
}

function minimum(a: DateCivile | null, b: DateCivile | null): DateCivile | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}

/**
 * Ajustements qui ne correspondent plus à aucune occurrence (élément
 * supprimé, date suspendue, fréquence changée…). Ils n'agissent plus ; les
 * actions les nomment avant d'enregistrer, jamais en silence.
 */
export function ajustementsOrphelins(entree: {
  profil: ProfilPaie;
  exceptions?: readonly ExceptionPaie[];
  elements: readonly ElementPlanifie[];
  ajustements: readonly AjustementOccurrence[];
}): AjustementOccurrence[] {
  return entree.ajustements.filter((a) => {
    const el = entree.elements.find((e) => e.id === a.elementId);
    if (!el) return true;
    if (el.cyclePaie !== undefined) return a.origine !== el.cyclePaie;
    const origines = paiesEntre(entree.profil, entree.exceptions ?? [], ajouterJours(a.origine, -70), ajouterJours(a.origine, 70)).map(
      (p) => p.dateOrigine,
    );
    const existe = occurrencesElement(el, origines, ajouterJours(a.origine, -1), ajouterJours(a.origine, 1)).some(
      (o) => o.origine === a.origine,
    );
    return !existe;
  });
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
    const m = new Map<string, { paie: DateCivile; libelle: string; echeance: DateCivile; elementId: string }>();
    for (const c of plan.cycles) {
      for (const l of c.lignes) {
        if (l.echeance) m.set(cle(l.elementId, l.origine), { paie: c.paie.dateOrigine, libelle: l.libelle, echeance: l.echeance, elementId: l.elementId });
      }
    }
    return m;
  };
  const a = position(avant);
  const b = position(apres);
  const changements: ChangementRattachement[] = [];
  for (const [k, { paie, libelle, echeance, elementId }] of a) {
    const nouvelle = b.get(k);
    if (nouvelle && nouvelle.paie !== paie) {
      changements.push({ elementId, libelle, echeance, dePaie: paie, versPaie: nouvelle.paie });
    }
  }
  return changements.sort((x, y) => (x.echeance < y.echeance ? -1 : 1));
}
