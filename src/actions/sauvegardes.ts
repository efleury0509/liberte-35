// Étape 6 : textes de Paramètres → Sauvegardes. Aucun calcul financier :
// on met en mots ce que le stockage a vérifié.

import { ajouterJours, composer, formaterDateCourte, type DateCivile } from '../noyau/dates';
import type { ApercuRestauration, CopieListee, EtatSauvegardes, ExportEnregistre, ResumeCopie } from '../lib/plateforme';

/** Date et heure locales d'un horodatage UTC. */
export type PartiesLocales = (iso: string) => { date: DateCivile; heure: number; minute: number };

/** Fuseau de l'ordinateur (Windows) : à 21 h à Montréal, on est encore aujourd'hui. */
export const partiesLocales: PartiesLocales = (iso) => {
  const d = new Date(iso);
  return { date: composer(d.getFullYear(), d.getMonth() + 1, d.getDate()), heure: d.getHours(), minute: d.getMinutes() };
};

const heureEcrite = (h: number, m: number) => `${h} h ${String(m).padStart(2, '0')}`;

function jourEcrit(date: DateCivile, jour: DateCivile, majuscule = false): string {
  if (date === jour) return majuscule ? 'Aujourd’hui' : 'aujourd’hui';
  if (date === ajouterJours(jour, -1)) return majuscule ? 'Hier' : 'hier';
  const court = formaterDateCourte(date);
  return date.slice(0, 4) === jour.slice(0, 4) ? court : `${court} ${date.slice(0, 4)}`;
}

/** « aujourd’hui à 16 h 32 », « hier à 9 h 05 », « 31 oct. à 21 h 40 ». */
export function libelleMoment(iso: string, jour: DateCivile, local: PartiesLocales = partiesLocales): string {
  const p = local(iso);
  return `${jourEcrit(p.date, jour)} à ${heureEcrite(p.heure, p.minute)}`;
}

/** Avec « du » devant : « d’aujourd’hui à… », « du 20 oct. à… ». */
function duMoment(iso: string, jour: DateCivile, local: PartiesLocales): string {
  const m = libelleMoment(iso, jour, local);
  return m.startsWith('aujourd’hui') ? `d’${m}` : `du ${m}`;
}

export function texteDerniereCopie(
  e: Pick<EtatSauvegardes, 'derniereCopie' | 'erreur' | 'enAttente'>,
  jour: DateCivile,
  local: PartiesLocales = partiesLocales,
): string {
  if (!e.derniereCopie) return 'Aucune copie pour l’instant : elle sera faite quelques secondes après ton prochain changement.';
  return `Dernière copie : ${libelleMoment(e.derniereCopie.horodatage, jour, local)}, vérifiée.`;
}

const nombre = (n: number, un: string, plusieurs: string, aucun: string) => (n === 0 ? aucun : `${n} ${n === 1 ? un : plusieurs}`);

/** « 3 éléments · 4 confirmations · 12 changements au journal » */
export function resumeTexte(r: ResumeCopie): string {
  const morceaux = [
    nombre(r.elements, 'élément', 'éléments', 'aucun élément'),
    nombre(r.confirmations, 'confirmation', 'confirmations', 'aucune confirmation'),
    nombre(r.entreesJournal, 'changement au journal', 'changements au journal', 'aucun changement au journal'),
  ];
  if (!r.paieConfiguree) morceaux.unshift('paie pas encore configurée');
  return morceaux.join(' · ');
}

export function libelleCopie(c: CopieListee, jour: DateCivile, local: PartiesLocales = partiesLocales): string {
  const p = local(c.horodatage);
  if (c.source.genre === 'jour' && c.jour) {
    const j = c.jour as DateCivile;
    const titre = j === jour ? 'Aujourd’hui' : `Journée du ${jourEcrit(j, jour)}`;
    return `${titre} — à jour à ${heureEcrite(p.heure, p.minute)}`;
  }
  if (c.motif === 'restauration') return `Avant la restauration ${duMoment(c.horodatage, jour, local)}`;
  if (c.motif === 'miseANiveau') return `Avant la mise à niveau de la structure ${duMoment(c.horodatage, jour, local)}`;
  return `Copie de précaution ${duMoment(c.horodatage, jour, local)}`;
}

export function titreApercu(a: ApercuRestauration, jour: DateCivile, local: PartiesLocales = partiesLocales): string {
  if (a.source.genre === 'jour') {
    const j = a.nom.slice(5, 15) as DateCivile;
    const p = local(a.horodatage);
    return `Restaurer la copie du ${jourEcrit(j, jour)} (à jour à ${heureEcrite(p.heure, p.minute)})`;
  }
  if (a.source.genre === 'precaution') return `Restaurer la copie de précaution ${duMoment(a.horodatage, jour, local)}`;
  return `Restaurer « ${a.nom} »`;
}

export interface LignesApercu {
  contenu: string;
  intro: string;
  retires: string[];
  suite: string | null;
  notes: string[];
}

export function lignesApercu(a: ApercuRestauration): LignesApercu {
  const n = a.nombreRetires;
  const intro =
    n === 0
      ? 'Aucun changement fait depuis cette copie ne sera retiré.'
      : n === 1
        ? 'Depuis cette copie, 1 changement a été fait. Il sera retiré :'
        : `Depuis cette copie, ${n} changements ont été faits. Ils seront retirés :`;
  const reste = n - a.retires.length;
  const notes: string[] = [];
  if (a.nombreRetrouves === 1) notes.push('1 changement absent aujourd’hui reviendra.');
  if (a.nombreRetrouves > 1) notes.push(`${a.nombreRetrouves} changements absents aujourd’hui reviendront.`);
  if (a.miseANiveau) {
    notes.push(`Cette copie vient d’une structure plus ancienne (${a.versionSchema}) : elle sera mise à niveau, avec sa propre copie de précaution.`);
  }
  notes.push('Une copie de l’état actuel sera gardée dans les copies de précaution : tu pourras revenir en arrière.');
  return {
    contenu: `Elle contient : ${resumeTexte(a.resume)}.`,
    intro,
    retires: a.retires.map((r) => `${r.objet} — ${r.champ}`),
    suite: reste <= 0 ? null : reste === 1 ? '… et 1 autre.' : `… et ${reste} autres.`,
    notes,
  };
}

export function messageExport(e: ExportEnregistre): string {
  const base = `Export enregistré : ${e.chemin}`;
  return e.vide ? `${base}. Il ne contient que les en-têtes : aucune donnée pour l’instant.` : base;
}
