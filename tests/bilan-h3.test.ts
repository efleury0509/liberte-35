// H3 : mini-bilan d'une paie terminée. Données fictives ; on vérifie chaque
// total à la main, à partir de cas simples.
import { describe, expect, it } from 'vitest';
import { bilanPaie } from '../src/lib/bilan';
import { planifier, type ConfirmationOccurrence, type ElementPlanifie, type EntreePlan } from '../src/noyau/cycles';
import { dateCivile } from '../src/noyau/dates';

const d = (t: string) => dateCivile(t);
const PAIE = d('2027-01-07');
const JOUR = d('2027-02-15'); // le cycle du 7 janv. (→ 20 janv.) est terminé
const profil = (montant: number | null) => ({
  frequence: { type: 'deuxSemaines' as const, depart: PAIE },
  montants: montant === null ? [] : [{ aPartirDu: PAIE, montant }],
});
const el = (id: string, date: string, montant: number | null, extra: Partial<ElementPlanifie> = {}): ElementPlanifie => ({
  id,
  libelle: id,
  regle: { frequence: { type: 'ponctuelle', date: d(date) }, montants: montant === null ? [] : [{ aPartirDu: d('2027-01-01'), montant }] },
  ...extra,
});
const conf = (elementId: string | null, origine: string, montant: number): ConfirmationOccurrence => ({ elementId, origine: d(origine), date: JOUR, montant });

function bilan(entree: Partial<EntreePlan> & { montantPaie?: number | null }) {
  const { montantPaie = 210_000, ...reste } = entree;
  const c = planifier({ profil: profil(montantPaie), aujourdhui: JOUR, ...reste }, PAIE, PAIE).cycles[0]!;
  return { c, b: bilanPaie(c) };
}

const loyer = el('Loyer', '2027-01-15', 110_000);
const cell = el('Cellulaire', '2027-01-12', 5_500);
const epicerie = el('Épicerie', '2027-01-10', 30_000, { genre: 'enveloppe' });
const bonus = el('Bonus', '2027-01-09', 40_000, { nature: 'revenu', incertain: true });

describe('H3 — mini-bilan d’une paie terminée', () => {
  it('rien de confirmé : le prévu est complet, le confirmé reste à « 0 sur n », tout est à vérifier', () => {
    const { c, b } = bilan({ elements: [loyer, cell, epicerie] });
    expect(b.revenus).toEqual({ prevu: 210_000, confirme: 0, confirmees: 0, operations: 1 });
    expect(b.sorties).toEqual({ prevu: 115_500, confirme: 0, confirmees: 0, operations: 2 });
    expect(b.enveloppes).toEqual({ prevu: 30_000, nombre: 1 });
    expect(b.paieAVerifier).toBe(true);
    expect(b.aVerifier.map((l) => l.libelle).sort()).toEqual(['Cellulaire', 'Loyer']);
    // Même compte que le plan : la paie et les deux dépenses.
    expect(b.aVerifier.length + (b.paieAVerifier ? 1 : 0)).toBe(c.aVerifier);
  });

  it('partiellement confirmé : prévu et confirmé restent séparés, sans écart calculé', () => {
    const { b } = bilan({ elements: [loyer, cell, epicerie], confirmations: [conf(null, '2027-01-07', 205_000), conf('Loyer', '2027-01-15', 112_000)] });
    expect(b.revenus).toEqual({ prevu: 210_000, confirme: 205_000, confirmees: 1, operations: 1 });
    // Le prévu du loyer reste 1 100 $, même confirmé à 1 120 $.
    expect(b.sorties).toEqual({ prevu: 115_500, confirme: 112_000, confirmees: 1, operations: 2 });
    expect(b.paieAVerifier).toBe(false);
    expect(b.aVerifier.map((l) => l.libelle)).toEqual(['Cellulaire']);
    expect(Object.keys(b)).not.toContain('ecart');
  });

  it('un montant prévu inconnu rend le total « À compléter » (null), jamais 0', () => {
    expect(bilan({ elements: [el('Internet', '2027-01-14', null), loyer] }).b.sorties.prevu).toBeNull();
    expect(bilan({ montantPaie: null, elements: [loyer] }).b.revenus.prevu).toBeNull();
    expect(bilan({ elements: [el('Fleurs', '2027-01-14', null, { genre: 'enveloppe' })] }).b.enveloppes.prevu).toBeNull();
  });

  it('un revenu incertain n’entre pas dans le prévu ; confirmé, il entre dans le confirmé', () => {
    const avant = bilan({ elements: [bonus] }).b;
    expect(avant.revenus.prevu).toBe(210_000);
    expect(avant.nonComptes).toBe(40_000);
    expect(avant.revenus.operations).toBe(2);
    const apres = bilan({ elements: [bonus], confirmations: [conf('Bonus', '2027-01-09', 41_000)] }).b;
    expect(apres.revenus).toEqual({ prevu: 210_000, confirme: 41_000, confirmees: 1, operations: 2 });
    expect(apres.nonComptes).toBe(0);
  });

  it('une occurrence retirée cette fois n’est ni prévue ni à vérifier ; elle est seulement comptée à part', () => {
    const { b } = bilan({ elements: [loyer, cell], ajustements: [{ elementId: 'Cellulaire', origine: d('2027-01-12'), retire: true }] });
    expect(b.sorties).toEqual({ prevu: 110_000, confirme: 0, confirmees: 0, operations: 1 });
    expect(b.retirees).toBe(1);
    expect(b.aVerifier.map((l) => l.libelle)).toEqual(['Loyer']);
  });

  it('une sortie payée avec une réserve : le prévu reste le montant de la dépense, signalé une seule fois', () => {
    const { b } = bilan({ elements: [loyer], couvertures: new Map([['Loyer|2027-01-15', 50_000]]) });
    expect(b.sorties.prevu).toBe(110_000);
    expect(b.avecReserve).toBe(true);
  });

  it('sans enveloppe : prévu nul et connu ; ajusté pour cette fois : le prévu suit l’ajustement', () => {
    const { b } = bilan({ elements: [loyer], ajustements: [{ elementId: 'Loyer', origine: d('2027-01-15'), montant: 100_000 }] });
    expect(b.enveloppes).toEqual({ prevu: 0, nombre: 0 });
    expect(b.sorties.prevu).toBe(100_000);
  });
});
