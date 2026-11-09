// Étape A, lot 1 : les réserves (décisions Q86 à Q95, B1 à B3).
//
// Une réserve est une partie VIRTUELLE de la valeur d'un compte d'épargne.
// Son solde ne vient que de ce qui est réel : affectations, réaffectations,
// libérations, utilisations, prélèvements, et les parts des contributions
// confirmées (A5). Réserves + non réservé = valeur suivie, toujours (N2) ;
// un dépassement est affiché, jamais corrigé tout seul (Q89).

import type { CompteStocke, DonneesPaie, EntreeJournal, MouvementReserveStocke, ReserveStockee } from '../lib/plateforme';
import { ajouterJours, dateCivile, formaterDateCourte, type DateCivile } from '../noyau/dates';
import { formaterMontant, type Cents } from '../noyau/montants';
import { paiesEntre } from '../noyau/paie';
import { planifier } from '../noyau/cycles';
import {
  avecAnnee,
  comptesDe,
  etatReserves,
  exigerCompte,
  exigerOuvert,
  nomCompte,
  reservesActives,
  valeurDuCompte,
} from './comptes';
import { horsRepartition, montantPrevu, partsConfirmees, partsDe, reservesDe, soldeReserve } from './couvertures';
import { finaliser, trouver } from './elements';
import { A_COMPLETER, ErreurSaisie, lireDate, lireMontant, versNoyau, type LigneApercu, type Proposition } from './paie';

export const SECTION_RESERVES = 'Mon épargne';
export const objetReserve = (nom: string) => `Réserve « ${nom} »`;
const entree = (nom: string, champ: string, avant: string | null, apres: string | null, motif: string | null = null): EntreeJournal => ({
  section: SECTION_RESERVES,
  objet: objetReserve(nom),
  champ,
  ancienneValeur: avant,
  nouvelleValeur: apres,
  motif,
});
const nouveau = (m: Omit<MouvementReserveStocke, 'id'>): MouvementReserveStocke => ({ id: crypto.randomUUID(), ...m });
const texteOuNull = (t: string) => (t.trim() === '' ? null : t.trim());

function exigerReserve(d: DonneesPaie, compteId: string, reserveId: string) {
  const { compte, nom } = exigerCompte(d, compteId);
  const reserve = reservesDe(compte).find((r) => r.id === reserveId);
  if (!reserve) throw new ErreurSaisie('Cette réserve n’existe plus.');
  return { compte, nomCompte: nom, reserve };
}
function exigerActive(r: ReserveStockee) {
  if (r.arreteeLe !== null) throw new ErreurSaisie('Cette réserve est arrêtée.');
}
const avecReserve = (k: CompteStocke, r: ReserveStockee): CompteStocke => ({ ...k, reserves: reservesDe(k).map((x) => (x.id === r.id ? r : x)) });
const definir = (k: CompteStocke): Proposition['changements'][number] => ({ type: 'definirCompte', compte: k });

/** Ligne d'aperçu « Non réservé » avant → après, pour montrer la cohérence. */
function ligneNonReserve(d: DonneesPaie, avant: CompteStocke, apres: CompteStocke): LigneApercu {
  const a = etatReserves(d, avant).nonReserve;
  const futur = { ...d, comptes: comptesDe(d).map((k) => (k.id === apres.id ? apres : k)) };
  const b = etatReserves(futur, apres).nonReserve;
  const t = (x: Cents | null) => (x === null ? A_COMPLETER : formaterMontant(x));
  return { libelle: 'Non réservé', avant: t(a), apres: t(b) };
}

// ---------------------------------------------------------------------------
// Créer, modifier (R1, R2, R4, R8, R9)

export interface SaisieReserve {
  nom: string;
  sorte: 'permanente' | 'ponctuelle';
  cible: string;
  date: string;
  /** Vide : une seule fois. */
  frequenceMois: string;
  /** B1 : dépense liée (porte date, fréquence, montant). */
  depenseId: string;
  note: string;
}

function lireReserve(s: SaisieReserve): Omit<ReserveStockee, 'id' | 'suspensions' | 'mouvements' | 'arreteeLe' | 'transfereeVers'> {
  const nom = s.nom.trim();
  if (nom === '') throw new ErreurSaisie('Donne un nom à la réserve.');
  const lie = s.depenseId !== '';
  const cible = lie ? null : lireMontant(s.cible, 'Cible');
  const date = lie || s.date.trim() === '' ? null : lireDate(s.date, 'Date');
  const sorte = lie ? 'ponctuelle' : s.sorte;
  if (sorte === 'ponctuelle' && !lie && date === null) throw new ErreurSaisie('Une réserve ponctuelle a besoin d’une date.');
  const f = s.frequenceMois.trim() === '' || lie ? null : Number(s.frequenceMois);
  if (f !== null && (!Number.isInteger(f) || f <= 0)) throw new ErreurSaisie('Fréquence invalide.');
  return { nom, sorte, cible, date: sorte === 'permanente' ? null : date, frequenceMois: sorte === 'permanente' ? null : f, depenseId: lie ? s.depenseId : null, note: texteOuNull(s.note) };
}

export function proposerReserve(d: DonneesPaie, compteId: string, s: SaisieReserve, jour: DateCivile): Proposition {
  const { compte } = exigerOuvert(d, compteId);
  const champs = lireReserve(s);
  if (reservesActives(compte).some((r) => r.nom === champs.nom)) throw new ErreurSaisie(`Une réserve « ${champs.nom} » existe déjà dans ce compte.`);
  if (champs.depenseId) {
    trouver(d, champs.depenseId);
    if (comptesDe(d).some((k) => reservesActives(k).some((r) => r.depenseId === champs.depenseId))) throw new ErreurSaisie('Cette dépense a déjà une réserve.');
  }
  const reserve: ReserveStockee = { id: crypto.randomUUID(), ...champs, arreteeLe: null, transfereeVers: null, suspensions: [], mouvements: [] };
  const texte = decrireReserve(d, reserve);
  return finaliser(
    d,
    {
      titre: `Nouvelle réserve « ${champs.nom} »`,
      lignes: [{ libelle: champs.nom, avant: '—', apres: texte }],
      changements: [definir({ ...compte, reserves: [...reservesDe(compte), reserve] })],
      journal: [entree(champs.nom, 'création', null, texte)],
      apres: valeurDuCompte(d, compte) === null ? ['La valeur du compte est à compléter : indique-la avant d’affecter de l’argent à cette réserve.'] : [],
    },
    jour,
  );
}

export function proposerModificationReserve(d: DonneesPaie, compteId: string, reserveId: string, s: SaisieReserve, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, reserveId);
  exigerActive(reserve);
  const champs = lireReserve({ ...s, depenseId: reserve.depenseId ?? '' });
  const apres: ReserveStockee = { ...reserve, ...champs };
  const [a, b] = [decrireReserve(d, reserve), decrireReserve(d, apres)];
  if (a === b && reserve.note === apres.note) throw new ErreurSaisie('Rien ne change.');
  return finaliser(
    d,
    {
      titre: `Modifier la réserve « ${reserve.nom} »`,
      lignes: [{ libelle: reserve.nom, avant: a, apres: b }],
      changements: [definir(avecReserve(compte, apres))],
      journal: [entree(apres.nom, 'modification', a, b)],
      apres: ['La contribution planifiée ne change pas ; la suggestion est recalculée.'],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Mouvements internes (R3, R5, R6, O2)

function lireMontantPositif(texte: string, quoi: string): Cents {
  const m = lireMontant(texte, 'Montant');
  if (m === null || m === 0) throw new ErreurSaisie(`Indique le montant ${quoi}.`);
  return m;
}
const dateOuJour = (texte: string, jour: DateCivile) => (texte.trim() === '' ? jour : lireDate(texte, 'Date'));

/** R3 : du non réservé vers une réserve. Q95 : jamais sur une valeur à compléter. */
export function proposerAffectation(d: DonneesPaie, compteId: string, reserveId: string, s: { montant: string; date: string; note: string }, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, reserveId);
  exigerOuvert(d, compteId);
  exigerActive(reserve);
  const etat = etatReserves(d, compte);
  if (etat.nonReserve === null) throw new ErreurSaisie('Indique d’abord la valeur du compte.');
  if (etat.nonReserve < 0) throw new ErreurSaisie(`Tes réserves dépassent déjà la valeur du compte de ${formaterMontant(-etat.nonReserve)} : « Ajuster mes réserves » d’abord.`);
  const montant = lireMontantPositif(s.montant, 'à mettre de côté');
  if (montant > etat.nonReserve) throw new ErreurSaisie(`Le non réservé n’a que ${formaterMontant(etat.nonReserve)}.`);
  const date = dateOuJour(s.date, jour);
  const apres = avecReserve(compte, { ...reserve, mouvements: [...reserve.mouvements, nouveau({ date, sorte: 'affectation', montant, vers: null, lien: null, note: texteOuNull(s.note) })] });
  const solde = etat.soldes.get(reserve.id) ?? 0;
  return finaliser(
    d,
    {
      titre: `Mettre ${formaterMontant(montant)} dans « ${reserve.nom} »`,
      lignes: [{ libelle: reserve.nom, avant: formaterMontant(solde), apres: formaterMontant(solde + montant) }, ligneNonReserve(d, compte, apres)],
      changements: [definir(apres)],
      journal: [entree(reserve.nom, 'affectation', null, `${formaterMontant(montant)} le ${avecAnnee(date)}`, texteOuNull(s.note))],
    },
    jour,
  );
}

/** R5 : d'une réserve vers une autre du même compte. */
export function proposerReaffectation(d: DonneesPaie, compteId: string, deId: string, versId: string, s: { montant: string; date: string; note: string }, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, deId);
  if (versId === '' || versId === deId) throw new ErreurSaisie('Choisis une autre réserve.');
  const { reserve: vers } = exigerReserve(d, compteId, versId);
  exigerActive(vers);
  const etat = etatReserves(d, compte);
  const solde = etat.soldes.get(deId) ?? 0;
  const montant = lireMontantPositif(s.montant, 'à déplacer');
  if (montant > solde) throw new ErreurSaisie(`La réserve « ${reserve.nom} » n’a que ${formaterMontant(solde)}.`);
  const date = dateOuJour(s.date, jour);
  const apres = avecReserve(compte, { ...reserve, mouvements: [...reserve.mouvements, nouveau({ date, sorte: 'reaffectation', montant, vers: versId, lien: null, note: texteOuNull(s.note) })] });
  const soldeVers = etat.soldes.get(versId) ?? 0;
  const texte = `${formaterMontant(montant)} de « ${reserve.nom} » vers « ${vers.nom} »`;
  return finaliser(
    d,
    {
      titre: `Réaffecter ${texte}`,
      lignes: [
        { libelle: reserve.nom, avant: formaterMontant(solde), apres: formaterMontant(solde - montant) },
        { libelle: vers.nom, avant: formaterMontant(soldeVers), apres: formaterMontant(soldeVers + montant) },
      ],
      changements: [definir(apres)],
      journal: [entree(reserve.nom, 'réaffectation', null, texte), entree(vers.nom, 'réaffectation reçue', null, texte)],
    },
    jour,
  );
}

/** R6 : d'une réserve vers le non réservé. */
export function proposerLiberation(d: DonneesPaie, compteId: string, reserveId: string, s: { montant: string; date: string; note: string }, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, reserveId);
  const etat = etatReserves(d, compte);
  const solde = etat.soldes.get(reserveId) ?? 0;
  const montant = lireMontantPositif(s.montant, 'à libérer');
  if (montant > solde) throw new ErreurSaisie(`La réserve « ${reserve.nom} » n’a que ${formaterMontant(solde)}.`);
  const date = dateOuJour(s.date, jour);
  const apres = avecReserve(compte, { ...reserve, mouvements: [...reserve.mouvements, nouveau({ date, sorte: 'liberation', montant, vers: null, lien: null, note: texteOuNull(s.note) })] });
  return finaliser(
    d,
    {
      titre: `Libérer ${formaterMontant(montant)} de « ${reserve.nom} »`,
      lignes: [{ libelle: reserve.nom, avant: formaterMontant(solde), apres: formaterMontant(solde - montant) }, ligneNonReserve(d, compte, apres)],
      changements: [definir(apres)],
      journal: [entree(reserve.nom, 'libération', null, `${formaterMontant(montant)} le ${avecAnnee(date)}`, texteOuNull(s.note))],
    },
    jour,
  );
}

/** O3 : « Ajuster mes réserves » après un dépassement ; rien ne bouge sans confirmation. */
export function proposerAjusterReserves(d: DonneesPaie, compteId: string, mode: 'une' | 'prorata', reserveId: string, jour: DateCivile): Proposition {
  const { compte } = exigerCompte(d, compteId);
  const etat = etatReserves(d, compte);
  if (etat.nonReserve === null || etat.nonReserve >= 0) throw new ErreurSaisie('Tes réserves ne dépassent pas la valeur du compte.');
  const ecart = -etat.nonReserve;
  const actives = reservesActives(compte).filter((r) => (etat.soldes.get(r.id) ?? 0) > 0);
  const reductions = new Map<string, Cents>();
  if (mode === 'une') {
    const r = actives.find((x) => x.id === reserveId);
    if (!r) throw new ErreurSaisie('Choisis la réserve à réduire.');
    if ((etat.soldes.get(r.id) ?? 0) < ecart) throw new ErreurSaisie(`La réserve « ${r.nom} » n’a que ${formaterMontant(etat.soldes.get(r.id) ?? 0)}.`);
    reductions.set(r.id, ecart);
  } else {
    let reste = ecart;
    for (const r of actives) {
      const part = Math.floor(((etat.soldes.get(r.id) ?? 0) * ecart) / etat.totalReserves);
      reductions.set(r.id, part);
      reste -= part;
    }
    // L'arrondi va sur la plus grande réserve.
    const plusGrande = [...actives].sort((a, b) => (etat.soldes.get(b.id) ?? 0) - (etat.soldes.get(a.id) ?? 0))[0];
    if (plusGrande && reste > 0) reductions.set(plusGrande.id, (reductions.get(plusGrande.id) ?? 0) + reste);
  }
  const reserves = reservesDe(compte).map((r) => {
    const m = reductions.get(r.id);
    return m ? { ...r, mouvements: [...r.mouvements, nouveau({ date: jour, sorte: 'liberation', montant: m, vers: null, lien: null, note: 'ajustement après dépassement' })] } : r;
  });
  const apres = { ...compte, reserves };
  return finaliser(
    d,
    {
      titre: `Ajuster les réserves de « ${nomCompte(d, compte)} »`,
      lignes: [
        ...[...reductions].filter(([, m]) => m > 0).map(([id, m]) => {
          const r = reservesDe(compte).find((x) => x.id === id)!;
          const s = etat.soldes.get(id) ?? 0;
          return { libelle: r.nom, avant: formaterMontant(s), apres: formaterMontant(s - m) };
        }),
        ligneNonReserve(d, compte, apres),
      ],
      changements: [definir(apres)],
      journal: [...reductions].filter(([, m]) => m > 0).map(([id, m]) => entree(reservesDe(compte).find((x) => x.id === id)!.nom, 'ajustement après dépassement', null, formaterMontant(m))),
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Suspendre, reprendre, arrêter, supprimer (R10, X1, X3)

const enSuspension = (r: ReserveStockee) => r.suspensions.some((s) => s.fin === null);

export function proposerSuspensionReserve(d: DonneesPaie, compteId: string, reserveId: string, dateTexte: string, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, reserveId);
  exigerActive(reserve);
  if (enSuspension(reserve)) throw new ErreurSaisie('Cette réserve est déjà suspendue.');
  const date = dateOuJour(dateTexte, jour);
  const parts = (compte.repartitions ?? []).filter((rp) => rp.origine === null).flatMap((rp) => rp.parts.filter((p) => p.reserveId === reserve.id));
  return finaliser(
    d,
    {
      titre: `Suspendre la réserve « ${reserve.nom} »`,
      lignes: [{ libelle: reserve.nom, avant: 'Active', apres: `Suspendue à partir du ${avecAnnee(date)}` }],
      changements: [definir(avecReserve(compte, { ...reserve, suspensions: [...reserve.suspensions, { debut: date, fin: null }] }))],
      journal: [entree(reserve.nom, 'suspension', null, avecAnnee(date))],
      apres: [
        'Son solde reste intact ; plus aucune suggestion.',
        ...(parts.length > 0 ? [`Ses parts de contribution (${parts.map((p) => formaterMontant(p.montant)).join(', ')}) iront au non réservé jusqu’à la reprise.`] : []),
      ],
      apercuForce: true,
    },
    jour,
  );
}

export function proposerRepriseReserve(d: DonneesPaie, compteId: string, reserveId: string, dateTexte: string, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, reserveId);
  if (!enSuspension(reserve)) throw new ErreurSaisie('Cette réserve n’est pas suspendue.');
  const date = dateOuJour(dateTexte, jour);
  const veille = ajouterJours(date, -1) as string;
  const suspensions = reserve.suspensions.map((s) => (s.fin === null ? { ...s, fin: veille < s.debut ? s.debut : veille } : s));
  return finaliser(
    d,
    {
      titre: `Reprendre la réserve « ${reserve.nom} »`,
      lignes: [{ libelle: reserve.nom, avant: 'Suspendue', apres: `Active à partir du ${avecAnnee(date)}` }],
      changements: [definir(avecReserve(compte, { ...reserve, suspensions }))],
      journal: [entree(reserve.nom, 'reprise', null, avecAnnee(date))],
      apres: ['La répartition habituelle reprend telle quelle.'],
    },
    jour,
  );
}

/** B3 : arrêter archive la réserve ; son solde est d'abord libéré ou réaffecté. */
export function proposerArretReserve(d: DonneesPaie, compteId: string, reserveId: string, s: { date: string; versId: string }, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, reserveId);
  exigerActive(reserve);
  const date = dateOuJour(s.date, jour);
  const solde = etatReserves(d, compte).soldes.get(reserveId) ?? 0;
  const mouvements = [...reserve.mouvements];
  const lignes: LigneApercu[] = [{ libelle: reserve.nom, avant: 'Active', apres: `Arrêtée le ${avecAnnee(date)}` }];
  if (solde > 0) {
    if (s.versId !== '' && s.versId !== reserveId) {
      const { reserve: vers } = exigerReserve(d, compteId, s.versId);
      exigerActive(vers);
      mouvements.push(nouveau({ date, sorte: 'reaffectation', montant: solde, vers: vers.id, lien: null, note: 'arrêt de la réserve' }));
      lignes.push({ libelle: 'Solde', avant: formaterMontant(solde), apres: `réaffecté à « ${vers.nom} »` });
    } else {
      mouvements.push(nouveau({ date, sorte: 'liberation', montant: solde, vers: null, lien: null, note: 'arrêt de la réserve' }));
      lignes.push({ libelle: 'Solde', avant: formaterMontant(solde), apres: 'libéré (non réservé)' });
    }
  }
  const repartitions = (compte.repartitions ?? []).map((rp) => ({ ...rp, parts: rp.parts.filter((p) => p.reserveId !== reserveId) }));
  const dep = reserve.depenseId ? d.elements.find((e) => e.id === reserve.depenseId) : null;
  return finaliser(
    d,
    {
      titre: `Arrêter la réserve « ${reserve.nom} »`,
      lignes,
      changements: [definir({ ...avecReserve(compte, { ...reserve, arreteeLe: date, mouvements }), repartitions })],
      journal: [entree(reserve.nom, 'arrêt', null, avecAnnee(date))],
      apres: [
        'Son historique est conservé ; elle ne reçoit plus de contribution.',
        ...(dep ? [`La dépense « ${dep.libelle} » sera payée depuis le disponible à partir de sa prochaine occurrence.`] : []),
      ],
      apercuForce: true,
    },
    jour,
  );
}

export function proposerSuppressionReserve(d: DonneesPaie, compteId: string, reserveId: string, jour: DateCivile): Proposition {
  const { compte, reserve } = exigerReserve(d, compteId, reserveId);
  const solde = etatReserves(d, compte).soldes.get(reserveId) ?? 0;
  if (solde !== 0) throw new ErreurSaisie(`Cette réserve a ${formaterMontant(solde)} : libère ou réaffecte d’abord son solde (« Arrêter »).`);
  const historique = reserve.mouvements.length > 0 || partsConfirmees(d, compte).some((p) => p.reserveId === reserveId) || reservesDe(compte).some((r) => r.mouvements.some((m) => m.vers === reserveId));
  if (historique) throw new ErreurSaisie('Cette réserve a un historique : arrête-la plutôt.');
  const repartitions = (compte.repartitions ?? []).map((rp) => ({ ...rp, parts: rp.parts.filter((p) => p.reserveId !== reserveId) }));
  const dep = reserve.depenseId ? d.elements.find((e) => e.id === reserve.depenseId) : null;
  return finaliser(
    d,
    {
      titre: `Supprimer la réserve « ${reserve.nom} »`,
      lignes: [{ libelle: reserve.nom, avant: 'Réserve', apres: 'Supprimée' }],
      changements: [definir({ ...compte, reserves: reservesDe(compte).filter((r) => r.id !== reserveId), repartitions })],
      journal: [entree(reserve.nom, 'suppression', 'réserve', null)],
      apres: dep ? [`La dépense « ${dep.libelle} » sera payée depuis le disponible.`] : [],
      apercuForce: true,
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Répartition d'une contribution (A5, Q86, P1 à P7)

/** Parts saisies en dollars, par réserve ; vide ou 0 : aucune part. */
export function proposerRepartition(d: DonneesPaie, elementId: string, saisie: Record<string, string>, origine: string | null, jour: DateCivile): Proposition {
  const compte = comptesDe(d).find((k) => k.contributions.includes(elementId));
  if (!compte) throw new ErreurSaisie('Cette contribution n’existe plus.');
  exigerOuvert(d, compte.id);
  const e = trouver(d, elementId);
  if (origine !== null && d.confirmations.some((f) => f.elementId === elementId && f.origine === origine)) {
    throw new ErreurSaisie('Cette paie est confirmée : sa répartition ne peut plus changer.');
  }
  const parts: { reserveId: string; montant: Cents }[] = [];
  for (const r of reservesActives(compte)) {
    const m = lireMontant(saisie[r.id] ?? '', `Part de « ${r.nom} »`);
    if (m !== null && m > 0) parts.push({ reserveId: r.id, montant: m });
  }
  const somme = parts.reduce((t, p) => t + p.montant, 0);
  const prevu = montantPrevu(d, e, origine ?? jour);
  if (prevu !== null && somme > prevu) throw new ErreurSaisie(`La répartition (${formaterMontant(somme)}) dépasse la contribution (${formaterMontant(prevu)}).`);
  const autres = (compte.repartitions ?? []).filter((rp) => !(rp.elementId === elementId && rp.origine === origine));
  const repartitions = parts.length > 0 ? [...autres, { elementId, origine, parts }] : autres;
  const nomR = (id: string) => reservesDe(compte).find((r) => r.id === id)!.nom;
  const texte = parts.length === 0 ? 'tout au non réservé' : `${parts.map((p) => `${formaterMontant(p.montant)} ${nomR(p.reserveId)}`).join(' + ')}${prevu !== null && prevu > somme ? ` ; ${formaterMontant(prevu - somme)} au non réservé` : ''}`;
  const avant = partsDe(compte, elementId, origine ?? '');
  const texteAvant = avant.length === 0 ? 'tout au non réservé' : avant.map((p) => `${formaterMontant(p.montant)} ${nomR(p.reserveId)}`).join(' + ');
  return finaliser(
    d,
    {
      titre: origine === null ? `Répartir la contribution à « ${nomCompte(d, compte)} »` : `Répartir la paie du ${avecAnnee(origine)} seulement`,
      lignes: [{ libelle: 'Répartition', avant: texteAvant, apres: texte }],
      changements: [definir({ ...compte, repartitions })],
      journal: [{ section: SECTION_RESERVES, objet: `Compte « ${nomCompte(d, compte)} »`, champ: origine === null ? 'répartition' : `répartition du ${avecAnnee(origine)}`, ancienneValeur: texteAvant, nouvelleValeur: texte, motif: null }],
      apres: [
        ...(origine === null ? [`Date d’effet : ${avecAnnee(jour)}. Les paies déjà confirmées gardent leurs parts.`] : []),
        'Mes paies ne change pas : une seule ligne de contribution. Les parts comptent seulement une fois la contribution confirmée.',
      ],
    },
    jour,
  );
}

/** P6 : revenir à la répartition habituelle pour une paie. */
export function proposerRetourRepartition(d: DonneesPaie, elementId: string, origine: string, jour: DateCivile): Proposition {
  const compte = comptesDe(d).find((k) => k.contributions.includes(elementId));
  if (!compte || !(compte.repartitions ?? []).some((rp) => rp.elementId === elementId && rp.origine === origine)) {
    throw new ErreurSaisie('Cette paie suit déjà la répartition habituelle.');
  }
  if (d.confirmations.some((f) => f.elementId === elementId && f.origine === origine)) throw new ErreurSaisie('Cette paie est confirmée : sa répartition ne peut plus changer.');
  return finaliser(
    d,
    {
      titre: `Revenir à la répartition habituelle (${avecAnnee(origine)})`,
      lignes: [{ libelle: 'Répartition', avant: 'propre à cette paie', apres: 'habituelle' }],
      changements: [definir({ ...compte, repartitions: (compte.repartitions ?? []).filter((rp) => !(rp.elementId === elementId && rp.origine === origine)) })],
      journal: [{ section: SECTION_RESERVES, objet: `Compte « ${nomCompte(d, compte)} »`, champ: `répartition du ${avecAnnee(origine)}`, ancienneValeur: 'propre', nouvelleValeur: 'habituelle', motif: null }],
    },
    jour,
  );
}

// ---------------------------------------------------------------------------
// Ce que montre Mon épargne

/** B1 : cible et date d'une réserve ; celles de la dépense liée si elle en a une. */
export function cibleEtDate(d: DonneesPaie, r: ReserveStockee, jour: DateCivile): { cible: Cents | null; date: string | null; aCompleter: boolean } {
  if (r.depenseId) {
    const e = d.elements.find((x) => x.id === r.depenseId);
    if (!e) return { cible: null, date: null, aCompleter: true };
    const occ = prochaineOccurrence(d, r.depenseId, jour);
    if (!occ) return { cible: null, date: null, aCompleter: false };
    return { cible: occ.montant, date: occ.date, aCompleter: occ.montant === null };
  }
  let date = r.date;
  if (date !== null && r.frequenceMois !== null) {
    while (date < jour) date = ajouterMois(date, r.frequenceMois);
  }
  return { cible: r.cible, date, aCompleter: r.cible === null };
}

function ajouterMois(date: string, n: number): string {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  const total = a * 12 + (m - 1) + n;
  const an = Math.floor(total / 12);
  const mois = (total % 12) + 1;
  const dernier = new Date(Date.UTC(an, mois, 0)).getUTCDate();
  return `${an}-${String(mois).padStart(2, '0')}-${String(Math.min(j, dernier)).padStart(2, '0')}`;
}

/** Prochaine occurrence non confirmée d'une dépense, à partir d'aujourd'hui. */
export function prochaineOccurrence(d: DonneesPaie, depenseId: string, jour: DateCivile): { origine: string; date: string; montant: Cents | null } | null {
  return occurrencesDepense(d, depenseId, jour, ajouterJours(jour, 3 * 366)).find((o) => !o.confirmee) ?? null;
}

/** Occurrences d'une dépense entre deux dates (date prévue ou ajustée). */
export function occurrencesDepense(d: DonneesPaie, depenseId: string, debut: string, fin: string) {
  const n = versNoyau(d);
  if (!n.profil) return [];
  const plan = planifier(
    { profil: n.profil, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, couvertures: n.couvertures },
    ajouterJours(dateCivile(debut), -45),
    ajouterJours(dateCivile(fin), 1),
  );
  const res: { origine: string; date: string; montant: Cents | null; confirmee: boolean; couvert: Cents | null; cycle: string }[] = [];
  const vus = new Set<string>();
  for (const c of plan.cycles) {
    for (const l of c.lignes) {
      if (l.elementId !== depenseId || l.retiree || vus.has(l.origine)) continue;
      const date = (l.echeance ?? c.paie.date) as string;
      if (date < debut || date > fin) continue;
      vus.add(l.origine);
      res.push({ origine: l.origine, date, montant: l.montant, confirmee: l.statut === 'confirme', couvert: l.couvert, cycle: c.paie.date });
    }
  }
  return res.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** D7, Q92 : (cible − solde) ÷ paies d'ici la date, arrondi au dollar supérieur. */
export function suggestion(d: DonneesPaie, compte: CompteStocke, r: ReserveStockee, jour: DateCivile): { montant: Cents; paies: number } | null {
  if (r.arreteeLe !== null || horsRepartition(r, jour) || r.sorte === 'permanente') return null;
  const { cible, date } = cibleEtDate(d, r, jour);
  if (cible === null || date === null || !d.profil) return null;
  const n = versNoyau(d);
  if (!n.profil) return null;
  const paies = paiesEntre(n.profil, n.exceptions, jour, ajouterJours(dateCivile(date), -1)).filter((p) => p.date >= jour && p.date < date).length;
  if (paies === 0) return null;
  const manque = cible - soldeReserve(d, compte, r);
  if (manque <= 0) return { montant: 0, paies };
  return { montant: Math.ceil(manque / paies / 100) * 100, paies };
}

export interface VueReserve {
  id: string;
  nom: string;
  sorte: 'permanente' | 'ponctuelle';
  etat: 'active' | 'suspendue' | 'arretee';
  solde: Cents;
  soldeTexte: string;
  cible: string;
  /** Pour la barre de progression : null quand la cible est inconnue (jamais 0). */
  cibleCents: Cents | null;
  date: string | null;
  depense: string | null;
  manque: string | null;
  surplus: string | null;
  aReconstituer: string | null;
  suggestion: string | null;
  transfereeVers: string | null;
  historique: { date: string; texte: string }[];
  brut: ReserveStockee;
}

export interface VueReserves {
  compteId: string;
  nonReserve: string;
  nonReserveCents: Cents | null;
  /** Q89 : montant du dépassement, ou null. */
  depassement: string | null;
  valeurConnue: boolean;
  actives: VueReserve[];
  arretees: VueReserve[];
}

export function vueReserves(d: DonneesPaie, compteId: string, jour: DateCivile): VueReserves {
  const { compte } = exigerCompte(d, compteId);
  const etat = etatReserves(d, compte);
  const vues = reservesDe(compte).map((r): VueReserve => {
    const solde = etat.soldes.get(r.id) ?? 0;
    const { cible, date, aCompleter } = cibleEtDate(d, r, jour);
    const utilisee = r.mouvements.some((m) => m.sorte === 'utilisation' || m.sorte === 'prelevement');
    const ecart = cible === null ? null : cible - solde;
    const sug = suggestion(d, compte, r, jour);
    const nomDep = r.depenseId ? (d.elements.find((e) => e.id === r.depenseId)?.libelle ?? null) : null;
    const historique = [
      ...r.mouvements.map((m) => ({
        date: m.date,
        texte: `${m.sorte === 'affectation' && m.lien?.includes('|') ? 'Part de contribution' : LIBELLES_MOUVEMENT[m.sorte]} ${formaterMontant(m.montant)}${m.sorte === 'reaffectation' ? ` vers « ${reservesDe(compte).find((x) => x.id === m.vers)?.nom ?? '?'} »` : ''}${m.note ? ` — ${m.note}` : ''}`,
      })),
      ...reservesDe(compte).flatMap((x) => x.mouvements.filter((m) => m.sorte === 'reaffectation' && m.vers === r.id).map((m) => ({ date: m.date, texte: `Réaffectation reçue de « ${x.nom} » ${formaterMontant(m.montant)}` }))),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((h) => ({ ...h, date: avecAnnee(h.date) }));
    return {
      id: r.id,
      nom: r.nom,
      sorte: r.sorte,
      etat: r.arreteeLe !== null ? 'arretee' : enSuspension(r) ? 'suspendue' : 'active',
      solde,
      soldeTexte: etat.nonReserve === null && solde === 0 ? '—' : formaterMontant(solde),
      cible: aCompleter ? A_COMPLETER : cible === null ? '—' : formaterMontant(cible),
      cibleCents: aCompleter ? null : cible,
      date: date ? avecAnnee(date) : null,
      depense: nomDep,
      manque: ecart !== null && ecart > 0 && !(r.sorte === 'permanente' && utilisee) ? formaterMontant(ecart) : null,
      surplus: ecart !== null && ecart < 0 ? formaterMontant(-ecart) : null,
      aReconstituer: r.sorte === 'permanente' && utilisee && ecart !== null && ecart > 0 ? formaterMontant(ecart) : null,
      suggestion: sug === null ? null : sug.montant === 0 ? 'Cible atteinte' : `${formaterMontant(sug.montant)} par paie (${sug.paies} paie${sug.paies > 1 ? 's' : ''} d’ici le ${formaterDateCourte(date as DateCivile)})`,
      transfereeVers: r.transfereeVers,
      historique,
      brut: r,
    };
  });
  return {
    compteId,
    nonReserve: etat.nonReserve === null ? A_COMPLETER : formaterMontant(etat.nonReserve),
    nonReserveCents: etat.nonReserve,
    depassement: etat.nonReserve !== null && etat.nonReserve < 0 ? formaterMontant(-etat.nonReserve) : null,
    valeurConnue: etat.nonReserve !== null,
    actives: vues.filter((v) => v.etat !== 'arretee'),
    arretees: vues.filter((v) => v.etat === 'arretee'),
  };
}

export const LIBELLES_MOUVEMENT: Record<MouvementReserveStocke['sorte'], string> = {
  affectation: 'Affectation',
  liberation: 'Libération',
  reaffectation: 'Réaffectation',
  utilisation: 'Utilisation',
  prelevement: 'Prélèvement',
  transfert: 'Transfert',
};

export function decrireReserve(d: DonneesPaie, r: ReserveStockee): string {
  if (r.depenseId) {
    const e = d.elements.find((x) => x.id === r.depenseId);
    return `liée à la dépense « ${e?.libelle ?? '?'} »`;
  }
  const cible = r.cible === null ? A_COMPLETER : formaterMontant(r.cible);
  if (r.sorte === 'permanente') return `permanente ; cible ${cible}`;
  const f = r.frequenceMois === null ? 'une fois' : r.frequenceMois === 12 ? 'chaque année' : `tous les ${r.frequenceMois} mois`;
  return `ponctuelle ; ${cible} pour le ${r.date ? avecAnnee(r.date) : '?'} (${f})`;
}
