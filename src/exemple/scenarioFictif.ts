// Scénario FICTIF des cas témoins de l'étape 3 (validés le 8 novembre 2026).
// Sert aux tests automatiques et au bouton « Voir l'exemple fictif » de
// l'installation d'essai. Ces données ne sont jamais enregistrées.

import { dateCivile as d } from '../noyau/dates';
import type { ElementPlanifie } from '../noyau/cycles';
import type { ProfilPaie } from '../noyau/paie';

export const PROFIL_FICTIF: ProfilPaie = {
  frequence: { type: 'deuxSemaines', depart: d('2027-01-07') },
  montants: [{ aPartirDu: d('2027-01-07'), montant: 210_000 }],
};

const DEBUT = d('2027-01-01');

export const ELEMENTS_FICTIFS: readonly ElementPlanifie[] = [
  {
    id: 'loyer',
    libelle: 'Loyer',
    regle: { frequence: { type: 'mois', n: 1, depart: d('2027-01-01') }, montants: [{ aPartirDu: DEBUT, montant: 120_000 }] },
  },
  {
    id: 'assurances',
    libelle: 'Assurances',
    regle: { frequence: { type: 'mois', n: 1, depart: d('2027-01-15') }, montants: [{ aPartirDu: DEBUT, montant: 14_000 }] },
  },
  {
    id: 'epicerie',
    libelle: 'Épicerie',
    regle: { frequence: { type: 'rangPaie', rang: 1 }, montants: [{ aPartirDu: DEBUT, montant: 30_000 }] },
  },
  {
    id: 'essence',
    libelle: 'Essence',
    regle: { frequence: { type: 'chaquePaie' }, montants: [{ aPartirDu: DEBUT, montant: 6_000 }] },
  },
  {
    id: 'supplement',
    libelle: 'Paiement supplémentaire de dette',
    regle: { frequence: { type: 'rangPaie', rang: 2 }, montants: [{ aPartirDu: DEBUT, montant: 10_000 }] },
  },
];

/** Période affichée par l'exemple : les neuf cycles des cas C1 à C9. */
export const PERIODE_FICTIVE = { debut: d('2027-01-01'), fin: d('2027-04-29') } as const;
