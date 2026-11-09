// Étape A, lot 2 : les dépenses à prévoir (décisions Q90 à Q93, B1).
//
// Une dépense à prévoir est un élément de dépense (étape 4) avec une fiche.
// Elle apparaît dans Mes paies le jour venu. Payée « avec la réserve », seule
// la partie non couverte sort du cycle (Q91) ; à la confirmation, un seul
// aperçu prépare l'utilisation de la réserve ET le retrait du compte (Q90).
// Créer une fiche ne réserve rien ; la suggestion ne s'applique jamais seule.

import type { ChangementPaie, CompteStocke, DepenseStockee, DonneesPaie, ElementStocke, EntreeJournal, MouvementStocke, ReserveStockee } from '../lib/plateforme';
import { ajouterJours, dateCivile, formaterDateCourte, type DateCivile } from '../noyau/dates';
import { formaterMontant, type Cents } from '../noyau/montants';
import { avecAnnee, comptesDe, etatReserves, exigerOuvert, nomCompte, reservesActives, valeurDuCompte } from './comptes';
import { cleOccurrence, dateOccurrence, horsRepartition, modeOccurrence, montantPrevu, partsAFiger, partsDe, partsPour, reserveDeDepense, reservesDe, soldeReserve } from './couvertures';
import { construireFrequence, decrireQuand, finaliser, proposerFin, proposerFrequence, proposerMontant, trouver, type Quand } from './elements';
import { A_COMPLETER, ErreurSaisie, lireDate, lireMontant, type LigneApercu, type Proposition } from './paie';
import { cibleEtDate, occurrencesDepense, prochaineOccurrence, suggestion } from './reserves';

export const SECTION_DEPENSES = 'Dépenses à prévoir';
export const objetDepense = (nom: string) => `Dépense à prévoir « ${nom} »`;
export const QUAND_DEPENSE: readonly Quand[] = ['unique', 'annee', 'sixMois', 'troisMois', 'deuxMois', 'mois'];
const entree = (nom: string, champ: string, avant: string | null, apres: string | null): EntreeJournal => ({
  section: SECTION_DEPENSES,
  objet: objetDepense(nom),
  champ,
  ancienneValeur: avant,
  nouvelleValeur: apres,
  motif: null,
});
const texteOuNull = (t: string) => (t.trim() === '' ? null : t.trim());

export const depensesDe = (d: DonneesPaie): DepenseStockee[] => d.depenses ?? [];
export const estDepenseAPrevoir = (d: DonneesPaie, elementId: string) => depensesDe(d).some((x) => x.id === elementId);
function exigerDepense(d: DonneesPaie, id: string): { fiche: DepenseStockee; element: ElementStocke } {
  const fiche = depensesDe(d).find((x) => x.id === id);
  if (!fiche) throw new ErreurSaisie('Cette dépense à prévoir n’existe plus.');
  return { fiche, element: trouver(d, id) };
}
/** Les actions communes (estimation, date, fin) écrivent sous le nom de la dépense (J1). */
const sousDepense = (p: Proposition, nom: string): Proposition => ({ ...p, journal: p.journal.map((e) => ({ ...e, section: SECTION_DEPENSES, objet: objetDepense(nom) })) });

// ---------------------------------------------------------------------------
// Créer, modifier, lier, supprimer (D1, D10, D11, X2)

export interface SaisieDepense {
  nom: string;
  /** Estimation ; vide : « À compléter ». */
  montant: string;
  quand: Quand | '';
  date: string;
  note: string;
  /** Créer en même temps une réserve liée dans ce compte (évite une double saisie). */
  reserveDansCompte: string;
}

export function proposerAjoutDepense(d: DonneesPaie, s: SaisieDepense, jour: DateCivile): Proposition {
  const nom = s.nom.trim();
  if (nom === '') throw new ErreurSaisie('Donne un nom à la dépense.');
  if (s.quand === '' || !QUAND_DEPENSE.includes(s.quand)) throw new ErreurSaisie('Choisis la fréquence.');
  if (s.date.trim() === '') throw new ErreurSaisie('Indique la prochaine date.');
  const date = lireDate(s.date, 'Prochaine date');
  const montant = lireMontant(s.montant, 'Montant estimé');
  const element: ElementStocke = {
    id: crypto.randomUUID(),
    libelle: nom,
    nature: 'depense',
    genre: 'fixe',
    incertain: false,
    estimation: montant !== null,
    frequence: construireFrequence(s.quand, date, null),
    montants: montant === null ? [] : [{ aPartirDu: date, montant }],
    suspensions: [],
    fin: null,
    cyclePaie: null,
    changementsFrequence: [],
  };
  const changements: ChangementPaie[] = [
    { type: 'definirElement', element },
    { type: 'definirDepense', depense: { id: element.id, note: texteOuNull(s.note), modes: [] } },
  ];
  const texte = `${montant === null ? A_COMPLETER : formaterMontant(montant)}, ${decrireQuand(element)}`;
  const lignes: LigneApercu[] = [{ libelle: nom, avant: '—', apres: texte }];
  const journal = [entree(nom, 'création', null, texte)];
  if (s.reserveDansCompte !== '') {
    const { compte } = exigerOuvert(d, s.reserveDansCompte);
    const reserve: ReserveStockee = { id: crypto.randomUUID(), nom, sorte: 'ponctuelle', cible: null, date: null, frequenceMois: null, depenseId: element.id, arreteeLe: null, transfereeVers: null, note: null, suspensions: [], mouvements: [] };
    changements.push({ type: 'definirCompte', compte: { ...compte, reserves: [...reservesDe(compte), reserve] } });
    lignes.push({ libelle: 'Réserve liée', avant: '—', apres: `« ${nom} » dans « ${nomCompte(d, compte)} » (0,00 $)` });
  }
  return finaliser(d, { titre: `Nouvelle dépense à prévoir « ${nom} »`, lignes, changements, journal, apres: ['Rien n’est réservé tant que tu ne le décides pas.'] }, jour);
}

export function proposerNoteDepense(d: DonneesPaie, id: string, nom: string, note: string, jour: DateCivile): Proposition {
  const { fiche, element } = exigerDepense(d, id);
  const n = nom.trim();
  if (n === '') throw new ErreurSaisie('Donne un nom à la dépense.');
  const nouvelle = texteOuNull(note);
  if (n === element.libelle && nouvelle === fiche.note) throw new ErreurSaisie('Rien ne change.');
  return finaliser(
    d,
    {
      titre: `Modifier « ${element.libelle} »`,
      lignes: [{ libelle: 'Nom et note', avant: `${element.libelle}${fiche.note ? ` — ${fiche.note}` : ''}`, apres: `${n}${nouvelle ? ` — ${nouvelle}` : ''}` }],
      changements: [
        { type: 'definirElement', element: { ...element, libelle: n } },
        { type: 'definirDepense', depense: { ...fiche, note: nouvelle } },
      ],
      journal: [entree(n, 'nom et note', element.libelle, n)],
    },
    jour,
  );
}

/** D11 : l'estimation, la date ou la fréquence changent ; la réserve liée suit (B1). */
export function proposerEstimation(d: DonneesPaie, id: string, aPartirDu: string, montant: string, jour: DateCivile): Proposition {
  const { element } = exigerDepense(d, id);
  // Une estimation saisie avant la première occurrence vaut dès la première occurrence
  // (sinon le montant d'origine, daté de cette occurrence, l'emporterait).
  const premiere = element.montants[0]?.aPartirDu;
  const date = premiere && /^\d{4}-\d{2}-\d{2}$/.test(aPartirDu) && aPartirDu < premiere ? premiere : aPartirDu;
  return sousDepense(proposerMontant(d, id, date, montant, jour), element.libelle);
}
export function proposerDateFrequence(d: DonneesPaie, id: string, quand: Quand, date: string, jour: DateCivile): Proposition {
  const { element } = exigerDepense(d, id);
  return sousDepense(proposerFrequence(d, id, quand, date, jour), element.libelle);
}
export function proposerFinDepense(d: DonneesPaie, id: string, derniere: string, jour: DateCivile): Proposition {
  const { element } = exigerDepense(d, id);
  return sousDepense(proposerFin(d, id, derniere, jour), element.libelle);
}

/** Lier (ou délier) une réserve à la dépense ; « nouvelle:<compte> » la crée en même temps. */
export function proposerLienReserve(d: DonneesPaie, id: string, cible: string, jour: DateCivile): Proposition {
  const { element } = exigerDepense(d, id);
  const actuelle = reserveDeDepense(d, id);
  const changements: ChangementPaie[] = [];
  const comptes = new Map<string, CompteStocke>(comptesDe(d).map((k) => [k.id, k]));
  const remplacer = (k: CompteStocke, r: ReserveStockee) => comptes.set(k.id, { ...comptes.get(k.id)!, reserves: reservesDe(comptes.get(k.id)!).map((x) => (x.id === r.id ? r : x)) });
  if (actuelle) {
    // Déliée, elle garde sa date et sa cible actuelles (B1 : plus de source unique).
    const { cible: c, date } = cibleEtDate(d, actuelle.reserve, jour);
    remplacer(actuelle.compte, { ...actuelle.reserve, depenseId: null, cible: c, date: date ?? jour, frequenceMois: null });
  }
  let apres = 'aucune';
  if (cible.startsWith('nouvelle:')) {
    // Créer la réserve liée depuis une dépense existante, en un geste.
    const { compte } = exigerOuvert(d, cible.slice('nouvelle:'.length));
    const k = comptes.get(compte.id)!;
    if (reservesActives(k).some((x) => x.nom === element.libelle)) throw new ErreurSaisie(`Une réserve « ${element.libelle} » existe déjà dans ce compte : choisis-la plutôt.`);
    const r: ReserveStockee = { id: crypto.randomUUID(), nom: element.libelle, sorte: 'ponctuelle', cible: null, date: null, frequenceMois: null, depenseId: id, arreteeLe: null, transfereeVers: null, note: null, suspensions: [], mouvements: [] };
    comptes.set(k.id, { ...k, reserves: [...reservesDe(k), r] });
    apres = `« ${r.nom} » (${nomCompte(d, k)}), nouvelle, ${formaterMontant(0)}`;
  } else if (cible !== '') {
    const [compteId, reserveId] = cible.split(':');
    const k = comptes.get(compteId ?? '');
    const r = k ? reservesActives(k).find((x) => x.id === reserveId) : undefined;
    if (!k || !r) throw new ErreurSaisie('Cette réserve n’existe plus.');
    if (r.depenseId !== null && r.depenseId !== id) throw new ErreurSaisie('Cette réserve est déjà liée à une autre dépense.');
    remplacer(k, { ...r, depenseId: id, sorte: 'ponctuelle' });
    apres = `« ${r.nom} » (${nomCompte(d, k)})`;
  }
  const avant = actuelle ? `« ${actuelle.reserve.nom} »` : 'aucune';
  if (avant === apres) throw new ErreurSaisie('Rien ne change.');
  for (const k of comptes.values()) if (k !== comptesDe(d).find((x) => x.id === k.id)) changements.push({ type: 'definirCompte', compte: k });
  return finaliser(
    d,
    {
      titre: `Réserve de « ${element.libelle} »`,
      lignes: [{ libelle: 'Réserve liée', avant, apres }],
      changements,
      journal: [entree(element.libelle, 'réserve liée', avant, apres)],
      apres: [cible !== '' ? 'Par défaut, la dépense sera payée avec cette réserve.' : 'La dépense sera payée depuis le disponible.'],
    },
    jour,
  );
}

/** D10, Q90 : le mode de paiement d'une seule occurrence. */
export function proposerModeOccurrence(d: DonneesPaie, id: string, origine: string, mode: 'disponible' | 'reserve', jour: DateCivile): Proposition {
  const { fiche, element } = exigerDepense(d, id);
  if (mode === 'reserve' && !reserveDeDepense(d, id)) throw new ErreurSaisie('Cette dépense n’a pas de réserve liée.');
  if (d.confirmations.some((f) => f.elementId === id && f.origine === origine)) throw new ErreurSaisie('Cette occurrence est confirmée : son mode ne peut plus changer.');
  const avant = modeOccurrence(d, id, origine);
  if (avant === mode) throw new ErreurSaisie('Rien ne change.');
  const parDefaut = reserveDeDepense(d, id) ? 'reserve' : 'disponible';
  const modes = fiche.modes.filter((m) => m.origine !== origine);
  if (mode !== parDefaut) modes.push({ origine, mode });
  const nomMode = (m: string) => (m === 'reserve' ? 'avec la réserve' : 'depuis le disponible');
  return finaliser(
    d,
    {
      titre: `« ${element.libelle} » du ${avecAnnee(origine)} : ${nomMode(mode)}`,
      lignes: [{ libelle: `Paiement du ${avecAnnee(origine)}`, avant: nomMode(avant), apres: nomMode(mode) }],
      changements: [{ type: 'definirDepense', depense: { ...fiche, modes } }],
      journal: [entree(element.libelle, `paiement du ${avecAnnee(origine)}`, nomMode(avant), nomMode(mode))],
      apres: ['Les autres occurrences ne changent pas.'],
    },
    jour,
  );
}

export function proposerSuppressionDepense(d: DonneesPaie, id: string, jour: DateCivile): Proposition {
  const { element } = exigerDepense(d, id);
  if (d.confirmations.some((f) => f.elementId === id)) throw new ErreurSaisie('Cette dépense a un historique : termine-la plutôt (« Dernière fois le… »).');
  const changements: ChangementPaie[] = [];
  const liee = reserveDeDepense(d, id);
  const apres: string[] = [];
  if (liee) {
    const { cible, date } = cibleEtDate(d, liee.reserve, jour);
    changements.push({
      type: 'definirCompte',
      compte: { ...liee.compte, reserves: reservesDe(liee.compte).map((x) => (x.id === liee.reserve.id ? { ...x, depenseId: null, cible, date: date ?? jour } : x)) },
    });
    apres.push(`La réserve « ${liee.reserve.nom} » reste, avec sa date et sa cible actuelles.`);
  }
  changements.push({ type: 'supprimerDepense', id }, { type: 'supprimerElement', id });
  return finaliser(d, { titre: `Supprimer « ${element.libelle} »`, lignes: [{ libelle: element.libelle, avant: 'Dépense à prévoir', apres: 'Supprimée' }], changements, journal: [entree(element.libelle, 'suppression', element.libelle, null)], apres, apercuForce: true }, jour);
}

// ---------------------------------------------------------------------------
// Suggestion (D7 à D9, Q92) : rien ne s'applique sans confirmation

export function proposerSuggestion(d: DonneesPaie, id: string, choix: 'redistribuer' | 'augmenter' | 'creer', contributionId: string, jour: DateCivile): Proposition {
  const { element } = exigerDepense(d, id);
  const liee = reserveDeDepense(d, id);
  if (!liee) throw new ErreurSaisie('Lie d’abord une réserve à cette dépense.');
  const { compte, reserve } = liee;
  exigerOuvert(d, compte.id);
  const sug = suggestion(d, compte, reserve, jour);
  if (!sug || sug.montant === 0) throw new ErreurSaisie('Aucune contribution à suggérer pour l’instant.');
  const S = sug.montant;
  const nomR = (rid: string) => reservesDe(compte).find((x) => x.id === rid)?.nom ?? '?';
  if (choix === 'creer') {
    const c: ElementStocke = {
      id: crypto.randomUUID(),
      libelle: `Contribution — ${nomCompte(d, compte)}`,
      nature: 'depense',
      genre: 'fixe',
      incertain: false,
      estimation: false,
      frequence: construireFrequence('chaquePaie', jour, null),
      montants: [{ aPartirDu: jour, montant: S }],
      suspensions: [],
      fin: null,
      cyclePaie: null,
      changementsFrequence: [],
    };
    return finaliser(
      d,
      {
        titre: `Contribution de ${formaterMontant(S)} à chaque paie pour « ${reserve.nom} »`,
        lignes: [{ libelle: 'Contribution', avant: '—', apres: `${formaterMontant(S)} à chaque paie à partir du ${avecAnnee(jour)}, entièrement vers « ${reserve.nom} »` }],
        apres: [`Date d’effet : ${avecAnnee(jour)}. Le disponible planifié des cycles suivants baisse d’autant.`],
        changements: [
          { type: 'definirElement', element: c },
          { type: 'definirCompte', compte: { ...compte, contributions: [...compte.contributions, c.id], repartitions: [...(compte.repartitions ?? []), { elementId: c.id, origine: null, parts: [{ reserveId: reserve.id, montant: S }] }] } },
        ],
        journal: [entree(element.libelle, 'contribution créée', null, `${formaterMontant(S)} à chaque paie`)],
      },
      jour,
    );
  }
  const e = d.elements.find((x) => x.id === contributionId && compte.contributions.includes(x.id));
  if (!e) throw new ErreurSaisie('Choisis la contribution à utiliser.');
  const prevu = montantPrevu(d, e, jour);
  const parts = partsDe(compte, e.id, jour).map((p) => ({ ...p }));
  const actuelle = parts.find((p) => p.reserveId === reserve.id)?.montant ?? 0;
  const diff = S - actuelle;
  const lignes: LigneApercu[] = [];
  let nouvellesParts = parts.filter((p) => p.reserveId !== reserve.id);
  let changementsElement: ChangementPaie[] = [];
  if (choix === 'redistribuer') {
    if (prevu === null) throw new ErreurSaisie('Le montant de cette contribution est à compléter : choisis « Augmenter » ou donne-lui un montant.');
    let aTrouver = diff;
    const libre = prevu - parts.reduce((t, p) => t + p.montant, 0);
    aTrouver -= Math.min(Math.max(aTrouver, 0), libre);
    nouvellesParts = [...nouvellesParts].sort((a, b) => b.montant - a.montant).map((p) => {
      const pris = Math.min(p.montant, Math.max(aTrouver, 0));
      aTrouver -= pris;
      if (pris > 0) lignes.push({ libelle: `Part de « ${nomR(p.reserveId)} »`, avant: formaterMontant(p.montant), apres: formaterMontant(p.montant - pris) });
      return { ...p, montant: p.montant - pris };
    });
    if (aTrouver > 0) throw new ErreurSaisie('La contribution est trop petite pour cette part : choisis plutôt « Augmenter ».');
    nouvellesParts = nouvellesParts.filter((p) => p.montant > 0);
  } else {
    if (diff <= 0) throw new ErreurSaisie('La part actuelle suffit déjà.');
    const nouveau = (prevu ?? 0) + diff;
    changementsElement = [{ type: 'definirElement', element: { ...e, montants: [...e.montants.filter((m) => m.aPartirDu < jour), { aPartirDu: jour, montant: nouveau }] } }];
    lignes.push({ libelle: 'Contribution', avant: prevu === null ? A_COMPLETER : formaterMontant(prevu), apres: `${formaterMontant(nouveau)} à partir du ${avecAnnee(jour)}` });
  }
  lignes.unshift({ libelle: `Part de « ${reserve.nom} »`, avant: formaterMontant(actuelle), apres: formaterMontant(S) });
  const autres = (compte.repartitions ?? []).filter((rp) => !(rp.elementId === e.id && rp.origine === null));
  return finaliser(
    d,
    {
      titre: choix === 'redistribuer' ? `Redistribuer la contribution pour « ${reserve.nom} »` : `Augmenter la contribution pour « ${reserve.nom} »`,
      lignes,
      changements: [...changementsElement, { type: 'definirCompte', compte: { ...compte, repartitions: [...autres, { elementId: e.id, origine: null, parts: [...nouvellesParts, { reserveId: reserve.id, montant: S }] }] } }],
      journal: [entree(element.libelle, choix === 'redistribuer' ? 'contribution redistribuée' : 'contribution augmentée', formaterMontant(actuelle), formaterMontant(S))],
      apres: [
        `Date d’effet : ${avecAnnee(jour)}. Les paies déjà confirmées gardent leurs parts.`,
        ...(choix === 'redistribuer' ? ['Le disponible des cycles ne change pas.'] : []),
      ],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Payer avec la réserve à la confirmation (U1 à U5) : appelé par confirmations.ts

export interface EffetsReserve {
  changements: ChangementPaie[];
  lignes: LigneApercu[];
  consequences: string[];
  journal: EntreeJournal[];
  /** Q90 : un aperçu est obligatoire dès qu'une réserve est touchée. */
  apercu: boolean;
}

/**
 * Prépare (ou défait) l'utilisation de la réserve pour une occurrence. `montant`
 * null : annulation. Les comptes déjà modifiés par un autre élément du même lot
 * sont pris dans `comptes` (Tout confirmer).
 */
export function effetsReserve(
  d: DonneesPaie,
  comptes: Map<string, CompteStocke>,
  elementId: string,
  origine: string,
  montant: Cents | null,
  date: string,
  sansReserve = false,
): EffetsReserve {
  const vide: EffetsReserve = { changements: [], lignes: [], consequences: [], journal: [], apercu: false };
  if (comptesDe(d).some((k) => k.contributions.includes(elementId))) return effetsContribution(d, comptes, elementId, origine, montant);
  if (!estDepenseAPrevoir(d, elementId)) return vide;
  const cle = cleOccurrence(elementId, origine);
  const courant = (k: CompteStocke) => comptes.get(k.id) ?? k;
  const touches = new Set<string>();
  const annules: LigneApercu[] = [];
  // 1. Retirer ce qui était déjà lié à cette occurrence (correction, annulation).
  for (const k0 of comptesDe(d)) {
    const k = courant(k0);
    const lie = k.mouvements.some((m) => m.lien === cle) || reservesDe(k).some((r) => r.mouvements.some((m) => m.lien === cle));
    if (!lie) continue;
    if (montant === null) {
      // U5 : l'annulation défait l'utilisation et le retrait ; on le montre.
      for (const r of reservesDe(k)) {
        const u = r.mouvements.filter((m) => m.lien === cle).reduce((t, m) => t + m.montant, 0);
        if (u > 0) annules.push({ libelle: `Réserve « ${r.nom} »`, avant: `utilisé : ${formaterMontant(u)}`, apres: `${formaterMontant(u)} y revient` });
      }
      const retire = k.mouvements.filter((m) => m.lien === cle).reduce((t, m) => t + m.montant, 0);
      if (retire > 0) annules.push({ libelle: `Retrait de « ${nomCompte(d, k)} »`, avant: formaterMontant(retire), apres: 'annulé (la valeur suivie revient)' });
    }
    comptes.set(k.id, { ...k, mouvements: k.mouvements.filter((m) => m.lien !== cle), reserves: reservesDe(k).map((r) => ({ ...r, mouvements: r.mouvements.filter((m) => m.lien !== cle) })) });
    touches.add(k.id);
  }
  const res: EffetsReserve = { ...vide, lignes: [], consequences: [], journal: [] };
  const element = trouver(d, elementId);
  if (montant !== null && !sansReserve && modeOccurrence(d, elementId, origine) === 'reserve') {
    const liee = reserveDeDepense(d, elementId);
    if (liee) {
      const k = courant(liee.compte);
      const r = reservesDe(k).find((x) => x.id === liee.reserve.id)!;
      const disponible = Math.max(0, soldeReserve(d, k, r));
      const utilise = Math.min(montant, disponible);
      if (utilise > 0) {
        const retrait: MouvementStocke = { id: crypto.randomUUID(), date, sorte: 'retrait', montant: utilise, vers: null, destination: 'compte courant', note: `« ${element.libelle} »`, lien: cle };
        comptes.set(k.id, {
          ...k,
          mouvements: [...k.mouvements, retrait],
          reserves: reservesDe(k).map((x) => (x.id === r.id ? { ...x, mouvements: [...x.mouvements, { id: crypto.randomUUID(), date, sorte: 'utilisation', montant: utilise, vers: null, lien: cle, note: null }] } : x)),
        });
        touches.add(k.id);
        res.lignes.push(
          { libelle: `Réserve « ${r.nom} »`, avant: formaterMontant(disponible), apres: `${formaterMontant(disponible - utilise)} (utilisé : ${formaterMontant(utilise)})` },
          { libelle: `Retrait de « ${nomCompte(d, k)} »`, avant: '—', apres: `${formaterMontant(utilise)} vers le compte courant` },
        );
        res.journal.push({ section: SECTION_DEPENSES, objet: `Réserve « ${r.nom} »`, champ: 'utilisation', ancienneValeur: null, nouvelleValeur: `${formaterMontant(utilise)} pour « ${element.libelle} »`, motif: null });
        res.apercu = true;
      }
      res.consequences.push(
        montant > utilise
          ? `Payé avec la réserve : ${formaterMontant(utilise)} + depuis le disponible du cycle : ${formaterMontant(montant - utilise)}.`
          : `Payé entièrement avec la réserve : le disponible du cycle n’est pas touché.`,
      );
    }
  }
  if (annules.length > 0) {
    res.lignes.push(...annules);
    res.apercu = true;
  }
  for (const id of touches) res.changements.push({ type: 'definirCompte', compte: comptes.get(id)! });
  return res;
}

/**
 * Contribution confirmée (P1 à P7) : ses parts sont figées dans les réserves,
 * liées à l'occurrence. Une correction les recalcule au prorata des parts déjà
 * reçues ; une annulation les retire exactement. Changer la répartition ensuite
 * ne touche jamais une paie déjà confirmée.
 */
function effetsContribution(d: DonneesPaie, comptes: Map<string, CompteStocke>, elementId: string, origine: string, montant: Cents | null): EffetsReserve {
  const res: EffetsReserve = { changements: [], lignes: [], consequences: [], journal: [], apercu: false };
  const k0 = comptesDe(d).find((k) => k.contributions.includes(elementId))!;
  const k = comptes.get(k0.id) ?? k0;
  const cle = cleOccurrence(elementId, origine);
  const anciennes = new Map<string, Cents>();
  for (const r of reservesDe(k)) for (const m of r.mouvements) if (m.lien === cle && m.sorte === 'affectation') anciennes.set(r.id, (anciennes.get(r.id) ?? 0) + m.montant);
  const ancienne = d.confirmations.find((f) => f.elementId === elementId && f.origine === origine) ?? null;
  let nouvelles = new Map<string, Cents>();
  if (montant !== null) {
    nouvelles = ancienne
      ? partsPour([...anciennes].map(([reserveId, m]) => ({ reserveId, montant: m })), ancienne.montant, montant)
      : partsAFiger(d, k, elementId, origine, montant);
  }
  const date = dateOccurrence(d, elementId, origine);
  const reserves = reservesDe(k).map((r) => {
    const sans = r.mouvements.filter((m) => m.lien !== cle);
    const m = nouvelles.get(r.id) ?? 0;
    const garder = m > 0 && !horsRepartition(r, date);
    const avant = anciennes.get(r.id) ?? 0;
    const apres = garder ? m : 0;
    if (avant !== apres) res.lignes.push({ libelle: `Réserve « ${r.nom} »`, avant: avant === 0 ? '—' : `part ${formaterMontant(avant)}`, apres: apres === 0 ? 'aucune part' : `part ${formaterMontant(apres)}` });
    return garder ? { ...r, mouvements: [...sans, { id: crypto.randomUUID(), date, sorte: 'affectation' as const, montant: m, vers: null, lien: cle, note: 'part de contribution' }] } : { ...r, mouvements: sans };
  });
  if (res.lignes.length === 0) return res;
  const nouveau = { ...k, reserves };
  comptes.set(k.id, nouveau);
  res.changements.push({ type: 'definirCompte', compte: nouveau });
  return res;
}

// ---------------------------------------------------------------------------
// Ce que montre la section

export interface VueDepense {
  id: string;
  nom: string;
  note: string | null;
  quand: string;
  estimation: string;
  prochaine: { origine: string; date: string; montant: string; mode: 'disponible' | 'reserve'; couverture: string } | null;
  reserve: { nom: string; compte: string; solde: string; compteId: string; reserveId: string } | null;
  suggestion: string | null;
  /** Contributions du compte de la réserve, pour Redistribuer / Augmenter. */
  contributions: { id: string; texte: string; part: string }[];
  historique: { date: string; montant: string }[];
  ecartHistorique: string | null;
  occurrences: { origine: string; date: string; mode: 'disponible' | 'reserve'; confirmee: boolean }[];
  confirmee: boolean;
}

function couverture(montant: Cents | null, couvert: Cents | null, mode: 'disponible' | 'reserve'): string {
  if (montant === null || (mode === 'reserve' && couvert === null)) return A_COMPLETER;
  if (mode === 'disponible') return 'depuis le disponible';
  const c = couvert ?? 0;
  if (c >= montant) return 'couverte par la réserve';
  if (c === 0) return `non couverte : ${formaterMontant(montant)} depuis le disponible`;
  return `réserve ${formaterMontant(c)} + disponible ${formaterMontant(montant - c)}`;
}

export function vueDepenses(d: DonneesPaie, jour: DateCivile): VueDepense[] {
  return depensesDe(d).map((fiche) => {
    const element = trouver(d, fiche.id);
    const liee = reserveDeDepense(d, fiche.id);
    const occs = occurrencesDepense(d, fiche.id, jour, ajouterJours(jour, 2 * 366));
    const p = occs.find((o) => !o.confirmee) ?? null;
    const mode = p ? modeOccurrence(d, fiche.id, p.origine) : 'disponible';
    const histo = d.confirmations
      .filter((f) => f.elementId === fiche.id)
      .sort((a, b) => (a.origine < b.origine ? 1 : -1))
      .map((f) => ({ date: avecAnnee(f.origine), montant: f.montant }));
    const estim = element.montants.at(-1)?.montant ?? null;
    const sug = liee ? suggestion(d, liee.compte, liee.reserve, jour) : null;
    return {
      id: fiche.id,
      nom: element.libelle,
      note: fiche.note,
      quand: decrireQuand(element, jour),
      estimation: estim === null ? A_COMPLETER : formaterMontant(estim),
      prochaine: p
        ? { origine: p.origine, date: avecAnnee(p.date), montant: p.montant === null ? A_COMPLETER : formaterMontant(p.montant), mode, couverture: couverture(p.montant, p.couvert, mode) }
        : null,
      reserve: liee
        ? {
            nom: liee.reserve.nom,
            compte: nomCompte(d, liee.compte),
            solde: valeurDuCompte(d, liee.compte) === null ? '—' : formaterMontant(etatReserves(d, liee.compte).soldes.get(liee.reserve.id) ?? 0),
            compteId: liee.compte.id,
            reserveId: liee.reserve.id,
          }
        : null,
      suggestion: sug === null ? null : sug.montant === 0 ? 'Cible atteinte' : `${formaterMontant(sug.montant)} par paie (${sug.paies} paie${sug.paies > 1 ? 's' : ''})`,
      contributions: liee
        ? liee.compte.contributions.map((cid) => {
            const e = trouver(d, cid);
            const part = partsDe(liee.compte, cid, jour).find((x) => x.reserveId === liee.reserve.id)?.montant ?? 0;
            const m = montantPrevu(d, e, jour);
            return { id: cid, texte: `${m === null ? A_COMPLETER : formaterMontant(m)}, ${decrireQuand(e, jour)}`, part: formaterMontant(part) };
          })
        : [],
      historique: histo.map((h) => ({ date: h.date, montant: formaterMontant(h.montant) })),
      ecartHistorique: histo[0] && estim !== null && histo[0].montant !== estim ? `La dernière fois : ${formaterMontant(histo[0].montant)} (estimation : ${formaterMontant(estim)}).` : null,
      occurrences: occs.filter((o) => !o.confirmee).slice(0, 3).map((o) => ({ origine: o.origine, date: avecAnnee(o.date), mode: modeOccurrence(d, fiche.id, o.origine), confirmee: o.confirmee })),
      confirmee: false,
    };
  });
}

export interface MoisAPrevoir {
  mois: string;
  lignes: { nom: string; date: string; montant: string; couverture: string }[];
}

/** H2, H3 : les 12 prochains mois, avec la couverture de chaque dépense. */
export function douzeMois(d: DonneesPaie, jour: DateCivile): { mois: MoisAPrevoir[]; total: string; aCompleter: string[] } {
  const fin = ajouterJours(jour, 365);
  const toutes = depensesDe(d).flatMap((fiche) => {
    const nom = trouver(d, fiche.id).libelle;
    return occurrencesDepense(d, fiche.id, jour, fin)
      .filter((o) => !o.confirmee)
      .map((o) => ({ ...o, nom, mode: modeOccurrence(d, fiche.id, o.origine) }));
  });
  toutes.sort((a, b) => (a.date < b.date ? -1 : 1));
  const parMois = new Map<string, MoisAPrevoir>();
  for (const o of toutes) {
    const cle = o.date.slice(0, 7);
    const libelle = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cle}-15T12:00:00Z`));
    const m = parMois.get(cle) ?? { mois: libelle, lignes: [] };
    m.lignes.push({ nom: o.nom, date: formaterDateCourte(dateCivile(o.date)), montant: o.montant === null ? A_COMPLETER : formaterMontant(o.montant), couverture: couverture(o.montant, o.couvert, o.mode) });
    parMois.set(cle, m);
  }
  const total = toutes.reduce((t, o) => t + (o.montant ?? 0), 0);
  return { mois: [...parMois.values()], total: formaterMontant(total), aCompleter: toutes.filter((o) => o.montant === null).map((o) => o.nom) };
}

export { prochaineOccurrence };
