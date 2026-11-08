// Tous les libellés de l'interface sont ici, pour ajuster le ton
// sans toucher au code (architecture, section 7).

export const TEXTES = {
  application: {
    nom: 'Liberté 35',
    devise: 'Pas de jugement sur hier. De la clarté pour aujourd’hui. De la liberté pour demain.',
  },
  profil: {
    essai: 'Installation d’essai — données fictives seulement',
    officiel: 'Installation officielle',
    apercu: 'Aperçu dans le navigateur — rien n’est enregistré',
  },
  navigation: {
    titre: 'Navigation principale',
  },
  sectionAVenir: {
    titre: 'Cette section arrive bientôt',
    corps: (etape: string) => `Elle sera construite à l’étape ${etape} du plan de développement.`,
  },
  parametres: {
    titreInstallation: 'À propos de cette installation',
    profil: 'Type d’installation',
    version: 'Version de l’application',
    schema: 'Version de la structure des données',
    dossier: 'Dossier des données',
    integrite: 'Vérification du fichier de données',
    integriteOk: 'Aucun problème détecté',
    integriteKo: 'Problème détecté',
    journal: 'Changements consignés au journal',
    chargement: 'Lecture en cours…',
    erreur: 'Impossible de lire l’état de l’application.',
  },
} as const;
