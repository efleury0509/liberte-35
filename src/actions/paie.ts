// Actions de « Mes paies » : chaque changement est d'abord PROPOSÉ, avec
// ses anciennes et nouvelles valeurs et ses conséquences (cahier 14.2),
// puis enregistré seulement après confirmation, avec ses entrées de journal
// (A10). Rien ici ne calcule de montant : le noyau s'en charge.

import { planifier, comparerRattachements, type AjustementOccurrence, type ElementPlanifie, type Plan } from '../noyau/cycles';
import { ajouterJours, dateCivile, formaterDateCourte, formaterDateLongue, type DateCivile } from '../noyau/dates';
import { arrondirDecimal, formaterMontant, type Cents } from '../noyau/montants';
import { paiesEntre, type ExceptionPaie, type Paie, type ProfilPaie } from '../noyau/paie';
import { montantEnVigueur } from '../noyau/regles';
import { versAjustementNoyau, versElementNoyau } from './elementsStockes';
import type {
  ChangementPaie,
  DonneesPaie,
  EntreeJournal,
  ExceptionStockee,
  FrequenceStockee,
  ProfilPaieStocke,
} from '../lib/plateforme';

export class ErreurSaisie extends Error {}

export interface LigneApercu {
  libelle: string;
  avant: string;
  apres: string;
}

export interface Proposition {
  titre: string;
  lignes: LigneApercu[];
  consequences: string[];
  changements: ChangementPaie[];
  journal: EntreeJournal[];
  /**
   * Étape 4b, C : vrai quand l'aperçu protège vraiment (effet de bord,
   * passé touché, suppression…) ; sinon l'enregistrement est direct, avec
   * « Annuler » juste après.
   */
  apercu: boolean;
}

export const SECTION = 'Mes paies';
export const A_COMPLETER = 'À compléter';

export const LIBELLES_FREQUENCE: Record<FrequenceStockee, string> = {
  hebdomadaire: 'Chaque semaine',
  deuxSemaines: 'Aux deux semaines',
  deuxFoisParMois: 'Deux fois par mois',
  mensuelle: 'Une fois par mois',
};

// ---------------------------------------------------------------------------
// Conversions entre le stockage et le noyau

export interface DonneesNoyau {
  profil: ProfilPaie | null;
  exceptions: ExceptionPaie[];
  seuil: Cents | null;
  elements: ElementPlanifie[];
  ajustements: AjustementOccurrence[];
}

export function versNoyau(d: DonneesPaie): DonneesNoyau {
  const montants = d.salaires.map((s) => ({ aPartirDu: dateCivile(s.aPartirDu), montant: s.montant }));
  let profil: ProfilPaie | null = null;
  if (d.profil) {
    const depart = dateCivile(d.profil.depart);
    const f = d.profil;
    profil = {
      frequence:
        f.frequence === 'deuxFoisParMois'
          ? { type: 'deuxFoisParMois', depart, jours: f.jours ?? [15, 31] }
          : { type: f.frequence, depart },
      montants,
    };
  }
  const exceptions: ExceptionPaie[] = d.exceptions.map((e) => ({
    dateOrigine: dateCivile(e.dateOrigine),
    ...(e.dateReelle ? { dateReelle: dateCivile(e.dateReelle) } : {}),
    ...(e.montant !== null ? { montant: e.montant } : {}),
  }));
  return {
    profil,
    exceptions,
    seuil: d.seuil,
    elements: (d.elements ?? []).map(versElementNoyau),
    ajustements: (d.ajustements ?? []).map(versAjustementNoyau),
  };
}

// ---------------------------------------------------------------------------
// Saisies

export function lireDate(texte: string, nom: string): DateCivile {
  try {
    return dateCivile(texte.trim());
  } catch {
    throw new ErreurSaisie(`${nom} : date invalide.`);
  }
}

/** Montant saisi en dollars ; vide → null ; négatif refusé. */
export function lireMontant(texte: string, nom: string): Cents | null {
  if (texte.trim() === '') return null;
  let c: Cents;
  try {
    c = arrondirDecimal(texte.replace('$', ''));
  } catch {
    throw new ErreurSaisie(`${nom} : « ${texte} » n'est pas un montant.`);
  }
  if (c < 0) throw new ErreurSaisie(`${nom} : le montant ne peut pas être négatif.`);
  return c;
}

export const montantOuACompleter = (c: Cents | null | undefined) => (c === null || c === undefined ? A_COMPLETER : formaterMontant(c));

export function decrireFrequence(p: ProfilPaieStocke): string {
  const depart = formaterDateLongue(dateCivile(p.depart));
  if (p.frequence === 'deuxFoisParMois' && p.jours) {
    const [j1, j2] = p.jours;
    const second = j2 === 31 ? 'le dernier jour' : `le ${j2}`;
    return `Deux fois par mois, le ${j1 === 1 ? '1er' : j1} et ${second}, à partir du ${depart}`;
  }
  return `${LIBELLES_FREQUENCE[p.frequence]}, à partir du ${depart}`;
}

function entree(objet: string, champ: string, avant: string | null, apres: string | null): EntreeJournal {
  return { section: SECTION, objet, champ, ancienneValeur: avant, nouvelleValeur: apres, motif: null };
}

// ---------------------------------------------------------------------------
// Profil de paie

export interface SaisieProfil {
  frequence: FrequenceStockee;
  depart: string;
  jours?: [number, number];
  /** Montant net habituel, à la création seulement ; vide : à compléter. */
  montant?: string;
}

export function proposerProfil(d: DonneesPaie, s: SaisieProfil): Proposition {
  const depart = lireDate(s.depart, 'Date de la première paie');
  let jours: [number, number] | null = null;
  if (s.frequence === 'deuxFoisParMois') {
    const [j1, j2] = s.jours ?? [0, 0];
    if (!Number.isInteger(j1) || !Number.isInteger(j2) || j1 < 1 || j1 > 27 || j2 <= j1 || j2 > 31) {
      throw new ErreurSaisie('Deux fois par mois : le premier jour va de 1 à 27, le second doit venir après (31 = dernier jour).');
    }
    jours = [j1, j2];
  }
  const profil: ProfilPaieStocke = { frequence: s.frequence, depart, jours };
  const changements: ChangementPaie[] = [{ type: 'definirProfil', profil }];
  const avant = d.profil ? decrireFrequence(d.profil) : 'Aucun profil';
  const apres = decrireFrequence(profil);
  const lignes: LigneApercu[] = [{ libelle: 'Calendrier de paie', avant, apres }];
  const journal = [entree('Profil de paie', 'calendrier', d.profil ? avant : null, apres)];
  const consequences: string[] = [];

  if (!d.profil) {
    const montant = lireMontant(s.montant ?? '', 'Montant net habituel');
    if (montant !== null) {
      changements.push({ type: 'definirSalaire', salaire: { aPartirDu: depart, montant } });
      lignes.push({ libelle: 'Montant net habituel', avant: A_COMPLETER, apres: formaterMontant(montant) });
      journal.push(entree('Profil de paie', 'salaire net', null, `${formaterMontant(montant)} à partir du ${depart}`));
    } else {
      consequences.push('Le montant net reste « À compléter » : aucun disponible ne sera calculé avant que tu l’indiques.');
    }
  } else {
    consequences.push('Le calendrier de paie est recalculé. Les salaires datés sont conservés.');
    if (d.exceptions.length > 0) {
      consequences.push(
        `${d.exceptions.length} exception(s) de paie restent attachées à leur date d'origine ; celles qui ne correspondent plus à une paie seront ignorées.`,
      );
    }
  }
  // Le calendrier de paie touche tous les cycles : toujours un aperçu.
  return { titre: d.profil ? 'Modifier le calendrier de paie' : 'Créer le profil de paie', lignes, consequences, changements, journal, apercu: true };
}

// ---------------------------------------------------------------------------
// Changement de salaire daté (cahier 4.1)

export function proposerSalaire(d: DonneesPaie, aPartirDuTexte: string, montantTexte: string, jour?: DateCivile): Proposition {
  const { profil, exceptions } = versNoyau(d);
  if (!profil) throw new ErreurSaisie('Crée d’abord le profil de paie.');
  const aPartirDu = lireDate(aPartirDuTexte, 'Date du changement');
  const montant = lireMontant(montantTexte, 'Nouveau salaire net');
  if (montant === null) throw new ErreurSaisie('Nouveau salaire net : indique un montant.');
  const actuel = montantEnVigueur(profil.montants, aPartirDu);
  const date = formaterDateLongue(aPartirDu);
  const consequences = [`Les paies d’avant le ${date} ne changent pas.`];
  const prochaine = paiesEntre({ ...profil, montants: [] }, exceptions, aPartirDu, ajouterJours(aPartirDu, 62))[0];
  if (prochaine) consequences.push(`Première paie concernée : ${formaterDateLongue(prochaine.date)}.`);
  const gardees = exceptions.filter((e) => e.montant !== undefined && e.dateOrigine >= aPartirDu).length;
  if (gardees > 0) {
    consequences.push(`${gardees} paie(s) au montant particulier gardent leur montant : une exception n’est jamais écrasée.`);
  }
  return {
    titre: 'Changer le salaire à partir d’une date',
    lignes: [{ libelle: `Salaire net à partir du ${date}`, avant: montantOuACompleter(actuel), apres: formaterMontant(montant) }],
    consequences,
    changements: [{ type: 'definirSalaire', salaire: { aPartirDu, montant } }],
    journal: [entree('Salaire net', `à partir du ${aPartirDu}`, montantOuACompleter(actuel), formaterMontant(montant))],
    // Aperçu si le changement touche des paies déjà passées (ou si on ne sait pas quel jour on est).
    apercu: jour === undefined || aPartirDu < jour || gardees > 0,
  };
}

// ---------------------------------------------------------------------------
// Exception sur une paie : date réelle de versement (A11) et/ou montant

export interface SaisieException {
  dateReelle: string;
  montant: string;
}

function planAutour(d: DonneesNoyau, profil: ProfilPaie, paie: Paie, elements: readonly ElementPlanifie[], exceptions: ExceptionPaie[]): Plan {
  return planifier(
    { profil, exceptions, elements, ajustements: d.ajustements, seuil: d.seuil },
    ajouterJours(paie.dateOrigine, -70),
    ajouterJours(paie.dateOrigine, 70),
  );
}

export function proposerException(
  d: DonneesPaie,
  paie: Paie,
  s: SaisieException,
  elementsFournis?: readonly ElementPlanifie[],
  jour?: DateCivile,
): Proposition {
  const noyau = versNoyau(d);
  const elements = elementsFournis ?? noyau.elements;
  if (!noyau.profil) throw new ErreurSaisie('Crée d’abord le profil de paie.');
  const dateReelle = s.dateReelle.trim() === '' ? paie.dateOrigine : lireDate(s.dateReelle, 'Date de versement');
  const montant = lireMontant(s.montant, 'Montant de cette paie');
  const deplacee = dateReelle !== paie.dateOrigine;
  const montantNormal = montantEnVigueur(noyau.profil.montants, paie.dateOrigine);
  const montantParticulier = montant !== null && montant !== montantNormal;

  const autres = noyau.exceptions.filter((e) => e.dateOrigine !== paie.dateOrigine);
  const nouvelle: ExceptionPaie | null =
    deplacee || montantParticulier
      ? {
          dateOrigine: paie.dateOrigine,
          ...(deplacee ? { dateReelle } : {}),
          ...(montantParticulier ? { montant } : {}),
        }
      : null;
  const exceptionsApres = nouvelle ? [...autres, nouvelle] : autres;

  let apres: Plan;
  try {
    apres = planAutour(noyau, noyau.profil, paie, elements, exceptionsApres);
  } catch (e) {
    throw new ErreurSaisie(e instanceof Error ? e.message : String(e));
  }
  const avant = planAutour(noyau, noyau.profil, paie, elements, noyau.exceptions);
  const cycleAvant = avant.cycles.find((c) => c.paie.dateOrigine === paie.dateOrigine);
  const cycleApres = apres.cycles.find((c) => c.paie.dateOrigine === paie.dateOrigine);

  const objet = `Paie du ${paie.dateOrigine}`;
  const lignes: LigneApercu[] = [
    { libelle: 'Date de versement', avant: formaterDateLongue(paie.date), apres: formaterDateLongue(dateReelle) },
    {
      libelle: 'Montant de cette paie',
      avant: montantOuACompleter(paie.montant),
      apres: montantOuACompleter(cycleApres?.paie.montant ?? null),
    },
  ];
  const journal: EntreeJournal[] = [];
  if (dateReelle !== paie.date) journal.push(entree(objet, 'date de versement', paie.date, dateReelle));
  if ((cycleApres?.paie.montant ?? null) !== paie.montant) {
    journal.push(entree(objet, 'montant', montantOuACompleter(paie.montant), montantOuACompleter(cycleApres?.paie.montant ?? null)));
  }
  if (journal.length === 0) throw new ErreurSaisie('Rien ne change pour cette paie.');

  const consequences: string[] = [];
  if (deplacee) consequences.push('La règle de paie ne change pas : les paies suivantes gardent leurs dates.');
  const rattachements = comparerRattachements(avant, apres);
  for (const c of rattachements) {
    consequences.push(
      `À vérifier : ${c.libelle} (${formaterDateCourte(c.echeance)}) passerait de la paie du ${formaterDateCourte(c.dePaie)} à celle du ${formaterDateCourte(c.versPaie)}`,
    );
  }
  if (cycleAvant && cycleApres && cycleAvant.disponible !== cycleApres.disponible) {
    consequences.push(
      `Disponible planifié de ce cycle : ${montantOuACompleter(cycleAvant.disponible)} → ${montantOuACompleter(cycleApres.disponible)}.`,
    );
  }

  const changements: ChangementPaie[] = nouvelle
    ? [{ type: 'definirException', exception: versStockage(nouvelle) }]
    : [{ type: 'retirerException', dateOrigine: paie.dateOrigine }];
  // A11 : un élément qui changerait de paie est montré avant d'enregistrer ;
  // un cycle déjà terminé aussi.
  const passe = jour !== undefined && cycleAvant !== undefined && cycleAvant.fin < jour;
  return {
    titre: `Modifier la paie du ${formaterDateLongue(paie.dateOrigine)}`,
    lignes,
    consequences,
    changements,
    journal,
    apercu: rattachements.length > 0 || passe || jour === undefined,
  };
}

function versStockage(e: ExceptionPaie): ExceptionStockee {
  return { dateOrigine: e.dateOrigine, dateReelle: e.dateReelle ?? null, montant: e.montant ?? null };
}

// ---------------------------------------------------------------------------
// Seuil d'attention (A9)

export function proposerSeuil(d: DonneesPaie, texte: string): Proposition {
  const seuil = lireMontant(texte, 'Seuil d’attention');
  const avant = d.seuil === null ? 'Aucun' : formaterMontant(d.seuil);
  const apres = seuil === null ? 'Aucun' : formaterMontant(seuil);
  if (avant === apres) throw new ErreurSaisie('Le seuil est déjà à cette valeur.');
  return {
    titre: 'Seuil d’attention des cycles',
    lignes: [{ libelle: 'Seuil d’attention', avant, apres }],
    consequences: [
      seuil === null
        ? 'Seul un disponible planifié négatif sera signalé.'
        : `Un cycle sera signalé, avec discrétion, si son disponible planifié est négatif ou inférieur à ${apres}.`,
    ],
    changements: [{ type: 'definirSeuil', seuil }],
    journal: [entree('Seuil d’attention', 'montant', avant, apres)],
    apercu: false,
  };
}
