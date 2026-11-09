// Étape A : calculs purs des réserves, partagés par Mes paies et Mon épargne.
//
// - Le solde d'une réserve : ses mouvements + les parts des contributions
//   CONFIRMÉES de son compte (A5, Q86). Rien de planifié n'y entre.
// - La couverture d'une dépense à prévoir réglée « avec la réserve » : pour une
//   occurrence confirmée, ce qui a vraiment été utilisé ; pour une occurrence
//   à venir, ce que la réserve aura à sa date si les contributions planifiées
//   sont faites (elles sont déjà déduites de leurs cycles : compter la dépense
//   en entier serait la compter deux fois). Inconnu → null, jamais 0 $.
//
// Ce module ne dépend d'aucune action : versNoyau peut l'utiliser.

import type { CompteStocke, DonneesPaie, ElementStocke, ReserveStockee } from '../lib/plateforme';
import { ajouterJours, dateCivile, type DateCivile } from '../noyau/dates';
import type { Cents } from '../noyau/montants';
import { planifier, type EntreePlan } from '../noyau/cycles';
import type { ProfilPaie } from '../noyau/paie';

export const cleOccurrence = (elementId: string, origine: string) => `${elementId}|${origine}`;

export const reservesDe = (k: CompteStocke): ReserveStockee[] => k.reserves ?? [];
export const toutesLesReserves = (d: DonneesPaie): { compte: CompteStocke; reserve: ReserveStockee }[] =>
  (d.comptes ?? []).flatMap((compte) => reservesDe(compte).map((reserve) => ({ compte, reserve })));

/** Réserve active liée à une dépense (B1). */
export function reserveDeDepense(d: DonneesPaie, depenseId: string): { compte: CompteStocke; reserve: ReserveStockee } | null {
  return toutesLesReserves(d).find((x) => x.reserve.depenseId === depenseId && x.reserve.arreteeLe === null) ?? null;
}

/** B3 : suspendue ou arrêtée à cette date : ses parts vont au non réservé. */
export function horsRepartition(r: ReserveStockee, date: string): boolean {
  if (r.arreteeLe !== null && date >= r.arreteeLe) return true;
  return r.suspensions.some((s) => date >= s.debut && (s.fin === null || date <= s.fin));
}

/** Parts prévues d'une occurrence : celles de cette paie (P6), sinon l'habituelle. */
export function partsDe(k: CompteStocke, elementId: string, origine: string): { reserveId: string; montant: Cents }[] {
  const rs = k.repartitions ?? [];
  return (rs.find((r) => r.elementId === elementId && r.origine === origine) ?? rs.find((r) => r.elementId === elementId && r.origine === null))?.parts ?? [];
}

/** Montant prévu d'une occurrence (ajustement, sinon règle) ; null si à compléter. */
export function montantPrevu(d: DonneesPaie, e: ElementStocke, origine: string): Cents | null {
  const a = d.ajustements.find((x) => x.elementId === e.id && x.origine === origine);
  if (a && a.montant !== undefined && a.montant !== null) return a.montant;
  return [...e.montants].filter((m) => m.aPartirDu <= origine).sort((x, y) => (x.aPartirDu < y.aPartirDu ? -1 : 1)).at(-1)?.montant ?? null;
}

/**
 * Q86 : parts reçues pour un montant donné. La proportion suit le montant
 * prévu ; sans montant prévu (P7), les parts sont fixes, réduites au prorata si
 * le montant ne suffit pas. Arrondi au cent inférieur ; l'écart va au non réservé.
 */
export function partsPour(parts: readonly { reserveId: string; montant: Cents }[], prevu: Cents | null, montant: Cents): Map<string, Cents> {
  const somme = parts.reduce((t, p) => t + p.montant, 0);
  const base = prevu ?? somme;
  const res = new Map<string, Cents>();
  if (somme === 0 || base === 0) return res;
  const facteur = prevu === null && montant >= somme ? null : montant;
  for (const p of parts) res.set(p.reserveId, facteur === null ? p.montant : Math.floor((p.montant * facteur) / base));
  return res;
}

/** Date d'une occurrence confirmée : prévue ou ajustée (Q67). */
export function dateOccurrence(d: DonneesPaie, elementId: string, origine: string): string {
  return d.ajustements.find((a) => a.elementId === elementId && a.origine === origine)?.date ?? origine;
}

/**
 * Parts reçues par chaque réserve pour chaque contribution confirmée. Elles
 * sont figées à la confirmation (mouvements « affectation » liés à
 * l'occurrence) : changer la répartition ensuite ne touche jamais le passé.
 */
export function partsConfirmees(_d: DonneesPaie, k: CompteStocke): { reserveId: string; date: string; montant: Cents; elementId: string; origine: string }[] {
  return reservesDe(k).flatMap((r) =>
    r.mouvements
      .filter((m) => m.sorte === 'affectation' && m.lien !== null && m.lien.includes('|'))
      .map((m) => {
        const [elementId, origine] = m.lien!.split('|') as [string, string];
        return { reserveId: r.id, date: m.date, montant: m.montant, elementId, origine };
      }),
  );
}

/** Parts à figer pour une confirmation de contribution (P1 à P7). */
export function partsAFiger(d: DonneesPaie, k: CompteStocke, elementId: string, origine: string, montant: Cents): Map<string, Cents> {
  const e = d.elements.find((x) => x.id === elementId);
  if (!e) return new Map();
  return partsPour(partsDe(k, elementId, origine), montantPrevu(d, e, origine), montant);
}

/** Solde d'une réserve : uniquement ce qui est réel (mouvements, parts confirmées). */
export function soldeReserve(d: DonneesPaie, k: CompteStocke, r: ReserveStockee, jusqua?: string): Cents {
  let solde = 0;
  const dans = (date: string) => jusqua === undefined || date <= jusqua;
  for (const m of r.mouvements) {
    if (!dans(m.date)) continue;
    solde += m.sorte === 'affectation' ? m.montant : -m.montant;
  }
  for (const x of reservesDe(k)) {
    for (const m of x.mouvements) if (m.sorte === 'reaffectation' && m.vers === r.id && dans(m.date)) solde += m.montant;
  }
  return solde;
}

/** Ce que les réserves ont réellement versé pour une occurrence de dépense. */
export function utiliseePour(d: DonneesPaie, depenseId: string, origine: string): Cents {
  const lien = cleOccurrence(depenseId, origine);
  return toutesLesReserves(d).reduce((t, { reserve }) => t + reserve.mouvements.filter((m) => m.sorte === 'utilisation' && m.lien === lien).reduce((u, m) => u + m.montant, 0), 0);
}

/** Mode de paiement d'une occurrence (Q90) : choisi pour elle, sinon selon la réserve liée. */
export function modeOccurrence(d: DonneesPaie, depenseId: string, origine: string): 'disponible' | 'reserve' {
  const choisi = (d.depenses ?? []).find((x) => x.id === depenseId)?.modes.find((m) => m.origine === origine);
  if (choisi) return choisi.mode;
  return reserveDeDepense(d, depenseId) ? 'reserve' : 'disponible';
}

interface BaseNoyau {
  profil: ProfilPaie | null;
  exceptions: EntreePlan['exceptions'];
  elements: EntreePlan['elements'];
  ajustements: EntreePlan['ajustements'];
  confirmations: EntreePlan['confirmations'];
}

/**
 * Couvertures de toutes les occurrences de dépenses à prévoir, dans une
 * fenêtre de trois ans après la dernière date connue.
 */
export function couvertures(d: DonneesPaie, base: BaseNoyau): Map<string, Cents | null> {
  const res = new Map<string, Cents | null>();
  const depenses = d.depenses ?? [];
  if (depenses.length === 0 || !base.profil) return res;
  const dates = [base.profil.frequence.depart as string, ...d.confirmations.map((f) => f.origine)].sort();
  const debut = ajouterJours(dateCivile(dates[0]!), -31);
  const fin = ajouterJours(dateCivile(dates.at(-1)!), 3 * 366);
  const plan = planifier({ profil: base.profil, exceptions: base.exceptions, elements: base.elements, ajustements: base.ajustements, confirmations: base.confirmations }, debut, fin);
  const lignes = plan.cycles.flatMap((c) => c.lignes.map((l) => ({ l, date: (l.echeance ?? c.paie.date) as string })));

  for (const dep of depenses) {
    const lieeA = reserveDeDepense(d, dep.id);
    // Projection de la réserve liée : solde réel, puis événements datés.
    type Evt = { date: string; ordre: number; part?: Cents | null; dep?: { origine: string; montant: Cents | null } };
    const evts: Evt[] = [];
    for (const { l, date } of lignes) {
      if (l.elementId === dep.id) {
        if (l.statut === 'confirme') {
          res.set(cleOccurrence(dep.id, l.origine), utiliseePour(d, dep.id, l.origine));
        } else if (l.retiree) {
          continue;
        } else if (modeOccurrence(d, dep.id, l.origine) === 'reserve' && lieeA) {
          evts.push({ date, ordre: 1, dep: { origine: l.origine, montant: l.montant } });
        }
      } else if (lieeA && lieeA.compte.contributions.includes(l.elementId) && l.statut !== 'confirme' && !l.retiree) {
        if (horsRepartition(lieeA.reserve, date)) continue;
        const parts = partsDe(lieeA.compte, l.elementId, l.origine);
        if (!parts.some((p) => p.reserveId === lieeA.reserve.id)) continue;
        const e = d.elements.find((x) => x.id === l.elementId)!;
        const part = l.montant === null ? null : (partsPour(parts, montantPrevu(d, e, l.origine), l.montant).get(lieeA.reserve.id) ?? 0);
        evts.push({ date, ordre: 0, part });
      }
    }
    if (!lieeA) continue;
    evts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ordre - b.ordre));
    let projete: Cents | null = soldeReserve(d, lieeA.compte, lieeA.reserve);
    for (const ev of evts) {
      if (ev.dep === undefined) {
        projete = projete === null || ev.part === null || ev.part === undefined ? (ev.part === undefined ? projete : null) : projete + ev.part;
        continue;
      }
      const cle = cleOccurrence(dep.id, ev.dep.origine);
      if (ev.dep.montant === null || projete === null) {
        res.set(cle, null);
        continue;
      }
      const couvert = Math.max(0, Math.min(ev.dep.montant, projete));
      res.set(cle, couvert);
      projete -= couvert;
    }
  }
  return res;
}
