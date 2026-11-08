// Version 0.4.3 : tests de non-régression après le diagnostic du 8 novembre.
// Cas réel : la paie du 29 avril 2027 (3e paie d'avril) a été versée le
// 10 mai par une modification de paie ; elle semblait avoir disparu.
// Le calcul était juste ; on verrouille ici ce qui doit le rester, et on
// teste les corrections (aperçu obligatoire, durées de cycles, 1re paie).

import { describe, expect, it } from 'vitest';
import { cyclesAffiches } from '../src/actions/analyse';
import { proposerException, versNoyau } from '../src/actions/paie';
import { donneesVides } from '../src/lib/appliquer';
import type { DonneesPaie, ExceptionStockee } from '../src/lib/plateforme';
import { ajouterJours, dateCivile as d, type DateCivile } from '../src/noyau/dates';

const JOUR = d('2026-11-08');
const ORIGINES = Array.from({ length: 13 }, (_, i) => ajouterJours(d('2027-01-07'), 14 * i));

function donnees(exceptions: ExceptionStockee[] = []): DonneesPaie {
  return {
    ...donneesVides(),
    profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
    salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
    exceptions,
  };
}

function vue(d0: DonneesPaie, nombre?: number) {
  const n = versNoyau(d0);
  return cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, seuil: n.seuil }, JOUR, nombre);
}

const PAIE_29_AU_10_MAI: ExceptionStockee = { dateOrigine: '2027-04-29', dateReelle: '2027-05-10', montant: null };

describe('Le cas réel : paie du 29 avril versée le 10 mai', () => {
  const v = vue(donnees([PAIE_29_AU_10_MAI]));

  it('les 13 paies sont toutes affichées, celle du 29 avril comprise', () => {
    expect(v.cycles.map((c) => c.paie.dateOrigine)).toEqual(ORIGINES);
  });

  it('elle est affichée à sa date réelle, avec sa date d’origine', () => {
    const c = v.cycles.find((x) => x.paie.dateOrigine === '2027-04-29')!;
    expect(c.paie.date).toBe('2027-05-10');
    expect(c.paie.deplacee).toBe(true);
    expect([c.debut, c.fin]).toEqual(['2027-05-10', '2027-05-12']);
  });

  it('les cycles voisins ont les bonnes bornes', () => {
    const avant = v.cycles.find((x) => x.paie.dateOrigine === '2027-04-15')!;
    const apres = v.cycles.find((x) => x.paie.dateOrigine === '2027-05-13')!;
    expect([avant.debut, avant.fin]).toEqual(['2027-04-15', '2027-05-09']);
    expect([apres.debut, apres.fin]).toEqual(['2027-05-13', '2027-05-26']);
  });

  it('la mise à jour ne touche pas cette exception : les données restent telles quelles', () => {
    const d0 = donnees([PAIE_29_AU_10_MAI]);
    vue(d0);
    expect(d0.exceptions).toEqual([PAIE_29_AU_10_MAI]);
  });
});

describe('Correction 2 : déplacer une paie passe toujours par un aperçu', () => {
  const paieDe = (d0: DonneesPaie, origine: string) => vue(d0).cycles.find((c) => c.paie.dateOrigine === origine)!.paie;

  it('remettre la paie au 29 avril : aperçu, durées des cycles en clair, retour à la règle', () => {
    const d0 = donnees([PAIE_29_AU_10_MAI]);
    const p = proposerException(d0, paieDe(d0, '2027-04-29'), { dateReelle: '2027-04-29', montant: '' }, undefined, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.changements).toEqual([{ type: 'retirerException', dateOrigine: '2027-04-29' }]);
    expect(p.consequences).toContain('Cycle de la paie du 15 avr. : 25 jours → 14 jours (du 15 avr. au 28 avr.).');
    expect(p.consequences).toContain('Cycle de cette paie : 3 jours → 14 jours (du 29 avr. au 12 mai).');
  });

  it('déplacer de 2 jours, sans aucun élément touché : aperçu quand même', () => {
    const d0 = donnees();
    const p = proposerException(d0, paieDe(d0, '2027-04-15'), { dateReelle: '2027-04-16', montant: '' }, undefined, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain('Cycle de la paie du 1er avr. : 14 jours → 15 jours (du 1er avr. au 15 avr.).');
    expect(p.consequences).toContain('Cycle de cette paie : 14 jours → 13 jours (du 16 avr. au 28 avr.).');
  });

  it('changer seulement le montant d’une paie future reste direct', () => {
    const d0 = donnees();
    const p = proposerException(d0, paieDe(d0, '2027-04-15'), { dateReelle: '2027-04-15', montant: '2200' }, undefined, JOUR);
    expect(p.apercu).toBe(false);
  });
});

describe('Correction 4 : la première paie versée plus tôt reste affichée', () => {
  it('7 janvier versée le 5 janvier : le cycle commence le 5 et rien ne manque', () => {
    const v = vue(donnees([{ dateOrigine: '2027-01-07', dateReelle: '2027-01-05', montant: null }]));
    expect(v.cycles.map((c) => c.paie.dateOrigine)).toEqual(ORIGINES);
    expect([v.cycles[0]!.debut, v.cycles[0]!.fin]).toEqual(['2027-01-05', '2027-01-20']);
  });

  it('même chose quand le calendrier a commencé avant aujourd’hui', () => {
    const d0 = donnees([{ dateOrigine: '2027-01-07', dateReelle: '2027-01-05', montant: null }]);
    const n = versNoyau(d0);
    const v = cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, seuil: n.seuil }, d('2027-01-06'));
    expect(v.cycles[0]!.paie.dateOrigine).toBe('2027-01-07');
    expect(v.courant).toBe('2027-01-07');
  });
});

describe('Correction 6 : aucune paie ne sort jamais de l’affichage (mois à trois paies)', () => {
  // Graine fixe : les mêmes déplacements à chaque exécution.
  let graine = 43;
  const hasard = () => (graine = (graine * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

  it('500 calendriers avec des paies déplacées au hasard : les 13 paies, dans l’ordre, avril compris', () => {
    for (let essai = 0; essai < 500; essai++) {
      const exceptions: ExceptionStockee[] = [];
      const reelles = new Map<DateCivile, DateCivile>(ORIGINES.map((o) => [o, o]));
      for (let k = 0; k < 4; k++) {
        const i = Math.floor(hasard() * ORIGINES.length);
        const o = ORIGINES[i]!;
        const precedente = i > 0 ? reelles.get(ORIGINES[i - 1]!)! : ajouterJours(o, -14);
        const suivante = i < ORIGINES.length - 1 ? reelles.get(ORIGINES[i + 1]!)! : ajouterJours(o, 14);
        const date = ajouterJours(o, Math.floor(hasard() * 27) - 13);
        if (date <= precedente || date >= suivante) continue;
        reelles.set(o, date);
        exceptions.splice(0, exceptions.length, ...[...reelles].filter(([a, b]) => a !== b).map(([a, b]) => ({ dateOrigine: a, dateReelle: b, montant: null })));
      }
      for (const nombre of [13, 26]) {
        const v = vue(donnees(exceptions), nombre);
        const affichees = v.cycles.map((c) => c.paie.dateOrigine).slice(0, 13);
        expect(affichees, JSON.stringify(exceptions)).toEqual(ORIGINES);
        for (const c of v.cycles.slice(0, 13)) expect(c.paie.date).toBe(reelles.get(c.paie.dateOrigine));
        // Les cycles se suivent sans trou ni chevauchement.
        v.cycles.slice(1).forEach((c, i) => expect(c.debut).toBe(ajouterJours(v.cycles[i]!.fin, 1)));
        // Avril 2027 a trois paies d'origine : 1er, 15 et 29.
        expect(v.cycles.filter((c) => c.paie.dateOrigine.startsWith('2027-04')).length).toBe(3);
      }
    }
  });
});
