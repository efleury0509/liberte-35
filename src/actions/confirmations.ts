// Étape 5 : confirmer, corriger, annuler une confirmation, tout confirmer.
// Décisions du 8 novembre 2026 (Q17 à Q25) :
// - on confirme la paie, les autres revenus, les dépenses fixes et
//   ponctuelles ; jamais une enveloppe (4.6-c) ;
// - le montant confirmé remplace le prévu dans le disponible (Q18) ;
// - la date confirmée est une information, elle ne déplace rien (Q19) ;
// - la date du jour est proposée par défaut (Q20) ;
// - un écart n'est jamais réparti d'office (Q21) ;
// - annuler une confirmation ramène l'état exact ; le journal garde la trace (Q22).
// Confirmer, corriger et annuler s'enregistrent directement, avec « Annuler » ;
// « Tout confirmer » montre d'abord un aperçu rapide (Q24).

import { planifier, type Cycle, type Ligne } from '../noyau/cycles';
import { ajouterJours, formaterDateCourte, type DateCivile } from '../noyau/dates';
import { formaterMontant, type Cents } from '../noyau/montants';
import type { ChangementPaie, ConfirmationStockee, DonneesPaie, EntreeJournal } from '../lib/plateforme';
import { appliquerChangements } from '../lib/appliquer';
import { objetJournal } from './cartes';
import { effetsReserve } from './depenses';
import type { CompteStocke } from '../lib/plateforme';
import { ErreurSaisie, SECTION, lireDate, lireMontant, montantOuACompleter, versNoyau, type LigneApercu, type Proposition } from './paie';

/** Une occurrence à confirmer ; elementId null : la paie elle-même. */
export interface CibleConfirmation {
  elementId: string | null;
  origine: string;
}

export interface SaisieConfirmation {
  /** En dollars. */
  montant: string;
  date: string;
  /** Étape A (U4) : dépense à prévoir payée sans utiliser sa réserve. */
  sansReserve?: boolean;
}

interface Situation {
  cycle: Cycle;
  ligne: Ligne | null;
  /** Montant prévu (règle, ajustement ou exception de paie). */
  prevu: Cents | null;
  confirmation: ConfirmationStockee | undefined;
  titre: string;
  objet: string;
  champ: string;
}

const STATUTS: Record<string, string> = { aVenir: 'À venir', aVerifier: 'À vérifier', confirme: 'Confirmé' };

function planAutour(d: DonneesPaie, origine: DateCivile, jour: DateCivile) {
  const n = versNoyau(d);
  if (!n.profil) throw new ErreurSaisie('Crée d’abord le profil de paie.');
  return planifier(
    { profil: n.profil, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, couvertures: n.couvertures, aujourdhui: jour },
    ajouterJours(origine, -100),
    ajouterJours(origine, 100),
  );
}

function situer(d: DonneesPaie, cible: CibleConfirmation, jour: DateCivile): Situation {
  const origine = cible.origine as DateCivile;
  const plan = planAutour(d, origine, jour);
  const confirmation = (d.confirmations ?? []).find((f) => f.elementId === cible.elementId && f.origine === cible.origine);
  const quand = formaterDateCourte(origine);
  if (cible.elementId === null) {
    const cycle = plan.cycles.find((c) => c.paie.dateOrigine === origine);
    if (!cycle) throw new ErreurSaisie('Cette paie n’existe pas dans le calendrier.');
    return { cycle, ligne: null, prevu: cycle.paie.montant, confirmation, titre: `la paie du ${quand}`, objet: `Paie du ${cible.origine}`, champ: 'confirmation' };
  }
  const element = (d.elements ?? []).find((e) => e.id === cible.elementId);
  if (!element) throw new ErreurSaisie('Ce revenu ou cette dépense n’existe plus.');
  for (const cycle of plan.cycles) {
    const ligne = cycle.lignes.find((l) => l.elementId === cible.elementId && l.origine === origine);
    if (ligne) {
      return {
        cycle,
        ligne,
        prevu: ligne.montantPrevu,
        confirmation,
        titre: `« ${element.libelle} » (${quand})`,
        objet: objetJournal(d, element),
        champ: `confirmation du ${cible.origine}`,
      };
    }
  }
  throw new ErreurSaisie('Cette opération n’existe plus dans le plan.');
}

const decrire = (f: { montant: number; date: string }) => `${formaterMontant(f.montant)} le ${f.date}`;

function lireSaisie(s: SaisieConfirmation): { montant: Cents; date: DateCivile } {
  const montant = lireMontant(s.montant, 'Montant confirmé');
  if (montant === null) throw new ErreurSaisie('Montant confirmé : indique un montant.');
  if (s.date.trim() === '') throw new ErreurSaisie('Date : indique la date de réception ou de paiement.');
  return { montant, date: lireDate(s.date, 'Date') };
}

function ecart(prevu: Cents | null, montant: Cents): string[] {
  if (prevu === null || prevu === montant) return [];
  const diff = montant - prevu;
  const texte = diff > 0 ? `+${formaterMontant(diff)}` : `−${formaterMontant(-diff)}`;
  return [`Différence avec le prévu : ${texte}. Rien n’est réparti : le disponible du cycle en tient compte.`];
}

/** Une confirmation ne touche que son propre cycle : on montre son disponible avant et après. */
function effetSurLeCycle(d: DonneesPaie, changements: ChangementPaie[], cycle: Cycle, jour: DateCivile): string[] {
  const apres = planAutour(appliquerChangements(d, changements), cycle.paie.dateOrigine, jour).cycles.find(
    (c) => c.paie.dateOrigine === cycle.paie.dateOrigine,
  );
  if (!apres || apres.disponible === cycle.disponible) return [];
  return [
    `Cycle du ${formaterDateCourte(cycle.paie.date)} : disponible planifié ${montantOuACompleter(cycle.disponible)} → ${montantOuACompleter(apres.disponible)}`,
  ];
}

function entree(objet: string, champ: string, avant: string | null, apres: string | null): EntreeJournal {
  return { section: SECTION, objet, champ, ancienneValeur: avant, nouvelleValeur: apres, motif: null };
}

function verifierConfirmable(s: Situation): void {
  if (s.ligne?.genre === 'enveloppe') throw new ErreurSaisie('Une enveloppe ne se confirme pas : elle n’est jamais réconciliée.');
  if (s.ligne?.retiree) throw new ErreurSaisie('Cette occurrence est retirée cette fois : remets-la d’abord pour la confirmer.');
}

// ---------------------------------------------------------------------------

/** Confirmer : sans saisie, au montant prévu et à la date du jour (Q20). */
export function proposerConfirmation(d: DonneesPaie, cible: CibleConfirmation, saisie: SaisieConfirmation | null, jour: DateCivile): Proposition {
  const s = situer(d, cible, jour);
  verifierConfirmable(s);
  if (s.confirmation) throw new ErreurSaisie('Déjà confirmé : corrige ou annule la confirmation.');
  let valeur: { montant: Cents; date: DateCivile };
  if (saisie) valeur = lireSaisie(saisie);
  else {
    if (s.prevu === null) throw new ErreurSaisie('Le montant prévu est à compléter : indique le montant confirmé.');
    valeur = { montant: s.prevu, date: jour };
  }
  const confirmation: ConfirmationStockee = { elementId: cible.elementId, origine: cible.origine, date: valeur.date, montant: valeur.montant };
  // Étape A (U1, U2) : une dépense payée avec sa réserve, préparée dans le même aperçu.
  const r = cible.elementId === null ? null : effetsReserve(d, new Map<string, CompteStocke>(), cible.elementId, cible.origine, valeur.montant, valeur.date, saisie?.sansReserve === true);
  const changements: ChangementPaie[] = [{ type: 'definirConfirmation', confirmation }, ...(r?.changements ?? [])];
  const statut = cible.elementId === null ? s.cycle.paieStatut : (s.ligne?.statut ?? 'aVenir');
  return {
    titre: `Confirmer ${s.titre}`,
    lignes: [{ libelle: 'Confirmation', avant: STATUTS[statut] ?? statut, apres: decrire(confirmation) }, ...(r?.lignes ?? [])],
    consequences: [...ecart(s.prevu, valeur.montant), ...(r?.consequences ?? []), ...effetSurLeCycle(d, changements, s.cycle, jour)],
    changements,
    journal: [entree(s.objet, s.champ, null, decrire(confirmation)), ...(r?.journal ?? [])],
    apercu: r?.apercu ?? false,
  };
}

export function proposerCorrection(d: DonneesPaie, cible: CibleConfirmation, saisie: SaisieConfirmation, jour: DateCivile): Proposition {
  const s = situer(d, cible, jour);
  if (!s.confirmation) throw new ErreurSaisie('Cette opération n’est pas confirmée.');
  const valeur = lireSaisie(saisie);
  if (valeur.montant === s.confirmation.montant && valeur.date === s.confirmation.date) throw new ErreurSaisie('Rien ne change.');
  const confirmation: ConfirmationStockee = { ...s.confirmation, montant: valeur.montant, date: valeur.date };
  const r = cible.elementId === null ? null : effetsReserve(d, new Map<string, CompteStocke>(), cible.elementId, cible.origine, valeur.montant, valeur.date, saisie.sansReserve === true);
  const changements: ChangementPaie[] = [{ type: 'definirConfirmation', confirmation }, ...(r?.changements ?? [])];
  return {
    titre: `Corriger la confirmation de ${s.titre}`,
    lignes: [{ libelle: 'Confirmation', avant: decrire(s.confirmation), apres: decrire(confirmation) }, ...(r?.lignes ?? [])],
    consequences: [...ecart(s.prevu, valeur.montant), ...(r?.consequences ?? []), ...effetSurLeCycle(d, changements, s.cycle, jour)],
    changements,
    journal: [entree(s.objet, `correction de la ${s.champ}`, decrire(s.confirmation), decrire(confirmation)), ...(r?.journal ?? [])],
    apercu: r?.apercu ?? false,
  };
}

export function proposerAnnulationConfirmation(d: DonneesPaie, cible: CibleConfirmation, jour: DateCivile): Proposition {
  const s = situer(d, cible, jour);
  if (!s.confirmation) throw new ErreurSaisie('Cette opération n’est pas confirmée.');
  // Étape A (U5) : l'utilisation de la réserve et le retrait sont défaits avec elle.
  const r = cible.elementId === null ? null : effetsReserve(d, new Map<string, CompteStocke>(), cible.elementId, cible.origine, null, jour);
  const changements: ChangementPaie[] = [{ type: 'retirerConfirmation', elementId: cible.elementId, origine: cible.origine }, ...(r?.changements ?? [])];
  return {
    titre: `Annuler la confirmation de ${s.titre}`,
    lignes: [{ libelle: 'Confirmation', avant: decrire(s.confirmation), apres: 'Aucune' }, ...(r?.lignes ?? [])],
    consequences: effetSurLeCycle(d, changements, s.cycle, jour),
    changements,
    journal: [entree(s.objet, `annulation de la ${s.champ}`, decrire(s.confirmation), null)],
    apercu: r?.apercu ?? false,
  };
}

/**
 * Tout confirmer dans un cycle (Q24), à la date du jour et aux montants
 * prévus. Un aperçu rapide dit ce qui est inclus et exclu, puis une seule
 * action enregistre le tout (et un seul « Annuler » la défait).
 */
export function proposerToutConfirmer(d: DonneesPaie, paieOrigine: string, jour: DateCivile): Proposition {
  const origine = paieOrigine as DateCivile;
  const plan = planAutour(d, origine, jour);
  const cycle = plan.cycles.find((c) => c.paie.dateOrigine === origine);
  if (!cycle) throw new ErreurSaisie('Cette paie n’existe pas dans le calendrier.');

  const changements: ChangementPaie[] = [];
  const lignes: LigneApercu[] = [];
  const journal: EntreeJournal[] = [];
  const exclus: string[] = [];
  const ajouter = (elementId: string | null, libelle: string, objet: string, champ: string, statut: string, montant: Cents) => {
    const confirmation: ConfirmationStockee = { elementId, origine: elementId === null ? cycle.paie.dateOrigine : '', date: jour, montant };
    return { confirmation, libelle, objet, champ, statut };
  };
  const inclus: ReturnType<typeof ajouter>[] = [];

  const quand = formaterDateCourte(cycle.paie.date);
  if (cycle.paieStatut !== 'confirme') {
    if (cycle.paie.montant === null) exclus.push(`Exclu : la paie du ${quand} (montant à compléter).`);
    else inclus.push(ajouter(null, `Paie du ${quand}`, `Paie du ${cycle.paie.dateOrigine}`, 'confirmation', cycle.paieStatut, cycle.paie.montant));
  }
  const tri = (l: Ligne) => l.echeance ?? cycle.fin;
  for (const l of [...cycle.lignes].sort((a, b) => (tri(a) < tri(b) ? -1 : tri(a) > tri(b) ? 1 : 0))) {
    if (l.statut === 'confirme') continue;
    if (l.genre === 'enveloppe') exclus.push(`Exclu : ${l.libelle} (enveloppe, jamais réconciliée).`);
    else if (l.retiree) exclus.push(`Exclu : ${l.libelle} (retirée cette fois).`);
    else if (l.incertain) exclus.push(`Exclu : ${l.libelle} (revenu incertain : à confirmer individuellement).`);
    else if (l.montantPrevu === null) exclus.push(`Exclu : ${l.libelle} (montant à compléter).`);
    else {
      const element = (d.elements ?? []).find((e) => e.id === l.elementId);
      const i = ajouter(l.elementId, l.libelle, element ? objetJournal(d, element) : l.libelle, `confirmation du ${l.origine}`, l.statut, l.montantPrevu);
      i.confirmation.origine = l.origine;
      inclus.push(i);
    }
  }
  if (inclus.length === 0) throw new ErreurSaisie('Rien à confirmer dans ce cycle.');
  const comptes = new Map<string, CompteStocke>();
  const autres: string[] = [];
  const touches = new Set<string>();
  for (const i of inclus) {
    changements.push({ type: 'definirConfirmation', confirmation: i.confirmation });
    lignes.push({ libelle: i.libelle, avant: STATUTS[i.statut] ?? i.statut, apres: decrire(i.confirmation) });
    journal.push(entree(i.objet, i.champ, null, decrire(i.confirmation)));
    if (i.confirmation.elementId !== null) {
      const r = effetsReserve(d, comptes, i.confirmation.elementId, i.confirmation.origine, i.confirmation.montant, i.confirmation.date);
      lignes.push(...r.lignes);
      journal.push(...r.journal);
      autres.push(...r.consequences);
      for (const c of r.changements) if (c.type === 'definirCompte') touches.add(c.compte.id);
    }
  }
  for (const id of touches) changements.push({ type: 'definirCompte', compte: comptes.get(id)! });
  exclus.push(...autres);
  return {
    titre: `Tout confirmer — cycle du ${quand}`,
    lignes,
    consequences: [
      `${inclus.length} opération${inclus.length > 1 ? 's' : ''} confirmée${inclus.length > 1 ? 's' : ''} au montant prévu, à la date du jour.`,
      ...exclus,
      ...effetSurLeCycle(d, changements, cycle, jour),
    ],
    changements,
    journal,
    apercu: true,
  };
}
