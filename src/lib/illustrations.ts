// Registre des illustrations approuvées. Les fichiers haute résolution seront
// fournis séparément ; tant qu'un fichier manque, son emplacement reste vide
// (aucune version simplifiée définitive, décision V1 du 9 nov. 2026).
// 0.16.0 : la loutre de bienvenue de l'Accueil est le premier fichier fourni,
// embarqué tel quel (1 671 × 941, aucun recadrage ni retouche).

import loutreBienvenue from '../assets/illustrations/loutre_bienvenue_accueil.png';

export type NomIllustration =
  | 'cafe-glace'
  | 'licorne'
  | 'loutre'
  | 'loutre-bienvenue'
  | 'loutre-savante'
  | 'paysage-liberte'
  | 'popcorn'
  | 'livres-plante'
  | 'cloche'
  | 'calendrier'
  | 'arc-en-ciel'
  | 'vagues';

export interface Illustration {
  /** Texte de remplacement ; vide pour une illustration purement décorative. */
  alt: string;
  /** Adresse du fichier embarqué (import Vite), ou null tant qu'il n'est pas fourni. */
  fichier: string | null;
}

export const ILLUSTRATIONS: Record<NomIllustration, Illustration> = {
  'cafe-glace': { alt: '', fichier: null },
  licorne: { alt: '', fichier: null },
  loutre: { alt: '', fichier: null },
  'loutre-bienvenue': {
    alt: 'Une loutre à lunettes roses salue d’un clin d’œil, devant un tableau où est écrit « Bonjour ! ».',
    fichier: loutreBienvenue,
  },
  'loutre-savante': { alt: '', fichier: null },
  'paysage-liberte': { alt: '', fichier: null },
  popcorn: { alt: '', fichier: null },
  'livres-plante': { alt: '', fichier: null },
  cloche: { alt: '', fichier: null },
  calendrier: { alt: '', fichier: null },
  'arc-en-ciel': { alt: '', fichier: null },
  vagues: { alt: '', fichier: null },
};
