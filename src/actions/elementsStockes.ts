// Conversion d'un revenu ou d'une dépense enregistré vers le noyau.
// Séparé des actions pour que « paie.ts » puisse l'utiliser sans dépendance
// circulaire.

import type { AjustementOccurrence, ElementPlanifie } from '../noyau/cycles';
import { dateCivile } from '../noyau/dates';
import type { Frequence } from '../noyau/frequences';
import type { Regle } from '../noyau/regles';
import type { AjustementStocke, ElementStocke } from '../lib/plateforme';

export function versFrequenceNoyau(f: ElementStocke['frequence']): Frequence {
  const copie: Record<string, unknown> = { ...f };
  if (typeof f['depart'] === 'string') copie['depart'] = dateCivile(f['depart']);
  if (typeof f['date'] === 'string') copie['date'] = dateCivile(f['date']);
  return copie as unknown as Frequence;
}

export function versElementNoyau(e: ElementStocke): ElementPlanifie {
  const regle: Regle = {
    frequence: versFrequenceNoyau(e.frequence),
    montants: e.montants.map((m) => ({ aPartirDu: dateCivile(m.aPartirDu), montant: m.montant })),
    ...(e.suspensions.length > 0
      ? { suspensions: e.suspensions.map((s) => ({ debut: dateCivile(s.debut), fin: dateCivile(s.fin) })) }
      : {}),
    ...(e.fin ? { fin: dateCivile(e.fin) } : {}),
    ...((e.changementsFrequence ?? []).length > 0
      ? {
          changements: e.changementsFrequence.map((p) => ({ aPartirDu: dateCivile(p.aPartirDu), frequence: versFrequenceNoyau(p.frequence) })),
        }
      : {}),
  };
  return {
    id: e.id,
    libelle: e.libelle,
    regle,
    nature: e.nature,
    genre: e.genre,
    ...(e.incertain ? { incertain: true } : {}),
    ...(e.estimation ? { estimation: true } : {}),
    ...(e.cyclePaie ? { cyclePaie: dateCivile(e.cyclePaie) } : {}),
  };
}

/** Inverse : un élément du noyau (par exemple de l'exemple fictif) au format stocké. */
export function versElementStocke(e: ElementPlanifie): ElementStocke {
  return {
    id: e.id,
    libelle: e.libelle,
    nature: e.nature ?? 'depense',
    genre: e.genre ?? 'fixe',
    incertain: e.incertain ?? false,
    estimation: e.estimation ?? false,
    frequence: { ...e.regle.frequence },
    montants: e.regle.montants.map((m) => ({ aPartirDu: m.aPartirDu, montant: m.montant })),
    suspensions: (e.regle.suspensions ?? []).map((s) => ({ debut: s.debut, fin: s.fin })),
    fin: e.regle.fin ?? null,
    cyclePaie: e.cyclePaie ?? null,
    changementsFrequence: (e.regle.changements ?? []).map((p) => ({ aPartirDu: p.aPartirDu, frequence: { ...p.frequence } })),
  };
}

export function versAjustementNoyau(a: AjustementStocke): AjustementOccurrence {
  return {
    elementId: a.elementId,
    origine: dateCivile(a.origine),
    ...(a.montant !== null ? { montant: a.montant } : {}),
    ...(a.date !== null ? { date: dateCivile(a.date) } : {}),
    ...(a.paieOrigine !== null ? { paieOrigine: dateCivile(a.paieOrigine) } : {}),
    ...(a.retire ? { retire: true } : {}),
  };
}
