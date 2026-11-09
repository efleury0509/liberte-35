// Pont entre l'interface et le reste de l'application.
// Dans l'application installée, les demandes passent par Tauri vers le
// stockage SQLite. Dans un simple navigateur (développement, tests de
// l'interface), un aperçu en mémoire répond à la place : rien n'est enregistré.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { version as VERSION_APPLICATION } from '../../package.json';
import { appliquerChangements, cloner, donneesVides } from './appliquer';
import { aujourdhui } from './aujourdhui';
import { ajouterJours } from '../noyau/dates';

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

/** Solde de référence d'un prêt à une date (étape 7a, Q40). */
export interface SoldePretStocke {
  date: string;
  montant: number;
  note: string | null;
}

/**
 * Fiche d'un prêt (étape 7a). Son id est celui de l'élément de dépense fixe
 * qui porte le versement. Tout est facultatif : on complète plus tard.
 */
/** Étape 8 : relevé recopié tel quel, jamais modifié ensuite. */
export interface ReleveStocke {
  date: string;
  solde: number;
  minimum: number | null;
  echeance: string | null;
}

/** Solde actuel selon une mise à jour manuelle datée (Q59). */
export interface SoldeCarteStocke {
  date: string;
  montant: number;
  note: string | null;
}

/** Frais récurrent autorisé, informatif seulement (Q62). */
export interface FraisCarteStocke {
  libelle: string;
  montant: number;
  frequence: 'annee' | 'mois';
}

export type ObjectifCarte = 'reduireSolde' | 'payerReleves';

/**
 * Fiche de la carte. Son `id` est celui de la dépense fixe qui porte
 * l'échéance mensuelle ; `supplements` : les paiements supplémentaires
 * (dépenses « une seule fois »).
 */
export interface CarteStocke {
  id: string;
  limite: number | null;
  /** Taux annuel en pour cent, point décimal (« 20.99 »). */
  taux: string | null;
  objectif: ObjectifCarte | null;
  releves: ReleveStocke[];
  soldes: SoldeCarteStocke[];
  frais: FraisCarteStocke[];
  supplements: string[];
}

export interface PretStocke {
  id: string;
  /** Absent : le versement sert de minimum (Q46). */
  minimum: number | null;
  echeanceFinale: string | null;
  /** Pour cent, point décimal (« 9.90 »). */
  taux: string | null;
  /** Marqué remboursé par l'utilisatrice, jamais déduit d'une estimation. */
  rembourseLe: string | null;
  soldes: SoldePretStocke[];
}

/** Étape 9 : solde de référence daté d'un compte d'épargne (départ ou correction). */
export interface ReferenceCompteStockee {
  date: string;
  montant: number;
  note: string | null;
}

export type SorteMouvement = 'fluctuation' | 'retrait' | 'transfert';

/** Étape 9 (Q73, Q74) : jamais dans Mes paies. Une fluctuation peut être négative. */
export interface MouvementStocke {
  id: string;
  date: string;
  sorte: SorteMouvement;
  montant: number;
  /** Transfert : le compte de destination. */
  vers: string | null;
  /** Retrait : destination facultative, en texte libre. */
  destination: string | null;
  note: string | null;
}

export type SorteCompte = 'celi' | 'reer' | 'celiapp' | 'epargne' | 'autre';

/** Étape 9 : compte d'épargne ; `contributions` = éléments de dépense fixe rattachés. */
export interface CompteStocke {
  id: string;
  sorte: SorteCompte;
  typeLibre: string | null;
  nom: string | null;
  vocation: string | null;
  institution: string | null;
  fermeLe: string | null;
  references: ReferenceCompteStockee[];
  mouvements: MouvementStocke[];
  contributions: string[];
}

export interface DonneesPaie {
  profil: ProfilPaieStocke | null;
  salaires: SalaireStocke[];
  exceptions: ExceptionStockee[];
  seuil: number | null;
  elements: ElementStocke[];
  ajustements: AjustementStocke[];
  confirmations: ConfirmationStockee[];
  prets: PretStocke[];
  /** Étape 8 : la carte Visa (une seule pour l'instant, Q55). */
  cartes: CarteStocke[];
  /** Étape 9 : comptes d'épargne, dans l'ordre de création. */
  comptes: CompteStocke[];
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
  | { type: 'retirerAjustement'; elementId: string; origine: string }
  | { type: 'definirPret'; pret: PretStocke }
  | { type: 'supprimerPret'; id: string }
  | { type: 'definirCarte'; carte: CarteStocke }
  | { type: 'supprimerCarte'; id: string }
  | { type: 'definirCompte'; compte: CompteStocke }
  | { type: 'supprimerCompte'; id: string };

export interface EntreeJournal {
  section: string;
  objet: string;
  champ: string;
  ancienneValeur: string | null;
  nouvelleValeur: string | null;
  motif: string | null;
}

// Étape 6 : sauvegardes et export (identiques aux types Rust).
export type SourceCopie =
  | { genre: 'jour'; nom: string }
  | { genre: 'precaution'; nom: string }
  | { genre: 'fichier'; chemin: string };

export interface ResumeCopie {
  paieConfiguree: boolean;
  salaires: number;
  elements: number;
  confirmations: number;
  entreesJournal: number;
}

export interface CopieListee {
  source: SourceCopie;
  nom: string;
  jour: string | null;
  /** UTC, ISO 8601. */
  horodatage: string;
  motif: 'restauration' | 'miseANiveau' | null;
  lisible: boolean;
  raison: string | null;
  versionSchema: number | null;
  resume: ResumeCopie | null;
}

export interface CopieFaite {
  nom: string;
  jour: string;
  horodatage: string;
}

export interface EtatSauvegardes {
  derniereCopie: CopieFaite | null;
  erreur: string | null;
  enAttente: boolean;
  copies: { copiesDuJour: CopieListee[]; precautions: CopieListee[] };
}

export interface ChangementJournal {
  horodatage: string;
  section: string;
  objet: string;
  champ: string;
}

export interface ApercuRestauration {
  source: SourceCopie;
  nom: string;
  horodatage: string;
  versionSchema: number;
  miseANiveau: boolean;
  resume: ResumeCopie;
  nombreRetires: number;
  retires: ChangementJournal[];
  nombreRetrouves: number;
}

export interface ResultatRestauration {
  nom: string;
  precaution: string;
}

export interface ExportEnregistre {
  chemin: string;
  nomFichier: string;
  fichiers: string[];
  resume: ResumeCopie;
  vide: boolean;
}

export interface AvisCopie {
  reussie: boolean;
  erreur: string | null;
  /** Premier échec après une réussite : un seul avis est montré (R6). */
  nouvelAvis: boolean;
}

export interface Plateforme {
  etat(): Promise<EtatApplication>;
  lirePaie(): Promise<DonneesPaie>;
  appliquerChangementsPaie(changements: ChangementPaie[], journal: EntreeJournal[]): Promise<DonneesPaie>;
  etatSauvegardes(): Promise<EtatSauvegardes>;
  apercuRestauration(source: SourceCopie): Promise<ApercuRestauration>;
  /** Fenêtre « Ouvrir » ; null si elle est fermée sans choisir. */
  choisirFichierCopie(): Promise<ApercuRestauration | null>;
  restaurer(source: SourceCopie): Promise<ResultatRestauration>;
  /** Fenêtre « Enregistrer sous » ; null si elle est fermée sans choisir. */
  exporter(): Promise<ExportEnregistre | null>;
  /** Avis après chaque copie du jour ; renvoie de quoi se désabonner. */
  surAvisCopie(rappel: (a: AvisCopie) => void): () => void;
}

function dansTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const plateformeTauri: Plateforme = {
  etat: () => invoke<EtatApplication>('etat_application'),
  lirePaie: () => invoke<DonneesPaie>('lire_paie'),
  appliquerChangementsPaie: (changements, journal) =>
    invoke<DonneesPaie>('appliquer_changements_paie', { changements, journal }),
  etatSauvegardes: () => invoke<EtatSauvegardes>('etat_sauvegardes'),
  apercuRestauration: (source) => invoke<ApercuRestauration>('apercu_restauration', { source }),
  choisirFichierCopie: () => invoke<ApercuRestauration | null>('choisir_fichier_copie'),
  restaurer: (source) => invoke<ResultatRestauration>('restaurer', { source }),
  exporter: () => invoke<ExportEnregistre | null>('exporter_donnees'),
  surAvisCopie: (rappel) => {
    let fin: (() => void) | null = null;
    let annule = false;
    void listen<AvisCopie>('etat-copie', (e) => rappel(e.payload)).then((f) => {
      if (annule) f();
      else fin = f;
    });
    return () => {
      annule = true;
      fin?.();
    };
  },
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
  interface Instantane {
    donnees: DonneesPaie;
    journal: ChangementJournal[];
    horodatage: string;
  }
  let donnees: DonneesPaie = donneesVides();
  let journal: ChangementJournal[] = [];
  const copiesDuJour = new Map<string, Instantane & { lisible: boolean }>();
  let precautions: (Instantane & { nom: string; motif: 'restauration' | 'miseANiveau' })[] = [];
  const abonnes = new Set<(a: AvisCopie) => void>();
  let derniereErreur: string | null = null;

  // L'heure réelle, mais posée sur le jour de l'aperçu (« ?aujourdhui= ») :
  // une copie faite « aujourd'hui » reste d'aujourd'hui, même après minuit UTC.
  const maintenant = () => {
    const h = new Date();
    const jour = aujourdhui();
    const local = new Date(Number(jour.slice(0, 4)), Number(jour.slice(5, 7)) - 1, Number(jour.slice(8, 10)), h.getHours(), h.getMinutes(), h.getSeconds());
    return local.toISOString().slice(0, 19) + 'Z';
  };
  const instantane = (): Instantane => ({ donnees: cloner(donnees), journal: [...journal], horodatage: maintenant() });
  const resume = (i: Instantane): ResumeCopie => ({
    paieConfiguree: i.donnees.profil !== null,
    salaires: i.donnees.salaires.length,
    elements: i.donnees.elements.length,
    confirmations: i.donnees.confirmations.length,
    entreesJournal: i.journal.length,
  });
  const decaler = (jours: number) => ajouterJours(aujourdhui(), jours) as string;

  // « ?simuler=copies » : des copies plus anciennes, dont une illisible.
  if (simulation() === 'copies') {
    const ancien: Instantane = {
      donnees: donneesVides(),
      journal: [{ horodatage: '2026-01-01T12:00:00Z', section: 'Mes paies', objet: 'Paie', champ: 'création' }],
      horodatage: `${decaler(-2)}T21:40:00Z`,
    };
    copiesDuJour.set(decaler(-2), { ...ancien, lisible: true });
    copiesDuJour.set(decaler(-1), { ...ancien, horodatage: `${decaler(-1)}T14:05:00Z`, lisible: false });
    precautions.push({ ...ancien, nom: 'avant-mise-a-niveau-v4-vers-v5-20261020100000.sqlite', motif: 'miseANiveau', horodatage: '2026-10-20T10:00:00Z' });
  }

  const avertir = (a: AvisCopie) => abonnes.forEach((f) => f(a));
  const copierLeJour = () => {
    if (simulation() === 'echec-copie') {
      const erreur = 'La copie de sauvegarde du jour n’a pas pu être faite (simulation). Tes données sont bien enregistrées et tes copies précédentes sont intactes.';
      const nouvelAvis = derniereErreur === null;
      derniereErreur = erreur;
      avertir({ reussie: false, erreur, nouvelAvis });
      return;
    }
    copiesDuJour.set(aujourdhui(), { ...instantane(), lisible: true });
    const jours = [...copiesDuJour.keys()].sort().reverse();
    jours.slice(3).forEach((j) => copiesDuJour.delete(j));
    derniereErreur = null;
    avertir({ reussie: true, erreur: null, nouvelAvis: false });
  };

  const listeJours = (): CopieListee[] =>
    [...copiesDuJour.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([jour, c]) => ({
        source: { genre: 'jour', nom: `jour-${jour}.sqlite` },
        nom: `jour-${jour}.sqlite`,
        jour,
        horodatage: c.horodatage,
        motif: null,
        lisible: c.lisible,
        raison: c.lisible ? null : 'Cette copie est illisible (le contrôle d’intégrité a échoué) : elle ne peut pas être restaurée.',
        versionSchema: c.lisible ? 6 : null,
        resume: c.lisible ? resume(c) : null,
      }));
  const listePrecautions = (): CopieListee[] =>
    precautions.map((p) => ({
      source: { genre: 'precaution', nom: p.nom },
      nom: p.nom,
      jour: null,
      horodatage: p.horodatage,
      motif: p.motif,
      lisible: true,
      raison: null,
      versionSchema: 8,
      resume: resume(p),
    }));
  const trouver = (source: SourceCopie): Instantane & { nom: string } => {
    if (source.genre === 'jour') {
      const c = copiesDuJour.get(source.nom.slice(5, 15));
      if (!c) throw 'Cette copie est introuvable.';
      if (!c.lisible) throw 'Cette copie est illisible (le contrôle d’intégrité a échoué) : elle ne peut pas être restaurée.';
      return { ...c, nom: source.nom };
    }
    if (source.genre === 'precaution') {
      const p = precautions.find((x) => x.nom === source.nom);
      if (!p) throw 'Cette copie est introuvable.';
      return p;
    }
    const plusAncienne = listeJours().filter((c) => c.lisible).pop();
    const base = plusAncienne ? copiesDuJour.get(plusAncienne.jour as string)! : { ...instantane(), donnees: donneesVides(), journal: [] };
    return { ...base, nom: source.chemin.split(/[\\/]/).pop() ?? source.chemin };
  };
  const cle = (e: ChangementJournal) => `${e.horodatage}|${e.objet}|${e.champ}`;
  const apercu = (source: SourceCopie): ApercuRestauration => {
    const c = trouver(source);
    const dansCopie = new Set(c.journal.map(cle));
    const dansActuel = new Set(journal.map(cle));
    const retires = journal.filter((e) => !dansCopie.has(cle(e))).reverse();
    return {
      source,
      nom: c.nom,
      horodatage: c.horodatage,
      versionSchema: 8,
      miseANiveau: false,
      resume: resume(c),
      nombreRetires: retires.length,
      retires: retires.slice(0, 5),
      nombreRetrouves: c.journal.filter((e) => !dansActuel.has(cle(e))).length,
    };
  };

  return {
    etat: async () => {
      if (simulation() === 'erreur') {
        throw 'Le contrôle d’intégrité a échoué (simulation). Rien n’a été modifié.';
      }
      return {
        profil: 'apercu',
        versionApplication: VERSION_APPLICATION,
        versionSchema: 8,
        dossierDonnees: '(aucun : aperçu en mémoire)',
        integriteOk: true,
        nombreEntreesJournal: journal.length,
      };
    },
    lirePaie: async () => cloner(donnees),
    appliquerChangementsPaie: async (changements, entrees) => {
      if (entrees.length === 0) throw 'Un changement de paie doit être consigné au journal. Rien n’a été enregistré.';
      // Tout ou rien : en cas d'erreur, rien n'est modifié.
      donnees = appliquerChangements(donnees, changements);
      const h = maintenant();
      journal = [...journal, ...entrees.map((e) => ({ horodatage: h, section: e.section, objet: e.objet, champ: e.champ }))];
      // Dans l'aperçu, la copie suit tout de suite (pas de délai).
      copierLeJour();
      return cloner(donnees);
    },
    etatSauvegardes: async () => {
      const jours = listeJours();
      const derniere = jours.find((c) => c.lisible);
      return {
        derniereCopie: derniere ? { nom: derniere.nom, jour: derniere.jour as string, horodatage: derniere.horodatage } : null,
        erreur: derniereErreur,
        enAttente: false,
        copies: { copiesDuJour: jours, precautions: listePrecautions() },
      };
    },
    apercuRestauration: async (source) => apercu(source),
    choisirFichierCopie: async () => {
      if (simulation() === 'fichier-annule') return null;
      if (simulation() === 'fichier-export') {
        throw 'Ce fichier est un export (.zip) : un export ne se restaure pas. Choisis une copie de sauvegarde (.sqlite).';
      }
      return apercu({ genre: 'fichier', chemin: 'E:\\Sauvegardes\\ma copie.sqlite' });
    },
    restaurer: async (source) => {
      const c = trouver(source);
      const nom = `avant-restauration-${maintenant().replace(/\D/g, '')}-${precautions.length + 1}.sqlite`;
      precautions = [{ ...instantane(), nom, motif: 'restauration' as const }, ...precautions].slice(0, 5);
      donnees = cloner(c.donnees);
      journal = [...c.journal, { horodatage: maintenant(), section: 'Paramètres', objet: 'Sauvegardes', champ: 'restauration' }];
      copierLeJour();
      return { nom: c.nom, precaution: nom };
    },
    exporter: async () => {
      if (simulation() === 'export-annule') return null;
      const r = resume(instantane());
      const nomFichier = `liberte-35-apercu-export-${aujourdhui()}.zip`;
      return {
        chemin: `Documents\\${nomFichier}`,
        nomFichier,
        fichiers: ['donnees.json', 'LISEZMOI.txt'],
        resume: r,
        vide: !r.paieConfiguree && r.salaires === 0 && r.elements === 0 && r.entreesJournal === 0,
      };
    },
    surAvisCopie: (rappel) => {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
  };
}

export const plateformeApercu: Plateforme = creerApercu();

export function obtenirPlateforme(): Plateforme {
  return dansTauri() ? plateformeTauri : plateformeApercu;
}
