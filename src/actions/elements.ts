// Actions de l'étape 4 : autres revenus, dépenses fixes, enveloppes et
// dépenses ponctuelles (cahier 4.2, 4.5, 4.6 ; décisions A3, Q12 à Q16).
//
// Comme pour la paie, chaque changement est d'abord PROPOSÉ : anciennes et
// nouvelles valeurs, conséquences sur les cycles (14.2), puis enregistré
// seulement après confirmation, avec ses entrées de journal (A10).
// Modifier, suspendre et terminer gardent le passé : seule la règle change
// « à partir du » (4.5-c, 14.3).

import { planifier, type Cycle, type ElementPlanifie } from '../noyau/cycles';
import { ajouterJours, formaterDateCourte, formaterDateLongue, type DateCivile } from '../noyau/dates';
import { formaterMontant } from '../noyau/montants';
import type { ProfilPaie } from '../noyau/paie';
import { montantEnVigueur } from '../noyau/regles';
import type { ChangementPaie, DonneesPaie, ElementStocke, EntreeJournal } from '../lib/plateforme';
import { versElementNoyau } from './elementsStockes';
import {
  A_COMPLETER,
  ErreurSaisie,
  SECTION,
  lireDate,
  lireMontant,
  montantOuACompleter,
  versNoyau,
  type LigneApercu,
  type Proposition,
} from './paie';

export { versElementNoyau } from './elementsStockes';

// ---------------------------------------------------------------------------
// Fréquences offertes

export type Quand =
  | 'unique'
  | 'cycle'
  | 'semaine'
  | 'deuxSemaines'
  | 'mois'
  | 'deuxMois'
  | 'troisMois'
  | 'sixMois'
  | 'annee'
  | 'chaquePaie'
  | 'paie1'
  | 'paie2';

export const LIBELLES_QUAND: Record<Quand, string> = {
  unique: 'Une seule fois',
  cycle: 'Une seule fois, dans un cycle choisi',
  semaine: 'Chaque semaine',
  deuxSemaines: 'Aux deux semaines',
  mois: 'Chaque mois',
  deuxMois: 'Aux deux mois',
  troisMois: 'Aux trois mois',
  sixMois: 'Aux six mois',
  annee: 'Chaque année',
  chaquePaie: 'À chaque paie',
  paie1: '1re paie du mois',
  paie2: '2e paie du mois',
};

/** Q12 : un revenu suit une date, ou « à chaque paie » ; jamais un rang de paie. */
export const QUAND_REVENU: readonly Quand[] = ['unique', 'semaine', 'deuxSemaines', 'mois', 'deuxMois', 'troisMois', 'sixMois', 'annee', 'chaquePaie'];
export const QUAND_DEPENSE: readonly Quand[] = Object.keys(LIBELLES_QUAND) as Quand[];

/** Fréquences sans date : elles suivent les paies du profil principal. */
export const quandSansDate = (q: Quand) => q === 'chaquePaie' || q === 'paie1' || q === 'paie2' || q === 'cycle';

// ---------------------------------------------------------------------------
// Descriptions

const NOMBRES: Record<number, string> = { 2: 'deux', 3: 'trois', 6: 'six' };

export function decrireQuand(e: Pick<ElementStocke, 'frequence' | 'cyclePaie'>): string {
  const f = e.frequence;
  const depart = typeof f['depart'] === 'string' ? `, à partir du ${formaterDateLongue(f['depart'] as DateCivile)}` : '';
  const n = typeof f['n'] === 'number' ? f['n'] : 1;
  if (e.cyclePaie) return `Une seule fois, dans le cycle de la paie du ${formaterDateCourte(e.cyclePaie as DateCivile)}`;
  switch (f.type) {
    case 'ponctuelle':
      return `Une seule fois, le ${formaterDateLongue(f['date'] as DateCivile)}`;
    case 'semaines':
      return (n === 1 ? 'Chaque semaine' : n === 2 ? 'Aux deux semaines' : `Toutes les ${n} semaines`) + depart;
    case 'mois':
      return (n === 1 ? 'Chaque mois' : NOMBRES[n] ? `Aux ${NOMBRES[n]} mois` : `Tous les ${n} mois`) + depart;
    case 'annees':
      return (n === 1 ? 'Chaque année' : `Tous les ${n} ans`) + depart;
    case 'jours':
      return `Tous les ${n} jours` + depart;
    case 'chaquePaie':
      return 'À chaque paie';
    case 'rangPaie':
      return f['rang'] === 1 ? '1re paie du mois' : '2e paie du mois';
    default:
      return 'Fréquence personnalisée' + depart;
  }
}

const nomObjet = (e: Pick<ElementStocke, 'nature' | 'libelle'>) => `${e.nature === 'revenu' ? 'Revenu' : 'Dépense'} « ${e.libelle} »`;

function decrireMontant(montant: number | null, estimation: boolean): string {
  if (montant === null) return A_COMPLETER;
  return formaterMontant(montant) + (estimation ? ' (estimation)' : '');
}

function decrireSuspension(debut: DateCivile, fin: DateCivile): string {
  return `du ${formaterDateLongue(debut)} au ${formaterDateLongue(fin)}`;
}

function entree(objet: string, champ: string, avant: string | null, apres: string | null): EntreeJournal {
  return { section: SECTION, objet, champ, ancienneValeur: avant, nouvelleValeur: apres, motif: null };
}

// ---------------------------------------------------------------------------
// Horizon affiché et conséquences sur les cycles

export const NOMBRE_CYCLES = 13;

/** Cycles affichés : du cycle actuel aux 12 suivants. */
export function cyclesAffiches(
  profil: ProfilPaie,
  entree: Omit<Parameters<typeof planifier>[0], 'profil'>,
  jour: DateCivile,
): { plan: ReturnType<typeof planifier>; cycles: Cycle[]; courant: DateCivile | null } {
  const depart = profil.frequence.depart;
  const debut = depart > jour ? depart : ajouterJours(jour, -45);
  const plan = planifier({ ...entree, profil }, debut, ajouterJours(debut, 260));
  const i = Math.max(0, plan.cycles.findIndex((c) => c.fin >= jour));
  const cycles = plan.cycles.slice(i, i + NOMBRE_CYCLES);
  const actuel = plan.cycles.find((c) => c.debut <= jour && c.fin >= jour);
  return { plan, cycles, courant: actuel?.paie.dateOrigine ?? null };
}

const MAX_CYCLES_MONTRES = 4;

function consequencesCycles(d: DonneesPaie, apres: readonly ElementStocke[], jour: DateCivile): string[] {
  const noyau = versNoyau(d);
  if (!noyau.profil) return [];
  const calcul = (elements: readonly ElementPlanifie[]) =>
    cyclesAffiches(noyau.profil!, { exceptions: noyau.exceptions, elements, seuil: noyau.seuil }, jour).cycles;
  const avantCycles = calcul(noyau.elements);
  const apresCycles = calcul(apres.map(versElementNoyau));
  const lignes: string[] = [];
  for (const a of avantCycles) {
    const b = apresCycles.find((c) => c.paie.dateOrigine === a.paie.dateOrigine);
    if (!b || a.disponible === b.disponible) continue;
    lignes.push(
      `Cycle du ${formaterDateCourte(a.paie.date)} : disponible planifié ${montantOuACompleter(a.disponible)} → ${montantOuACompleter(b.disponible)}`,
    );
  }
  if (lignes.length === 0 && avantCycles.some((c) => c.paie.montant === null)) {
    return ['Le disponible planifié reste « À compléter » tant que le salaire net n’est pas indiqué.'];
  }
  if (lignes.length <= MAX_CYCLES_MONTRES) return lignes;
  const reste = lignes.length - MAX_CYCLES_MONTRES;
  return [...lignes.slice(0, MAX_CYCLES_MONTRES), reste === 1 ? 'Et 1 autre cycle.' : `Et ${reste} autres cycles.`];
}

function trouver(d: DonneesPaie, id: string): ElementStocke {
  const e = (d.elements ?? []).find((x) => x.id === id);
  if (!e) throw new ErreurSaisie('Ce revenu ou cette dépense n’existe plus.');
  return e;
}

const remplacer = (d: DonneesPaie, e: ElementStocke) => (d.elements ?? []).map((x) => (x.id === e.id ? e : x));

function exigerProfil(d: DonneesPaie): ProfilPaie {
  const p = versNoyau(d).profil;
  if (!p) throw new ErreurSaisie('Crée d’abord le profil de paie.');
  return p;
}

// ---------------------------------------------------------------------------
// Ajouter

export interface SaisieElement {
  nature: 'revenu' | 'depense';
  libelle: string;
  genre: 'fixe' | 'enveloppe';
  /** En dollars ; vide : à compléter. */
  montant: string;
  estimation: boolean;
  incertain: boolean;
  quand: Quand;
  /** Date unique ou première date ; inutile pour les fréquences liées à la paie. */
  date: string;
  /** Date d'origine de la paie du cycle choisi (quand = 'cycle'). */
  cyclePaie: string;
}

function construireFrequence(q: Quand, date: DateCivile | null, cyclePaie: DateCivile | null): ElementStocke['frequence'] {
  const depuis = (type: string, n: number) => ({ type, n, depart: date as string });
  switch (q) {
    case 'unique':
      return { type: 'ponctuelle', date: date as string };
    case 'cycle':
      return { type: 'ponctuelle', date: cyclePaie as string };
    case 'semaine':
      return depuis('semaines', 1);
    case 'deuxSemaines':
      return depuis('semaines', 2);
    case 'mois':
      return depuis('mois', 1);
    case 'deuxMois':
      return depuis('mois', 2);
    case 'troisMois':
      return depuis('mois', 3);
    case 'sixMois':
      return depuis('mois', 6);
    case 'annee':
      return depuis('annees', 1);
    case 'chaquePaie':
      return { type: 'chaquePaie' };
    case 'paie1':
      return { type: 'rangPaie', rang: 1 };
    case 'paie2':
      return { type: 'rangPaie', rang: 2 };
  }
}

export function proposerAjout(d: DonneesPaie, s: SaisieElement, jour: DateCivile): Proposition {
  const profil = exigerProfil(d);
  const libelle = s.libelle.trim();
  if (libelle === '') throw new ErreurSaisie('Donne un nom à ce revenu ou à cette dépense.');
  const revenu = s.nature === 'revenu';
  if (revenu && !QUAND_REVENU.includes(s.quand)) {
    throw new ErreurSaisie('Un revenu suit une date, ou « À chaque paie ».');
  }
  const montant = lireMontant(s.montant, 'Montant');
  let date: DateCivile | null = null;
  let cyclePaie: DateCivile | null = null;
  if (s.quand === 'cycle') {
    if (s.cyclePaie.trim() === '') throw new ErreurSaisie('Choisis le cycle de cette dépense.');
    cyclePaie = lireDate(s.cyclePaie, 'Cycle');
  } else if (!quandSansDate(s.quand)) {
    if (s.date.trim() === '') throw new ErreurSaisie('Indique la date (ou la première date).');
    date = lireDate(s.date, 'Date');
  }
  // Un montant lié à la paie vaut dès la première paie du profil.
  const aPartirDu = date ?? cyclePaie ?? profil.frequence.depart;
  const element: ElementStocke = {
    id: crypto.randomUUID(),
    libelle,
    nature: s.nature,
    genre: revenu ? 'fixe' : s.genre,
    incertain: revenu && s.incertain,
    estimation: s.estimation,
    frequence: construireFrequence(s.quand, date, cyclePaie),
    montants: montant === null ? [] : [{ aPartirDu, montant }],
    suspensions: [],
    fin: null,
    cyclePaie,
  };

  const lignes: LigneApercu[] = [
    { libelle: 'Nom', avant: '—', apres: libelle },
    { libelle: 'Montant', avant: '—', apres: decrireMontant(montant, element.estimation) },
    { libelle: 'Quand', avant: '—', apres: decrireQuand(element) },
    revenu
      ? { libelle: 'Certitude', avant: '—', apres: element.incertain ? 'Incertain' : 'Certain' }
      : { libelle: 'Genre', avant: '—', apres: element.genre === 'enveloppe' ? 'Enveloppe variable' : 'Dépense fixe' },
  ];
  const consequences = consequencesCycles(d, [...(d.elements ?? []), element], jour);
  if (element.incertain) {
    consequences.push('Revenu incertain : visible dans son cycle, mais hors du disponible planifié tant que sa réception n’est pas confirmée.');
  }
  return {
    titre: revenu ? 'Ajouter un revenu' : 'Ajouter une dépense',
    lignes,
    consequences,
    changements: [{ type: 'definirElement', element }],
    journal: [entree(nomObjet(element), 'création', null, `${decrireMontant(montant, element.estimation)} — ${decrireQuand(element)}`)],
  };
}

// ---------------------------------------------------------------------------
// Modifier le montant à partir d'une date (H1)

export function proposerMontant(d: DonneesPaie, id: string, dateTexte: string, montantTexte: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const date = lireDate(dateTexte, 'À partir du');
  const montant = lireMontant(montantTexte, 'Nouveau montant');
  if (montant === null) throw new ErreurSaisie('Nouveau montant : indique un montant.');
  const actuel = montantEnVigueur(versElementNoyau(e).regle.montants, date);
  if (actuel === montant) throw new ErreurSaisie('Le montant est déjà celui-là à cette date.');
  const modifie: ElementStocke = {
    ...e,
    montants: [...e.montants.filter((m) => m.aPartirDu !== date), { aPartirDu: date, montant }].sort((a, b) =>
      a.aPartirDu < b.aPartirDu ? -1 : 1,
    ),
  };
  const longue = formaterDateLongue(date);
  return {
    titre: `Changer le montant de « ${e.libelle} »`,
    lignes: [{ libelle: `Montant à partir du ${longue}`, avant: montantOuACompleter(actuel), apres: formaterMontant(montant) }],
    consequences: [`Les cycles d’avant le ${longue} ne changent pas.`, ...consequencesCycles(d, remplacer(d, modifie), jour)],
    changements: [{ type: 'definirElement', element: modifie }],
    journal: [entree(nomObjet(e), `montant à partir du ${date}`, montantOuACompleter(actuel), formaterMontant(montant))],
  };
}

// ---------------------------------------------------------------------------
// Suspendre (H2) et reprendre plus tôt (H4)

export function proposerSuspension(d: DonneesPaie, id: string, debutTexte: string, finTexte: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const debut = lireDate(debutTexte, 'Début de la suspension');
  const fin = lireDate(finTexte, 'Fin de la suspension');
  if (fin < debut) throw new ErreurSaisie('La fin de la suspension doit venir après son début.');
  const modifie: ElementStocke = { ...e, suspensions: [...e.suspensions, { debut, fin }].sort((a, b) => (a.debut < b.debut ? -1 : 1)) };
  return {
    titre: `Suspendre « ${e.libelle} »`,
    lignes: [{ libelle: 'Suspension', avant: '—', apres: decrireSuspension(debut, fin) }],
    consequences: [
      'Les occurrences d’avant et d’après la suspension sont gardées.',
      ...consequencesCycles(d, remplacer(d, modifie), jour),
    ],
    changements: [{ type: 'definirElement', element: modifie }],
    journal: [entree(nomObjet(e), 'suspension', null, `du ${debut} au ${fin}`)],
  };
}

export function proposerReprise(d: DonneesPaie, id: string, repriseTexte: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const reprise = lireDate(repriseTexte, 'Reprise le');
  const s = e.suspensions.find((x) => x.debut <= reprise && reprise <= x.fin);
  if (!s) throw new ErreurSaisie(`« ${e.libelle} » n’est pas suspendu à cette date.`);
  const nouvelleFin = ajouterJours(reprise, -1);
  const raccourcie = nouvelleFin >= s.debut ? { debut: s.debut, fin: nouvelleFin } : null;
  const suspensions = e.suspensions.flatMap((x) => (x === s ? (raccourcie ? [raccourcie] : []) : [x]));
  const modifie: ElementStocke = { ...e, suspensions };
  const avant = decrireSuspension(s.debut as DateCivile, s.fin as DateCivile);
  const apres = raccourcie ? decrireSuspension(raccourcie.debut as DateCivile, raccourcie.fin) : 'Aucune';
  return {
    titre: `Reprendre « ${e.libelle} » plus tôt`,
    lignes: [{ libelle: 'Suspension', avant, apres }],
    consequences: [`Reprise le ${formaterDateLongue(reprise)}.`, ...consequencesCycles(d, remplacer(d, modifie), jour)],
    changements: [{ type: 'definirElement', element: modifie }],
    journal: [entree(nomObjet(e), 'fin de suspension', s.fin, raccourcie ? raccourcie.fin : 'suspension retirée')],
  };
}

// ---------------------------------------------------------------------------
// Terminer (H3)

export function proposerFin(d: DonneesPaie, id: string, derniereTexte: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const derniere = lireDate(derniereTexte, 'Dernière date');
  const debut = (e.frequence['depart'] ?? e.frequence['date']) as string | undefined;
  if (debut && derniere < debut) throw new ErreurSaisie('La fin ne peut pas venir avant le début de cette récurrence.');
  const modifie: ElementStocke = { ...e, fin: derniere };
  return {
    titre: `Terminer « ${e.libelle} »`,
    lignes: [
      { libelle: 'Fin', avant: e.fin ? `après le ${formaterDateLongue(e.fin as DateCivile)}` : 'Aucune', apres: `après le ${formaterDateLongue(derniere)}` },
    ],
    consequences: [
      `Les occurrences jusqu’au ${formaterDateLongue(derniere)} inclus sont gardées ; « ${e.libelle} » reste consultable.`,
      ...consequencesCycles(d, remplacer(d, modifie), jour),
    ],
    changements: [{ type: 'definirElement', element: modifie }],
    journal: [entree(nomObjet(e), 'fin', e.fin, derniere)],
  };
}

// ---------------------------------------------------------------------------
// Certain ou incertain (H5)

export function proposerCertitude(d: DonneesPaie, id: string, incertain: boolean, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  if (e.nature !== 'revenu') throw new ErreurSaisie('Seul un revenu peut être incertain.');
  if (e.incertain === incertain) throw new ErreurSaisie('Rien ne change.');
  const modifie: ElementStocke = { ...e, incertain };
  const mot = (x: boolean) => (x ? 'Incertain' : 'Certain');
  const consequences = consequencesCycles(d, remplacer(d, modifie), jour);
  if (incertain) consequences.push('Il restera visible, mais hors du disponible planifié tant que sa réception n’est pas confirmée.');
  return {
    titre: `Certitude de « ${e.libelle} »`,
    lignes: [{ libelle: 'Certitude', avant: mot(e.incertain), apres: mot(incertain) }],
    consequences,
    changements: [{ type: 'definirElement', element: modifie }],
    journal: [entree(nomObjet(e), 'certitude', mot(e.incertain), mot(incertain))],
  };
}

// ---------------------------------------------------------------------------
// Supprimer (Q16, H8)
//
// Possible tant qu'aucune confirmation n'y est attachée. Les confirmations
// arrivent à l'étape 5 : cette vérification s'ajoutera alors ici, et une
// règle confirmée ne pourra plus qu'être terminée.

export function proposerSuppression(d: DonneesPaie, id: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const description = `${decrireMontant(versElementNoyau(e).regle.montants.at(-1)?.montant ?? null, e.estimation)} — ${decrireQuand(e)}`;
  return {
    titre: `Supprimer « ${e.libelle} »`,
    lignes: [{ libelle: e.libelle, avant: description, apres: 'Supprimé' }],
    consequences: [
      ...consequencesCycles(
        d,
        (d.elements ?? []).filter((x) => x.id !== id),
        jour,
      ),
      'Le journal garde la trace de cette suppression.',
    ],
    changements: [{ type: 'supprimerElement', id }],
    journal: [entree(nomObjet(e), 'suppression', description, null)],
  };
}

export type { ChangementPaie };
