// Contre-vérification de l'étape 4 : 300 plans aléatoires (graine fixe),
// calculés indépendamment en Python (scripts/oracle_revenus.py) : autres
// revenus certains, incertains, estimés ou sans montant ; dépenses fixes,
// enveloppes, ponctuelles datées ou rattachées à un cycle ; suspensions,
// fins, paies déplacées. Le moteur doit trouver exactement les mêmes lignes,
// revenus, sorties, disponibles, estimations et montants non comptés.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { versElementNoyau } from '../../src/actions/elementsStockes';
import { planifier } from '../../src/noyau/cycles';
import { dateCivile as d } from '../../src/noyau/dates';
import type { ExceptionPaie, ProfilPaie } from '../../src/noyau/paie';

/* eslint-disable @typescript-eslint/no-explicit-any */
const cas: any[] = JSON.parse(readFileSync('tests/noyau/oracle-revenus.json', 'utf8'));

describe('Contre-vérification des revenus et dépenses par un calcul indépendant', () => {
  it('300 plans identiques au calcul Python', () => {
    expect(cas).toHaveLength(300);
    const ecarts: string[] = [];
    cas.forEach((c, i) => {
      const profil: ProfilPaie = {
        frequence: { ...c.profil.frequence, depart: d(c.profil.frequence.depart) },
        montants: c.profil.montants.map((m: any) => ({ aPartirDu: d(m.aPartirDu), montant: m.montant })),
      };
      const exceptions: ExceptionPaie[] = c.exceptions.map((e: any) => ({ dateOrigine: d(e.dateOrigine), dateReelle: d(e.dateReelle) }));
      const plan = planifier({ profil, exceptions, elements: c.elements.map(versElementNoyau) }, d('2027-01-01'), d('2027-09-30'));
      const obtenu = plan.cycles.map((cy) => ({
        origine: cy.paie.dateOrigine,
        lignes: cy.lignes.map((l) => (l.echeance ? `${l.elementId}@${l.echeance}` : l.elementId)).sort(),
        revenus: cy.revenus,
        sorties: cy.sorties,
        disponible: cy.disponible,
        estimation: cy.estimation,
        nonComptes: cy.nonComptes,
      }));
      if (JSON.stringify(obtenu) !== JSON.stringify(c.attendu)) ecarts.push(`plan ${i}`);
    });
    expect(ecarts).toEqual([]);
  });
});
