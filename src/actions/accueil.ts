// Accueil (0.16.0) : ce que l'écran d'accueil montre en dix secondes.
// Aucun nouveau calcul financier : on reprend tels quels les cycles de Mes
// paies (mêmes fonctions, mêmes données) et on choisit quoi en montrer.
// Prévu, confirmé et « à compléter » restent distincts ; un montant inconnu
// n'est jamais un 0.

import { aVerifierAvant, cyclesAffiches } from './analyse';
import { estPaiementCarte, libelleLigne, raisonsACompleter } from './cartes';
import { versNoyau } from './paie';
import type { DonneesPaie } from '../lib/plateforme';
import { titresCartes } from '../lib/operations';
import type { Cycle, Ligne } from '../noyau/cycles';
import { formaterDateCourte, formaterDateLongue, jourDeLaSemaine, type DateCivile } from '../noyau/dates';
import type { Cents } from '../noyau/montants';

/** Où mène un lien de l'Accueil dans Mes paies. */
export type CibleMesPaies =
  | { type: 'paie'; date: DateCivile; ligne?: { elementId: string; origine: DateCivile } }
  | { type: 'aVerifierPassees' };

export interface ComptesPaie {
  confirmees: number;
  aVenir: number;
  aVerifier: number;
  aCompleter: number;
}

export interface ResumePaie {
  cycle: Cycle;
  titre: string;
  comptes: ComptesPaie;
  /** Pourquoi le disponible est « À compléter » ; null s'il est connu. */
  manque: string | null;
}

export interface PointSurveiller {
  cle: string;
  texte: string;
  action: string;
  cible: CibleMesPaies;
}

export interface LigneBientot {
  /** Jour prévu ; pour une sortie sans date propre, la fin de sa paie. */
  date: DateCivile;
  /** Vrai quand la sortie n'a pas de date propre : « d'ici le … ». */
  sansDate: boolean;
  libelle: string;
  montant: Cents | null;
  etat: 'prevu' | 'a-completer';
  statut: string;
  cible: CibleMesPaies;
}

export interface GroupeBientot {
  titre: string;
  lignes: LigneBientot[];
}

export interface VueAccueil {
  /** La date du jour, en deux morceaux : « Mercredi » et « 11 novembre ». */
  jourSemaine: string;
  jourMois: string;
  phrase: string;
  paies: ResumePaie[];
  surveiller: PointSurveiller[];
  bientot: GroupeBientot[];
  /** Opérations à venir des deux paies que « Bientôt » ne montre pas. */
  autresBientot: number;
}

export const MAX_SURVEILLER = 4;
export const MAX_BIENTOT = 6;

const majuscule = (t: string) => (t ? t[0]!.toLocaleUpperCase('fr-CA') + t.slice(1) : t);
/** « 11 novembre », « 1er décembre ». */
const jourEtMois = (d: DateCivile) => formaterDateLongue(d).split(' ').slice(1, -1).join(' ');
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? un : plusieurs}`;

function periode(c: Cycle): string {
  const debut = jourEtMois(c.debut);
  const fin = jourEtMois(c.fin);
  return c.debut.slice(0, 7) === c.fin.slice(0, 7) ? `du ${debut.split(' ')[0]} au ${fin}` : `du ${debut} au ${fin}`;
}

const visible = (l: Ligne) => !l.retiree && l.statut !== 'retiree' && l.statut !== 'enveloppe';

/** Les états d'une paie, comptés ligne par ligne (la paie comprise). */
export function comptesPaie(c: Cycle): ComptesPaie {
  const lignes = c.lignes.filter(visible);
  return {
    confirmees: lignes.filter((l) => l.statut === 'confirme').length + (c.paieStatut === 'confirme' ? 1 : 0),
    aVenir: lignes.filter((l) => l.statut === 'aVenir').length + (c.paieStatut === 'aVenir' ? 1 : 0),
    aVerifier: c.aVerifier,
    aCompleter:
      lignes.filter((l) => l.compte && l.montant === null && l.statut !== 'confirme').length + (c.paie.montant === null && c.paieStatut !== 'confirme' ? 1 : 0),
  };
}

const dateDe = (c: Cycle, l: Ligne) => l.echeance ?? c.paie.date;

function ligneBientot(d: DonneesPaie, c: Cycle, l: Ligne): LigneBientot {
  const carte = estPaiementCarte(d, l.elementId);
  const cible: CibleMesPaies = { type: 'paie', date: c.paie.dateOrigine, ligne: { elementId: l.elementId, origine: l.origine } };
  const base = { date: l.echeance ?? c.fin, sansDate: l.echeance === null, libelle: libelleLigne(d, l), montant: l.montant, cible };
  if (l.montant === null) return { ...base, etat: 'a-completer', statut: carte ? 'Montant à choisir' : 'À compléter' };
  if (l.couvert === null) return { ...base, etat: 'a-completer', statut: 'Couverture à compléter' };
  if (l.couvert > 0) return { ...base, etat: 'prevu', statut: l.couvert >= l.montant ? 'Avec la réserve' : 'En partie avec la réserve' };
  return { ...base, etat: 'prevu', statut: 'À venir' };
}

export function vueAccueil(d: DonneesPaie, jour: DateCivile): VueAccueil {
  const semaine = majuscule(jourDeLaSemaine(jour));
  const jourMois = jourEtMois(jour);
  const noyau = versNoyau(d);
  if (!noyau.profil) {
    return { jourSemaine: semaine, jourMois, phrase: 'Configure ta paie pour voir où tu en es.', paies: [], surveiller: [], bientot: [], autresBientot: 0 };
  }
  const entree = { exceptions: noyau.exceptions, elements: noyau.elements, ajustements: noyau.ajustements, confirmations: noyau.confirmations, seuil: noyau.seuil, couvertures: noyau.couvertures };
  const v = cyclesAffiches(noyau.profil, entree, jour);
  const deux = v.cycles.slice(0, 2);
  const titres = titresCartes(v.courant !== null);
  const paies: ResumePaie[] = deux.map((c, i) => ({ cycle: c, titre: titres[i]!, comptes: comptesPaie(c), manque: raisonsACompleter(d, c) }));
  const passees = deux[0] ? aVerifierAvant(noyau.profil, entree, jour, deux[0].debut) : 0;

  // À surveiller : seulement ce qui demande un geste, chacun avec son lien.
  const points: PointSurveiller[] = [];
  for (const c of deux) {
    const quand = formaterDateCourte(c.paie.date);
    if (c.signal === 'negatif') points.push({ cle: `negatif-${c.paie.dateOrigine}`, texte: `La paie du ${quand} prévoit plus de dépenses que de revenus`, action: 'Voir cette paie', cible: { type: 'paie', date: c.paie.dateOrigine } });
    else if (c.signal === 'seuil') points.push({ cle: `seuil-${c.paie.dateOrigine}`, texte: `La paie du ${quand} passe sous ton seuil d’attention`, action: 'Voir cette paie', cible: { type: 'paie', date: c.paie.dateOrigine } });
  }
  if (v.courant !== null && deux[0] && deux[0].aVerifier > 0) {
    points.push({ cle: 'a-verifier-actuelle', texte: `${pluriel(deux[0].aVerifier, 'élément', 'éléments')} à vérifier dans ta paie actuelle`, action: deux[0].aVerifier === 1 ? 'Le voir' : 'Les voir', cible: { type: 'paie', date: deux[0].paie.dateOrigine } });
  }
  if (passees > 0) {
    points.push({ cle: 'a-verifier-passees', texte: `${pluriel(passees, 'élément', 'éléments')} à vérifier dans des paies précédentes`, action: passees === 1 ? 'Le retrouver' : 'Les retrouver', cible: { type: 'aVerifierPassees' } });
  }
  let carteSignalee = false;
  for (const c of deux) {
    const echeance = c.lignes.find((l) => visible(l) && l.statut !== 'confirme' && l.montant === null && estPaiementCarte(d, l.elementId));
    if (echeance && !carteSignalee) {
      carteSignalee = true;
      points.push({
        cle: `carte-${echeance.origine}`,
        texte: `Montant de l’échéance « ${echeance.libelle} » à choisir pour le ${formaterDateCourte(dateDe(c, echeance))}`,
        action: 'Le choisir',
        cible: { type: 'paie', date: c.paie.dateOrigine, ligne: { elementId: echeance.elementId, origine: echeance.origine } },
      });
    }
    const autreManque = c.disponible === null && (c.paie.montant === null || c.lignes.some((l) => l.compte && (l.montant === null || l.couvert === null) && !estPaiementCarte(d, l.elementId)));
    if (autreManque) points.push({ cle: `manque-${c.paie.dateOrigine}`, texte: `Un montant manque pour la paie du ${formaterDateCourte(c.paie.date)}`, action: 'Le compléter', cible: { type: 'paie', date: c.paie.dateOrigine } });
  }
  const surveiller = points.slice(0, MAX_SURVEILLER);

  // Bientôt : les dépenses encore à venir des deux paies, par date.
  let reste = MAX_BIENTOT;
  let total = 0;
  const bientot: GroupeBientot[] = [];
  deux.forEach((c, i) => {
    const lignes = c.lignes
      // « À venir » selon Mes paies : sa date (ou, sans date propre, la fin de sa
      // paie) n'est pas passée. Une sortie datée d'avant aujourd'hui et non
      // confirmée est « à vérifier » : elle n'est jamais ici, jamais tenue pour
      // payée, et reste comptée dans « À surveiller » et dans sa paie.
      .filter((l) => visible(l) && l.nature === 'depense' && l.statut === 'aVenir')
      .sort((a, b) => {
        const da = a.echeance ?? c.fin;
        const db = b.echeance ?? c.fin;
        return da < db ? -1 : da > db ? 1 : 0;
      });
    total += lignes.length;
    const montrees = lignes.slice(0, reste);
    reste -= montrees.length;
    if (montrees.length > 0) {
      const titre = i === 0 && v.courant !== null ? `Paie actuelle · jusqu’au ${formaterDateCourte(c.fin)}` : `${titres[i]} · ${formaterDateCourte(c.debut)} → ${formaterDateCourte(c.fin)}`;
      bientot.push({ titre, lignes: montrees.map((l) => ligneBientot(d, c, l)) });
    }
  });
  const montrees = bientot.reduce((n, g) => n + g.lignes.length, 0);

  const debutPhrase = v.courant !== null && deux[0] ? `Ta paie actuelle va ${periode(deux[0])}.` : deux[0] ? `Ta première paie arrive le ${jourEtMois(deux[0].paie.date)}.` : '';
  const finPhrase =
    surveiller.length === 0
      ? 'Tout est en ordre : rien ne t’attend pour l’instant.'
      : surveiller.length === 1
        ? 'Un point mérite un coup d’œil, juste en dessous.'
        : `${surveiller.length} points méritent un coup d’œil, juste en dessous.`;

  return { jourSemaine: semaine, jourMois, phrase: `${debutPhrase} ${finPhrase}`.trim(), paies, surveiller, bientot, autresBientot: total - montrees };
}
