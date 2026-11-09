// Registre des illustrations approuvées. Les fichiers haute résolution seront
// fournis séparément ; tant qu'un fichier manque, son emplacement reste vide
// (aucune version simplifiée définitive, décision V1 du 9 nov. 2026).

export type NomIllustration =
  | 'cafe-glace'
  | 'licorne'
  | 'loutre'
  | 'loutre-savante'
  | 'paysage-liberte'
  | 'popcorn'
  | 'livres-plante'
  | 'cloche'
  | 'calendrier';

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
  'loutre-savante': { alt: '', fichier: null },
  'paysage-liberte': { alt: '', fichier: null },
  popcorn: { alt: '', fichier: null },
  'livres-plante': { alt: '', fichier: null },
  cloche: { alt: '', fichier: null },
  calendrier: { alt: '', fichier: null },
};
