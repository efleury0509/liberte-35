// Étape 4b — D : voir les paies suivantes, sans calendrier illimité.

import { describe, expect, it } from 'vitest';
import { cyclesAffiches, NOMBRE_CYCLES } from '../src/actions/elements';
import { ELEMENTS_ETAPE4, PROFIL_ETAPE4 } from '../src/exemple/scenarioEtape4';
import { planifier } from '../src/noyau/cycles';
import { dateCivile as d } from '../src/noyau/dates';

const jour = d('2027-02-10');

describe('D — paies suivantes', () => {
  it('par défaut : le cycle actuel et les 12 suivants', () => {
    const { cycles, courant } = cyclesAffiches(PROFIL_ETAPE4, { elements: ELEMENTS_ETAPE4 }, jour);
    expect(cycles).toHaveLength(NOMBRE_CYCLES);
    expect(cycles[0]?.debut).toBe('2027-02-04');
    expect(courant).toBe('2027-02-04');
  });

  it('D1 : deux clics donnent 39 cycles ; les cycles 27 à 39 sont ceux d’un calcul qui part directement de leur date', () => {
    const { cycles } = cyclesAffiches(PROFIL_ETAPE4, { elements: ELEMENTS_ETAPE4 }, jour, 3 * NOMBRE_CYCLES);
    expect(cycles).toHaveLength(39);
    const fin = cycles.slice(26);
    const direct = planifier({ profil: PROFIL_ETAPE4, elements: ELEMENTS_ETAPE4 }, fin[0]!.debut, fin.at(-1)!.debut).cycles;
    expect(direct).toEqual(fin);
    // Le mois à trois paies de septembre 2027 est dans la fenêtre.
    const debuts = cycles.map((c) => c.debut);
    expect(debuts).toEqual(expect.arrayContaining(['2027-09-02', '2027-09-16', '2027-09-30']));
    // A8 : la 3e paie de septembre ne reçoit pas l'épicerie (1re paie du mois).
    const septembre30 = cycles.find((c) => c.debut === '2027-09-30')!;
    expect(septembre30.lignes.map((l) => l.elementId)).not.toContain('epicerie');
    expect(cycles.find((c) => c.debut === '2027-09-02')!.lignes.map((l) => l.elementId)).toContain('epicerie');
  });

  it('une paie hebdomadaire : 39 cycles consécutifs, sans trou', () => {
    const profil = { frequence: { type: 'hebdomadaire' as const, depart: d('2027-01-04') }, montants: PROFIL_ETAPE4.montants };
    const { cycles } = cyclesAffiches(profil, {}, jour, 39);
    expect(cycles).toHaveLength(39);
    cycles.slice(1).forEach((c, i) => expect(c.debut > cycles[i]!.fin).toBe(true));
  });
});
