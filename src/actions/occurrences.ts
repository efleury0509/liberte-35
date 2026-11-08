// Ajustements d'UNE occurrence depuis le détail d'un cycle (étape 4b, A) :
// montant pour cette fois, autre date, autre paie, retrait. La règle ne
// change jamais ; « Revenir à la règle » efface l'ajustement. Saisie directe
// (C) : ce qui change est exactement ce qui a été tapé.

import { appliquerChangements } from '../lib/appliquer';
import type { AjustementStocke, ChangementPaie, DonneesPaie, ElementStocke, EntreeJournal } from '../lib/plateforme';
import { planifier, type Ligne } from '../noyau/cycles';
import { ajouterJours, formaterDateCourte, type DateCivile } from '../noyau/dates';
import type { Cents } from '../noyau/montants';
import { montantEnVigueur } from '../noyau/regles';
import { analyser } from './analyse';
import { decrireAjustement, nomObjet } from './elements';
import { versElementNoyau } from './elementsStockes';
import { ErreurSaisie, SECTION, lireDate, lireMontant, versNoyau, type Proposition } from './paie';

export interface CibleOccurrence {
  elementId: string;
  /** Date d'origine : identité stable de l'occurrence. */
  origine: string;
}

export interface EtatOccurrence {
  element: ElementStocke;
  ajustement: AjustementStocke | undefined;
  /** Montant selon la règle. */
  montantRegle: Cents | null;
  /** Ligne telle qu'affichée (ajustement compris) ; undefined si hors des cycles. */
  ligne: Ligne | undefined;
  /** Paie (date d'origine) du cycle où l'occurrence se trouve. */
  paie: DateCivile | null;
  /** Élément daté : sa date peut être changée. */
  datee: boolean;
}

const cleDe = (a: { elementId: string; origine: string }) => `${a.elementId}|${a.origine}`;

/** Où se trouve l'occurrence, avec ces données (ajustements compris). */
function situer(d: DonneesPaie, cible: CibleOccurrence): { ligne: Ligne | undefined; paie: DateCivile | null } {
  const n = versNoyau(d);
  if (!n.profil) return { ligne: undefined, paie: null };
  const origine = cible.origine as DateCivile;
  const plan = planifier(
    { profil: n.profil, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, seuil: n.seuil },
    ajouterJours(origine, -100),
    ajouterJours(origine, 100),
  );
  for (const c of plan.cycles) {
    const ligne = c.lignes.find((l) => l.elementId === cible.elementId && l.origine === cible.origine);
    if (ligne) return { ligne, paie: c.paie.dateOrigine };
  }
  return { ligne: undefined, paie: null };
}

export function lireOccurrence(d: DonneesPaie, cible: CibleOccurrence): EtatOccurrence {
  const element = (d.elements ?? []).find((e) => e.id === cible.elementId);
  if (!element) throw new ErreurSaisie('Ce revenu ou cette dépense n’existe plus.');
  const ajustement = (d.ajustements ?? []).find((a) => cleDe(a) === cleDe(cible));
  const { ligne, paie } = situer(d, cible);
  return {
    element,
    ajustement,
    montantRegle: montantEnVigueur(versElementNoyau(element).regle.montants, cible.origine as DateCivile),
    ligne,
    paie,
    datee: ligne ? ligne.echeance !== null : element.frequence.type !== 'chaquePaie' && element.frequence.type !== 'rangPaie' && !element.cyclePaie,
  };
}

/** Paie où irait l'occurrence sans paie choisie, avec cette date. */
function paieParDefaut(d: DonneesPaie, cible: CibleOccurrence, date: string | null): DateCivile | null {
  const autres = (d.ajustements ?? []).filter((a) => cleDe(a) !== cleDe(cible));
  const provisoire: AjustementStocke | null = date !== null ? { ...cible, montant: null, date, paieOrigine: null, retire: false } : null;
  return situer({ ...d, ajustements: provisoire ? [...autres, provisoire] : autres }, cible).paie;
}

const parler = (a: AjustementStocke | undefined) => (a ? decrireAjustement(a) : 'selon la règle');

function proposition(
  d: DonneesPaie,
  e: ElementStocke,
  cible: CibleOccurrence,
  titre: string,
  avant: AjustementStocke | undefined,
  apres: AjustementStocke | null,
  jour: DateCivile,
): Proposition {
  const changements: ChangementPaie[] = apres
    ? [{ type: 'definirAjustement', ajustement: apres }]
    : [{ type: 'retirerAjustement', elementId: cible.elementId, origine: cible.origine }];
  const journal: EntreeJournal[] = [
    {
      section: SECTION,
      objet: nomObjet(e),
      champ: `occurrence du ${cible.origine}`,
      ancienneValeur: parler(avant),
      nouvelleValeur: apres ? decrireAjustement(apres) : 'selon la règle',
      motif: null,
    },
  ];
  // Vérifie que le stockage acceptera ce changement (élément existant, etc.).
  try {
    appliquerChangements(d, changements);
  } catch (m) {
    throw new ErreurSaisie(String(m).replace(' Rien n’a été enregistré.', ''));
  }
  return {
    titre,
    lignes: [{ libelle: `Occurrence du ${formaterDateCourte(cible.origine as DateCivile)}`, avant: parler(avant), apres: apres ? decrireAjustement(apres) : 'selon la règle' }],
    consequences: analyser(d, changements, jour).cycles,
    changements,
    journal,
    apercu: false,
  };
}

export interface SaisieOccurrence {
  /** Montant pour cette fois ; vide : selon la règle. */
  montant: string;
  /** Nouvelle échéance (élément daté) ; vide ou origine : inchangée. */
  date: string;
  /** Paie choisie (date d'origine) ; vide : selon l'échéance. */
  paie: string;
}

export function proposerAjustement(d: DonneesPaie, cible: CibleOccurrence, s: SaisieOccurrence, jour: DateCivile): Proposition {
  const etat = lireOccurrence(d, cible);
  const saisi = lireMontant(s.montant, 'Montant cette fois');
  const montant = saisi !== null && saisi !== etat.montantRegle ? saisi : null;
  let date: string | null = null;
  if (etat.datee && s.date.trim() !== '') {
    const d2 = lireDate(s.date, 'Date prévue');
    if (d2 !== cible.origine) date = d2;
  }
  let paieOrigine: string | null = null;
  if (s.paie.trim() !== '') {
    const p = lireDate(s.paie, 'Paie');
    if (p !== paieParDefaut(d, cible, date)) paieOrigine = p;
  }
  const retire = etat.ajustement?.retire ?? false;
  const nouvel: AjustementStocke | null =
    montant === null && date === null && paieOrigine === null && !retire
      ? null
      : { elementId: cible.elementId, origine: cible.origine, montant, date, paieOrigine, retire };
  if (nouvel === null && !etat.ajustement) throw new ErreurSaisie('Rien ne change pour cette occurrence.');
  if (nouvel && etat.ajustement && JSON.stringify(nouvel) === JSON.stringify(etat.ajustement)) {
    throw new ErreurSaisie('Rien ne change pour cette occurrence.');
  }
  return proposition(d, etat.element, cible, `Ajuster « ${etat.element.libelle} » pour cette fois`, etat.ajustement, nouvel, jour);
}

/** Retirer (ou remettre) cette occurrence seulement ; la règle reste. */
export function proposerRetrait(d: DonneesPaie, cible: CibleOccurrence, retire: boolean, jour: DateCivile): Proposition {
  const etat = lireOccurrence(d, cible);
  const base = etat.ajustement ?? { elementId: cible.elementId, origine: cible.origine, montant: null, date: null, paieOrigine: null, retire: false };
  if (base.retire === retire) throw new ErreurSaisie('Rien ne change pour cette occurrence.');
  const nouvel = { ...base, retire };
  const vide = nouvel.montant === null && nouvel.date === null && nouvel.paieOrigine === null && !nouvel.retire;
  const titre = retire ? `Retirer « ${etat.element.libelle} » cette fois` : `Remettre « ${etat.element.libelle} » cette fois`;
  return proposition(d, etat.element, cible, titre, etat.ajustement, vide ? null : nouvel, jour);
}

/** Efface l'ajustement : l'occurrence suit de nouveau la règle. */
export function proposerRetourRegle(d: DonneesPaie, cible: CibleOccurrence, jour: DateCivile): Proposition {
  const etat = lireOccurrence(d, cible);
  if (!etat.ajustement) throw new ErreurSaisie('Cette occurrence suit déjà la règle.');
  return proposition(d, etat.element, cible, `« ${etat.element.libelle} » : revenir à la règle`, etat.ajustement, null, jour);
}
