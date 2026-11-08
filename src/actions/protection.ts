// Étape 5, Q23 : protection simple des faits confirmés. Une modification
// reste permise tant qu'elle garde toutes les opérations confirmées ; si elle
// en ferait disparaître une, seule cette modification est refusée, avec une
// explication claire. Les données ne sont jamais touchées en silence.

import { appliquerChangements } from '../lib/appliquer';
import type { ChangementPaie, ConfirmationStockee, DonneesPaie } from '../lib/plateforme';
import { ajustementsOrphelins } from '../noyau/cycles';
import { ajouterJours, formaterDateCourte, type DateCivile } from '../noyau/dates';
import { paiesEntre } from '../noyau/paie';
import { versNoyau, type DonneesNoyau } from './paie';

function existe(n: DonneesNoyau, f: ConfirmationStockee): boolean {
  if (!n.profil) return false;
  const origine = f.origine as DateCivile;
  if (f.elementId === null) {
    return paiesEntre(n.profil, n.exceptions, ajouterJours(origine, -40), ajouterJours(origine, 40)).some((p) => p.dateOrigine === origine);
  }
  if (!n.elements.some((e) => e.id === f.elementId)) return false;
  const orphelins = ajustementsOrphelins({
    profil: n.profil,
    exceptions: n.exceptions,
    elements: n.elements,
    ajustements: [{ elementId: f.elementId, origine }],
  });
  return orphelins.length === 0;
}

/** Confirmations qui existaient et qui disparaîtraient avec ces changements. */
export function confirmationsPerdues(d: DonneesPaie, changements: readonly ChangementPaie[]): ConfirmationStockee[] {
  const confirmations = d.confirmations ?? [];
  if (confirmations.length === 0) return [];
  let apres: DonneesPaie;
  try {
    apres = appliquerChangements(d, changements);
  } catch {
    return [];
  }
  const avantN = versNoyau(d);
  const apresN = versNoyau(apres);
  return confirmations.filter((f) => existe(avantN, f) && !existe(apresN, f));
}

export function messageConfirmationsPerdues(d: DonneesPaie, perdues: readonly ConfirmationStockee[]): string {
  const nom = (f: ConfirmationStockee) => {
    const quand = formaterDateCourte(f.origine as DateCivile);
    if (f.elementId === null) return `la paie du ${quand}`;
    const libelle = (d.elements ?? []).find((e) => e.id === f.elementId)?.libelle ?? f.elementId;
    return `« ${libelle} » du ${quand}`;
  };
  const liste = perdues.map(nom).join(', ');
  return perdues.length === 1
    ? `Cette modification ferait disparaître une opération confirmée : ${liste}. Choisis une date qui la garde, ou annule d’abord la confirmation.`
    : `Cette modification ferait disparaître des opérations confirmées : ${liste}. Choisis une date qui les garde, ou annule d’abord leurs confirmations.`;
}

/** Une occurrence porte-t-elle une confirmation ? */
export function estConfirmee(d: DonneesPaie, elementId: string | null, origine: string): boolean {
  return (d.confirmations ?? []).some((f) => f.elementId === elementId && f.origine === origine);
}
