// Étape 8 : la carte Visa (cahier 5.3 ; décisions Q55 à Q69).
//
// La carte s'adapte à Liberté 35 : son échéance mensuelle est une dépense
// fixe (souvent sans montant : « À compléter », jamais 0 $) ; le montant d'une
// échéance se choisit avec « Ajuster » dans Mes paies ; un paiement
// supplémentaire est une dépense « une seule fois » rattachée à la carte.
// Mes dettes configure et consulte ; Mes paies planifie, ajuste et confirme.
//
// Aucun achat suivi, aucun intérêt calculé : le relevé fait foi. Les relevés
// sont recopiés tels quels et jamais modifiés ; leur suivi (paiements
// rattachés, constats) se recalcule à chaque affichage. La date prévue ou
// ajustée sert seulement à classer un paiement : elle ne prouve jamais qu'il
// a été reçu à temps (Q67). Rien ne change automatiquement.

import type { CarteStocke, DonneesPaie, ElementStocke, EntreeJournal, ObjectifCarte, ReleveStocke } from '../lib/plateforme';
import { ajouterJours, formaterDateCourte, type DateCivile } from '../noyau/dates';
import { formaterMontant, type Cents } from '../noyau/montants';
import { planifier, type Cycle, type Ligne } from '../noyau/cycles';
import { construireFrequence, exigerProfil, finaliser, nomObjet, trouver } from './elements';
import { A_COMPLETER, ErreurSaisie, lireDate, lireMontant, versNoyau, type LigneApercu, type Proposition } from './paie';
import { estPret, lireTaux, objetPret } from './prets';

export const SECTION_DETTES = 'Mes dettes';
export const PHRASE_ECHEANCE = 'Liberté 35 ne vérifie pas si un paiement a été reçu à temps : seul ton relevé suivant le dit.';
export const LIBELLES_OBJECTIF: Record<ObjectifCarte | 'aucun', string> = {
  aucun: 'Aucun objectif choisi',
  reduireSolde: 'Réduire mon solde actuel',
  payerReleves: 'Payer mes relevés en entier',
};

const avecAnnee = (d: string) => `${formaterDateCourte(d as DateCivile)} ${d.slice(0, 4)}`;
export const objetCarte = (nom: string) => `Carte « ${nom} »`;
const entree = (nom: string, champ: string, avant: string | null, apres: string | null, motif: string | null = null): EntreeJournal => ({
  section: SECTION_DETTES,
  objet: objetCarte(nom),
  champ,
  ancienneValeur: avant,
  nouvelleValeur: apres,
  motif,
});

export const laCarte = (d: DonneesPaie): CarteStocke | null => (d.cartes ?? [])[0] ?? null;
/** La carte d'un paiement : son échéance ou un paiement supplémentaire. */
export const carteDuPaiement = (d: DonneesPaie, elementId: string): CarteStocke | null =>
  (d.cartes ?? []).find((k) => k.id === elementId || k.supplements.includes(elementId)) ?? null;
export const estPaiementCarte = (d: DonneesPaie, elementId: string) => carteDuPaiement(d, elementId) !== null;
export const estSupplement = (d: DonneesPaie, elementId: string) => (d.cartes ?? []).some((k) => k.supplements.includes(elementId));
const nomCarte = (d: DonneesPaie, k: CarteStocke) => trouver(d, k.id).libelle;

/** J1, Q51 : au journal, tout ce qui touche un prêt ou la carte se lit sous son nom. */
export function objetJournal(d: DonneesPaie, e: ElementStocke): string {
  const k = carteDuPaiement(d, e.id);
  if (k) return objetCarte(nomCarte(d, k));
  if (estPret(d, e.id)) return objetPret(e.libelle);
  return nomObjet(e);
}

/** Libellé d'une ligne dans Mes paies. */
export function libelleLigne(d: DonneesPaie, l: Pick<Ligne, 'elementId' | 'libelle'>): string {
  const k = carteDuPaiement(d, l.elementId);
  if (k && k.id !== l.elementId) return `Paiement supplémentaire — ${nomCarte(d, k)}`;
  if (k || estPret(d, l.elementId)) return `Paiement — ${l.libelle}`;
  return l.libelle;
}

/** Q68 : pourquoi le disponible d'un cycle est « À compléter ». */
export function raisonsACompleter(d: DonneesPaie, c: Cycle): string | null {
  if (c.disponible !== null) return null;
  const manque: string[] = [];
  if (c.paie.montant === null) manque.push(`la paie du ${formaterDateCourte(c.paie.date)}`);
  for (const l of c.lignes) {
    if (l.montant === null && l.compte) manque.push(`${libelleLigne(d, l)} (${formaterDateCourte(l.echeance ?? c.paie.date)})`);
  }
  return manque.length === 0 ? null : `Il manque : ${manque.join(', ')}.`;
}

function exigerCarte(d: DonneesPaie): { carte: CarteStocke; nom: string } {
  const carte = laCarte(d);
  if (!carte) throw new ErreurSaisie('Ajoute d’abord ta carte dans Mes dettes.');
  return { carte, nom: nomCarte(d, carte) };
}

/** Proposition directe (sans aperçu), annulable par le bandeau. */
function directe(d: DonneesPaie, titre: string, lignes: LigneApercu[], changements: Proposition['changements'], journal: EntreeJournal[], jour: DateCivile): Proposition {
  return finaliser(d, { titre, lignes, changements, journal }, jour);
}

// ---------------------------------------------------------------------------
// Fiche (F1 à F3, G1)

export interface SaisieCarte {
  nom: string;
  /** Date de la prochaine échéance mensuelle. */
  prochaine: string;
  limite: string;
  taux: string;
}

export function proposerAjoutCarte(d: DonneesPaie, s: SaisieCarte, jour: DateCivile): Proposition {
  exigerProfil(d);
  if (laCarte(d)) throw new ErreurSaisie('Une seule carte pour l’instant.');
  const nom = s.nom.trim();
  if (nom === '') throw new ErreurSaisie('Donne un nom à ta carte.');
  if (s.prochaine.trim() === '') throw new ErreurSaisie('Indique la date de la prochaine échéance.');
  const prochaine = lireDate(s.prochaine, 'Prochaine échéance');
  const limite = lireMontant(s.limite, 'Limite');
  const taux = lireTaux(s.taux);
  const id = crypto.randomUUID();
  // Q57 : aucune somme imposée ; chaque échéance reste « À compléter ».
  const element: ElementStocke = {
    id,
    libelle: nom,
    nature: 'depense',
    genre: 'fixe',
    incertain: false,
    estimation: false,
    frequence: construireFrequence('mois', prochaine, null),
    montants: [],
    suspensions: [],
    fin: null,
    cyclePaie: null,
    changementsFrequence: [],
  };
  const carte: CarteStocke = { id, limite, taux, objectif: null, releves: [], soldes: [], frais: [], supplements: [] };
  const jourDuMois = Number(prochaine.slice(8, 10));
  const quand = `chaque mois, le ${jourDuMois === 1 ? '1er' : jourDuMois}, à partir du ${avecAnnee(prochaine)}`;
  return directe(
    d,
    `Ajouter la carte « ${nom} »`,
    [{ libelle: 'Échéance', avant: '—', apres: `${quand} ; montant à choisir à chaque relevé` }],
    [
      { type: 'definirElement', element },
      { type: 'definirCarte', carte },
    ],
    [entree(nom, 'création', null, [quand, ...(limite !== null ? [`limite ${formaterMontant(limite)}`] : []), ...(taux !== null ? [`taux ${taux.replace('.', ',')} %`] : [])].join(' ; '))],
    jour,
  );
}

const tauxTexte = (t: string | null) => (t === null ? A_COMPLETER : `${t.replace('.', ',')} %`);

export function proposerRenseignementsCarte(d: DonneesPaie, s: { limite: string; taux: string }, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  const limite = lireMontant(s.limite, 'Limite');
  const taux = lireTaux(s.taux);
  const lignes: LigneApercu[] = [];
  const journal: EntreeJournal[] = [];
  const noter = (libelle: string, avant: string, apres: string) => {
    if (avant === apres) return;
    lignes.push({ libelle, avant, apres });
    journal.push(entree(nom, libelle.toLowerCase(), avant, apres));
  };
  noter('Limite', carte.limite === null ? A_COMPLETER : formaterMontant(carte.limite), limite === null ? A_COMPLETER : formaterMontant(limite));
  noter('Taux', tauxTexte(carte.taux), tauxTexte(taux));
  if (journal.length === 0) throw new ErreurSaisie('Rien ne change.');
  return directe(d, `Compléter « ${nom} »`, lignes, [{ type: 'definirCarte', carte: { ...carte, limite, taux } }], journal, jour);
}

/** G1 : choisi à la main, informatif ; aucune bascule automatique. */
export function proposerObjectif(d: DonneesPaie, objectif: ObjectifCarte | null, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  if (carte.objectif === objectif) throw new ErreurSaisie('Rien ne change.');
  const avant = LIBELLES_OBJECTIF[carte.objectif ?? 'aucun'];
  const apres = LIBELLES_OBJECTIF[objectif ?? 'aucun'];
  return directe(d, `Objectif de « ${nom} »`, [{ libelle: 'Mon objectif', avant, apres }], [{ type: 'definirCarte', carte: { ...carte, objectif } }], [entree(nom, 'objectif', avant, apres)], jour);
}

export function proposerFrais(d: DonneesPaie, s: { libelle: string; montant: string; frequence: 'annee' | 'mois' }, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  const libelle = s.libelle.trim();
  if (libelle === '') throw new ErreurSaisie('Donne un nom à ce frais.');
  if (carte.frais.some((f) => f.libelle === libelle)) throw new ErreurSaisie(`Un frais nommé « ${libelle} » existe déjà.`);
  const montant = lireMontant(s.montant, 'Montant du frais');
  if (montant === null) throw new ErreurSaisie('Indique le montant de ce frais.');
  const texte = `${libelle} — ${formaterMontant(montant)} ${s.frequence === 'annee' ? 'par année' : 'par mois'}`;
  return directe(
    d,
    `Ajouter un frais à « ${nom} »`,
    [{ libelle: 'Frais autorisé', avant: '—', apres: texte }],
    [{ type: 'definirCarte', carte: { ...carte, frais: [...carte.frais, { libelle, montant, frequence: s.frequence }] } }],
    [entree(nom, 'frais', null, texte)],
    jour,
  );
}

export function proposerRetraitFrais(d: DonneesPaie, libelle: string, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  if (!carte.frais.some((f) => f.libelle === libelle)) throw new ErreurSaisie('Ce frais n’existe plus.');
  return directe(
    d,
    `Retirer le frais « ${libelle} »`,
    [{ libelle: 'Frais autorisé', avant: libelle, apres: 'Retiré' }],
    [{ type: 'definirCarte', carte: { ...carte, frais: carte.frais.filter((f) => f.libelle !== libelle) } }],
    [entree(nom, 'frais', libelle, null)],
    jour,
  );
}

// ---------------------------------------------------------------------------
// Relevés et solde actuel (R1 à R3, S1)

const decrireReleve = (r: ReleveStocke) =>
  [
    `relevé du ${avecAnnee(r.date)}`,
    `nouveau solde ${formaterMontant(r.solde)}`,
    ...(r.minimum !== null ? [`minimum ${formaterMontant(r.minimum)}`] : []),
    ...(r.echeance !== null ? [`échéance ${avecAnnee(r.echeance)}`] : []),
  ].join(' ; ');

export function proposerReleve(d: DonneesPaie, s: { date: string; solde: string; minimum: string; echeance: string }, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  if (s.date.trim() === '') throw new ErreurSaisie('Indique la date du relevé.');
  const date = lireDate(s.date, 'Date du relevé');
  const solde = lireMontant(s.solde, 'Nouveau solde');
  if (solde === null) throw new ErreurSaisie('Indique le nouveau solde du relevé.');
  const minimum = lireMontant(s.minimum, 'Minimum');
  const echeance = s.echeance.trim() === '' ? null : lireDate(s.echeance, 'Échéance');
  if (echeance !== null && echeance < date) throw new ErreurSaisie('L’échéance ne peut pas venir avant la date du relevé.');
  if (carte.releves.some((r) => r.date === date)) throw new ErreurSaisie(`Un relevé existe déjà au ${avecAnnee(date)}.`);
  const releve: ReleveStocke = { date, solde, minimum, echeance };
  return directe(
    d,
    `Ajouter le relevé du ${avecAnnee(date)}`,
    [{ libelle: 'Relevé', avant: '—', apres: decrireReleve(releve) }],
    [{ type: 'definirCarte', carte: { ...carte, releves: [...carte.releves, releve] } }],
    [entree(nom, 'relevé', null, decrireReleve(releve))],
    jour,
  );
}

/** Un relevé ne se modifie jamais : une saisie erronée se retire, avec un aperçu. */
export function proposerRetraitReleve(d: DonneesPaie, date: string, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  const r = carte.releves.find((x) => x.date === date);
  if (!r) throw new ErreurSaisie('Ce relevé n’existe plus.');
  return finaliser(
    d,
    {
      titre: `Retirer le relevé du ${avecAnnee(date)}`,
      lignes: [{ libelle: 'Relevé', avant: decrireReleve(r), apres: 'Retiré' }],
      changements: [{ type: 'definirCarte', carte: { ...carte, releves: carte.releves.filter((x) => x.date !== date) } }],
      journal: [entree(nom, 'relevé retiré', decrireReleve(r), null)],
      avant: ['Les paiements ne changent pas ; ils seront rattachés au relevé précédent, s’il y en a un.'],
      apercuForce: true,
    },
    jour,
  );
}

export function proposerSoldeActuel(d: DonneesPaie, s: { date: string; montant: string; note: string }, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  const montant = lireMontant(s.montant, 'Solde actuel');
  if (montant === null) throw new ErreurSaisie('Indique le solde actuel.');
  const date = s.date.trim() === '' ? jour : lireDate(s.date, 'Date du solde');
  if (carte.soldes.some((x) => x.date === date)) throw new ErreurSaisie(`Un solde existe déjà au ${avecAnnee(date)}.`);
  const note = s.note.trim() === '' ? null : s.note.trim();
  const apres = `${formaterMontant(montant)} au ${avecAnnee(date)}`;
  return directe(
    d,
    `Mettre à jour le solde actuel de « ${nom} »`,
    [{ libelle: 'Solde actuel', avant: carte.soldes.length ? 'mis à jour' : A_COMPLETER, apres }],
    [{ type: 'definirCarte', carte: { ...carte, soldes: [...carte.soldes, { date, montant, note }] } }],
    [entree(nom, 'solde actuel', null, apres, note)],
    jour,
  );
}

// ---------------------------------------------------------------------------
// Paiements supplémentaires (X1 à X4), depuis Mes paies

export function proposerSupplement(d: DonneesPaie, s: { montant: string; date: string }, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  const montant = lireMontant(s.montant, 'Montant');
  if (montant === null || montant === 0) throw new ErreurSaisie('Indique le montant du paiement supplémentaire.');
  const date = s.date.trim() === '' ? jour : lireDate(s.date, 'Date');
  const id = crypto.randomUUID();
  const element: ElementStocke = {
    id,
    libelle: `${nom} — paiement supplémentaire`,
    nature: 'depense',
    genre: 'fixe',
    incertain: false,
    estimation: false,
    frequence: construireFrequence('unique', date, null),
    montants: [{ aPartirDu: date, montant }],
    suspensions: [],
    fin: null,
    cyclePaie: null,
    changementsFrequence: [],
  };
  const texte = `${formaterMontant(montant)} le ${avecAnnee(date)}`;
  return directe(
    d,
    `Paiement supplémentaire — ${nom}`,
    [{ libelle: 'Paiement supplémentaire', avant: '—', apres: texte }],
    [
      { type: 'definirElement', element },
      { type: 'definirCarte', carte: { ...carte, supplements: [...carte.supplements, id] } },
    ],
    [entree(nom, 'paiement supplémentaire', null, texte)],
    jour,
  );
}

export function proposerSuppressionSupplement(d: DonneesPaie, elementId: string, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  if (!carte.supplements.includes(elementId)) throw new ErreurSaisie('Ce paiement supplémentaire n’existe plus.');
  if ((d.confirmations ?? []).some((f) => f.elementId === elementId)) {
    throw new ErreurSaisie('Ce paiement est confirmé : il ne peut plus être supprimé. Corrige ou annule d’abord la confirmation.');
  }
  const e = trouver(d, elementId);
  const texte = `${e.montants[0] ? formaterMontant(e.montants[0].montant) : A_COMPLETER} le ${avecAnnee(String(e.frequence['date'] ?? ''))}`;
  return directe(
    d,
    `Supprimer le paiement supplémentaire du ${avecAnnee(String(e.frequence['date'] ?? ''))}`,
    [{ libelle: 'Paiement supplémentaire', avant: texte, apres: 'Supprimé' }],
    [
      { type: 'definirCarte', carte: { ...carte, supplements: carte.supplements.filter((x) => x !== elementId) } },
      { type: 'supprimerElement', id: elementId },
    ],
    [entree(nom, 'paiement supplémentaire', texte, null)],
    jour,
  );
}

export function proposerSuppressionCarte(d: DonneesPaie, jour: DateCivile): Proposition {
  const { carte, nom } = exigerCarte(d);
  const ids = [carte.id, ...carte.supplements];
  if ((d.confirmations ?? []).some((f) => f.elementId !== null && ids.includes(f.elementId))) {
    throw new ErreurSaisie('Ta carte a des paiements confirmés : elle ne peut pas être supprimée.');
  }
  return finaliser(
    d,
    {
      titre: `Supprimer la carte « ${nom} »`,
      lignes: [{ libelle: nom, avant: 'Carte', apres: 'Supprimée' }],
      changements: [{ type: 'supprimerCarte', id: carte.id }, ...ids.map((id) => ({ type: 'supprimerElement' as const, id }))],
      journal: [entree(nom, 'suppression', 'carte', null)],
      apres: ['Ses échéances et paiements supplémentaires disparaissent des cycles. Le journal garde la trace de cette suppression.'],
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Choix rapides pour « Ajuster » une échéance (A1)

/** Le relevé auquel répond une échéance : le dernier daté avant elle. */
function releveAvant(carte: CarteStocke, date: string): ReleveStocke | null {
  return [...carte.releves].filter((r) => r.date < date).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1) ?? null;
}

export function choixRapides(d: DonneesPaie, elementId: string, date: string): { libelle: string; montant: Cents }[] {
  const carte = laCarte(d);
  if (!carte || carte.id !== elementId) return [];
  const r = releveAvant(carte, date);
  if (!r) return [];
  return [...(r.minimum !== null ? [{ libelle: 'Minimum', montant: r.minimum }] : []), { libelle: 'Solde du relevé', montant: r.solde }];
}

// ---------------------------------------------------------------------------
// Suivi des relevés (Q60, Q67, O1 à O9) : des additions, aucune estimation

interface Paiement {
  elementId: string;
  supplement: boolean;
  /** Date prévue ou ajustée : sert seulement à classer (Q67). */
  date: string;
  montant: Cents | null;
  confirme: boolean;
  dateConfirmee: string | null;
}

function paiementsDeLaCarte(d: DonneesPaie, carte: CarteStocke, debut: string, fin: string, jour: DateCivile): Paiement[] {
  const n = versNoyau(d);
  if (!n.profil) return [];
  const ids = new Set([carte.id, ...carte.supplements]);
  const plan = planifier(
    { aujourdhui: jour, profil: n.profil, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations },
    ajouterJours(debut as DateCivile, -45),
    ajouterJours(fin as DateCivile, 1),
  );
  const vus = new Set<string>();
  const res: Paiement[] = [];
  for (const c of plan.cycles) {
    for (const l of c.lignes) {
      if (!ids.has(l.elementId) || l.retiree) continue;
      const cle = `${l.elementId}|${l.origine}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      res.push({
        elementId: l.elementId,
        supplement: l.elementId !== carte.id,
        date: (l.echeance ?? c.paie.date) as string,
        montant: l.montant,
        confirme: l.statut === 'confirme',
        dateConfirmee: l.confirmation?.date ?? null,
      });
    }
  }
  return res.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const somme = (ps: Paiement[]): Cents | null => (ps.some((p) => p.montant === null) ? null : ps.reduce((t, p) => t + (p.montant as number), 0));

function lignePaiement(p: Paiement): string {
  const quand = p.confirme && p.dateConfirmee !== null && p.dateConfirmee !== p.date ? `${avecAnnee(p.date)} (prévu) · confirmé le ${avecAnnee(p.dateConfirmee)}` : avecAnnee(p.date);
  return `${quand} — ${p.montant === null ? A_COMPLETER : formaterMontant(p.montant)}${p.supplement ? ' (supplémentaire)' : ''}`;
}

export interface SuiviReleve {
  date: string;
  /** Données originales, telles que recopiées. */
  nouveauSolde: string;
  minimum: string;
  echeance: string;
  confirmes: string[];
  totalConfirmes: string;
  planifies: string[];
  totalPlanifies: string;
  /** O9 : planifiés après l'échéance du relevé, non comptés. */
  apresEcheance: string[];
  /** Q66 : échéance du relevé différente de la date prévue. */
  notesEcheance: string[];
  constatMinimum: string | null;
  constatSolde: string;
}

function suivre(r: ReleveStocke, suivant: string | null, paiements: Paiement[]): SuiviReleve {
  const periode = paiements.filter((p) => p.date > r.date && (suivant === null || p.date <= suivant));
  const confirmes = periode.filter((p) => p.confirme);
  const nonConfirmes = periode.filter((p) => !p.confirme);
  const planifies = r.echeance === null ? nonConfirmes : nonConfirmes.filter((p) => p.date <= (r.echeance as string));
  // O9 : seulement ce qui suit de près l'échéance (pas les mois suivants).
  const apres = r.echeance === null ? [] : nonConfirmes.filter((p) => p.date > (r.echeance as string) && p.date < ajouterJours(r.echeance as DateCivile, 28));
  const conf = somme(confirmes) as Cents;
  // Sans échéance indiquée, « d'ici l'échéance » n'a pas de sens : à compléter.
  const plan = r.echeance === null ? null : somme(planifies);
  const notesEcheance =
    r.echeance === null
      ? []
      : periode
          .filter((p) => !p.supplement && p.date.slice(0, 7) === (r.echeance as string).slice(0, 7) && p.date !== r.echeance)
          .map((p) => `Échéance du relevé : ${avecAnnee(r.echeance as string)} — paiement prévu le ${avecAnnee(p.date)}.`)
          .slice(0, 1);
  let constatMinimum: string | null = null;
  if (r.minimum !== null) {
    if (conf >= r.minimum) constatMinimum = 'Minimum : atteint par les paiements confirmés.';
    else if (plan === null) constatMinimum = `Minimum : pas encore atteint par les paiements confirmés ; paiements planifiés ${r.echeance === null ? '(échéance du relevé non indiquée)' : 'à compléter'}.`;
    else if (conf + plan >= r.minimum) constatMinimum = 'Minimum : serait atteint si les paiements planifiés sont faits.';
    else constatMinimum = `Minimum : il manque ${formaterMontant(r.minimum - conf - plan)}.`;
  }
  const constatSolde =
    conf >= r.solde
      ? 'Nouveau solde : atteint par les paiements confirmés.'
      : plan === null
      ? `Nouveau solde : ce qui resterait est à compléter${r.echeance === null ? ' (échéance du relevé non indiquée)' : ' (un paiement planifié est à compléter)'}.`
      : `Nouveau solde : après les paiements confirmés et planifiés, il resterait ${formaterMontant(Math.max(0, r.solde - conf - plan))}.`;
  return {
    date: avecAnnee(r.date),
    nouveauSolde: formaterMontant(r.solde),
    minimum: r.minimum === null ? A_COMPLETER : formaterMontant(r.minimum),
    echeance: r.echeance === null ? A_COMPLETER : avecAnnee(r.echeance),
    confirmes: confirmes.map(lignePaiement),
    totalConfirmes: formaterMontant(conf),
    planifies: planifies.map(lignePaiement),
    totalPlanifies: plan === null ? A_COMPLETER : formaterMontant(plan),
    apresEcheance: apres.map((p) => `${lignePaiement(p)} — prévu après l’échéance du relevé (${avecAnnee(r.echeance as string)})`),
    notesEcheance,
    constatMinimum,
    constatSolde,
  };
}

// ---------------------------------------------------------------------------
// Ce que montre la fiche

export interface VueCarte {
  nom: string;
  objectif: ObjectifCarte | null;
  objectifLibelle: string;
  /** G2, G3 : ce que l'objectif met en avant ; null sans objectif. */
  enTete: string | null;
  echeance: string;
  montantEcheance: string;
  limite: string;
  taux: string;
  frais: { libelle: string; texte: string }[];
  soldeActuel: string;
  /** G2 : fait à part, jamais soustrait. */
  payesDepuisSolde: string | null;
  utilisation: string;
  /** Échéances à venir sans montant : à choisir dans Mes paies. */
  aChoisir: string[];
  /** Le plus récent d'abord. */
  releves: SuiviReleve[];
  dates: string[];
  phraseEcheance: string;
  brut: CarteStocke;
}

export function vueCarte(d: DonneesPaie, jour: DateCivile): VueCarte | null {
  const carte = laCarte(d);
  if (!carte) return null;
  const nom = nomCarte(d, carte);
  const element = trouver(d, carte.id);
  const depart = String(element.frequence['depart'] ?? '');
  const jourDuMois = Number(depart.slice(8, 10));
  const releves = [...carte.releves].sort((a, b) => (a.date < b.date ? -1 : 1));
  const soldes = [...carte.soldes].sort((a, b) => (a.date < b.date ? -1 : 1));
  const dernierSolde = soldes.at(-1) ?? null;
  const dernierReleve = releves.at(-1) ?? null;

  // Paiements à classer : du premier relevé (ou du solde) jusqu'à ~2 mois après aujourd'hui.
  const bornes = [jour as string, depart, ...releves.map((r) => r.date), ...releves.flatMap((r) => (r.echeance ? [r.echeance] : [])), ...soldes.map((s) => s.date)].sort();
  const paiements = paiementsDeLaCarte(d, carte, bornes[0] as string, ajouterJours(bornes.at(-1) as DateCivile, 62), jour);

  const suivis = releves.map((r, i) => suivre(r, releves[i + 1]?.date ?? null, paiements)).reverse();

  const payesDepuis = dernierSolde ? paiements.filter((p) => p.confirme && p.date > dernierSolde.date) : [];
  const recent =
    dernierSolde && (!dernierReleve || dernierSolde.date >= dernierReleve.date)
      ? { montant: dernierSolde.montant, source: `selon ta mise à jour du ${avecAnnee(dernierSolde.date)}` }
      : dernierReleve
        ? { montant: dernierReleve.solde, source: `selon le relevé du ${avecAnnee(dernierReleve.date)}` }
        : null;
  const soldeActuel = dernierSolde
    ? `${formaterMontant(dernierSolde.montant)} (ta mise à jour du ${avecAnnee(dernierSolde.date)}${dernierSolde.note ? ` — ${dernierSolde.note}` : ''})`
    : A_COMPLETER;
  const utilisation =
    carte.limite === null || carte.limite === 0 || recent === null ? A_COMPLETER : `${Math.round((recent.montant * 100) / carte.limite)} % — ${recent.source}`;

  return {
    nom,
    objectif: carte.objectif,
    objectifLibelle: LIBELLES_OBJECTIF[carte.objectif ?? 'aucun'],
    enTete:
      carte.objectif === 'reduireSolde'
        ? `Solde actuel : ${soldeActuel}`
        : carte.objectif === 'payerReleves'
          ? (suivis[0]?.constatSolde ?? 'Nouveau solde : à compléter (aucun relevé).')
          : null,
    echeance: `chaque mois, le ${jourDuMois === 1 ? '1er' : jourDuMois}`,
    montantEcheance: 'à choisir à chaque relevé',
    limite: carte.limite === null ? A_COMPLETER : formaterMontant(carte.limite),
    taux: tauxTexte(carte.taux),
    frais: carte.frais.map((f) => ({ libelle: f.libelle, texte: `${f.libelle} — ${formaterMontant(f.montant)} ${f.frequence === 'annee' ? 'par année' : 'par mois'}` })),
    soldeActuel,
    payesDepuisSolde: dernierSolde ? `Paiements confirmés depuis cette mise à jour : ${formaterMontant(somme(payesDepuis) ?? 0)}` : null,
    utilisation,
    aChoisir: paiements
      .filter((p) => !p.supplement && !p.confirme && p.montant === null && p.date >= jour)
      .slice(0, 1)
      .map((p) => `Échéance du ${avecAnnee(p.date)} : montant à choisir dans Mes paies.`),
    releves: suivis,
    dates: releves.map((r) => r.date).reverse(),
    phraseEcheance: PHRASE_ECHEANCE,
    brut: carte,
  };
}
