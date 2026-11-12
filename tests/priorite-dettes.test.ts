// Lot 1 : priorité de remboursement, choisie à la main. Un repère : aucun
// paiement, aucune prévision, aucun solde ne change. Données fictives.
import { describe, expect, it } from 'vitest';
import { dettesParPriorite, prioriteActive, proposerPrioriteDettes, rangPriorite } from '../src/actions/priorite';
import { ErreurSaisie } from '../src/actions/paie';
import { appliquerChangements, inverser } from '../src/lib/appliquer';
import type { DonneesPaie, ElementStocke, PretStocke } from '../src/lib/plateforme';

const element = (id: string, libelle: string): ElementStocke =>
  ({ id, libelle, nature: 'depense', genre: 'fixe', incertain: false, estimation: false, frequence: { type: 'chaquePaie' }, montants: [{ aPartirDu: '2027-01-07', montant: 20_500 }], suspensions: [], fin: null, cyclePaie: null, changementsFrequence: [] }) as ElementStocke;
const pret = (id: string, rembourseLe: string | null = null): PretStocke => ({ id, minimum: null, echeanceFinale: null, taux: null, rembourseLe, soldes: [] });

function donnees(): DonneesPaie {
  return {
    profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
    salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
    exceptions: [],
    seuil: null,
    elements: [element('auto', 'Prêt auto (fictif)'), element('perso', 'Prêt perso (fictif)'), element('visa', 'Visa (fictive)')],
    ajustements: [],
    confirmations: [],
    prets: [pret('auto'), pret('perso')],
    cartes: [{ id: 'visa', limite: null, taux: null, objectif: null, releves: [], soldes: [], frais: [], supplements: [] }],
    comptes: [],
  };
}

describe('Lot 1 — priorité de remboursement', () => {
  it('sans choix, aucune priorité n’est inventée', () => {
    const d = donnees();
    expect(rangPriorite(d, 'auto')).toBeNull();
    expect(dettesParPriorite(d).map((x) => [x.id, x.rang])).toEqual([
      ['auto', null],
      ['perso', null],
      ['visa', null],
    ]);
  });

  it('un ordre choisi à la main est gardé, sans aucun autre changement', () => {
    const d = donnees();
    const p = proposerPrioriteDettes(d, ['visa', 'perso', 'auto']);
    expect(p.apercu).toBe(false);
    expect(p.changements).toEqual([{ type: 'definirPrioriteDettes', ordre: ['visa', 'perso', 'auto'] }]);
    const apres = appliquerChangements(d, p.changements);
    expect(rangPriorite(apres, 'visa')).toBe(1);
    expect(rangPriorite(apres, 'auto')).toBe(3);
    const { prioriteDettes: _, ...reste } = apres;
    expect(reste).toEqual(donnees());
    // « Annuler » remet exactement l'état d'avant.
    expect(appliquerChangements(apres, inverser(d, p.changements)).prioriteDettes).toEqual([]);
  });

  it('un classement partiel : les dettes non classées restent « sans priorité »', () => {
    const d = appliquerChangements(donnees(), proposerPrioriteDettes(donnees(), ['perso']).changements);
    expect(dettesParPriorite(d).map((x) => [x.id, x.rang])).toEqual([
      ['perso', 1],
      ['auto', null],
      ['visa', null],
    ]);
  });

  it('une dette remboursée sort de l’ordre ; les rangs se resserrent', () => {
    const d = appliquerChangements(donnees(), proposerPrioriteDettes(donnees(), ['auto', 'perso']).changements);
    d.prets = [pret('auto', '2027-03-01'), pret('perso')];
    expect(prioriteActive(d)).toEqual(['perso']);
    expect(rangPriorite(d, 'perso')).toBe(1);
  });

  it('refus : doublon, dette inconnue, rien qui change ; retirer les priorités', () => {
    const d = donnees();
    expect(() => proposerPrioriteDettes(d, ['auto', 'auto'])).toThrow(ErreurSaisie);
    expect(() => proposerPrioriteDettes(d, ['fantome'])).toThrow(ErreurSaisie);
    expect(() => proposerPrioriteDettes(d, [])).toThrow('Rien ne change.');
    expect(() => appliquerChangements(d, [{ type: 'definirPrioriteDettes', ordre: ['fantome'] }])).toThrow();
    const avec = appliquerChangements(d, proposerPrioriteDettes(d, ['auto']).changements);
    expect(appliquerChangements(avec, proposerPrioriteDettes(avec, []).changements).prioriteDettes).toEqual([]);
  });
});
