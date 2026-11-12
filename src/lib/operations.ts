// V1 lot 6b : ce que les cartes de Mes paies montrent d'un cycle, et ce
// qu'elles laissent au détail complet. Présentation seulement : aucun calcul
// financier ici, on compte des lignes du noyau.
import type { Cycle, Ligne } from '../noyau/cycles';

/** Nombre de dépenses principales montrées sur une carte. */
export const NOMBRE_PRINCIPALES = 4;

/** Les dépenses principales : les montants inconnus d'abord (à compléter), puis les plus grosses. */
export function principales(c: Cycle): Ligne[] {
  return c.lignes
    .filter((l) => l.nature === 'depense' && !l.retiree)
    .sort((a, b) => (a.montant === null ? -1 : b.montant === null ? 1 : b.montant - a.montant))
    .slice(0, NOMBRE_PRINCIPALES);
}

/** Les opérations du détail complet d'un cycle : la paie, puis chaque ligne. */
export function nombreOperations(c: Cycle): number {
  return 1 + c.lignes.length;
}

/** Les opérations du détail que la carte ne montre pas (« + N autres opérations »). */
export function autresOperations(c: Cycle): number {
  return nombreOperations(c) - principales(c).length;
}

export function texteAutresOperations(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? '+ 1 autre opération' : `+ ${n} autres opérations`;
}

/**
 * Lot 1 : intitulés des quatre cartes de « Mes prochaines paies ». Ils ne
 * parlent ni de durée ni de cadence : ils restent justes même quand une paie
 * est déplacée ou que la cadence change. Les dates restent sur chaque carte.
 * `periodeCommencee` : une paie a déjà commencé (la date du jour est dans un
 * cycle) ; sinon la première carte est la première paie à venir.
 */
export function titresCartes(periodeCommencee: boolean): [string, string, string, string] {
  return [periodeCommencee ? 'Paie actuelle' : 'Première paie à venir', 'Prochaine paie', 'Paie suivante', 'Paie d’après'];
}
