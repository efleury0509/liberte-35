// H2 : présentation des paies terminées (« Toutes mes paies » → « Terminées »).
// Regroupement par année et par mois seulement : aucun calcul financier ici,
// les cycles arrivent tels quels du noyau.
import type { Cycle } from '../noyau/cycles';
import { parties } from '../noyau/dates';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'] as const;

export interface AnneeHistorique {
  annee: number;
  paies: number;
  /** Éléments encore à vérifier dans les paies terminées de cette année. */
  aVerifier: number;
}

export interface MoisHistorique {
  cle: string;
  libelle: string;
  /** Les plus récentes d'abord. */
  cycles: Cycle[];
}

/** L'année d'une paie : celle de sa date de versement. */
export const anneeDe = (c: Cycle): number => parties(c.paie.date).annee;

/** Les années qui ont des paies terminées, la plus récente d'abord. */
export function anneesHistorique(cycles: readonly Cycle[]): AnneeHistorique[] {
  const parAnnee = new Map<number, AnneeHistorique>();
  for (const c of cycles) {
    const a = anneeDe(c);
    const e = parAnnee.get(a) ?? { annee: a, paies: 0, aVerifier: 0 };
    e.paies += 1;
    e.aVerifier += c.aVerifier;
    parAnnee.set(a, e);
  }
  return [...parAnnee.values()].sort((x, y) => y.annee - x.annee);
}

/** Les paies d'une année, regroupées par mois, les plus récentes d'abord. */
export function moisHistorique(cycles: readonly Cycle[], annee: number, seulementAVerifier = false): MoisHistorique[] {
  const groupes = new Map<number, Cycle[]>();
  for (const c of cycles) {
    if (anneeDe(c) !== annee || (seulementAVerifier && c.aVerifier === 0)) continue;
    const m = parties(c.paie.date).mois;
    groupes.set(m, [...(groupes.get(m) ?? []), c]);
  }
  return [...groupes.entries()]
    .sort(([a], [b]) => b - a)
    .map(([m, liste]) => ({
      cle: `${annee}-${String(m).padStart(2, '0')}`,
      libelle: `${MOIS[m - 1]} ${annee}`,
      cycles: [...liste].sort((a, b) => (a.paie.date < b.paie.date ? 1 : -1)),
    }));
}

/** L'année à ouvrir : la plus récente, ou la plus récente qui a encore quelque chose à vérifier. */
export function anneeParDefaut(annees: readonly AnneeHistorique[], aVerifier = false): number | null {
  const choix = aVerifier ? annees.find((a) => a.aVerifier > 0) : annees[0];
  return (choix ?? annees[0])?.annee ?? null;
}

/** État de vérification, distinct de « Terminée ». */
export function texteVerification(n: number): string {
  if (n === 0) return 'Rien à vérifier';
  return n === 1 ? '1 à vérifier' : `${n} à vérifier`;
}
