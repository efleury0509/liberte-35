// Étape 7a : les prêts au quotidien (cahier 5.1, 5.2 ; décisions Q34 à Q47).
//
// Un prêt est la fiche d'un élément de dépense fixe : son versement. Les
// cycles, statuts, confirmations, ajustements et « Tout confirmer » des
// étapes 4 à 5 s'appliquent donc tels quels, sans double saisie (Q39).
//
// On commence avec ce qu'on sait : nom, versement, fréquence et prochaine
// échéance suffisent. Minimum, taux, solde et échéance finale s'ajoutent
// plus tard, sans perdre de versement confirmé et sans réécrire l'historique.
// Aucune méthode d'intérêts n'est supposée (H0) : intérêts, capital et solde
// estimé restent « À compléter ». Rien n'arrête les versements sans une
// action explicite (E4) ; une échéance finale indiquée sert à planifier, mais
// ne vaut jamais remboursement (E3).

import type { DonneesPaie, ElementStocke, EntreeJournal, PretStocke } from '../lib/plateforme';
import { formaterDateCourte, type DateCivile } from '../noyau/dates';
import { formaterMontant, type Cents } from '../noyau/montants';
import { historiquePret, type LigneHistorique } from '../noyau/prets';
import { montantEnVigueur } from '../noyau/regles';
import { cyclesAffiches } from './analyse';
import { construireFrequence, exigerProfil, finaliser, proposerMontant, trouver, versElementNoyau, type Quand } from './elements';
import { A_COMPLETER, ErreurSaisie, lireDate, lireMontant, versNoyau, type LigneApercu, type Proposition } from './paie';

export const SECTION_DETTES = 'Mes dettes';

/** Fréquences d'un versement de prêt (Q38) : ce dont nos prêts ont besoin, pas plus. */
export type QuandPret = 'semaine' | 'deuxSemaines' | 'mois' | 'chaquePaie';
export const LIBELLES_QUAND_PRET: Record<QuandPret, string> = {
  semaine: 'Chaque semaine',
  deuxSemaines: 'Aux deux semaines',
  mois: 'Chaque mois',
  chaquePaie: 'À chaque paie',
};

export const NOTE_REPARTITION = 'Intérêts et capital : à compléter tant que la méthode de calcul du contrat n’est pas précisée.';

const avecAnnee = (d: string) => `${formaterDateCourte(d as DateCivile)} ${d.slice(0, 4)}`;
const objet = (nom: string) => `Prêt « ${nom} »`;
const entree = (nom: string, champ: string, avant: string | null, apres: string | null, motif: string | null = null): EntreeJournal => ({
  section: SECTION_DETTES,
  objet: objet(nom),
  champ,
  ancienneValeur: avant,
  nouvelleValeur: apres,
  motif,
});

export const estPret = (d: DonneesPaie, elementId: string) => (d.prets ?? []).some((p) => p.id === elementId);

function trouverPret(d: DonneesPaie, id: string): { pret: PretStocke; element: ElementStocke } {
  const pret = (d.prets ?? []).find((p) => p.id === id);
  if (!pret) throw new ErreurSaisie('Ce prêt n’existe plus.');
  return { pret, element: trouver(d, id) };
}

/** « aux deux semaines », « chaque mois, le 15 », « à chaque paie ». */
export function quandPret(e: Pick<ElementStocke, 'frequence'>): string {
  const f = e.frequence;
  const n = typeof f['n'] === 'number' ? f['n'] : 1;
  const depart = typeof f['depart'] === 'string' ? (f['depart'] as string) : null;
  switch (f.type) {
    case 'semaines':
      return n === 2 ? 'aux deux semaines' : n === 1 ? 'chaque semaine' : `toutes les ${n} semaines`;
    case 'mois':
      return n === 1 && depart ? `chaque mois, le ${Number(depart.slice(8, 10)) === 1 ? '1er' : Number(depart.slice(8, 10))}` : 'chaque mois';
    case 'chaquePaie':
      return 'à chaque paie';
    default:
      return 'selon sa règle';
  }
}

/** Taux saisi (« 9,90 », « 9.9 % ») → texte stocké avec un point. */
export function lireTaux(texte: string): string | null {
  const t = texte.replace(/[%\s]/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(t) || Number(t) > 100) throw new ErreurSaisie('Taux invalide : écris-le comme 9,90.');
  return t;
}

const tauxTexte = (t: string | null) => (t === null ? A_COMPLETER : `${t.replace('.', ',')} %`);

function versementEnVigueur(e: ElementStocke, jour: string): Cents | null {
  const montants = versElementNoyau(e).regle.montants;
  return montantEnVigueur(montants, jour as DateCivile) ?? montants[0]?.montant ?? null;
}

function lireSolde(soldeTexte: string, dateTexte: string): { montant: Cents; date: DateCivile } | null {
  const montant = lireMontant(soldeTexte, 'Solde');
  if (montant === null && dateTexte.trim() === '') return null;
  if (montant === null) throw new ErreurSaisie('Indique le montant de ce solde.');
  if (dateTexte.trim() === '') throw new ErreurSaisie('Indique la date de ce solde.');
  return { montant, date: lireDate(dateTexte, 'Date du solde') };
}

const finDe = (p: Pick<PretStocke, 'rembourseLe' | 'echeanceFinale'>) => p.rembourseLe ?? p.echeanceFinale;

// ---------------------------------------------------------------------------
// Ajouter (F1, F2, F3)

export interface SaisiePret {
  nom: string;
  /** Versement planifié, en dollars. */
  versement: string;
  quand: QuandPret | '';
  /** Date du prochain versement. */
  prochaine: string;
  /** Facultatifs. */
  minimum: string;
  echeanceFinale: string;
  solde: string;
  soldeLe: string;
  taux: string;
}

export function proposerAjoutPret(d: DonneesPaie, s: SaisiePret, jour: DateCivile): Proposition {
  exigerProfil(d);
  const nom = s.nom.trim();
  if (nom === '') throw new ErreurSaisie('Donne un nom à ce prêt.');
  const versement = lireMontant(s.versement, 'Versement');
  if (versement === null) throw new ErreurSaisie('Indique le montant du versement.');
  if (versement === 0) throw new ErreurSaisie('Le versement doit être plus grand que 0.');
  if (s.quand === '') throw new ErreurSaisie('Choisis la fréquence des versements.');
  if (s.prochaine.trim() === '') throw new ErreurSaisie('Indique la date du prochain versement.');
  const prochaine = lireDate(s.prochaine, 'Prochain versement');
  const minimum = lireMontant(s.minimum, 'Minimum');
  if (minimum !== null && minimum > versement) {
    throw new ErreurSaisie(`Le minimum (${formaterMontant(minimum)}) dépasse le versement planifié (${formaterMontant(versement)}).`);
  }
  const solde = lireSolde(s.solde, s.soldeLe);
  const taux = lireTaux(s.taux);
  const echeanceFinale = s.echeanceFinale.trim() === '' ? null : lireDate(s.echeanceFinale, 'Échéance finale');
  if (echeanceFinale !== null && echeanceFinale < prochaine) throw new ErreurSaisie('L’échéance finale ne peut pas venir avant le prochain versement.');

  const id = crypto.randomUUID();
  const element: ElementStocke = {
    id,
    libelle: nom,
    nature: 'depense',
    genre: 'fixe',
    incertain: false,
    estimation: false,
    frequence: construireFrequence(s.quand as Quand, prochaine, null),
    montants: [{ aPartirDu: prochaine, montant: versement }],
    suspensions: [],
    fin: echeanceFinale,
    cyclePaie: null,
    changementsFrequence: [],
  };
  const pret: PretStocke = {
    id,
    minimum,
    echeanceFinale,
    taux,
    rembourseLe: null,
    soldes: solde ? [{ date: solde.date, montant: solde.montant, note: null }] : [],
  };
  const extras = [
    ...(minimum !== null ? [`minimum ${formaterMontant(minimum)}`] : []),
    ...(taux !== null ? [`taux ${tauxTexte(taux)}`] : []),
    ...(solde ? [`solde ${formaterMontant(solde.montant)} au ${solde.date}`] : []),
    ...(echeanceFinale !== null ? [`échéance finale ${echeanceFinale}`] : []),
  ];
  const description = `${formaterMontant(versement)} — ${quandPret(element)} à partir du ${avecAnnee(prochaine)}`;
  return finaliser(
    d,
    {
      titre: `Ajouter le prêt « ${nom} »`,
      lignes: [
        { libelle: 'Prêt', avant: '—', apres: nom },
        { libelle: 'Versement', avant: '—', apres: description },
      ],
      changements: [
        { type: 'definirElement', element },
        { type: 'definirPret', pret },
      ],
      journal: [entree(nom, 'création', null, [description, ...extras].join(' ; '))],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Compléter ou modifier les renseignements (F4, E2)

export interface SaisieRenseignements {
  minimum: string;
  echeanceFinale: string;
  taux: string;
  /** Solde de départ : seulement s'il n'y en a pas encore (sinon, mise à jour du solde). */
  solde: string;
  soldeLe: string;
}

export function proposerRenseignements(d: DonneesPaie, id: string, s: SaisieRenseignements, jour: DateCivile): Proposition {
  const { pret, element } = trouverPret(d, id);
  const nom = element.libelle;
  const minimum = lireMontant(s.minimum, 'Minimum');
  const versement = versementEnVigueur(element, jour);
  if (minimum !== null && versement !== null && minimum > versement) {
    throw new ErreurSaisie(`Le minimum (${formaterMontant(minimum)}) dépasse le versement planifié (${formaterMontant(versement)}).`);
  }
  const taux = lireTaux(s.taux);
  const echeanceFinale = s.echeanceFinale.trim() === '' ? null : lireDate(s.echeanceFinale, 'Échéance finale');
  const depart = (element.frequence['depart'] ?? element.frequence['date']) as string | undefined;
  if (echeanceFinale !== null && depart && echeanceFinale < depart) {
    throw new ErreurSaisie('L’échéance finale ne peut pas venir avant le premier versement.');
  }
  // Le solde de départ s'ajoute s'il n'existe pas ; une fois connu, il ne se
  // remplace pas ici : on fait une mise à jour du solde (jamais de réécriture).
  const solde = pret.soldes.length === 0 ? lireSolde(s.solde, s.soldeLe) : null;

  const nouveau: PretStocke = {
    ...pret,
    minimum,
    taux,
    echeanceFinale,
    soldes: solde ? [{ date: solde.date, montant: solde.montant, note: null }] : pret.soldes,
  };
  const journal: EntreeJournal[] = [];
  const lignes: LigneApercu[] = [];
  const noter = (libelle: string, avant: string, apres: string) => {
    if (avant === apres) return;
    lignes.push({ libelle, avant, apres });
    journal.push(entree(nom, libelle.toLowerCase(), avant, apres));
  };
  noter('Minimum', pret.minimum === null ? 'Identique au versement' : formaterMontant(pret.minimum), minimum === null ? 'Identique au versement' : formaterMontant(minimum));
  noter('Taux', tauxTexte(pret.taux), tauxTexte(taux));
  noter('Échéance finale', pret.echeanceFinale ?? A_COMPLETER, echeanceFinale ?? A_COMPLETER);
  if (solde) noter('Solde de départ', A_COMPLETER, `${formaterMontant(solde.montant)} au ${solde.date}`);
  if (journal.length === 0) throw new ErreurSaisie('Rien ne change.');

  const fin = finDe(nouveau);
  const changements: Proposition['changements'] = [{ type: 'definirPret', pret: nouveau }];
  if (fin !== element.fin) changements.unshift({ type: 'definirElement', element: { ...element, fin } });
  return finaliser(
    d,
    {
      titre: `Compléter « ${nom} »`,
      lignes,
      changements,
      journal,
      avant: solde ? ['Les versements déjà confirmés restent tels quels ; le solde de départ sert pour la suite.'] : [],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Changer le versement à partir d'une date (F5)

export function proposerVersement(d: DonneesPaie, id: string, dateTexte: string, montantTexte: string, jour: DateCivile): Proposition {
  const { pret, element } = trouverPret(d, id);
  const montant = lireMontant(montantTexte, 'Nouveau versement');
  if (montant !== null && pret.minimum !== null && pret.minimum > montant) {
    throw new ErreurSaisie(`Le minimum (${formaterMontant(pret.minimum)}) dépasse le versement planifié (${formaterMontant(montant)}).`);
  }
  const p = proposerMontant(d, id, dateTexte, montantTexte, jour);
  return {
    ...p,
    titre: `Changer le versement de « ${element.libelle} »`,
    lignes: p.lignes.map((l) => ({ ...l, libelle: l.libelle.replace('Montant', 'Versement') })),
    journal: p.journal.map((e) =>
      e.objet.endsWith(`« ${element.libelle} »`) && e.champ.startsWith('montant')
        ? { ...e, section: SECTION_DETTES, objet: objet(element.libelle), champ: e.champ.replace('montant', 'versement') }
        : e,
    ),
  };
}

// ---------------------------------------------------------------------------
// Mettre à jour le solde (S3, Q40) : une nouvelle référence, rien de réécrit

export function proposerMiseAJourSolde(d: DonneesPaie, id: string, dateTexte: string, montantTexte: string, note: string, jour: DateCivile): Proposition {
  void jour;
  const { pret, element } = trouverPret(d, id);
  const montant = lireMontant(montantTexte, 'Solde');
  if (montant === null) throw new ErreurSaisie('Indique le solde.');
  const date = lireDate(dateTexte, 'Date du solde');
  if (pret.soldes.some((s) => s.date === date)) throw new ErreurSaisie(`Un solde existe déjà au ${avecAnnee(date)}.`);
  const reference = [...pret.soldes].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  const texteNote = note.trim() === '' ? null : note.trim();
  const nouveau: PretStocke = { ...pret, soldes: [...pret.soldes, { date, montant, note: texteNote }].sort((a, b) => (a.date < b.date ? -1 : 1)) };
  const avant = reference ? `${formaterMontant(reference.montant)} au ${reference.date}` : null;
  const apres = `${formaterMontant(montant)} au ${date}`;
  return {
    titre: `Mettre à jour le solde de « ${element.libelle} »`,
    lignes: [{ libelle: 'Solde', avant: avant ?? A_COMPLETER, apres }],
    consequences: [],
    changements: [{ type: 'definirPret', pret: nouveau }],
    journal: [entree(element.libelle, 'solde', avant, apres, texteNote)],
    apercu: false,
  };
}

// ---------------------------------------------------------------------------
// Marquer comme remboursé (L2 à L4) : toujours avec un aperçu

export function proposerRemboursement(d: DonneesPaie, id: string, dateTexte: string, jour: DateCivile): Proposition {
  const { pret, element } = trouverPret(d, id);
  if (pret.rembourseLe) throw new ErreurSaisie(`« ${element.libelle} » est déjà marqué remboursé.`);
  const derniere = (d.confirmations ?? [])
    .filter((f) => f.elementId === id)
    .map((f) => f.origine)
    .sort()
    .at(-1);
  const date = dateTexte.trim() === '' ? ((derniere ?? jour) as DateCivile) : lireDate(dateTexte, 'Remboursé le');
  const nouveau: PretStocke = { ...pret, rembourseLe: date };
  const versement = versementEnVigueur(element, date);
  return finaliser(
    d,
    {
      titre: `Marquer « ${element.libelle} » comme remboursé`,
      lignes: [{ libelle: 'Statut', avant: 'En cours', apres: `Remboursé le ${avecAnnee(date)}` }],
      changements: [
        { type: 'definirElement', element: { ...element, fin: date } },
        { type: 'definirPret', pret: nouveau },
      ],
      journal: [entree(element.libelle, 'statut', 'en cours', `remboursé le ${date}`)],
      avant: [
        `Les versements prévus après le ${avecAnnee(date)} ne seront plus planifiés.`,
        ...(versement !== null ? [`${formaterMontant(versement)} ${quandPret(element)} deviennent libres. L’app ne décide pas où va cet argent.`] : []),
        'L’historique reste consultable dans « Dettes libérées ».',
      ],
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Supprimer (D1, D2) : toujours avec un aperçu

export function proposerSuppressionPret(d: DonneesPaie, id: string, jour: DateCivile): Proposition {
  const { element } = trouverPret(d, id);
  if ((d.confirmations ?? []).some((f) => f.elementId === id)) {
    throw new ErreurSaisie('Ce prêt a des versements confirmés : marque-le comme remboursé plutôt que de le supprimer.');
  }
  const versement = versementEnVigueur(element, jour);
  const description = `${versement === null ? A_COMPLETER : formaterMontant(versement)} ${quandPret(element)}`;
  return finaliser(
    d,
    {
      titre: `Supprimer le prêt « ${element.libelle} »`,
      lignes: [{ libelle: element.libelle, avant: description, apres: 'Supprimé' }],
      changements: [
        { type: 'supprimerPret', id },
        { type: 'supprimerElement', id },
      ],
      journal: [entree(element.libelle, 'suppression', description, null)],
      apres: ['Ses versements disparaissent des cycles. Le journal garde la trace de cette suppression.'],
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Ce que montre la fiche

export type LigneVue =
  | {
      genre: 'versement';
      origine: string;
      date: string;
      dateConfirmee: string;
      paye: string;
      obligatoire: string;
      supplementaire: string;
      sousMinimum: string | null;
      interets: string;
      capital: string;
      nouveauSolde: string;
    }
  | { genre: 'solde'; date: string; texte: string };

export interface VuePret {
  id: string;
  nom: string;
  rembourse: boolean;
  statut: string;
  versement: string;
  prochainVersement: string | null;
  minimum: string;
  taux: string;
  methode: string;
  echeanceFinale: string;
  soldeInitial: string;
  capitalRembourse: string;
  soldeActuel: string;
  payeDepuisAjout: string;
  noteRepartition: string;
  /** E3 : échéance passée sans remboursement marqué. */
  note: string | null;
  historique: LigneVue[];
  /** Valeurs actuelles, pour préremplir les formulaires. */
  brut: PretStocke;
}

function ligneVue(l: LigneHistorique): LigneVue {
  if (l.genre === 'solde') {
    const note = l.note ? ` (${l.note})` : '';
    return { genre: 'solde', date: avecAnnee(l.date), texte: `${l.depart ? 'Solde de départ' : 'Solde mis à jour'} : ${formaterMontant(l.montant)}${note}` };
  }
  return {
    genre: 'versement',
    origine: l.origine,
    date: avecAnnee(l.origine),
    dateConfirmee: avecAnnee(l.dateConfirmee),
    paye: formaterMontant(l.paye),
    obligatoire: formaterMontant(l.obligatoire),
    supplementaire: formaterMontant(l.supplementaire),
    sousMinimum: l.sousMinimum > 0 ? `${formaterMontant(l.sousMinimum)} sous le minimum` : null,
    interets: A_COMPLETER,
    capital: A_COMPLETER,
    nouveauSolde: A_COMPLETER,
  };
}

function prochainVersement(d: DonneesPaie, id: string, jour: DateCivile): string | null {
  const n = versNoyau(d);
  if (!n.profil) return null;
  const { cycles } = cyclesAffiches(
    n.profil,
    { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations },
    jour,
    6,
  );
  for (const c of cycles) {
    for (const l of c.lignes) {
      if (l.elementId !== id || l.retiree || l.statut === 'confirme') continue;
      const date = l.echeance ?? c.paie.date;
      if (date < jour) continue;
      return `${l.montant === null ? A_COMPLETER : formaterMontant(l.montant)} le ${avecAnnee(date)}`;
    }
  }
  return null;
}

export function vuePret(d: DonneesPaie, id: string, jour: DateCivile): VuePret {
  const { pret, element } = trouverPret(d, id);
  const regle = versElementNoyau(element).regle;
  const h = historiquePret(
    {
      minimum: pret.minimum,
      montants: regle.montants,
      soldes: pret.soldes.map((s) => ({ date: s.date as DateCivile, montant: s.montant, note: s.note })),
    },
    (d.confirmations ?? [])
      .filter((f) => f.elementId === id)
      .map((f) => ({ origine: f.origine as DateCivile, date: f.date as DateCivile, montant: f.montant })),
  );
  const versement = versementEnVigueur(element, jour);
  const ref = h.reference;
  let soldeActuel = A_COMPLETER;
  if (ref) {
    soldeActuel = `${formaterMontant(ref.montant)} au ${avecAnnee(ref.date)}`;
    if (h.payeDepuisReference > 0) soldeActuel += ` — ${formaterMontant(h.payeDepuisReference)} payés depuis, répartition à compléter`;
  }
  const rembourse = pret.rembourseLe !== null;
  return {
    id,
    nom: element.libelle,
    rembourse,
    statut: rembourse ? `Remboursé le ${avecAnnee(pret.rembourseLe!)}` : 'En cours',
    versement: `${versement === null ? A_COMPLETER : formaterMontant(versement)} — ${quandPret(element)}`,
    prochainVersement: rembourse ? null : prochainVersement(d, id, jour),
    minimum: pret.minimum === null ? 'Identique au versement' : formaterMontant(pret.minimum),
    taux: tauxTexte(pret.taux),
    methode: A_COMPLETER,
    echeanceFinale: pret.echeanceFinale === null ? A_COMPLETER : `Dernier versement prévu : ${avecAnnee(pret.echeanceFinale)} (échéance indiquée)`,
    soldeInitial: h.soldeInitial ? `${formaterMontant(h.soldeInitial.montant)} au ${avecAnnee(h.soldeInitial.date)}` : A_COMPLETER,
    capitalRembourse: A_COMPLETER,
    soldeActuel,
    payeDepuisAjout: `Payé depuis l’ajout : ${formaterMontant(h.payeDepuisAjout)}`,
    noteRepartition: NOTE_REPARTITION,
    note:
      !rembourse && pret.echeanceFinale !== null && jour > pret.echeanceFinale
        ? 'L’échéance prévue est passée. Marque le prêt comme remboursé quand c’est fait.'
        : null,
    historique: h.lignes.map(ligneVue),
    brut: pret,
  };
}

export function listePrets(d: DonneesPaie, jour: DateCivile): { actifs: VuePret[]; liberes: VuePret[] } {
  const vues = (d.prets ?? []).map((p) => vuePret(d, p.id, jour)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return { actifs: vues.filter((v) => !v.rembourse), liberes: vues.filter((v) => v.rembourse) };
}
