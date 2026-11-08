// Pont entre l'interface et le reste de l'application.
// Dans l'application installée, les demandes passent par Tauri vers le
// stockage SQLite. Dans un simple navigateur (développement, tests de
// l'interface), un aperçu en mémoire répond à la place : rien n'est enregistré.

import { invoke } from '@tauri-apps/api/core';
import { version as VERSION_APPLICATION } from '../../package.json';

export type Profil = 'essai' | 'officiel' | 'apercu';

export interface EtatApplication {
  profil: Profil;
  versionApplication: string;
  versionSchema: number;
  dossierDonnees: string;
  integriteOk: boolean;
  nombreEntreesJournal: number;
}

// Format d'échange avec le stockage (identique aux types Rust).
export type FrequenceStockee = 'hebdomadaire' | 'deuxSemaines' | 'deuxFoisParMois' | 'mensuelle';

export interface ProfilPaieStocke {
  frequence: FrequenceStockee;
  depart: string;
  jours: [number, number] | null;
}

export interface SalaireStocke {
  aPartirDu: string;
  montant: number;
}

export interface ExceptionStockee {
  dateOrigine: string;
  dateReelle: string | null;
  montant: number | null;
}

export interface MontantStocke {
  aPartirDu: string;
  montant: number;
}

export interface SuspensionStockee {
  debut: string;
  fin: string;
}

/**
 * Autre revenu ou dépense (étape 4). La fréquence garde le format du noyau
 * (par exemple { type: 'mois', n: 1, depart: '2027-01-20' }).
 */
export interface ElementStocke {
  id: string;
  libelle: string;
  nature: 'revenu' | 'depense';
  genre: 'fixe' | 'enveloppe';
  incertain: boolean;
  estimation: boolean;
  frequence: Record<string, unknown> & { type: string };
  montants: MontantStocke[];
  suspensions: SuspensionStockee[];
  fin: string | null;
  /** Dépense ponctuelle rattachée à un cycle choisi : date d'origine de sa paie. */
  cyclePaie: string | null;
}

export interface DonneesPaie {
  profil: ProfilPaieStocke | null;
  salaires: SalaireStocke[];
  exceptions: ExceptionStockee[];
  seuil: number | null;
  elements: ElementStocke[];
}

export type ChangementPaie =
  | { type: 'definirProfil'; profil: ProfilPaieStocke }
  | { type: 'definirSalaire'; salaire: SalaireStocke }
  | { type: 'retirerSalaire'; aPartirDu: string }
  | { type: 'definirException'; exception: ExceptionStockee }
  | { type: 'retirerException'; dateOrigine: string }
  | { type: 'definirSeuil'; seuil: number | null }
  | { type: 'definirElement'; element: ElementStocke }
  | { type: 'supprimerElement'; id: string };

export interface EntreeJournal {
  section: string;
  objet: string;
  champ: string;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  motif: string | null;
}

export interface Plateforme {
  etat(): Promise<EtatApplication>;
  lirePaie(): Promise<DonneesPaie>;
  appliquerChangementsPaie(changements: ChangementPaie[], journal: EntreeJournal[]): Promise<DonneesPaie>;
}

function dansTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const plateformeTauri: Plateforme = {
  etat: () => invoke<EtatApplication>('etat_application'),
  lirePaie: () => invoke<DonneesPaie>('lire_paie'),
  appliquerChangementsPaie: (changements, journal) =>
    invoke<DonneesPaie>('appliquer_changements_paie', { changements, journal }),
};

// Pour les tests de l'interface seulement : « ?simuler=erreur » dans
// l'adresse de l'aperçu simule un fichier de données illisible.
// N'existe pas dans l'application installée.
function simulation(): string | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('simuler');
}

/** Aperçu en mémoire : mêmes règles que le stockage, rien n'est enregistré. */
export function creerApercu(): Plateforme {
  let donnees: DonneesPaie = { profil: null, salaires: [], exceptions: [], seuil: null, elements: [] };
  let journal = 0;
  // Copie par sérialisation, comme le pont Tauri : les objets réactifs de
  // l'interface ne peuvent pas être copiés autrement.
  const cloner = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  const copie = (): DonneesPaie => cloner(donnees);

  function appliquer(c: ChangementPaie): void {
    switch (c.type) {
      case 'definirProfil':
        donnees.profil = c.profil;
        break;
      case 'definirSalaire':
        if (c.salaire.montant < 0) throw 'Un salaire ne peut pas être négatif. Rien n’a été enregistré.';
        donnees.salaires = [...donnees.salaires.filter((s) => s.aPartirDu !== c.salaire.aPartirDu), c.salaire].sort((a, b) =>
          a.aPartirDu < b.aPartirDu ? -1 : 1,
        );
        break;
      case 'retirerSalaire':
        donnees.salaires = donnees.salaires.filter((s) => s.aPartirDu !== c.aPartirDu);
        break;
      case 'definirException':
        donnees.exceptions = [...donnees.exceptions.filter((e) => e.dateOrigine !== c.exception.dateOrigine), c.exception].sort(
          (a, b) => (a.dateOrigine < b.dateOrigine ? -1 : 1),
        );
        break;
      case 'retirerException':
        donnees.exceptions = donnees.exceptions.filter((e) => e.dateOrigine !== c.dateOrigine);
        break;
      case 'definirSeuil':
        donnees.seuil = c.seuil;
        break;
      case 'definirElement':
        if (c.element.libelle.trim() === '') throw 'Un revenu ou une dépense doit avoir un nom. Rien n’a été enregistré.';
        if (c.element.montants.some((m) => m.montant < 0)) throw 'Un montant ne peut pas être négatif. Rien n’a été enregistré.';
        donnees.elements = [...donnees.elements.filter((e) => e.id !== c.element.id), c.element];
        break;
      case 'supprimerElement':
        donnees.elements = donnees.elements.filter((e) => e.id !== c.id);
        break;
    }
  }

  return {
    etat: async () => {
      if (simulation() === 'erreur') {
        throw 'Le contrôle d’intégrité a échoué (simulation). Rien n’a été modifié.';
      }
      return {
        profil: 'apercu',
        versionApplication: VERSION_APPLICATION,
        versionSchema: 3,
        dossierDonnees: '(aucun : aperçu en mémoire)',
        integriteOk: true,
        nombreEntreesJournal: journal,
      };
    },
    lirePaie: async () => copie(),
    appliquerChangementsPaie: async (changements, entrees) => {
      if (entrees.length === 0) throw 'Un changement de paie doit être consigné au journal. Rien n’a été enregistré.';
      const avant = copie();
      try {
        cloner(changements).forEach(appliquer);
      } catch (e) {
        donnees = avant;
        throw e;
      }
      journal += entrees.length;
      return copie();
    },
  };
}

export const plateformeApercu: Plateforme = creerApercu();

export function obtenirPlateforme(): Plateforme {
  return dansTauri() ? plateformeTauri : plateformeApercu;
}
