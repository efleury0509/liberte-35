// Pont entre l'interface et le reste de l'application.
// Dans l'application installée, les demandes passent par Tauri vers le
// stockage SQLite. Dans un simple navigateur (développement, tests de
// l'interface), un aperçu en mémoire répond à la place : rien n'est enregistré.

import { invoke } from '@tauri-apps/api/core';

export type Profil = 'essai' | 'officiel' | 'apercu';

export interface EtatApplication {
  profil: Profil;
  versionApplication: string;
  versionSchema: number;
  dossierDonnees: string;
  integriteOk: boolean;
  nombreEntreesJournal: number;
}

export interface Plateforme {
  etat(): Promise<EtatApplication>;
}

function dansTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const plateformeTauri: Plateforme = {
  etat: () => invoke<EtatApplication>('etat_application'),
};

// Pour les tests de l'interface seulement : « ?simuler=erreur » dans
// l'adresse de l'aperçu simule un fichier de données illisible.
// N'existe pas dans l'application installée.
function simulation(): string | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('simuler');
}

export const plateformeApercu: Plateforme = {
  etat: async () => {
    if (simulation() === 'erreur') {
      throw 'Le contrôle d’intégrité a échoué (simulation). Rien n’a été modifié.';
    }
    return {
    profil: 'apercu',
    versionApplication: '0.1.0',
    versionSchema: 1,
    dossierDonnees: '(aucun : aperçu en mémoire)',
    integriteOk: true,
    nombreEntreesJournal: 0,
    };
  },
};

export function obtenirPlateforme(): Plateforme {
  return dansTauri() ? plateformeTauri : plateformeApercu;
}
