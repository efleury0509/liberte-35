// H3 : mini-bilan d'une paie terminée. Présentation seulement : on additionne
// ce que le noyau a déjà calculé pour chaque opération, sans nouvelle règle.
//
// - « Prévu » : le montant de la règle ou de l'ajustement (montantPrevu),
//   comme le plan. Un revenu incertain n'y entre pas (A3) ; une occurrence
//   retirée non plus. S'il manque un montant, le total est inconnu (null :
//   « À compléter »), jamais 0.
// - « Confirmé » : la somme des montants que tu as confirmés, avec le nombre
//   d'opérations confirmées. Ce n'est pas un solde bancaire.
// - Les enveloppes restent prévues : elles ne se confirment jamais.
// - Aucun écart prévu/confirmé n'est calculé (décision H3).
import type { Cycle, Ligne } from '../noyau/cycles';
import type { Cents } from '../noyau/montants';

export interface ColonneBilan {
  /** Total prévu ; null si un montant prévu manque. */
  prevu: Cents | null;
  /** Total des montants confirmés (0 quand rien n'est confirmé : voir `confirmees`). */
  confirme: Cents;
  /** Opérations confirmées. */
  confirmees: number;
  /** Opérations qui peuvent être confirmées. */
  operations: number;
}

export interface BilanPaie {
  revenus: ColonneBilan;
  sorties: ColonneBilan;
  enveloppes: { prevu: Cents | null; nombre: number };
  /** Occurrences retirées cette fois : jamais comptées. */
  retirees: number;
  /** Revenus incertains non confirmés : affichés, jamais comptés. */
  nonComptes: Cents;
  /** La paie elle-même est-elle encore à vérifier ? */
  paieAVerifier: boolean;
  /** Opérations encore à vérifier (paie non comprise). */
  aVerifier: Ligne[];
  /** Au moins une sortie est payée en partie avec une réserve d'épargne. */
  avecReserve: boolean;
}

const somme = (montants: (Cents | null)[]): Cents | null => (montants.every((m): m is Cents => m !== null) ? montants.reduce((a, b) => a + b, 0) : null);

export function bilanPaie(c: Cycle): BilanPaie {
  const actives = c.lignes.filter((l) => !l.retiree);
  const revenus = actives.filter((l) => l.nature === 'revenu');
  const sorties = actives.filter((l) => l.nature === 'depense' && l.genre !== 'enveloppe');
  const enveloppes = actives.filter((l) => l.nature === 'depense' && l.genre === 'enveloppe');
  const confirmes = (ls: Ligne[]) => ls.filter((l) => l.confirmation !== null);
  const totalConfirme = (ls: Ligne[]) => confirmes(ls).reduce((a, l) => a + (l.confirmation?.montant ?? 0), 0);

  const revenusPrevus = somme([c.paie.montant, ...revenus.filter((l) => !l.incertain).map((l) => l.montantPrevu)]);
  return {
    revenus: {
      prevu: revenusPrevus,
      confirme: (c.paieConfirmation?.montant ?? 0) + totalConfirme(revenus),
      confirmees: (c.paieConfirmation ? 1 : 0) + confirmes(revenus).length,
      operations: 1 + revenus.length,
    },
    sorties: {
      prevu: somme(sorties.map((l) => l.montantPrevu)),
      confirme: totalConfirme(sorties),
      confirmees: confirmes(sorties).length,
      operations: sorties.length,
    },
    enveloppes: { prevu: enveloppes.length === 0 ? 0 : somme(enveloppes.map((l) => l.montantPrevu)), nombre: enveloppes.length },
    retirees: c.lignes.length - actives.length,
    nonComptes: c.nonComptes,
    paieAVerifier: c.paieStatut === 'aVerifier',
    aVerifier: actives.filter((l) => l.statut === 'aVerifier'),
    avecReserve: sorties.some((l) => l.couvert !== null && l.couvert > 0),
  };
}
