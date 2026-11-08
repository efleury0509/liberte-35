// Date du jour, en date civile locale (jamais en UTC : à 21 h à Montréal,
// on est déjà « demain » en UTC). Dans l'aperçu du navigateur seulement,
// « ?aujourdhui=AAAA-MM-JJ » fixe la date pour les tests de l'interface.

import { composer, dateCivile, type DateCivile } from '../noyau/dates';

export function aujourdhui(): DateCivile {
  if (typeof location !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
    const fixe = new URLSearchParams(location.search).get('aujourdhui');
    if (fixe) return dateCivile(fixe);
  }
  const maintenant = new Date();
  return composer(maintenant.getFullYear(), maintenant.getMonth() + 1, maintenant.getDate());
}
