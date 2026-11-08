// Actions de l'étape 4 : autres revenus, dépenses fixes, enveloppes et
// dépenses ponctuelles (cahier 4.2, 4.5, 4.6 ; décisions A3, Q12 à Q16).
//
// Comme pour la paie, chaque changement est d'abord PROPOSÉ : anciennes et
// nouvelles valeurs, conséquences sur les cycles (14.2), puis enregistré
// seulement après confirmation, avec ses entrées de journal (A10).
// Modifier, suspendre et terminer gardent le passé : seule la règle change
// « à partir du » (4.5-c, 14.3).

import { ajouterJours, formaterDateCourte, formaterDateLongue, type DateCivile } from '../noyau/dates';
import { formaterMontant } from '../noyau/montants';
import type { ProfilPaie } from '../noyau/paie';
import { montantEnVigueur } from '../noyau/regles';
import type { AjustementStocke, ChangementPaie, DonneesPaie, ElementStocke, EntreeJournal } from '../lib/plateforme';
import { analyser, cyclesAffiches } from './analyse';
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
export { cyclesAffiches, NOMBRE_CYCLES } from './analyse';

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

/** Fréquences liées aux paies du profil principal : leur date de départ est facultative. */
export const quandLieePaie = (q: Quand) => q === 'chaquePaie' || q === 'paie1' || q === 'paie2';
/** Fréquences sans date à saisir. */
export const quandSansDate = (q: Quand) => q === 'cycle';

// ---------------------------------------------------------------------------
// Descriptions

const NOMBRES: Record<number, string> = { 2: 'deux', 3: 'trois', 6: 'six' };

/** Fréquence en vigueur à une date (étape 4b, B). */
export function frequenceEnVigueur(e: Pick<ElementStocke, 'frequence' | 'changementsFrequence'>, date: string): ElementStocke['frequence'] {
  let f = e.frequence;
  for (const p of [...(e.changementsFrequence ?? [])].sort((a, b) => (a.aPartirDu < b.aPartirDu ? -1 : 1))) {
    if (p.aPartirDu <= date) f = p.frequence;
  }
  return f;
}

/**
 * Description de la fréquence. Avec `jour`, celle en vigueur ce jour-là,
 * suivie de « depuis le … » ou du prochain changement prévu.
 */
export function decrireQuand(e: Pick<ElementStocke, 'frequence' | 'cyclePaie'> & Partial<Pick<ElementStocke, 'changementsFrequence'>>, jour?: string): string {
  const changements = [...(e.changementsFrequence ?? [])].sort((a, b) => (a.aPartirDu < b.aPartirDu ? -1 : 1));
  if (jour === undefined || changements.length === 0 || e.cyclePaie) return decrireFrequence(e.frequence, e.cyclePaie);
  const passe = changements.filter((p) => p.aPartirDu <= jour).at(-1);
  const futur = changements.find((p) => p.aPartirDu > jour);
  let texte = decrireFrequence(frequenceEnVigueur({ frequence: e.frequence, changementsFrequence: changements }, jour), null);
  if (passe) texte += ` (depuis le ${formaterDateCourte(passe.aPartirDu as DateCivile)})`;
  if (futur) texte += ` ; à partir du ${formaterDateCourte(futur.aPartirDu as DateCivile)} : ${minuscule(decrireFrequence(futur.frequence, null))}`;
  return texte;
}

const minuscule = (t: string) => (t.startsWith('À') ? 'à' + t.slice(1) : t.charAt(0).toLowerCase() + t.slice(1));

function decrireFrequence(f: ElementStocke['frequence'], cyclePaie: string | null | undefined): string {
  const e = { cyclePaie };
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
      return 'À chaque paie' + depart;
    case 'rangPaie':
      return (f['rang'] === 1 ? '1re paie du mois' : '2e paie du mois') + depart;
    default:
      return 'Fréquence personnalisée' + depart;
  }
}

export const nomObjet = (e: Pick<ElementStocke, 'nature' | 'libelle'>) => `${e.nature === 'revenu' ? 'Revenu' : 'Dépense'} « ${e.libelle} »`;

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
// Outils communs

function trouver(d: DonneesPaie, id: string): ElementStocke {
  const e = (d.elements ?? []).find((x) => x.id === id);
  if (!e) throw new ErreurSaisie('Ce revenu ou cette dépense n’existe plus.');
  return e;
}

function debutCycleActuel(d: DonneesPaie, profil: ProfilPaie, jour: DateCivile): DateCivile {
  const n = versNoyau(d);
  const { cycles } = cyclesAffiches(profil, { exceptions: n.exceptions }, jour, 1);
  // Date d'origine de la paie du cycle actuel (ou de la première paie à venir).
  return cycles[0]?.paie.dateOrigine ?? profil.frequence.depart;
}

function exigerProfil(d: DonneesPaie): ProfilPaie {
  const p = versNoyau(d).profil;
  if (!p) throw new ErreurSaisie('Crée d’abord le profil de paie.');
  return p;
}

export function decrireAjustement(a: AjustementStocke): string {
  const parties: string[] = [];
  if (a.retire) parties.push('retirée cette fois');
  if (a.montant !== null) parties.push(`montant ${formaterMontant(a.montant)}`);
  if (a.date !== null) parties.push(`date ${formaterDateCourte(a.date as DateCivile)}`);
  if (a.paieOrigine !== null) parties.push(`payée avec la paie du ${formaterDateCourte(a.paieOrigine as DateCivile)}`);
  return parties.join(', ');
}

interface Brouillon {
  titre: string;
  lignes: LigneApercu[];
  changements: ChangementPaie[];
  journal: EntreeJournal[];
  /** Phrases d'abord, avant les cycles touchés. */
  avant?: string[];
  /** Phrases à la fin. */
  apres?: string[];
  /** Aperçu même sans effet de bord (suppression, fréquence…). */
  apercuForce?: boolean;
}

/**
 * Complète une proposition avec l'analyse de ses conséquences (C) :
 * cycles touchés, cycles passés, ajustements devenus orphelins. Un
 * ajustement orphelin n'est jamais effacé en silence : il est nommé et
 * retiré avec une trace au journal.
 */
function finaliser(d: DonneesPaie, b: Brouillon, jour: DateCivile): Proposition {
  const an = analyser(d, b.changements, jour);
  const nom = (id: string) => (d.elements ?? []).find((e) => e.id === id)?.libelle ?? id;
  const objet = (id: string) => {
    const e = (d.elements ?? []).find((x) => x.id === id);
    return e ? nomObjet(e) : id;
  };
  const consequences = [
    ...(an.passes ? ['Attention : des cycles déjà passés changeraient.'] : []),
    ...(b.avant ?? []),
    ...an.cycles,
    ...an.orphelins.map(
      (o) =>
        `À vérifier : l’ajustement de « ${nom(o.elementId)} » du ${formaterDateCourte(o.origine as DateCivile)} ne correspondrait plus à aucune occurrence ; il sera retiré.`,
    ),
    ...(b.apres ?? []),
  ];
  return {
    titre: b.titre,
    lignes: b.lignes,
    consequences,
    changements: [
      ...b.changements,
      ...an.orphelins.map((o): ChangementPaie => ({ type: 'retirerAjustement', elementId: o.elementId, origine: o.origine })),
    ],
    journal: [
      ...b.journal,
      ...an.orphelins.map((o) => entree(objet(o.elementId), `ajustement du ${o.origine}`, decrireAjustement(o), 'retiré (occurrence disparue)')),
    ],
    apercu: b.apercuForce === true || an.passes || an.orphelins.length > 0,
  };
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
      return { type: 'chaquePaie', depart: date as string };
    case 'paie1':
      return { type: 'rangPaie', rang: 1, depart: date as string };
    case 'paie2':
      return { type: 'rangPaie', rang: 2, depart: date as string };
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
  } else if (quandLieePaie(s.quand) && s.date.trim() === '') {
    // Lié à la paie, sans date : à partir du cycle actuel (le passé ne change pas).
    date = debutCycleActuel(d, profil, jour);
  } else {
    if (s.date.trim() === '') throw new ErreurSaisie('Indique la date (ou la première date).');
    date = lireDate(s.date, 'Date');
  }
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
    changementsFrequence: [],
  };

  return finaliser(
    d,
    {
      titre: revenu ? 'Ajouter un revenu' : 'Ajouter une dépense',
      lignes: [
        { libelle: 'Nom', avant: '—', apres: libelle },
        { libelle: 'Montant', avant: '—', apres: decrireMontant(montant, element.estimation) },
        { libelle: 'Quand', avant: '—', apres: decrireQuand(element) },
        revenu
          ? { libelle: 'Certitude', avant: '—', apres: element.incertain ? 'Incertain' : 'Certain' }
          : { libelle: 'Genre', avant: '—', apres: element.genre === 'enveloppe' ? 'Enveloppe variable' : 'Dépense fixe' },
      ],
      changements: [{ type: 'definirElement', element }],
      journal: [entree(nomObjet(element), 'création', null, `${decrireMontant(montant, element.estimation)} — ${decrireQuand(element)}`)],
      apres: element.incertain
        ? ['Revenu incertain : visible dans son cycle, mais hors du disponible planifié tant que sa réception n’est pas confirmée.']
        : [],
    },
    jour,
  );
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
  // Protection : un ajustement de montant n'est jamais écrasé par la règle.
  const gardes = (d.ajustements ?? []).filter((a) => a.elementId === id && a.montant !== null && a.origine >= date).length;
  return finaliser(
    d,
    {
      titre: `Changer le montant de « ${e.libelle} »`,
      lignes: [{ libelle: `Montant à partir du ${longue}`, avant: montantOuACompleter(actuel), apres: formaterMontant(montant) }],
      changements: [{ type: 'definirElement', element: modifie }],
      journal: [entree(nomObjet(e), `montant à partir du ${date}`, montantOuACompleter(actuel), formaterMontant(montant))],
      avant: [`Les cycles d’avant le ${longue} ne changent pas.`],
      apres: gardes > 0 ? [`${gardes} occurrence(s) ajustée(s) à la main gardent leur montant.`] : [],
      apercuForce: gardes > 0,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Changer la fréquence à partir d'une date (B)

export function proposerFrequence(d: DonneesPaie, id: string, quand: Quand, dateTexte: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  if (e.cyclePaie || e.frequence.type === 'ponctuelle') {
    throw new ErreurSaisie('Une dépense ponctuelle n’a pas de fréquence à changer.');
  }
  if (quand === 'unique' || quand === 'cycle') throw new ErreurSaisie('Choisis une fréquence récurrente.');
  if (e.nature === 'revenu' && !QUAND_REVENU.includes(quand)) throw new ErreurSaisie('Un revenu suit une date, ou « À chaque paie ».');
  if (dateTexte.trim() === '') throw new ErreurSaisie('Indique la date du changement.');
  const date = lireDate(dateTexte, 'À partir du');
  const debutRegle = (e.frequence['depart'] as string | undefined) ?? null;
  if (debutRegle !== null && date <= debutRegle) {
    throw new ErreurSaisie('Le changement doit venir après le début de la règle ; pour tout changer, modifie la règle depuis le début.');
  }
  // La période porte déjà la date de départ : inutile de la répéter pour une fréquence liée à la paie.
  const brute = construireFrequence(quand, date, null);
  const nouvelle: ElementStocke['frequence'] = quandLieePaie(quand) ? (({ depart: _d, ...reste }) => reste)(brute) as ElementStocke['frequence'] : brute;
  const actuelle = frequenceEnVigueur(e, date);
  if (JSON.stringify(nouvelle) === JSON.stringify(actuelle)) throw new ErreurSaisie('C’est déjà la fréquence en vigueur à cette date.');
  const modifie: ElementStocke = {
    ...e,
    changementsFrequence: [...(e.changementsFrequence ?? []).filter((p) => p.aPartirDu !== date), { aPartirDu: date, frequence: nouvelle }].sort(
      (a, b) => (a.aPartirDu < b.aPartirDu ? -1 : 1),
    ),
  };
  const longue = formaterDateLongue(date);
  return finaliser(
    d,
    {
      titre: `Changer la fréquence de « ${e.libelle} »`,
      lignes: [{ libelle: `Fréquence à partir du ${longue}`, avant: decrireFrequence(actuelle, null), apres: decrireFrequence(nouvelle, null) }],
      changements: [{ type: 'definirElement', element: modifie }],
      journal: [entree(nomObjet(e), `fréquence à partir du ${date}`, decrireFrequence(actuelle, null), decrireFrequence(nouvelle, null))],
      avant: [`Les occurrences d’avant le ${longue} ne changent pas.`],
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Suspendre (H2) et reprendre plus tôt (H4)

export function proposerSuspension(d: DonneesPaie, id: string, debutTexte: string, finTexte: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const debut = lireDate(debutTexte, 'Début de la suspension');
  const fin = lireDate(finTexte, 'Fin de la suspension');
  if (fin < debut) throw new ErreurSaisie('La fin de la suspension doit venir après son début.');
  const modifie: ElementStocke = { ...e, suspensions: [...e.suspensions, { debut, fin }].sort((a, b) => (a.debut < b.debut ? -1 : 1)) };
  return finaliser(
    d,
    {
      titre: `Suspendre « ${e.libelle} »`,
      lignes: [{ libelle: 'Suspension', avant: '—', apres: decrireSuspension(debut, fin) }],
      changements: [{ type: 'definirElement', element: modifie }],
      journal: [entree(nomObjet(e), 'suspension', null, `du ${debut} au ${fin}`)],
      avant: ['Les occurrences d’avant et d’après la suspension sont gardées.'],
    },
    jour,
  );
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
  return finaliser(
    d,
    {
      titre: `Reprendre « ${e.libelle} » plus tôt`,
      lignes: [{ libelle: 'Suspension', avant, apres }],
      changements: [{ type: 'definirElement', element: modifie }],
      journal: [entree(nomObjet(e), 'fin de suspension', s.fin, raccourcie ? raccourcie.fin : 'suspension retirée')],
      avant: [`Reprise le ${formaterDateLongue(reprise)}.`],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Terminer (H3)

export function proposerFin(d: DonneesPaie, id: string, derniereTexte: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const derniere = lireDate(derniereTexte, 'Dernière date');
  const debut = (e.frequence['depart'] ?? e.frequence['date']) as string | undefined;
  if (debut && derniere < debut) throw new ErreurSaisie('La fin ne peut pas venir avant le début de cette récurrence.');
  const modifie: ElementStocke = { ...e, fin: derniere };
  return finaliser(
    d,
    {
      titre: `Terminer « ${e.libelle} »`,
      lignes: [
        { libelle: 'Fin', avant: e.fin ? `après le ${formaterDateLongue(e.fin as DateCivile)}` : 'Aucune', apres: `après le ${formaterDateLongue(derniere)}` },
      ],
      changements: [{ type: 'definirElement', element: modifie }],
      journal: [entree(nomObjet(e), 'fin', e.fin, derniere)],
      avant: [`Les occurrences jusqu’au ${formaterDateLongue(derniere)} inclus sont gardées ; « ${e.libelle} » reste consultable.`],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Certain ou incertain (H5)

export function proposerCertitude(d: DonneesPaie, id: string, incertain: boolean, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  if (e.nature !== 'revenu') throw new ErreurSaisie('Seul un revenu peut être incertain.');
  if (e.incertain === incertain) throw new ErreurSaisie('Rien ne change.');
  const mot = (x: boolean) => (x ? 'Incertain' : 'Certain');
  return finaliser(
    d,
    {
      titre: `Certitude de « ${e.libelle} »`,
      lignes: [{ libelle: 'Certitude', avant: mot(e.incertain), apres: mot(incertain) }],
      changements: [{ type: 'definirElement', element: { ...e, incertain } }],
      journal: [entree(nomObjet(e), 'certitude', mot(e.incertain), mot(incertain))],
      apres: incertain ? ['Il restera visible, mais hors du disponible planifié tant que sa réception n’est pas confirmée.'] : [],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Supprimer (Q16, H8) : toujours avec un aperçu.
//
// Possible tant qu'aucune confirmation n'y est attachée. Les confirmations
// arrivent à l'étape 5 : cette vérification s'ajoutera alors ici, et une
// règle confirmée ne pourra plus qu'être terminée.

export function proposerSuppression(d: DonneesPaie, id: string, jour: DateCivile): Proposition {
  const e = trouver(d, id);
  const description = `${decrireMontant(versElementNoyau(e).regle.montants.at(-1)?.montant ?? null, e.estimation)} — ${decrireQuand(e, jour)}`;
  const ajustements = (d.ajustements ?? []).filter((a) => a.elementId === id).length;
  return finaliser(
    d,
    {
      titre: `Supprimer « ${e.libelle} »`,
      lignes: [{ libelle: e.libelle, avant: description, apres: 'Supprimé' }],
      changements: [{ type: 'supprimerElement', id }],
      journal: [entree(nomObjet(e), 'suppression', description, null)],
      apres: [
        ...(ajustements > 0 ? [`Ses ${ajustements} ajustement(s) d’occurrence sont supprimés avec lui.`] : []),
        'Le journal garde la trace de cette suppression.',
      ],
      apercuForce: true,
    },
    jour,
  );
}

export type { ChangementPaie };
