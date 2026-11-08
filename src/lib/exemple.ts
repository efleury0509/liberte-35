// L'exemple fictif (décision Q10) n'existe que hors de l'installation
// officielle : jamais de données fictives à côté des vraies.

import type { Profil } from './plateforme';

export function exempleAutorise(profil: Profil | undefined): boolean {
  return profil === 'essai' || profil === 'apercu';
}
