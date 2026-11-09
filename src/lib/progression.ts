// Progression vers une cible : affichée seulement quand elle est calculable.
// Une valeur ou une cible inconnue donne « À compléter », jamais 0 % (cahier V1, section 6).
import type { Cents } from '../noyau/montants';

export type Progression =
  | { calculable: true; pourcentage: number; largeur: number; atteinte: boolean }
  | { calculable: false; raison: 'valeur-inconnue' | 'cible-inconnue' };

export function progression(valeur: Cents | null, cible: Cents | null): Progression {
  if (valeur === null) return { calculable: false, raison: 'valeur-inconnue' };
  if (cible === null || cible <= 0) return { calculable: false, raison: 'cible-inconnue' };
  // Arrondi vers le bas : on n'annonce jamais un progrès qui n'est pas atteint.
  const pourcentage = Math.max(0, Math.floor((valeur * 100) / cible));
  return { calculable: true, pourcentage, largeur: Math.min(100, pourcentage), atteinte: valeur >= cible };
}
