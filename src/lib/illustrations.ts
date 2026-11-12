// Registre des illustrations approuvées. Les fichiers haute résolution seront
// fournis séparément ; tant qu'un fichier manque, son emplacement reste vide
// (aucune version simplifiée définitive, décision V1 du 9 nov. 2026).
// 0.16.0 : la loutre de bienvenue de l'Accueil est le premier fichier fourni,
// embarqué tel quel (1 671 × 941, aucun recadrage ni retouche).

import loutreBienvenue from '../assets/illustrations/loutre_bienvenue_accueil.png';
// Dépenses : la loutre gestionnaire (2e version approuvée), en tête de la
// colonne de droite ; métadonnées d'origine retirées, pixels identiques.
import loutreDepenses from '../assets/illustrations/loutre_gestionnaire_depenses.png';
// Épargne : la loutre jardinière, à côté du bandeau des totaux (maquette B).
import loutreEpargne from '../assets/illustrations/loutre_jardiniere_epargne.png';
// Mes paies : la loutre organisatrice, à droite du titre et des boutons
// (maquette A) ; bords d'origine adoucis, posée sur le crème sans cadre.
import loutrePaies from '../assets/illustrations/loutre_organisatrice_paies.png';
// Dettes : le paysage panoramique « Liberté financière » (3:1), dans l'en-tête
// (maquette A) ; l'original paysage_liberte_financiere.png reste à part, intact.
import paysageDettes from '../assets/illustrations/paysage_liberte_financiere_panoramique.png';

export type NomIllustration =
  | 'cafe-glace'
  | 'licorne'
  | 'loutre'
  | 'loutre-bienvenue'
  | 'loutre-depenses'
  | 'loutre-epargne'
  | 'loutre-paies'
  | 'paysage-dettes'
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
  'loutre-depenses': {
    alt: 'Une loutre en coton ouaté mauve vérifie un long reçu, entourée d’un carnet « Budget mensuel », d’une calculatrice, d’une tirelire et de son café glacé.',
    fichier: loutreDepenses,
  },
  'loutre-epargne': {
    alt: 'Une loutre jardinière arrose des pots étiquetés Fonds d’urgence, Projets à venir, CELI, REER et Réserves.',
    fichier: loutreEpargne,
  },
  'loutre-paies': {
    alt: 'Une loutre organisatrice fait un clin d’œil en cochant Paie, Factures et Épargne dans son agenda, à côté d’un calendrier et de son café glacé.',
    fichier: loutrePaies,
  },
  'paysage-dettes': {
    alt: 'Une loutre au café glacé montre l’horizon près d’un panneau « Liberté financière », au bout d’un chemin fleuri, sous un coucher de soleil.',
    fichier: paysageDettes,
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
