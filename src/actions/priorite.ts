// Lot 1 : priorité de remboursement des dettes, choisie à la main.
//
// C'est un réglage d'affichage : il ne déclenche aucun paiement et ne change
// ni prévision, ni solde, ni calcul. Sans priorité choisie, rien n'est
// inventé : aucune dette n'a de rang. Une dette ajoutée plus tard reste
// « sans priorité » jusqu'à ce que tu la classes.
import type { DonneesPaie } from '../lib/plateforme';
import { laCarte } from './cartes';
import { ErreurSaisie, type Proposition } from './paie';
import { SECTION_DETTES } from './prets';

export interface DetteClassable {
  id: string;
  nom: string;
  sorte: 'pret' | 'carte';
}

const nomDe = (d: DonneesPaie, id: string) => (d.elements ?? []).find((e) => e.id === id)?.libelle ?? id;

/** Les dettes en cours : prêts non remboursés et la carte. */
export function dettesEnCours(d: DonneesPaie): DetteClassable[] {
  const prets = (d.prets ?? [])
    .filter((p) => p.rembourseLe === null)
    .map((p): DetteClassable => ({ id: p.id, nom: nomDe(d, p.id), sorte: 'pret' }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const carte = laCarte(d);
  return carte ? [...prets, { id: carte.id, nom: nomDe(d, carte.id), sorte: 'carte' }] : prets;
}

/** L'ordre choisi, limité aux dettes en cours. */
export function prioriteActive(d: DonneesPaie): string[] {
  const enCours = new Set(dettesEnCours(d).map((x) => x.id));
  return (d.prioriteDettes ?? []).filter((id) => enCours.has(id));
}

/** Rang d'une dette (1 = la première), ou null si aucune priorité n'est choisie pour elle. */
export function rangPriorite(d: DonneesPaie, id: string): number | null {
  const i = prioriteActive(d).indexOf(id);
  return i < 0 ? null : i + 1;
}

/** Les dettes en cours, classées d'abord (dans l'ordre choisi), puis les autres. */
export function dettesParPriorite(d: DonneesPaie): (DetteClassable & { rang: number | null })[] {
  const ordre = prioriteActive(d);
  const toutes = dettesEnCours(d);
  const classees = ordre.map((id, i) => ({ ...toutes.find((x) => x.id === id)!, rang: i + 1 }));
  const autres = toutes.filter((x) => !ordre.includes(x.id)).map((x) => ({ ...x, rang: null }));
  return [...classees, ...autres];
}

const decrire = (d: DonneesPaie, ordre: readonly string[]) => (ordre.length === 0 ? 'Aucune priorité' : ordre.map((id, i) => `${i + 1}. ${nomDe(d, id)}`).join(' · '));

/**
 * Enregistrer un ordre de priorité (toutes les dettes listées sont classées,
 * dans cet ordre). Une liste vide retire les priorités. Enregistrement direct,
 * avec « Annuler » : aucun cycle ne change.
 */
export function proposerPrioriteDettes(d: DonneesPaie, ordre: readonly string[]): Proposition {
  const enCours = new Set(dettesEnCours(d).map((x) => x.id));
  if (new Set(ordre).size !== ordre.length) throw new ErreurSaisie('Une dette apparaît deux fois dans l’ordre.');
  const inconnue = ordre.find((id) => !enCours.has(id));
  if (inconnue) throw new ErreurSaisie(`« ${nomDe(d, inconnue)} » n’est pas une dette en cours.`);
  const avant = prioriteActive(d);
  if (avant.length === ordre.length && avant.every((id, i) => id === ordre[i])) throw new ErreurSaisie('Rien ne change.');
  return {
    titre: ordre.length === 0 ? 'Retirer les priorités de remboursement' : 'Ordre de priorité des dettes',
    lignes: [{ libelle: 'Priorité de remboursement', avant: decrire(d, avant), apres: decrire(d, ordre) }],
    consequences: ['Un repère seulement : aucun paiement, aucune prévision et aucun solde ne change.'],
    changements: [{ type: 'definirPrioriteDettes', ordre: [...ordre] }],
    journal: [{ section: SECTION_DETTES, objet: 'Priorité de remboursement', champ: 'ordre', ancienneValeur: decrire(d, avant), nouvelleValeur: decrire(d, ordre), motif: null }],
    apercu: false,
  };
}
