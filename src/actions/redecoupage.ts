// H4 : ce qu'un nouveau calendrier de paie ferait aux paies PASSÉES.
// Le calendrier n'a pas d'historique « à partir du » (reporté) : un
// changement recalcule tout le calendrier. On compte donc, avant
// d'enregistrer, les paies passées dont la période change et les opérations
// passées qui changeraient de paie. Rien n'est modifié ici.
import { planifier, type Cycle } from '../noyau/cycles';
import { ajouterJours, type DateCivile } from '../noyau/dates';
import { debutDuCalendrier, type ProfilPaie } from '../noyau/paie';
import type { DonneesNoyau } from './paie';

export interface Redecoupage {
  /** Paies passées dont la période (début → fin) n'existe plus telle quelle. */
  periodes: number;
  /** Opérations des paies passées qui changeraient de paie (ou seraient recalculées). */
  operations: number;
  /** Parmi elles, les opérations confirmées : leur confirmation est gardée. */
  confirmees: number;
}

function passees(n: DonneesNoyau, profil: ProfilPaie, debut: DateCivile, jour: DateCivile): Cycle[] {
  const fin = ajouterJours(jour, -1);
  if (fin < debut) return [];
  return planifier(
    { profil, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, couvertures: n.couvertures, aujourdhui: jour },
    debut,
    fin,
  ).cycles.filter((c) => c.fin < jour);
}

/** Compare les paies passées avant et après un changement de calendrier. Peut lever une erreur : l'appelant bloque alors l'enregistrement. */
export function redecoupage(avant: DonneesNoyau, apres: DonneesNoyau, jour: DateCivile): Redecoupage {
  if (!avant.profil || !apres.profil) return { periodes: 0, operations: 0, confirmees: 0 };
  const a = debutDuCalendrier(avant.profil, avant.exceptions);
  const b = debutDuCalendrier(apres.profil, apres.exceptions);
  const debut = a < b ? a : b;
  const cyclesAvant = passees(avant, avant.profil, debut, jour);
  const cyclesApres = passees(apres, apres.profil, debut, jour);

  const periode = (c: Cycle) => `${c.debut}|${c.fin}`;
  const periodesApres = new Set(cyclesApres.map(periode));
  const periodes = cyclesAvant.filter((c) => !periodesApres.has(periode(c))).length;

  // Où tombe chaque opération passée : la période de sa paie.
  const placement = (cycles: Cycle[]) => {
    const m = new Map<string, string>();
    for (const c of cycles) for (const l of c.lignes) m.set(`${l.elementId}|${l.origine}`, periode(c));
    return m;
  };
  const pa = placement(cyclesAvant);
  const pb = placement(cyclesApres);
  let operations = 0;
  let confirmees = 0;
  for (const c of cyclesAvant) {
    for (const l of c.lignes) {
      const cle = `${l.elementId}|${l.origine}`;
      if (pb.get(cle) !== pa.get(cle)) {
        operations += 1;
        if (l.statut === 'confirme') confirmees += 1;
      }
    }
  }
  return { periodes, operations, confirmees };
}
