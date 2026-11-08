// Dates de Liberté 35.
//
// Une « date civile » est un jour du calendrier, écrit AAAA-MM-JJ, sans heure
// ni fuseau horaire. Les calculs passent par un simple compte de jours depuis
// le 1er janvier 1970 : un changement d'heure ne peut donc jamais décaler une
// paie ou une échéance (cas D3, D4). L'objet Date de JavaScript n'est pas
// utilisé, justement parce qu'il porte une heure et un fuseau.

export type DateCivile = string & { readonly __dateCivile: unique symbol };

export class ErreurDate extends Error {}

export function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

export function joursDansLeMois(annee: number, mois: number): number {
  if (mois === 2) return estBissextile(annee) ? 29 : 28;
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

export function composer(annee: number, mois: number, jour: number): DateCivile {
  if (!Number.isInteger(annee) || annee < 1 || annee > 9999) throw new ErreurDate(`Année invalide : ${annee}`);
  if (!Number.isInteger(mois) || mois < 1 || mois > 12) throw new ErreurDate(`Mois invalide : ${mois}`);
  if (!Number.isInteger(jour) || jour < 1 || jour > joursDansLeMois(annee, mois)) {
    throw new ErreurDate(`Jour invalide : ${annee}-${mois}-${jour}`);
  }
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}` as DateCivile;
}

/** Valide un texte AAAA-MM-JJ et le transforme en date civile. */
export function dateCivile(texte: string): DateCivile {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (!m) throw new ErreurDate(`« ${texte} » n'est pas une date au format AAAA-MM-JJ.`);
  return composer(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function parties(d: DateCivile): { annee: number; mois: number; jour: number } {
  return { annee: Number(d.slice(0, 4)), mois: Number(d.slice(5, 7)), jour: Number(d.slice(8, 10)) };
}

// Algorithmes « days from civil » / « civil from days » de Howard Hinnant.
export function versNumeroDeJour(d: DateCivile): number {
  const { annee, mois, jour } = parties(d);
  const a = mois <= 2 ? annee - 1 : annee;
  const ere = Math.floor(a / 400);
  const ade = a - ere * 400;
  const jda = Math.floor((153 * (mois + (mois > 2 ? -3 : 9)) + 2) / 5) + jour - 1;
  const jde = ade * 365 + Math.floor(ade / 4) - Math.floor(ade / 100) + jda;
  return ere * 146_097 + jde - 719_468;
}

export function depuisNumeroDeJour(n: number): DateCivile {
  const z = n + 719_468;
  const ere = Math.floor(z / 146_097);
  const jde = z - ere * 146_097;
  const ade = Math.floor((jde - Math.floor(jde / 1460) + Math.floor(jde / 36_524) - Math.floor(jde / 146_096)) / 365);
  const jda = jde - (365 * ade + Math.floor(ade / 4) - Math.floor(ade / 100));
  const mp = Math.floor((5 * jda + 2) / 153);
  const jour = jda - Math.floor((153 * mp + 2) / 5) + 1;
  const mois = mp < 10 ? mp + 3 : mp - 9;
  const annee = ade + ere * 400 + (mois <= 2 ? 1 : 0);
  return composer(annee, mois, jour);
}

export function ajouterJours(d: DateCivile, n: number): DateCivile {
  if (!Number.isInteger(n)) throw new ErreurDate('Le nombre de jours doit être entier.');
  return depuisNumeroDeJour(versNumeroDeJour(d) + n);
}

export function ecartEnJours(de: DateCivile, a: DateCivile): number {
  return versNumeroDeJour(a) - versNumeroDeJour(de);
}

/**
 * Ajoute des mois. Le jour visé (par défaut celui de la date) est ramené au
 * dernier jour du mois s'il n'existe pas : 31 janvier + 1 mois = 28 février.
 * En repartant toujours du jour visé, on évite tout glissement (cas R9, R17).
 */
export function ajouterMois(d: DateCivile, n: number, jourVise?: number): DateCivile {
  if (!Number.isInteger(n)) throw new ErreurDate('Le nombre de mois doit être entier.');
  const { annee, mois, jour } = parties(d);
  const index = annee * 12 + (mois - 1) + n;
  const nouvelleAnnee = Math.floor(index / 12);
  const nouveauMois = (index % 12) + 1;
  const vise = jourVise ?? jour;
  return composer(nouvelleAnnee, nouveauMois, Math.min(vise, joursDansLeMois(nouvelleAnnee, nouveauMois)));
}

export function plusTot(a: DateCivile, b: DateCivile): DateCivile {
  return a <= b ? a : b;
}

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
const MOIS_LONGS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;
const MOIS_COURTS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
] as const;

export function jourDeLaSemaine(d: DateCivile): (typeof JOURS)[number] {
  // Le 1er janvier 1970 (jour 0) était un jeudi (index 3).
  const index = (((versNumeroDeJour(d) + 3) % 7) + 7) % 7;
  return JOURS[index] ?? 'lundi';
}

function jourEcrit(jour: number): string {
  return jour === 1 ? '1er' : String(jour);
}

/** « jeudi 7 janvier 2027 », « vendredi 1er janvier 2027 » */
export function formaterDateLongue(d: DateCivile): string {
  const { annee, mois, jour } = parties(d);
  return `${jourDeLaSemaine(d)} ${jourEcrit(jour)} ${MOIS_LONGS[mois - 1]} ${annee}`;
}

/** « 30 sept. », « 1er avr. » */
export function formaterDateCourte(d: DateCivile): string {
  const { mois, jour } = parties(d);
  return `${jourEcrit(jour)} ${MOIS_COURTS[mois - 1]}`;
}
