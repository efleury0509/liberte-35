// Règles récurrentes : une fréquence, des montants datés, des suspensions
// et une fin éventuelle (cahier 4.5, 4.6, 14.3 ; règle Q3).
//
// - Un changement de montant s'ajoute « à partir du » : le passé garde
//   l'ancien montant, il n'est jamais réécrit (E6).
// - Les dates d'effet, de fin et de suspension sont incluses (Q3).
// - Si aucun montant n'est connu pour une date, l'occurrence porte un montant
//   nul (null) : rien n'est inventé (décision A6).

import type { DateCivile } from './dates';
import { datesDe, type Frequence } from './frequences';
import type { Cents } from './montants';

export interface MontantDate {
  aPartirDu: DateCivile;
  montant: Cents;
}

export interface Suspension {
  debut: DateCivile;
  fin: DateCivile;
}

export interface Regle {
  frequence: Frequence;
  montants: readonly MontantDate[];
  suspensions?: readonly Suspension[] | undefined;
  fin?: DateCivile;
}

export interface Occurrence {
  date: DateCivile;
  /** null : aucun montant connu à cette date (à compléter). */
  montant: Cents | null;
}

export class ErreurRegle extends Error {}

function verifier(r: Regle): void {
  for (const m of r.montants) {
    if (!Number.isSafeInteger(m.montant)) {
      throw new ErreurRegle(`Montant invalide au ${m.aPartirDu} : il doit être un nombre entier de cents.`);
    }
  }
  for (const s of r.suspensions ?? []) {
    if (s.fin < s.debut) {
      throw new ErreurRegle(`Suspension invalide : la fin (${s.fin}) précède le début (${s.debut}).`);
    }
  }
}

/** Montant en vigueur à une date : le dernier fixé « à partir du » cette date ou avant. */
export function montantEnVigueur(montants: readonly MontantDate[], date: DateCivile): Cents | null {
  let resultat: Cents | null = null;
  let depuis: DateCivile | null = null;
  for (const m of montants) {
    if (m.aPartirDu <= date && (depuis === null || m.aPartirDu >= depuis)) {
      resultat = m.montant;
      depuis = m.aPartirDu;
    }
  }
  return resultat;
}

function estSuspendue(date: DateCivile, suspensions: readonly Suspension[]): boolean {
  return suspensions.some((s) => date >= s.debut && date <= s.fin);
}

/** Occurrences d'une règle entre `debut` et `fin` inclus. */
export function occurrences(
  r: Regle,
  debut: DateCivile,
  fin: DateCivile,
  paies?: readonly DateCivile[],
): Occurrence[] {
  verifier(r);
  const borne = r.fin !== undefined && r.fin < fin ? r.fin : fin;
  const suspensions = r.suspensions ?? [];
  return datesDe(r.frequence, debut, borne, paies)
    .filter((d) => !estSuspendue(d, suspensions))
    .map((d) => ({ date: d, montant: montantEnVigueur(r.montants, d) }));
}
