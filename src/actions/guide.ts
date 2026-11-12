// Configuration guidée (0.22.0) : la logique pure du guide de première
// utilisation. Le guide ne crée aucun second système : il présente, dans
// l'ordre, les propositions existantes (proposerProfil, proposerAjout,
// proposerAjoutPret, proposerAjoutCarte, proposerAjoutCompte). Ici, on ne
// fait que décider quand l'ouvrir, quelles dates de départ proposer et ce
// que le récapitulatif affiche. Rien n'est écrit ni inventé.

import { estPaiementCarte, laCarte } from './cartes';
import { estContribution, nomCompte } from './comptes';
import { estDepenseAPrevoir } from './depenses';
import { estPret } from './prets';
import { ErreurSaisie, decrireFrequence, lireDate } from './paie';
import type { ConfigurationGuidee, DonneesPaie, ElementStocke, FrequenceStockee } from '../lib/plateforme';
import { ajouterJours, ajouterMois, composer, ecartEnJours, parties, type DateCivile } from '../noyau/dates';
import { formaterMontant } from '../noyau/montants';
import { paiesEntre, type FrequencePaie } from '../noyau/paie';
import type { IdSection } from '../lib/navigation';

export const ETAPES_GUIDE = ['Bienvenue', 'Ma paie', 'Dépenses et revenus', 'Dettes', 'Épargne', 'Récapitulatif'] as const;
export const NOMBRE_ETAPES = ETAPES_GUIDE.length;
/** Les étapes 3 à 6 attendent le calendrier de paie. */
export const RAISON_VERROU = 'Disponible après ton calendrier de paie : tes dépenses, dettes et épargne se placent dans tes paies.';

/** Suggestions de noms (décision du 12 novembre) : le nom seulement, jamais un montant. */
export const SUGGESTIONS_DEPENSES = [
  'Loyer',
  'Hypothèque',
  'Électricité',
  'Internet',
  'Cellulaire',
  'Assurance auto',
  'Assurance habitation',
  'Transport en commun',
  'Abonnements',
  'Garderie',
] as const;

// ---------------------------------------------------------------------------
// Quand ouvrir le guide

/**
 * Installation réellement vierge : aucune donnée de paie, aucun élément,
 * prêt, carte, compte ni dépense à prévoir, et un journal vide (donc rien
 * n'a jamais été enregistré, même puis retiré).
 */
export function installationVierge(d: DonneesPaie, nombreEntreesJournal: number): boolean {
  return (
    nombreEntreesJournal === 0 &&
    d.profil === null &&
    d.salaires.length === 0 &&
    d.exceptions.length === 0 &&
    d.seuil === null &&
    d.elements.length === 0 &&
    d.ajustements.length === 0 &&
    d.confirmations.length === 0 &&
    d.prets.length === 0 &&
    (d.cartes ?? []).length === 0 &&
    (d.comptes ?? []).length === 0 &&
    (d.depenses ?? []).length === 0 &&
    (d.prioriteDettes ?? []).length === 0
  );
}

/** La page de bienvenue s'ouvre seule une seule fois : jamais d'état enregistré, installation vierge. */
export function ouvrirAuDemarrage(config: ConfigurationGuidee | null, d: DonneesPaie, nombreEntreesJournal: number): boolean {
  return config === null && installationVierge(d, nombreEntreesJournal);
}

/** L'invitation « Reprendre » de l'Accueil : seulement pendant un guide commencé. */
export function invitationAccueil(config: ConfigurationGuidee | null): { etape: number; libelle: string } | null {
  if (config?.statut !== 'enCours') return null;
  const etape = Math.min(Math.max(config.etape, 1), NOMBRE_ETAPES);
  return { etape, libelle: ETAPES_GUIDE[etape - 1]! };
}

/** Une étape est accessible : la bienvenue et la paie toujours ; le reste après le calendrier. */
export const etapeAccessible = (etape: number, d: DonneesPaie) => etape <= 2 || d.profil !== null;

// ---------------------------------------------------------------------------
// Ma paie : de quelle paie partir

export interface SaisieRythme {
  frequence: FrequenceStockee;
  /** Date d'une paie connue (sauf deux fois par mois). */
  reference: string;
  jours: [number, number];
}

export interface ChoixDepart {
  /** La paie en cours : la plus récente, aujourd'hui compris. */
  enCours: DateCivile | null;
  prochaine: DateCivile | null;
  /** Paies plus anciennes (un an au plus), la plus récente d'abord. */
  anciennes: DateCivile[];
}

const FENETRE_PASSE = 400;
const FENETRE_FUTUR = 62;

/**
 * Les paies du rythme décrit, sur un an et deux mois autour d'aujourd'hui.
 * Le calendrier de référence part assez tôt pour donner exactement les
 * mêmes dates que le vrai calendrier (même rythme, même jour visé).
 */
function paiesDuRythme(s: SaisieRythme, jour: DateCivile): { paies: DateCivile[]; departValide: (d: DateCivile) => boolean } {
  const debut = ajouterJours(jour, -FENETRE_PASSE);
  const fin = ajouterJours(jour, FENETRE_FUTUR);
  let frequence: FrequencePaie;
  let departValide: (d: DateCivile) => boolean = () => true;
  if (s.frequence === 'deuxFoisParMois') {
    const [j1, j2] = s.jours;
    if (!Number.isInteger(j1) || !Number.isInteger(j2) || j1 < 1 || j1 > 27 || j2 <= j1 || j2 > 31) {
      throw new ErreurSaisie('Deux fois par mois : le premier jour va de 1 à 27, le second doit venir après (31 = dernier jour).');
    }
    const p = parties(debut);
    frequence = { type: 'deuxFoisParMois', depart: composer(p.annee, p.mois, 1), jours: [j1, j2] };
  } else {
    if (s.reference.trim() === '') throw new ErreurSaisie('Indique la date d’une de tes paies, par exemple la dernière reçue.');
    const reference = lireDate(s.reference, 'Date d’une paie récente');
    if (reference < debut || reference > fin) {
      throw new ErreurSaisie('Date d’une paie récente : choisis une paie de la dernière année ou des deux prochains mois.');
    }
    if (s.frequence === 'mensuelle') {
      // Le jour du mois est celui de la paie connue ; on recule d'une année
      // à la fois pour garder exactement ce jour (sans raccourcir).
      const jourVise = parties(reference).jour;
      let depart = reference;
      while (depart > debut || parties(depart).jour !== jourVise) depart = ajouterMois(depart, -12, jourVise);
      frequence = { type: 'mensuelle', depart };
      // Un départ doit tomber sur le jour visé, sinon le rythme glisserait.
      departValide = (d) => parties(d).jour === jourVise;
    } else {
      const pas = s.frequence === 'hebdomadaire' ? 7 : 14;
      const recul = Math.ceil(Math.max(0, ecartEnJours(debut, reference)) / pas) * pas;
      frequence = { type: s.frequence, depart: ajouterJours(reference, -recul) };
    }
  }
  const paies = paiesEntre({ frequence, montants: [] }, [], debut, fin).map((p) => p.dateOrigine);
  return { paies, departValide };
}

export function choixDepart(s: SaisieRythme, jour: DateCivile): ChoixDepart {
  const { paies, departValide } = paiesDuRythme(s, jour);
  const passees = paies.filter((p) => p <= jour);
  const enCours = passees.at(-1) ?? null;
  const prochaine = paies.find((p) => p > jour) ?? null;
  const unAn = ajouterJours(jour, -366);
  const anciennes = passees
    .slice(0, -1)
    .filter((p) => p >= unAn && departValide(p))
    .reverse();
  return {
    enCours: enCours !== null && departValide(enCours) ? enCours : null,
    prochaine: prochaine !== null && departValide(prochaine) ? prochaine : null,
    anciennes,
  };
}

/** Paies passées avant la paie en cours, à partir du départ choisi : elles seront « à vérifier ». */
export function paiesAnterieures(s: SaisieRythme, depart: DateCivile, jour: DateCivile): DateCivile[] {
  const { paies } = paiesDuRythme(s, jour);
  const enCours = paies.filter((p) => p <= jour).at(-1);
  return enCours === undefined ? [] : paies.filter((p) => p >= depart && p < enCours);
}

// ---------------------------------------------------------------------------
// Ce qui a été saisi (étapes 3 à 5 et récapitulatif)

/** Les dépenses régulières : sans les versements de dettes, contributions ni dépenses à prévoir. */
export function depensesRegulieres(d: DonneesPaie): ElementStocke[] {
  return d.elements.filter(
    (e) => e.nature === 'depense' && !estPret(d, e.id) && !estPaiementCarte(d, e.id) && !estContribution(d, e.id) && !estDepenseAPrevoir(d, e.id),
  );
}
export const autresRevenus = (d: DonneesPaie): ElementStocke[] => d.elements.filter((e) => e.nature === 'revenu');
export const nomElement = (d: DonneesPaie, id: string) => d.elements.find((e) => e.id === id)?.libelle ?? '—';
export const sansMontant = (e: ElementStocke) => e.montants.length === 0;
export const montantElement = (e: ElementStocke) => {
  const m = e.montants.at(-1);
  return m ? `${formaterMontant(m.montant)}${e.estimation ? ' (estimé)' : ''}` : null;
};

export type EtatLigne = 'enregistre' | 'aCompleter' | 'aucun';
export interface LigneRecap {
  libelle: string;
  etat: EtatLigne;
  /** Texte de l'état (« Enregistré », « À compléter », « Aucun pour l'instant »). */
  valeur: string;
}
export interface SectionRecap {
  titre: string;
  section: IdSection;
  lien: string;
  lignes: LigneRecap[];
}
export interface Recapitulatif {
  sections: SectionRecap[];
  enregistres: number;
  aCompleter: number;
}

const ok = (libelle: string): LigneRecap => ({ libelle, etat: 'enregistre', valeur: 'Enregistré' });
const manque = (libelle: string): LigneRecap => ({ libelle, etat: 'aCompleter', valeur: 'À compléter' });
const aucun = (libelle: string, valeur: string): LigneRecap => ({ libelle, etat: 'aucun', valeur });

/**
 * Le récapitulatif : ce qui est enregistré et ce qui manque vraiment. Une
 * section laissée vide (pas de dette, pas de compte…) est neutre, jamais
 * comptée comme un manque. Seuls les manques que l'application affiche
 * déjà « À compléter » sont relevés.
 */
export function recapitulatif(d: DonneesPaie): Recapitulatif {
  const sections: SectionRecap[] = [];

  const paie: LigneRecap[] = [];
  if (d.profil) {
    paie.push(ok(`Calendrier : ${decrireFrequence(d.profil)}`));
    paie.push(d.salaires.length > 0 ? ok(`Montant net habituel · ${formaterMontant(d.salaires.at(-1)!.montant)}`) : manque('Montant net habituel'));
  } else {
    paie.push(manque('Calendrier de paie'));
  }
  sections.push({ titre: 'Ma paie', section: 'mes-paies', lien: 'Mes paies', lignes: paie });

  const depenses = depensesRegulieres(d);
  const revenus = autresRevenus(d);
  const lignesDepenses: LigneRecap[] = [];
  if (depenses.length === 0) lignesDepenses.push(aucun('Dépenses régulières', 'Aucune pour l’instant'));
  for (const e of depenses) lignesDepenses.push(sansMontant(e) ? manque(`${e.libelle} — montant`) : ok(`${e.libelle} · ${montantElement(e)!}`));
  if (revenus.length === 0) lignesDepenses.push(aucun('Autres revenus', 'Aucun pour l’instant'));
  for (const e of revenus) lignesDepenses.push(sansMontant(e) ? manque(`Revenu « ${e.libelle} » — montant`) : ok(`Revenu « ${e.libelle} » · ${montantElement(e)!}`));
  sections.push({ titre: 'Dépenses et revenus', section: 'depenses-a-prevoir', lien: 'Dépenses', lignes: lignesDepenses });

  const dettes: LigneRecap[] = [];
  for (const p of d.prets) {
    const nom = nomElement(d, p.id);
    dettes.push(ok(`${nom} — versement`));
    if (p.soldes.length === 0 && p.rembourseLe === null) dettes.push(manque(`${nom} — solde`));
  }
  const carte = laCarte(d);
  if (carte) {
    const nom = nomElement(d, carte.id);
    dettes.push(ok(`${nom} — prochaine échéance`));
    if (carte.releves.length === 0 && carte.soldes.length === 0) dettes.push(manque(`${nom} — solde (premier relevé)`));
  }
  if (dettes.length === 0) dettes.push(aucun('Prêts et carte de crédit', 'Aucune pour l’instant'));
  sections.push({ titre: 'Dettes', section: 'mes-dettes', lien: 'Dettes', lignes: dettes });

  const epargne: LigneRecap[] = [];
  for (const k of (d.comptes ?? []).filter((x) => x.fermeLe === null)) {
    const nom = nomCompte(d, k);
    epargne.push(k.references.length === 0 ? manque(`${nom} — solde`) : ok(nom));
  }
  if (epargne.length === 0) epargne.push(aucun('Comptes d’épargne', 'Aucun pour l’instant'));
  sections.push({ titre: 'Épargne', section: 'mon-epargne', lien: 'Épargne', lignes: epargne });

  // Un compte sans solde est quand même enregistré : il compte des deux côtés.
  const enregistres =
    (d.profil ? 1 : 0) + (d.salaires.length > 0 ? 1 : 0) + depenses.length + revenus.length + d.prets.length + (carte ? 1 : 0) + (d.comptes ?? []).filter((x) => x.fermeLe === null).length;
  const aCompleter = sections.reduce((n, s) => n + s.lignes.filter((l) => l.etat === 'aCompleter').length, 0);
  return { sections, enregistres, aCompleter };
}
