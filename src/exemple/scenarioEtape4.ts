// Scénario FICTIF des cas témoins de l'étape 4 (validés le 8 novembre 2026).
// Sert aux tests automatiques et au bouton « Voir l'exemple fictif » de
// l'installation d'essai. Ces données ne sont jamais enregistrées.

import { dateCivile as d } from '../noyau/dates';
import type { ElementPlanifie } from '../noyau/cycles';
import type { ProfilPaie } from '../noyau/paie';

export const PROFIL_ETAPE4: ProfilPaie = {
  frequence: { type: 'deuxSemaines', depart: d('2027-01-07') },
  montants: [{ aPartirDu: d('2027-01-07'), montant: 210_000 }],
};

const DEBUT = d('2027-01-01');
const montant = (c: number) => [{ aPartirDu: DEBUT, montant: c }];

export const ELEMENTS_ETAPE4: readonly ElementPlanifie[] = [
  // Autres revenus
  {
    id: 'allocation',
    libelle: 'Allocation',
    nature: 'revenu',
    regle: { frequence: { type: 'mois', n: 1, depart: d('2027-01-20') }, montants: montant(15_000) },
  },
  {
    id: 'pige',
    libelle: 'Contrat à la pige',
    nature: 'revenu',
    estimation: true,
    regle: { frequence: { type: 'ponctuelle', date: d('2027-02-25') }, montants: montant(30_000) },
  },
  {
    id: 'impot',
    libelle: 'Remboursement d’impôt',
    nature: 'revenu',
    incertain: true,
    estimation: true,
    regle: { frequence: { type: 'ponctuelle', date: d('2027-03-10') }, montants: montant(80_000) },
  },
  // Dépenses fixes
  {
    id: 'loyer',
    libelle: 'Loyer',
    regle: { frequence: { type: 'mois', n: 1, depart: d('2027-01-01') }, montants: montant(120_000) },
  },
  {
    id: 'assurances',
    libelle: 'Assurances',
    regle: { frequence: { type: 'mois', n: 1, depart: d('2027-01-15') }, montants: montant(14_000) },
  },
  {
    id: 'hydro',
    libelle: 'Hydro',
    estimation: true,
    regle: { frequence: { type: 'mois', n: 2, depart: d('2027-02-10') }, montants: montant(9_500) },
  },
  {
    id: 'gym',
    libelle: 'Gym',
    regle: {
      frequence: { type: 'mois', n: 1, depart: d('2027-01-05') },
      montants: montant(4_000),
      suspensions: [{ debut: d('2027-03-01'), fin: d('2027-04-30') }],
    },
  },
  {
    id: 'cellulaire',
    libelle: 'Cellulaire',
    regle: { frequence: { type: 'mois', n: 1, depart: d('2027-01-22') }, montants: montant(5_500), fin: d('2027-03-22') },
  },
  // Enveloppes variables
  {
    id: 'epicerie',
    libelle: 'Épicerie',
    genre: 'enveloppe',
    regle: { frequence: { type: 'rangPaie', rang: 1 }, montants: montant(30_000) },
  },
  {
    id: 'essence',
    libelle: 'Essence',
    genre: 'enveloppe',
    regle: { frequence: { type: 'chaquePaie' }, montants: montant(6_000) },
  },
  // Dépenses ponctuelles
  {
    id: 'cadeau',
    libelle: 'Cadeau d’anniversaire',
    regle: { frequence: { type: 'ponctuelle', date: d('2027-02-27') }, montants: montant(7_500) },
  },
  {
    id: 'coupe',
    libelle: 'Coupe de cheveux',
    cyclePaie: d('2027-03-04'),
    regle: { frequence: { type: 'ponctuelle', date: d('2027-03-04') }, montants: montant(4_500) },
  },
];

/** Période affichée par l'exemple : les quatre cycles M1 à M4. */
export const PERIODE_ETAPE4 = { debut: d('2027-02-01'), fin: d('2027-03-31') } as const;
