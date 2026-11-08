// Contre-vérification de l'étape 3 : 300 plans de paie aléatoires (graine
// fixe), calculés indépendamment en Python (scripts/oracle_cycles.py) :
// quatre fréquences, paies déplacées, montants modifiés, hausse de salaire,
// éléments à date fixe et liés à la paie. Le moteur doit trouver exactement
// les mêmes cycles, rattachements et disponibles.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planifier, type ElementPlanifie } from '../../src/noyau/cycles';
import { dateCivile as d } from '../../src/noyau/dates';
import type { ExceptionPaie, ProfilPaie } from '../../src/noyau/paie';

/* eslint-disable @typescript-eslint/no-explicit-any */
const cas: any[] = JSON.parse(readFileSync('tests/noyau/oracle-cycles.json', 'utf8'));

function element(e: any): ElementPlanifie {
  const montants = [{ aPartirDu: d('2026-01-01'), montant: e.montant }];
  if (e.type === 'fixe') {
    const jour = String(e.jour).padStart(2, '0');
    const depart = e.jour > 28 ? d(e.jour === 29 ? '2026-01-29' : e.jour === 30 ? '2026-01-30' : '2026-01-31') : d(`2026-01-${jour}`);
    return { id: e.id, libelle: e.id, regle: { frequence: { type: 'mois', n: 1, depart }, montants } };
  }
  if (e.type === 'chaquePaie') return { id: e.id, libelle: e.id, regle: { frequence: { type: 'chaquePaie' }, montants } };
  return { id: e.id, libelle: e.id, regle: { frequence: { type: 'rangPaie', rang: e.rang }, montants } };
}

describe('Contre-vérification des cycles par un calcul indépendant', () => {
  it('300 plans de paie identiques au calcul Python', () => {
    expect(cas).toHaveLength(300);
    const ecarts: string[] = [];
    cas.forEach((c, i) => {
      const profil: ProfilPaie = {
        frequence: { ...c.profil.frequence, depart: d(c.profil.frequence.depart) },
        montants: c.profil.montants.map((m: any) => ({ aPartirDu: d(m.aPartirDu), montant: m.montant })),
      };
      const exceptions: ExceptionPaie[] = c.exceptions.map((e: any) => ({
        dateOrigine: d(e.dateOrigine),
        ...(e.dateReelle ? { dateReelle: d(e.dateReelle) } : {}),
        ...(e.montant !== undefined ? { montant: e.montant } : {}),
      }));
      const plan = planifier({ profil, exceptions, elements: c.elements.map(element) }, d('2027-01-01'), d('2027-12-31'));
      const obtenu = plan.cycles.map((cy) => ({
        origine: cy.paie.dateOrigine,
        debut: cy.debut,
        fin: cy.fin,
        paie: cy.paie.montant,
        lignes: cy.lignes.map((l) => (l.echeance ? `${l.elementId}@${l.echeance}` : l.elementId)).sort(),
        disponible: cy.disponible,
      }));
      if (JSON.stringify(obtenu) !== JSON.stringify(c.attendu)) ecarts.push(`plan ${i} (${c.profil.frequence.type})`);
    });
    expect(ecarts).toEqual([]);
  });
});
