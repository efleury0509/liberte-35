// Règles récurrentes : une fréquence, des montants datés, des suspensions
// et une fin éventuelle (cahier 4.5, 4.6, 14.3 ; règle Q3).
//
// - Un changement de montant s'ajoute « à partir du » : le passé garde
//   l'ancien montant, il n'est jamais réécrit (E6).
// - Les dates d'effet, de fin et de suspension sont incluses (Q3).
// - Si aucun montant n'est connu pour une date, l'occurrence porte un montant
//   nul (null) : rien n'est inventé (décision A6).

import { ajouterJours, type DateCivile } from './dates';
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

/** Nouvelle fréquence « à partir du » (étape 4b, B) : le passé garde l'ancienne. */
export interface ChangementFrequence {
  aPartirDu: DateCivile;
  frequence: Frequence;
}

export interface Regle {
  /** Fréquence d'origine, valable jusqu'au premier changement. */
  frequence: Frequence;
  montants: readonly MontantDate[];
  suspensions?: readonly Suspension[] | undefined;
  fin?: DateCivile;
  /** Changements de fréquence datés, dans n'importe quel ordre. */
  changements?: readonly ChangementFrequence[] | undefined;
}

export interface Periode {
  frequence: Frequence;
  /** Premier jour de la période ; null : depuis toujours. */
  debut: DateCivile | null;
  /** Dernier jour de la période ; null : sans fin prévue. */
  fin: DateCivile | null;
}

/** Périodes successives d'une règle : une par fréquence, sans chevauchement. */
export function periodesDe(r: Regle): Periode[] {
  const changements = [...(r.changements ?? [])].sort((a, b) => (a.aPartirDu < b.aPartirDu ? -1 : 1));
  const periodes: Periode[] = [];
  let debut: DateCivile | null = null;
  let frequence = r.frequence;
  for (const c of changements) {
    periodes.push({ frequence, debut, fin: ajouterJours(c.aPartirDu, -1) });
    debut = c.aPartirDu;
    frequence = c.frequence;
  }
  periodes.push({ frequence, debut, fin: null });
  return periodes;
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
  const dates = (r.changements ?? []).map((c) => c.aPartirDu);
  if (new Set(dates).size !== dates.length) {
    throw new ErreurRegle('Deux changements de fréquence ne peuvent pas commencer le même jour.');
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
  return periodesDe(r)
    .flatMap((p) => {
      const de = p.debut !== null && p.debut > debut ? p.debut : debut;
      const a = p.fin !== null && p.fin < borne ? p.fin : borne;
      return de > a ? [] : datesDe(p.frequence, de, a, paies);
    })
    .filter((d) => !estSuspendue(d, suspensions))
    .map((d) => ({ date: d, montant: montantEnVigueur(r.montants, d) }));
}
