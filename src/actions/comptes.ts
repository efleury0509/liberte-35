// Étape 9 : les comptes d'épargne (cahier 6 ; décisions A4, Q70 à Q79).
//
// Un compte est une fiche dans Mon épargne. Ses contributions sont des
// dépenses fixes rattachées (comme les versements d'un prêt) : elles vivent
// dans Mes paies, où on les ajuste et on les confirme comme le reste.
//
// La valeur suivie part d'un solde de référence daté, puis bouge seulement
// avec ce qui est réel et daté APRÈS elle : contributions confirmées (par leur
// date prévue ou ajustée, Q67/Q72), fluctuations, retraits, transferts. Ce qui
// est daté le jour de la référence ou avant y est déjà inclus. Rien n'est
// estimé ; aucun taux n'est supposé ; aucun mouvement n'entre dans Mes paies.

import type { CompteStocke, DonneesPaie, ElementStocke, EntreeJournal, MouvementStocke, SorteCompte } from '../lib/plateforme';
import { ajouterJours, formaterDateCourte, type DateCivile } from '../noyau/dates';
import { arrondirDecimal, formaterMontant, type Cents } from '../noyau/montants';
import { planifier } from '../noyau/cycles';
import { appliquerChangements } from '../lib/appliquer';
import { reservesDe, soldeReserve } from './couvertures';
import type { MouvementReserveStocke, ReserveStockee } from '../lib/plateforme';
import { construireFrequence, decrireQuand, exigerProfil, finaliser, proposerFin, proposerMontant, trouver, type Quand } from './elements';
import { A_COMPLETER, ErreurSaisie, lireDate, lireMontant, versNoyau, type LigneApercu, type Proposition } from './paie';

export const SECTION_EPARGNE = 'Mon épargne';
export const FIN_OUVERTE = '9999-12-31';
export const LIBELLES_SORTE: Record<Exclude<SorteCompte, 'autre'>, string> = {
  celi: 'CELI',
  reer: 'REER',
  celiapp: 'CELIAPP',
  epargne: 'Compte épargne',
};
export const EXPLICATION_FLUCTUATION = 'Ajouter un gain ou une perte à la valeur suivie.';
export const EXPLICATION_CORRECTION = 'Repartir d’une nouvelle valeur à la date choisie.';
export const PHRASE_TOTAL = 'Ce total n’est pas de l’argent disponible dans tes cycles de paie.';
export const PHRASE_RETRAIT = 'Cet argent n’est pas ajouté à Mes paies. Pour le planifier dans un cycle, ajoute toi-même un revenu ponctuel.';

export const avecAnnee = (d: string) => `${formaterDateCourte(d as DateCivile)} ${d.slice(0, 4)}`;
const signe = (c: Cents) => `${c < 0 ? '−' : '+'}${formaterMontant(Math.abs(c))}`;
const texteOuNull = (t: string) => (t.trim() === '' ? null : t.trim());

// ---------------------------------------------------------------------------
// Noms et rattachements

export const comptesDe = (d: DonneesPaie): CompteStocke[] => d.comptes ?? [];
export const typeAffiche = (k: CompteStocke) => (k.sorte === 'autre' ? (k.typeLibre ?? 'Autre') : LIBELLES_SORTE[k.sorte]);

/** T1 à T3 : le nom choisi, sinon le type, numéroté parmi les comptes du même type. */
export function nomCompte(d: DonneesPaie, k: CompteStocke): string {
  if (k.nom?.trim()) return k.nom.trim();
  const memes = comptesDe(d).filter((x) => typeAffiche(x) === typeAffiche(k));
  const rang = memes.findIndex((x) => x.id === k.id) + 1;
  return rang > 1 ? `${typeAffiche(k)} ${rang}` : typeAffiche(k);
}

export const objetCompte = (nom: string) => `Compte « ${nom} »`;
export const compteDeContribution = (d: DonneesPaie, elementId: string): CompteStocke | null =>
  comptesDe(d).find((k) => k.contributions.includes(elementId)) ?? null;
export const estContribution = (d: DonneesPaie, elementId: string) => compteDeContribution(d, elementId) !== null;

export function exigerCompte(d: DonneesPaie, id: string): { compte: CompteStocke; nom: string } {
  const compte = comptesDe(d).find((k) => k.id === id);
  if (!compte) throw new ErreurSaisie('Ce compte n’existe plus.');
  return { compte, nom: nomCompte(d, compte) };
}
export function exigerOuvert(d: DonneesPaie, id: string) {
  const r = exigerCompte(d, id);
  if (r.compte.fermeLe !== null) throw new ErreurSaisie('Ce compte est fermé : rouvre-le d’abord.');
  return r;
}

// ---------------------------------------------------------------------------
// Étape A : réserves d'un compte (soldes réels) et part non réservée.

export interface EtatReserves {
  soldes: Map<string, Cents>;
  totalReserves: Cents;
  /** Valeur suivie − réserves ; null si la valeur est à compléter. Négatif : dépassement (Q89). */
  nonReserve: Cents | null;
}

export const reservesActives = (k: CompteStocke): ReserveStockee[] => reservesDe(k).filter((r) => r.arreteeLe === null);

export function etatReserves(d: DonneesPaie, k: CompteStocke): EtatReserves {
  const soldes = new Map<string, Cents>();
  for (const r of reservesDe(k)) soldes.set(r.id, soldeReserve(d, k, r));
  const totalReserves = reservesActives(k).reduce((t, r) => t + (soldes.get(r.id) ?? 0), 0);
  const v = valeurDuCompte(d, k);
  return { soldes, totalReserves, nonReserve: v ? v.montant - totalReserves : null };
}

const nouveauMouvementReserve = (m: Omit<MouvementReserveStocke, 'id'>): MouvementReserveStocke => ({ id: crypto.randomUUID(), ...m });

/**
 * Q88 : une sortie (retrait, transfert) est prise sur le non réservé par
 * défaut, ou sur une réserve choisie. Si le non réservé ne suffit pas, on
 * demande de choisir une réserve pour le reste, au lieu de refuser.
 */
function prelever(
  d: DonneesPaie,
  k: CompteStocke,
  montant: Cents,
  date: string,
  lien: string,
  prisSur: string,
  complement: string,
): { reserves: ReserveStockee[]; lignes: LigneApercu[] } {
  if (reservesActives(k).length === 0) return { reserves: reservesDe(k), lignes: [] };
  const etat = etatReserves(d, k);
  const nomR = (id: string) => reservesDe(k).find((r) => r.id === id)?.nom ?? '?';
  const parts: { reserveId: string; montant: Cents }[] = [];
  if (prisSur !== '') {
    const solde = etat.soldes.get(prisSur) ?? 0;
    if (montant > solde) throw new ErreurSaisie(`La réserve « ${nomR(prisSur)} » n’a que ${formaterMontant(solde)}.`);
    parts.push({ reserveId: prisSur, montant });
  } else {
    const libre = Math.max(0, etat.nonReserve ?? montant);
    if (montant > libre) {
      const reste = montant - libre;
      if (complement === '') {
        throw new ErreurSaisie(`Le non réservé ne suffit pas (${formaterMontant(libre)}) : choisis une réserve pour les ${formaterMontant(reste)} restants.`);
      }
      const solde = etat.soldes.get(complement) ?? 0;
      if (reste > solde) throw new ErreurSaisie(`La réserve « ${nomR(complement)} » n’a que ${formaterMontant(solde)}.`);
      parts.push({ reserveId: complement, montant: reste });
    }
  }
  const lignes: LigneApercu[] = parts.map((p) => ({
    libelle: `Pris sur la réserve « ${nomR(p.reserveId)} »`,
    avant: formaterMontant(etat.soldes.get(p.reserveId) ?? 0),
    apres: formaterMontant((etat.soldes.get(p.reserveId) ?? 0) - p.montant),
  }));
  const reserves = reservesDe(k).map((r) => {
    const p = parts.find((x) => x.reserveId === r.id);
    return p ? { ...r, mouvements: [...r.mouvements, nouveauMouvementReserve({ date, sorte: 'prelevement', montant: p.montant, vers: null, lien, note: null })] } : r;
  });
  return { reserves, lignes };
}

export const entreeCompte = (nom: string, champ: string, avant: string | null, apres: string | null, motif: string | null = null): EntreeJournal => ({
  section: SECTION_EPARGNE,
  objet: objetCompte(nom),
  champ,
  ancienneValeur: avant,
  nouvelleValeur: apres,
  motif,
});

/** Les actions communes (montant, fin) écrivent au journal sous le nom du compte (J1). */
function sousCompte(p: Proposition, nom: string): Proposition {
  return { ...p, journal: p.journal.map((e) => ({ ...e, section: SECTION_EPARGNE, objet: objetCompte(nom) })) };
}

// ---------------------------------------------------------------------------
// Valeur suivie : des additions

interface Fait {
  date: string;
  /** Effet sur la valeur du compte (+ ou −). */
  effet: Cents;
  genre: 'contribution' | 'fluctuation' | 'retrait' | 'transfertEnvoye' | 'transfertRecu';
  texte: string;
  /** Mouvement à retirer, et le compte qui le porte. */
  mouvement: { compteId: string; id: string } | null;
}

/** Date d'une contribution confirmée : sa date prévue ou ajustée (Q67). */
function dateDeConfirmation(d: DonneesPaie, elementId: string, origine: string): string {
  return d.ajustements.find((a) => a.elementId === elementId && a.origine === origine)?.date ?? origine;
}

function faits(d: DonneesPaie, k: CompteStocke): Fait[] {
  const res: Fait[] = [];
  for (const f of d.confirmations) {
    if (f.elementId === null || !k.contributions.includes(f.elementId)) continue;
    const date = dateDeConfirmation(d, f.elementId, f.origine);
    const confirmee = f.date !== date ? ` · confirmée le ${avecAnnee(f.date)}` : '';
    res.push({ date, effet: f.montant, genre: 'contribution', texte: `Contribution confirmée ${formaterMontant(f.montant)}${confirmee}`, mouvement: null });
  }
  for (const m of k.mouvements) {
    const note = m.note ? ` — ${m.note}` : '';
    const mv = { compteId: k.id, id: m.id };
    if (m.sorte === 'fluctuation') res.push({ date: m.date, effet: m.montant, genre: 'fluctuation', texte: `Fluctuation ${signe(m.montant)}${note}`, mouvement: mv });
    else if (m.sorte === 'retrait') {
      const vers = m.destination ? ` — vers ${m.destination}` : '';
      res.push({ date: m.date, effet: -m.montant, genre: 'retrait', texte: `Retrait ${formaterMontant(m.montant)}${vers}${note}`, mouvement: mv });
    } else {
      const dest = comptesDe(d).find((x) => x.id === m.vers);
      res.push({ date: m.date, effet: -m.montant, genre: 'transfertEnvoye', texte: `Transfert vers ${dest ? nomCompte(d, dest) : '?'} ${formaterMontant(m.montant)}${note}`, mouvement: mv });
    }
  }
  for (const x of comptesDe(d)) {
    for (const m of x.mouvements) {
      if (m.sorte !== 'transfert' || m.vers !== k.id) continue;
      const note = m.note ? ` — ${m.note}` : '';
      res.push({ date: m.date, effet: m.montant, genre: 'transfertRecu', texte: `Transfert depuis ${nomCompte(d, x)} ${formaterMontant(m.montant)}${note}`, mouvement: { compteId: x.id, id: m.id } });
    }
  }
  return res.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const derniereReference = (k: CompteStocke, jusqua: string = FIN_OUVERTE) =>
  [...k.references].filter((r) => r.date <= jusqua).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1) ?? null;

export interface Valeur {
  montant: Cents;
  reference: { date: string; montant: Cents };
  contributions: Cents;
  fluctuations: Cents;
  retraits: Cents;
  transferts: Cents;
}

/** Valeur suivie à une date (par défaut : tout ce qui est connu) ; null sans référence. */
export function valeurDuCompte(d: DonneesPaie, k: CompteStocke, jusqua: string = FIN_OUVERTE): Valeur | null {
  const r = derniereReference(k, jusqua);
  if (!r) return null;
  const v: Valeur = { montant: r.montant, reference: { date: r.date, montant: r.montant }, contributions: 0, fluctuations: 0, retraits: 0, transferts: 0 };
  for (const f of faits(d, k)) {
    if (f.date <= r.date || f.date > jusqua) continue;
    v.montant += f.effet;
    if (f.genre === 'contribution') v.contributions += f.effet;
    else if (f.genre === 'fluctuation') v.fluctuations += f.effet;
    else if (f.genre === 'retrait') v.retraits += -f.effet;
    else v.transferts += f.effet;
  }
  return v;
}

function detailValeur(v: Valeur): string {
  const parts = [`référence du ${avecAnnee(v.reference.date)} (${formaterMontant(v.reference.montant)})`];
  if (v.contributions !== 0) parts.push(`+ contributions confirmées (${formaterMontant(v.contributions)})`);
  if (v.fluctuations !== 0) parts.push(`+ fluctuations (${signe(v.fluctuations)})`);
  if (v.retraits !== 0) parts.push(`− retraits (${formaterMontant(v.retraits)})`);
  if (v.transferts !== 0) parts.push(`${v.transferts < 0 ? '−' : '+'} transferts (${formaterMontant(Math.abs(v.transferts))})`);
  return `${formaterMontant(v.montant)} = ${parts.join(' ')}`;
}

/** Contributions planifiées, pas encore confirmées, entre deux dates (incluses). */
function contributionsPlanifiees(d: DonneesPaie, k: CompteStocke, debut: string, fin: string, jour: DateCivile) {
  const n = versNoyau(d);
  if (!n.profil || k.contributions.length === 0) return [];
  const plan = planifier(
    { aujourdhui: jour, profil: n.profil, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations },
    ajouterJours(debut as DateCivile, -45),
    ajouterJours(fin as DateCivile, 1),
  );
  const vus = new Set<string>();
  const res: { elementId: string; date: string; montant: Cents | null }[] = [];
  for (const c of plan.cycles) {
    for (const l of c.lignes) {
      if (!k.contributions.includes(l.elementId) || l.retiree || l.statut === 'confirme') continue;
      const date = (l.echeance ?? c.paie.date) as string;
      const cle = `${l.elementId}|${l.origine}`;
      if (date < debut || date > fin || vus.has(cle)) continue;
      vus.add(cle);
      res.push({ elementId: l.elementId, date, montant: l.montant });
    }
  }
  return res.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Créer et renseigner (T1 à T5)

export interface SaisieCompte {
  sorte: SorteCompte | '';
  typeLibre: string;
  nom: string;
  vocation: string;
  institution: string;
  /** Vide : « À compléter » (Q71) ; 0 est un vrai solde. */
  solde: string;
  soldeLe: string;
}

export function proposerAjoutCompte(d: DonneesPaie, s: SaisieCompte, jour: DateCivile): Proposition {
  if (s.sorte === '') throw new ErreurSaisie('Choisis le type du compte.');
  const typeLibre = s.sorte === 'autre' ? texteOuNull(s.typeLibre) : null;
  if (s.sorte === 'autre' && typeLibre === null) throw new ErreurSaisie('Donne un nom au type « Autre ».');
  const solde = lireMontant(s.solde, 'Solde de départ');
  if (solde !== null && s.soldeLe.trim() === '') throw new ErreurSaisie('Indique la date du solde de départ.');
  const compte: CompteStocke = {
    id: crypto.randomUUID(),
    sorte: s.sorte,
    typeLibre,
    nom: texteOuNull(s.nom),
    vocation: texteOuNull(s.vocation),
    institution: texteOuNull(s.institution),
    fermeLe: null,
    references: solde === null ? [] : [{ date: lireDate(s.soldeLe, 'Date du solde'), montant: solde, note: null }],
    mouvements: [],
    contributions: [],
  };
  const futur = { ...d, comptes: [...comptesDe(d), compte] };
  const nom = nomCompte(futur, compte);
  const valeur = solde === null ? A_COMPLETER : `${formaterMontant(solde)} au ${avecAnnee(compte.references[0]!.date)}`;
  const description = [typeAffiche(compte), ...(compte.vocation ? [`vocation : ${compte.vocation}`] : []), `solde de départ : ${valeur}`].join(' ; ');
  return finaliser(d, { titre: `Ajouter le compte « ${nom} »`, lignes: [{ libelle: nom, avant: '—', apres: description }], changements: [{ type: 'definirCompte', compte }], journal: [entreeCompte(nom, 'création', null, description)] }, jour);
}

export function proposerRenseignementsCompte(d: DonneesPaie, id: string, s: { nom: string; vocation: string; institution: string }, jour: DateCivile): Proposition {
  const { compte, nom } = exigerCompte(d, id);
  const apres = { ...compte, nom: texteOuNull(s.nom), vocation: texteOuNull(s.vocation), institution: texteOuNull(s.institution) };
  const lignes: LigneApercu[] = [];
  const journal: EntreeJournal[] = [];
  for (const [champ, cle] of [['Nom', 'nom'], ['Vocation', 'vocation'], ['Institution', 'institution']] as const) {
    if (compte[cle] === apres[cle]) continue;
    lignes.push({ libelle: champ, avant: compte[cle] ?? '—', apres: apres[cle] ?? '—' });
    journal.push(entreeCompte(nom, champ.toLowerCase(), compte[cle], apres[cle]));
  }
  if (lignes.length === 0) throw new ErreurSaisie('Rien ne change.');
  return finaliser(d, { titre: `Compléter « ${nom} »`, lignes, changements: [{ type: 'definirCompte', compte: apres }], journal }, jour);
}

// ---------------------------------------------------------------------------
// Contributions (C1 à C5), planifiées dans Mes paies

export const QUAND_CONTRIBUTION: readonly Quand[] = ['chaquePaie', 'paie1', 'paie2', 'semaine', 'deuxSemaines', 'mois', 'deuxMois', 'troisMois', 'sixMois', 'annee'];

function elementContribution(nom: string, frequence: ElementStocke['frequence'], montant: Cents | null, depuis: string): ElementStocke {
  return {
    id: crypto.randomUUID(),
    libelle: `Contribution — ${nom}`,
    nature: 'depense',
    genre: 'fixe',
    incertain: false,
    estimation: false,
    frequence,
    montants: montant === null ? [] : [{ aPartirDu: depuis, montant }],
    suspensions: [],
    fin: null,
    cyclePaie: null,
    changementsFrequence: [],
  };
}

export function proposerContribution(d: DonneesPaie, compteId: string, s: { montant: string; quand: Quand | ''; date: string }, jour: DateCivile): Proposition {
  exigerProfil(d);
  const { compte, nom } = exigerOuvert(d, compteId);
  if (s.quand === '' || !QUAND_CONTRIBUTION.includes(s.quand)) throw new ErreurSaisie('Choisis la fréquence de la contribution.');
  if (s.date.trim() === '') throw new ErreurSaisie('Indique la date de la première contribution.');
  const date = lireDate(s.date, 'Première contribution');
  const montant = lireMontant(s.montant, 'Montant');
  if (montant === 0) throw new ErreurSaisie('Une contribution de 0 $ n’a pas de sens : laisse le montant vide s’il est à compléter.');
  const element = elementContribution(nom, construireFrequence(s.quand, date, null), montant, date);
  const texte = `${montant === null ? A_COMPLETER : formaterMontant(montant)}, ${decrireQuand(element)}`;
  return finaliser(
    d,
    {
      titre: `Contribution à « ${nom} » : ${texte}`,
      lignes: [{ libelle: 'Contribution', avant: '—', apres: texte }],
      changements: [
        { type: 'definirElement', element },
        { type: 'definirCompte', compte: { ...compte, contributions: [...compte.contributions, element.id] } },
      ],
      journal: [entreeCompte(nom, 'contribution', null, texte)],
    },
    jour,
  );
}

/** C3 : une seule fois, depuis Mes paies ; le bandeau montre montant et date. */
export function proposerContributionPonctuelle(d: DonneesPaie, s: { compteId: string; montant: string; date: string }, jour: DateCivile): Proposition {
  exigerProfil(d);
  if (s.compteId === '') throw new ErreurSaisie('Choisis le compte.');
  const { compte, nom } = exigerOuvert(d, s.compteId);
  const montant = lireMontant(s.montant, 'Montant');
  if (montant === null || montant === 0) throw new ErreurSaisie('Indique le montant de la contribution.');
  const date = s.date.trim() === '' ? jour : lireDate(s.date, 'Date');
  const element = elementContribution(nom, construireFrequence('unique', date, null), montant, date);
  const texte = `${formaterMontant(montant)} le ${avecAnnee(date)}`;
  return finaliser(
    d,
    {
      titre: `Contribution ponctuelle — ${nom} : ${texte}`,
      lignes: [{ libelle: 'Contribution ponctuelle', avant: '—', apres: texte }],
      changements: [
        { type: 'definirElement', element },
        { type: 'definirCompte', compte: { ...compte, contributions: [...compte.contributions, element.id] } },
      ],
      journal: [entreeCompte(nom, 'contribution ponctuelle', null, texte)],
    },
    jour,
  );
}

export function proposerMontantContribution(d: DonneesPaie, elementId: string, date: string, montant: string, jour: DateCivile): Proposition {
  const k = compteDeContribution(d, elementId);
  if (!k) throw new ErreurSaisie('Cette contribution n’existe plus.');
  exigerOuvert(d, k.id);
  return sousCompte(proposerMontant(d, elementId, date, montant, jour), nomCompte(d, k));
}

export function proposerArretContribution(d: DonneesPaie, elementId: string, derniere: string, jour: DateCivile): Proposition {
  const k = compteDeContribution(d, elementId);
  if (!k) throw new ErreurSaisie('Cette contribution n’existe plus.');
  return sousCompte(proposerFin(d, elementId, derniere, jour), nomCompte(d, k));
}

export function proposerSuppressionContribution(d: DonneesPaie, elementId: string, jour: DateCivile): Proposition {
  const k = compteDeContribution(d, elementId);
  if (!k) throw new ErreurSaisie('Cette contribution n’existe plus.');
  if (d.confirmations.some((f) => f.elementId === elementId)) {
    throw new ErreurSaisie('Cette contribution a des confirmations : arrête-la plutôt (« Dernière contribution le… »).');
  }
  const nom = nomCompte(d, k);
  const e = trouver(d, elementId);
  const texte = `${e.montants.at(-1) ? formaterMontant(e.montants.at(-1)!.montant) : A_COMPLETER}, ${decrireQuand(e)}`;
  return finaliser(
    d,
    {
      titre: `Supprimer la contribution à « ${nom} »`,
      lignes: [{ libelle: 'Contribution', avant: texte, apres: 'Supprimée' }],
      changements: [
        { type: 'definirCompte', compte: { ...k, contributions: k.contributions.filter((x) => x !== elementId) } },
        { type: 'supprimerElement', id: elementId },
      ],
      journal: [entreeCompte(nom, 'contribution', texte, null)],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Référence (Q71) et correction du solde (R1, R2)

export function proposerReference(d: DonneesPaie, id: string, s: { montant: string; date: string; note: string }, jour: DateCivile): Proposition {
  const { compte, nom } = exigerCompte(d, id);
  const montant = lireMontant(s.montant, 'Solde');
  if (montant === null) throw new ErreurSaisie('Indique le solde.');
  const date = s.date.trim() === '' ? jour : lireDate(s.date, 'Date du solde');
  if (compte.references.some((r) => r.date === date)) throw new ErreurSaisie(`Un solde de référence existe déjà au ${avecAnnee(date)}.`);
  const note = texteOuNull(s.note);
  const avant = valeurDuCompte(d, compte);
  const apres = `${formaterMontant(montant)} au ${avecAnnee(date)}`;
  const premiere = compte.references.length === 0;
  return finaliser(
    d,
    {
      titre: premiere ? `Solde de départ de « ${nom} »` : `Corriger le solde de « ${nom} »`,
      lignes: [{ libelle: 'Valeur suivie', avant: avant ? formaterMontant(avant.montant) : A_COMPLETER, apres: `repart de ${apres}` }],
      changements: [{ type: 'definirCompte', compte: { ...compte, references: [...compte.references, { date, montant, note }] } }],
      journal: [entreeCompte(nom, premiere ? 'solde de départ' : 'correction du solde', avant ? formaterMontant(avant.montant) : null, apres, note)],
      avant: premiere ? [] : ['L’historique reste visible : rien n’est réécrit. Ce qui est daté de ce jour ou avant est déjà compris dans ce solde.'],
      apercuForce: !premiere,
    },
    jour,
  );
}

/**
 * Correction 0.9.1 (W1 à W6) : ce qu'un retrait change, avant → après,
 * calculé avec les règles existantes sur les comptes touchés et le total.
 */
function effetsDuRetrait(d: DonneesPaie, changements: Proposition['changements'], ids: readonly string[]): { lignes: LigneApercu[]; notes: string[] } {
  const apres = appliquerChangements(d, changements);
  const valeur = (donnees: DonneesPaie, id: string) => {
    const k = comptesDe(donnees).find((x) => x.id === id);
    const v = k ? valeurDuCompte(donnees, k) : null;
    return v ? formaterMontant(v.montant) : A_COMPLETER;
  };
  const lignes: LigneApercu[] = [];
  const notes: string[] = [];
  for (const id of ids) {
    const k = comptesDe(d).find((x) => x.id === id);
    if (!k) continue;
    const [a, b] = [valeur(d, id), valeur(apres, id)];
    lignes.push({ libelle: `Valeur suivie (${nomCompte(d, k)})`, avant: a, apres: b });
    if (k.fermeLe === null && a !== A_COMPLETER && b === A_COMPLETER) notes.push(`${nomCompte(d, k)} ne sera plus compté dans le total (à compléter).`);
  }
  const [ta, tb] = [totalEpargne(d).montant ?? '—', totalEpargne(apres).montant ?? '—'];
  lignes.push({ libelle: 'Total suivi', avant: ta, apres: ta === tb ? 'inchangé' : tb });
  return { lignes, notes };
}

export function proposerRetraitReference(d: DonneesPaie, id: string, date: string, jour: DateCivile): Proposition {
  const { compte, nom } = exigerCompte(d, id);
  const r = compte.references.find((x) => x.date === date);
  if (!r) throw new ErreurSaisie('Ce solde de référence n’existe plus.');
  const texte = `${formaterMontant(r.montant)} au ${avecAnnee(r.date)}`;
  const changements: Proposition['changements'] = [{ type: 'definirCompte', compte: { ...compte, references: compte.references.filter((x) => x.date !== date) } }];
  const effets = effetsDuRetrait(d, changements, [compte.id]);
  return finaliser(
    d,
    {
      titre: `Retirer le solde de référence du ${avecAnnee(date)}`,
      lignes: [{ libelle: 'Solde de référence', avant: texte, apres: 'Retiré' }, ...effets.lignes],
      changements,
      journal: [entreeCompte(nom, 'solde de référence retiré', texte, null)],
      apres: effets.notes,
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Mouvements : fluctuation (F1 à F6), retrait et transfert (M1 à M5)

/** Montant avec signe (« -80 », « −80 », « +50 »). */
function lireMontantSigne(texte: string, nom: string): Cents | null {
  const t = texte.trim().replace('−', '-').replace('$', '');
  if (t === '') return null;
  try {
    return arrondirDecimal(t.startsWith('+') ? t.slice(1) : t);
  } catch {
    throw new ErreurSaisie(`${nom} : « ${texte} » n'est pas un montant.`);
  }
}

/** Un mouvement daté le jour d'une référence ou avant y est déjà compris. */
export function verifierApresReference(d: DonneesPaie, k: CompteStocke, date: string) {
  const r = derniereReference(k);
  if (r && date <= r.date) {
    throw new ErreurSaisie(`Ce mouvement serait daté avant ta référence du ${avecAnnee(r.date)} (ou le même jour) : il y est déjà compris.`);
  }
}

export function nouveauMouvement(m: Omit<MouvementStocke, 'id'>): MouvementStocke {
  return { id: crypto.randomUUID(), ...m };
}

export interface SaisieFluctuation {
  mode: 'montant' | 'valeur';
  montant: string;
  valeur: string;
  date: string;
  note: string;
}

export function proposerFluctuation(d: DonneesPaie, id: string, s: SaisieFluctuation, jour: DateCivile): Proposition {
  const { compte, nom } = exigerOuvert(d, id);
  const date = s.date.trim() === '' ? jour : lireDate(s.date, 'Date');
  const avant = valeurDuCompte(d, compte, date);
  if (!avant) {
    throw new ErreurSaisie(
      s.mode === 'valeur'
        ? 'Indique d’abord un solde de référence : cette valeur en ligne peut devenir ta première référence (« Corriger le solde »).'
        : 'Indique d’abord un solde de référence.',
    );
  }
  verifierApresReference(d, compte, date);
  let montant: Cents;
  const lignes: LigneApercu[] = [];
  const avertissements: string[] = [];
  if (s.mode === 'valeur') {
    const valeur = lireMontant(s.valeur, 'Valeur en ligne');
    if (valeur === null) throw new ErreurSaisie('Indique la valeur affichée en ligne.');
    montant = valeur - avant.montant;
    if (montant === 0) throw new ErreurSaisie('Aucun écart : rien à enregistrer.');
    lignes.push(
      { libelle: `Valeur suivie au ${avecAnnee(date)}`, avant: formaterMontant(avant.montant), apres: formaterMontant(avant.montant) },
      { libelle: 'Valeur en ligne', avant: '—', apres: formaterMontant(valeur) },
      { libelle: 'Fluctuation proposée', avant: '—', apres: signe(montant) },
    );
    // F4 : une contribution planifiée non confirmée est peut-être déjà dans la valeur en ligne.
    const ref = derniereReference(compte, date)!;
    const enAttente = contributionsPlanifiees(d, compte, ajouterJours(ref.date as DateCivile, 1), date, jour);
    if (enAttente.length > 0) {
      const liste = enAttente.map((p) => `${p.montant === null ? A_COMPLETER : formaterMontant(p.montant)}, ${formaterDateCourte(p.date as DateCivile)}`).join(' ; ');
      avertissements.push(
        `${enAttente.length === 1 ? '1 contribution prévue' : `${enAttente.length} contributions prévues`} d’ici le ${formaterDateCourte(date)} ${enAttente.length === 1 ? 'n’est pas confirmée' : 'ne sont pas confirmées'} (${liste}). Si elle est déjà dans ta valeur en ligne, confirme-la d’abord.`,
      );
    }
  } else {
    const m = lireMontantSigne(s.montant, 'Fluctuation');
    if (m === null || m === 0) throw new ErreurSaisie('Indique le gain (+) ou la perte (−).');
    montant = m;
    lignes.push({ libelle: 'Valeur suivie', avant: formaterMontant(avant.montant), apres: formaterMontant(avant.montant + montant) });
  }
  const note = texteOuNull(s.note);
  const mouvement = nouveauMouvement({ date, sorte: 'fluctuation', montant, vers: null, destination: null, note });
  const texte = `${signe(montant)} le ${avecAnnee(date)}`;
  return finaliser(
    d,
    {
      titre: `Fluctuation — ${nom} : ${texte}`,
      lignes,
      changements: [{ type: 'definirCompte', compte: { ...compte, mouvements: [...compte.mouvements, mouvement] } }],
      journal: [entreeCompte(nom, 'fluctuation', null, texte, note)],
      avant: avertissements,
      apres: ['Une fluctuation n’apparaît jamais dans Mes paies.'],
      apercuForce: true, // Q73 : aperçu et confirmation obligatoires
    },
    jour,
  );
}

export function proposerRetraitCompte(
  d: DonneesPaie,
  id: string,
  s: { montant: string; date: string; destination: string; note: string; prisSur?: string; complement?: string },
  jour: DateCivile,
): Proposition {
  const { compte, nom } = exigerOuvert(d, id);
  const montant = lireMontant(s.montant, 'Montant');
  if (montant === null || montant === 0) throw new ErreurSaisie('Indique le montant du retrait.');
  const date = s.date.trim() === '' ? jour : lireDate(s.date, 'Date');
  verifierApresReference(d, compte, date);
  const note = texteOuNull(s.note);
  const destination = texteOuNull(s.destination);
  const mouvement = nouveauMouvement({ date, sorte: 'retrait', montant, vers: null, destination, note });
  const pris = prelever(d, compte, montant, date, mouvement.id, s.prisSur ?? '', s.complement ?? '');
  const texte = `${formaterMontant(montant)} le ${avecAnnee(date)}${destination ? ` vers ${destination}` : ''}`;
  return finaliser(
    d,
    {
      titre: `Retrait — ${nom} : ${texte}`,
      lignes: [{ libelle: 'Retrait', avant: '—', apres: texte }, ...pris.lignes],
      changements: [{ type: 'definirCompte', compte: { ...compte, mouvements: [...compte.mouvements, mouvement], reserves: pris.reserves } }],
      journal: [entreeCompte(nom, 'retrait', null, texte, note)],
      apres: [PHRASE_RETRAIT],
    },
    jour,
  );
}

export function proposerTransfert(
  d: DonneesPaie,
  id: string,
  s: { vers: string; montant: string; date: string; note: string; prisSur?: string; complement?: string },
  jour: DateCivile,
): Proposition {
  const { compte, nom } = exigerOuvert(d, id);
  if (s.vers === '') throw new ErreurSaisie('Choisis le compte de destination.');
  if (s.vers === id) throw new ErreurSaisie('Un transfert doit aller vers un autre compte.');
  const { compte: dest, nom: nomDest } = exigerOuvert(d, s.vers);
  const montant = lireMontant(s.montant, 'Montant');
  if (montant === null || montant === 0) throw new ErreurSaisie('Indique le montant du transfert.');
  const date = s.date.trim() === '' ? jour : lireDate(s.date, 'Date');
  verifierApresReference(d, compte, date);
  verifierApresReference(d, dest, date);
  const note = texteOuNull(s.note);
  const mouvement = nouveauMouvement({ date, sorte: 'transfert', montant, vers: dest.id, destination: null, note });
  const pris = prelever(d, compte, montant, date, mouvement.id, s.prisSur ?? '', s.complement ?? '');
  const texte = `${formaterMontant(montant)} le ${avecAnnee(date)}, de « ${nom} » vers « ${nomDest} »`;
  return finaliser(
    d,
    {
      titre: `Transfert : ${texte}`,
      lignes: [
        { libelle: nom, avant: '—', apres: `−${formaterMontant(montant)}` },
        { libelle: nomDest, avant: '—', apres: `+${formaterMontant(montant)}` },
        ...pris.lignes,
      ],
      changements: [{ type: 'definirCompte', compte: { ...compte, mouvements: [...compte.mouvements, mouvement], reserves: pris.reserves } }],
      journal: [entreeCompte(nom, 'transfert', null, texte, note), entreeCompte(nomDest, 'transfert reçu', null, texte, note)],
      apres: ['Ce n’est pas une contribution : Mes paies ne change pas.'],
    },
    jour,
  );
}

/** F5, M5 : un mouvement ne se modifie pas ; il se retire, avec un aperçu. */
export function proposerRetraitMouvement(d: DonneesPaie, compteId: string, mouvementId: string, jour: DateCivile): Proposition {
  const { compte, nom } = exigerCompte(d, compteId);
  const m = compte.mouvements.find((x) => x.id === mouvementId);
  if (!m) throw new ErreurSaisie('Ce mouvement n’existe plus.');
  const f = faits(d, compte).find((x) => x.mouvement?.id === mouvementId)!;
  const texte = `${avecAnnee(m.date)} — ${f.texte}`;
  const journal = [entreeCompte(nom, 'mouvement retiré', texte, null)];
  if (m.vers) {
    const dest = comptesDe(d).find((x) => x.id === m.vers);
    if (dest) journal.push(entreeCompte(nomCompte(d, dest), 'transfert reçu retiré', texte, null));
  }
  // Étape A : les mouvements de réserve qui l'accompagnent partent avec lui.
  const sansLien = (k: CompteStocke): CompteStocke => ({
    ...k,
    reserves: reservesDe(k).map((r) => ({ ...r, mouvements: r.mouvements.filter((x) => x.lien !== mouvementId) })),
  });
  const touches = (k: CompteStocke) => reservesDe(k).some((r) => r.mouvements.some((x) => x.lien === mouvementId));
  const changements: Proposition['changements'] = [{ type: 'definirCompte', compte: sansLien({ ...compte, mouvements: compte.mouvements.filter((x) => x.id !== mouvementId) }) }];
  for (const k of comptesDe(d)) if (k.id !== compte.id && touches(k)) changements.push({ type: 'definirCompte', compte: sansLien(k) });
  const effets = effetsDuRetrait(d, changements, m.vers ? [compte.id, m.vers] : [compte.id]);
  return finaliser(
    d,
    {
      titre: `Retirer : ${texte}`,
      lignes: [{ libelle: 'Mouvement', avant: texte, apres: 'Retiré' }, ...effets.lignes],
      changements,
      journal,
      apres: effets.notes,
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Fermer, rouvrir, supprimer (X1 à X5, Q76, Q78)

const estArretee = (e: ElementStocke) => e.suspensions.some((s) => s.fin === FIN_OUVERTE);

/** Q94, B2 : comptes qui peuvent recevoir les réserves d'un compte qu'on ferme. */
export function comptesAdmissibles(d: DonneesPaie, id: string): CompteStocke[] {
  return comptesDe(d).filter((k) => k.id !== id && k.fermeLe === null && valeurDuCompte(d, k) !== null);
}

/**
 * Q94 : fermeture assistée. Chaque réserve ayant un solde reçoit un choix :
 * « liberer » ou « vers:<compte> » (B2 : transfert ordinaire, puis réserve du
 * même nom et de la même cible dans le compte qui reçoit). Tout se fait en un
 * seul enregistrement : jamais de fermeture partielle.
 */
export function proposerFermeture(d: DonneesPaie, id: string, dateTexte: string, jour: DateCivile, choix: Record<string, string> = {}): Proposition {
  const { compte, nom } = exigerCompte(d, id);
  if (compte.fermeLe !== null) throw new ErreurSaisie('Ce compte est déjà fermé.');
  const date = dateTexte.trim() === '' ? jour : lireDate(dateTexte, 'Date de fermeture');
  const etat = etatReserves(d, compte);
  const lignesReserves: LigneApercu[] = [];
  const journalReserves: EntreeJournal[] = [];
  let mouvementsCompte = [...compte.mouvements];
  const destinations = new Map<string, CompteStocke>();
  const reserves = reservesDe(compte).map((r) => {
    if (r.arreteeLe !== null) return r;
    const solde = etat.soldes.get(r.id) ?? 0;
    const c = choix[r.id] ?? '';
    if (solde > 0 && c === '') throw new ErreurSaisie(`Choisis quoi faire de la réserve « ${r.nom} » (${formaterMontant(solde)}).`);
    const arretee = { ...r, arreteeLe: date };
    if (solde <= 0) return arretee;
    if (c === 'liberer') {
      lignesReserves.push({ libelle: `Réserve « ${r.nom} »`, avant: formaterMontant(solde), apres: 'Libérée' });
      return { ...arretee, mouvements: [...r.mouvements, nouveauMouvementReserve({ date, sorte: 'liberation', montant: solde, vers: null, lien: null, note: 'fermeture du compte' })] };
    }
    const destId = c.startsWith('vers:') ? c.slice(5) : '';
    const dest0 = comptesAdmissibles(d, id).find((k) => k.id === destId);
    if (!dest0) throw new ErreurSaisie('Ce compte ne peut pas recevoir la réserve : il doit être ouvert et avoir une valeur connue.');
    const dest = destinations.get(destId) ?? dest0;
    verifierApresReference(d, dest, date);
    const nomDest = nomCompte(d, dest);
    const transfert = nouveauMouvement({ date, sorte: 'transfert', montant: solde, vers: destId, destination: null, note: `réserve « ${r.nom} »` });
    mouvementsCompte = [...mouvementsCompte, transfert];
    const nouvelle: ReserveStockee = {
      ...r,
      id: crypto.randomUUID(),
      arreteeLe: null,
      transfereeVers: null,
      suspensions: [],
      mouvements: [nouveauMouvementReserve({ date, sorte: 'affectation', montant: solde, vers: null, lien: transfert.id, note: `depuis « ${nom} »` })],
    };
    destinations.set(destId, { ...dest, reserves: [...reservesDe(dest), nouvelle] });
    lignesReserves.push({ libelle: `Réserve « ${r.nom} »`, avant: `${formaterMontant(solde)} dans « ${nom} »`, apres: `${formaterMontant(solde)} dans « ${nomDest} »` });
    journalReserves.push(entreeCompte(nomDest, 'réserve reçue', null, `« ${r.nom} » ${formaterMontant(solde)}`));
    return {
      ...arretee,
      transfereeVers: nomDest,
      mouvements: [...r.mouvements, nouveauMouvementReserve({ date, sorte: 'transfert', montant: solde, vers: null, lien: transfert.id, note: `vers « ${nomDest} »` })],
    };
  });
  const v = valeurDuCompte(d, { ...compte, mouvements: mouvementsCompte });
  const changements: Proposition['changements'] = [
    { type: 'definirCompte', compte: { ...compte, fermeLe: date, mouvements: mouvementsCompte, reserves, repartitions: [] } },
    ...[...destinations.values()].map((k) => ({ type: 'definirCompte' as const, compte: k })),
  ];
  for (const eid of compte.contributions) {
    const e = trouver(d, eid);
    if (estArretee(e)) continue;
    changements.push({ type: 'definirElement', element: { ...e, suspensions: [...e.suspensions, { debut: date, fin: FIN_OUVERTE }] } });
  }
  return finaliser(
    d,
    {
      titre: `Fermer « ${nom} » le ${avecAnnee(date)}`,
      lignes: [{ libelle: nom, avant: 'Ouvert', apres: `Fermé le ${avecAnnee(date)}` }, ...lignesReserves],
      changements,
      journal: [entreeCompte(nom, 'fermeture', null, `fermé le ${avecAnnee(date)}`), ...journalReserves],
      avant:
        v && v.montant !== 0
          ? [`Valeur suivie : ${formaterMontant(v.montant)} ; tu peux d’abord la transférer ou la retirer.`]
          : [],
      apres: ['Ses contributions s’arrêtent à partir de cette date. Son historique reste consultable dans « Comptes fermés » ; il sort du total.'],
      apercuForce: true,
    },
    jour,
  );
}

/** Reprend des contributions arrêtées à partir d'une date (réouverture, ou plus tard). */
function reprises(d: DonneesPaie, ids: readonly string[], date: DateCivile): Proposition['changements'] {
  const veille = ajouterJours(date, -1) as string;
  return ids.map((eid) => {
    const e = trouver(d, eid);
    return {
      type: 'definirElement' as const,
      element: { ...e, suspensions: e.suspensions.map((s) => (s.fin === FIN_OUVERTE ? { ...s, fin: veille < s.debut ? s.debut : veille } : s)) },
    };
  });
}

export function proposerReouverture(d: DonneesPaie, id: string, dateTexte: string, reprendre: readonly string[], jour: DateCivile): Proposition {
  const { compte, nom } = exigerCompte(d, id);
  if (compte.fermeLe === null) throw new ErreurSaisie('Ce compte est déjà ouvert.');
  const date = dateTexte.trim() === '' ? jour : lireDate(dateTexte, 'Date de réouverture');
  if (date < compte.fermeLe) throw new ErreurSaisie(`La réouverture ne peut pas précéder la fermeture (${avecAnnee(compte.fermeLe)}).`);
  const arretees = compte.contributions.filter((eid) => estArretee(trouver(d, eid)));
  const choisies = reprendre.filter((eid) => arretees.includes(eid));
  const decrire = (eid: string) => {
    const e = trouver(d, eid);
    return `${e.montants.at(-1) ? formaterMontant(e.montants.at(-1)!.montant) : A_COMPLETER}, ${decrireQuand(e)}`;
  };
  return finaliser(
    d,
    {
      titre: `Rouvrir « ${nom} » le ${avecAnnee(date)}`,
      lignes: [
        { libelle: nom, avant: `Fermé le ${avecAnnee(compte.fermeLe)}`, apres: 'Ouvert' },
        ...arretees.map((eid) => ({ libelle: `Contribution ${decrire(eid)}`, avant: 'Arrêtée', apres: choisies.includes(eid) ? `Reprend le ${avecAnnee(date)}` : 'Reste arrêtée' })),
      ],
      changements: [{ type: 'definirCompte', compte: { ...compte, fermeLe: null } }, ...reprises(d, choisies, date)],
      journal: [entreeCompte(nom, 'réouverture', `fermé le ${avecAnnee(compte.fermeLe)}`, `rouvert le ${avecAnnee(date)}`)],
      apres: ['Aucune contribution ne reprend toute seule ; rien n’est planifié entre la fermeture et la reprise.'],
      apercuForce: true,
    },
    jour,
  );
}

export function proposerRepriseContribution(d: DonneesPaie, elementId: string, dateTexte: string, jour: DateCivile): Proposition {
  const k = compteDeContribution(d, elementId);
  if (!k) throw new ErreurSaisie('Cette contribution n’existe plus.');
  const { nom } = exigerOuvert(d, k.id);
  if (!estArretee(trouver(d, elementId))) throw new ErreurSaisie('Cette contribution n’est pas arrêtée.');
  const date = dateTexte.trim() === '' ? jour : lireDate(dateTexte, 'Date de reprise');
  return finaliser(
    d,
    {
      titre: `Reprendre une contribution à « ${nom} » le ${avecAnnee(date)}`,
      lignes: [{ libelle: 'Contribution', avant: 'Arrêtée', apres: `Reprend le ${avecAnnee(date)}` }],
      changements: reprises(d, [elementId], date),
      journal: [entreeCompte(nom, 'contribution reprise', null, avecAnnee(date))],
    },
    jour,
  );
}

export function proposerSuppressionCompte(d: DonneesPaie, id: string, jour: DateCivile): Proposition {
  const { compte, nom } = exigerCompte(d, id);
  const historique =
    d.confirmations.some((f) => f.elementId !== null && compte.contributions.includes(f.elementId)) ||
    compte.mouvements.length > 0 ||
    reservesDe(compte).some((r) => r.mouvements.length > 0) ||
    comptesDe(d).some((x) => x.mouvements.some((m) => m.vers === id));
  if (historique) throw new ErreurSaisie('Ce compte a un historique : ferme-le plutôt.');
  return finaliser(
    d,
    {
      titre: `Supprimer le compte « ${nom} »`,
      lignes: [{ libelle: nom, avant: 'Compte', apres: 'Supprimé' }],
      changements: [{ type: 'supprimerCompte', id }, ...compte.contributions.map((eid) => ({ type: 'supprimerElement' as const, id: eid }))],
      journal: [entreeCompte(nom, 'suppression', 'compte', null)],
      apres: compte.contributions.length > 0 ? ['Ses contributions planifiées disparaissent des cycles.'] : [],
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Ce que montre Mon épargne

export interface LigneHistorique {
  date: string;
  texte: string;
  /** Pour « Retirer » : un mouvement, ou une référence. */
  mouvement: { compteId: string; id: string } | null;
  reference: string | null;
}

export interface VueContribution {
  id: string;
  texte: string;
  arretee: boolean;
  confirmee: boolean;
}

export interface VueCompte {
  id: string;
  nom: string;
  type: string;
  vocation: string | null;
  institution: string | null;
  fermeLe: string | null;
  /** « À compléter » sans référence (Q71). */
  valeur: string;
  valeurCents: Cents | null;
  detail: string | null;
  /** V6 : fait à part quand la valeur est à compléter. */
  confirmeesSansReference: string | null;
  aVenir: string[];
  contributions: VueContribution[];
  historique: LigneHistorique[];
  derniereReference: string | null;
}

export function vueCompte(d: DonneesPaie, id: string, jour: DateCivile): VueCompte {
  const { compte: k, nom } = exigerCompte(d, id);
  const v = valeurDuCompte(d, k);
  const fs = faits(d, k);
  const confirmees = fs.filter((f) => f.genre === 'contribution').reduce((t, f) => t + f.effet, 0);
  const historique: LigneHistorique[] = [
    ...k.references.map((r) => ({
      date: r.date,
      texte: `Solde de référence ${formaterMontant(r.montant)}${r.note ? ` — ${r.note}` : ''}`,
      mouvement: null,
      reference: r.date,
    })),
    ...fs.map((f) => ({ date: f.date, texte: f.texte, mouvement: f.mouvement, reference: null })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.reference ? 1 : 0) - (b.reference ? 1 : 0)))
    .map((h) => ({ ...h, date: avecAnnee(h.date) }));
  const aVenir = k.fermeLe !== null ? [] : contributionsPlanifiees(d, k, jour, ajouterJours(jour, 120), jour).slice(0, 3);
  return {
    id: k.id,
    nom,
    type: typeAffiche(k),
    vocation: k.vocation,
    institution: k.institution,
    fermeLe: k.fermeLe ? avecAnnee(k.fermeLe) : null,
    valeur: v ? formaterMontant(v.montant) : A_COMPLETER,
    valeurCents: v ? v.montant : null,
    detail: v ? detailValeur(v) : null,
    confirmeesSansReference: !v && confirmees > 0 ? `Contributions confirmées : ${formaterMontant(confirmees)}` : null,
    aVenir: aVenir.map((p) => `${p.montant === null ? A_COMPLETER : formaterMontant(p.montant)} le ${avecAnnee(p.date)}`),
    contributions: k.contributions.map((eid) => {
      const e = trouver(d, eid);
      const montant = e.montants.at(-1);
      return {
        id: eid,
        texte: `${montant ? formaterMontant(montant.montant) : A_COMPLETER}, ${decrireQuand(e, jour)}`,
        arretee: estArretee(e),
        confirmee: d.confirmations.some((f) => f.elementId === eid),
      };
    }),
    historique,
    derniereReference: derniereReference(k)?.date ?? null,
  };
}

export interface TotalEpargne {
  montant: string | null;
  nombre: number;
  /** « références du 1er janv. au 1er févr. 2027 » */
  dates: string | null;
  exclus: string[];
  phrase: string;
}

/** Q77 : les valeurs connues des comptes ouverts ; les « À compléter » sont nommés, jamais comptés à 0 $. */
export function totalEpargne(d: DonneesPaie): TotalEpargne {
  const ouverts = comptesDe(d).filter((k) => k.fermeLe === null);
  let total = 0;
  let nombre = 0;
  const dates: string[] = [];
  const exclus: string[] = [];
  for (const k of ouverts) {
    const v = valeurDuCompte(d, k);
    if (!v) {
      exclus.push(`${nomCompte(d, k)} (à compléter)`);
      continue;
    }
    total += v.montant;
    nombre += 1;
    dates.push(v.reference.date);
  }
  dates.sort();
  const plage =
    dates.length === 0
      ? null
      : dates[0] === dates.at(-1)
        ? `référence du ${avecAnnee(dates[0]!)}`
        : `références du ${formaterDateCourte(dates[0] as DateCivile)}${dates[0]!.slice(0, 4) !== dates.at(-1)!.slice(0, 4) ? ` ${dates[0]!.slice(0, 4)}` : ''} au ${avecAnnee(dates.at(-1)!)}`;
  return { montant: nombre === 0 ? null : formaterMontant(total), nombre, dates: plage, exclus, phrase: PHRASE_TOTAL };
}

export function listeComptes(d: DonneesPaie, jour: DateCivile): { ouverts: VueCompte[]; fermes: VueCompte[] } {
  const vues = comptesDe(d).map((k) => vueCompte(d, k.id, jour));
  return { ouverts: vues.filter((v) => v.fermeLe === null), fermes: vues.filter((v) => v.fermeLe !== null) };
}
