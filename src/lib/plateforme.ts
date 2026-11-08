// Pont entre l'interface et le reste de l'application.
// Dans l'application installée, les demandes passent par Tauri vers le
// stockage SQLite. Dans un simple navigateur (développement, tests de
// l'interface), un aperçu en mémoire répond à la place : rien n'est enregistré.

import { invoke } from '@tauri-apps/api/core';
import { version as VERSION_APPLICATION } from '../../package.json';
import { appliquerChangements, cloner, donneesVides } from './appliquer';

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

/** Changement de fréquence « à partir du » (étape 4b, B). */
export interface PeriodeStockee {
  aPartirDu: string;
  frequence: Record<string, unknown> & { type: string };
}

/** Ajustement d'une occurrence (étape 4b, A) ; la règle ne change pas. */
/** Fait confirmé (étape 5) ; elementId null : la paie elle-même. */
export interface ConfirmationStockee {
  elementId: string | null;
  origine: string;
  date: string;
  montant: number;
}

export interface AjustementStocke {
  elementId: string;
  /** Date d'origine de l'occurrence : son identité stable. */
  origine: string;
  montant: number | null;
  date: string | null;
  paieOrigine: string | null;
  retire: boolean;
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
  /** Changements de fréquence datés (étape 4b). */
  changementsFrequence: PeriodeStockee[];
}

export interface DonneesPaie {
  profil: ProfilPaieStocke | null;
  salaires: SalaireStocke[];
  exceptions: ExceptionStockee[];
  seuil: number | null;
  elements: ElementStocke[];
  ajustements: AjustementStocke[];
  confirmations: ConfirmationStockee[];
}

export type ChangementPaie =
  | { type: 'definirProfil'; profil: ProfilPaieStocke }
  | { type: 'definirSalaire'; salaire: SalaireStocke }
  | { type: 'retirerSalaire'; aPartirDu: string }
  | { type: 'definirException'; exception: ExceptionStockee }
  | { type: 'retirerException'; dateOrigine: string }
  | { type: 'definirSeuil'; seuil: number | null }
  | { type: 'definirElement'; element: ElementStocke }
  | { type: 'supprimerElement'; id: string }
  | { type: 'definirAjustement'; ajustement: AjustementStocke }
  | { type: 'definirConfirmation'; confirmation: ConfirmationStockee }
  | { type: 'retirerConfirmation'; elementId: string | null; origine: string }
  | { type: 'retirerAjustement'; elementId: string; origine: string };

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
  let donnees: DonneesPaie = donneesVides();
  let journal = 0;

  return {
    etat: async () => {
      if (simulation() === 'erreur') {
        throw 'Le contrôle d’intégrité a échoué (simulation). Rien n’a été modifié.';
      }
      return {
        profil: 'apercu',
        versionApplication: VERSION_APPLICATION,
        versionSchema: 5,
        dossierDonnees: '(aucun : aperçu en mémoire)',
        integriteOk: true,
        nombreEntreesJournal: journal,
      };
    },
    lirePaie: async () => cloner(donnees),
    appliquerChangementsPaie: async (changements, entrees) => {
      if (entrees.length === 0) throw 'Un changement de paie doit être consigné au journal. Rien n’a été enregistré.';
      // Tout ou rien : en cas d'erreur, rien n'est modifié.
      donnees = appliquerChangements(donnees, changements);
      journal += entrees.length;
      return cloner(donnees);
    },
  };
}

export const plateformeApercu: Plateforme = creerApercu();

export function obtenirPlateforme(): Plateforme {
  return dansTauri() ? plateformeTauri : plateformeApercu;
}
