// Conséquences d'une liste de changements, avant de l'enregistrer
// (cahier 14.2, décisions A11 et C de l'étape 4b).
//
// Toute action prépare ses changements ; l'analyse dit ce qu'ils feraient :
// - les cycles affichés dont le disponible planifié changerait ;
// - si des cycles PASSÉS changeraient ;
// - les éléments à date fixe qui changeraient de paie (A11) ;
// - les ajustements d'occurrence qui ne correspondraient plus à rien.
// L'aperçu ne s'affiche que si l'une de ces protections joue (C).

import { appliquerChangements } from '../lib/appliquer';
import type { AjustementStocke, ChangementPaie, DonneesPaie } from '../lib/plateforme';
import { ajustementsOrphelins, comparerRattachements, planifier, type ChangementRattachement, type Cycle } from '../noyau/cycles';
import { ajouterJours, formaterDateCourte, type DateCivile } from '../noyau/dates';
import { paiesEntre, type ProfilPaie } from '../noyau/paie';
import { montantOuACompleter, versNoyau, type DonneesNoyau } from './paie';

export const NOMBRE_CYCLES = 13;

/**
 * Cycles affichés : le cycle actuel et les suivants (13 par défaut ; « Voir
 * les paies suivantes » en ajoute 13 à chaque fois). On ne calcule que la
 * fenêtre affichée : aucun calendrier illimité.
 */
export function cyclesAffiches(
  profil: ProfilPaie,
  entree: Omit<Parameters<typeof planifier>[0], 'profil'>,
  jour: DateCivile,
  nombre: number = NOMBRE_CYCLES,
): { plan: ReturnType<typeof planifier>; cycles: Cycle[]; courant: DateCivile | null } {
  const depart = profil.frequence.depart;
  // 0.4.3 : la première paie peut être versée avant la date de départ du
  // calendrier ; l'affichage commence alors à sa date réelle.
  const premiere = paiesEntre(profil, entree.exceptions ?? [], ajouterJours(depart, -31), ajouterJours(depart, 31))[0]?.date ?? depart;
  const debutCalendrier = premiere < depart ? premiere : depart;
  const debut = depart > jour ? debutCalendrier : ajouterJours(jour, -45);
  // Assez large pour « nombre » cycles mensuels, plus la marge du début.
  const plan = planifier({ ...entree, profil }, debut, ajouterJours(debut, 60 + nombre * 32));
  const i = Math.max(0, plan.cycles.findIndex((c) => c.fin >= jour));
  const cycles = plan.cycles.slice(i, i + nombre);
  const actuel = plan.cycles.find((c) => c.debut <= jour && c.fin >= jour);
  return { plan, cycles, courant: actuel?.paie.dateOrigine ?? null };
}

export interface Analyse {
  /** « Cycle du … : disponible planifié A → B », quatre au plus. */
  cycles: string[];
  /** Des cycles terminés avant le cycle actuel changeraient. */
  passes: boolean;
  /** Éléments à date fixe qui changeraient de paie (A11). */
  rattachements: ChangementRattachement[];
  /** Ajustements qui deviendraient orphelins avec ces changements. */
  orphelins: AjustementStocke[];
}

const MAX_CYCLES_MONTRES = 4;

const entreeDe = (n: DonneesNoyau) => ({ exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, seuil: n.seuil });

export function analyser(d: DonneesPaie, changements: readonly ChangementPaie[], jour: DateCivile): Analyse {
  const vide: Analyse = { cycles: [], passes: false, rattachements: [], orphelins: [] };
  const avant = versNoyau(d);
  const apresDonnees = appliquerChangements(d, changements);
  const apres = versNoyau(apresDonnees);
  if (!avant.profil || !apres.profil) return vide;

  // Cycles affichés (actuel et suivants).
  const vueAvant = cyclesAffiches(avant.profil, entreeDe(avant), jour);
  const vueApres = cyclesAffiches(apres.profil, entreeDe(apres), jour);
  const lignes: string[] = [];
  for (const a of vueAvant.cycles) {
    const b = vueApres.cycles.find((c) => c.paie.dateOrigine === a.paie.dateOrigine);
    if (!b || a.disponible === b.disponible) continue;
    lignes.push(
      `Cycle du ${formaterDateCourte(a.paie.date)} : disponible planifié ${montantOuACompleter(a.disponible)} → ${montantOuACompleter(b.disponible)}`,
    );
  }
  let cycles = lignes;
  if (lignes.length === 0 && vueAvant.cycles.some((c) => c.paie.montant === null)) {
    cycles = ['Le disponible planifié reste « À compléter » tant que le salaire net n’est pas indiqué.'];
  } else if (lignes.length > MAX_CYCLES_MONTRES) {
    const reste = lignes.length - MAX_CYCLES_MONTRES;
    cycles = [...lignes.slice(0, MAX_CYCLES_MONTRES), reste === 1 ? 'Et 1 autre cycle.' : `Et ${reste} autres cycles.`];
  }

  // Cycles passés : du 200e jour avant aujourd'hui à la veille du cycle actuel.
  const debutActuel = vueAvant.cycles[0]?.debut ?? jour;
  let passes = false;
  const debutPasse = ajouterJours(jour, -200);
  const finPasse = ajouterJours(debutActuel, -1);
  if (finPasse >= debutPasse) {
    const empreinte = (n: DonneesNoyau) =>
      JSON.stringify(
        planifier({ ...entreeDe(n), profil: n.profil! }, debutPasse, finPasse).cycles.map((c) => [
          c.paie.dateOrigine,
          c.paie.date,
          c.paie.montant,
          c.disponible,
          c.lignes.map((l) => [l.elementId, l.origine, l.montant, l.compte]),
        ]),
      );
    passes = empreinte(avant) !== empreinte(apres);
  }

  // A11 : rattachements des éléments à date fixe, sur le passé récent et l'avenir affiché.
  const fenetre = (n: DonneesNoyau) => planifier({ ...entreeDe(n), profil: n.profil! }, debutPasse, vueAvant.cycles.at(-1)?.debut ?? jour);
  const rattachements = comparerRattachements(fenetre(avant), fenetre(apres));

  // Ajustements qui deviendraient orphelins.
  const orph = (n: DonneesNoyau) =>
    new Set(ajustementsOrphelins({ profil: n.profil!, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements }).map((a) => `${a.elementId}|${a.origine}`));
  const deja = orph(avant);
  const nouveaux = orph(apres);
  const orphelins = (apresDonnees.ajustements ?? []).filter((a) => nouveaux.has(`${a.elementId}|${a.origine}`) && !deja.has(`${a.elementId}|${a.origine}`));

  return { cycles, passes, rattachements, orphelins };
}
