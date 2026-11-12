// H4 : toute modification de règle qui touche une paie passée passe par un
// aperçu, quelle que soit son ancienneté ; si ses conséquences ne peuvent pas
// être calculées, rien n'est enregistré. Données fictives seulement.
import { describe, expect, it } from 'vitest';
import { CONSEQUENCES_INCONNUES, finaliser, proposerCertitude, proposerFin, proposerMontant, proposerSuppression, proposerSuspension } from '../src/actions/elements';
import { versElementStocke } from '../src/actions/elementsStockes';
import { ErreurSaisie, proposerProfil, proposerSeuil, versNoyau } from '../src/actions/paie';
import { redecoupage } from '../src/actions/redecoupage';
import { appliquerChangements } from '../src/lib/appliquer';
import type { ConfirmationStockee, DonneesPaie } from '../src/lib/plateforme';
import { planifier, type ElementPlanifie } from '../src/noyau/cycles';
import { dateCivile as d } from '../src/noyau/dates';

const mensuel = (id: string, depart: string, montant: number, extra: Partial<ElementPlanifie> = {}): ElementPlanifie => ({
  id,
  libelle: id,
  regle: { frequence: { type: 'mois', n: 1, depart: d(depart) }, montants: [{ aPartirDu: d(depart), montant }] },
  ...extra,
});

function donnees(depart: string, elements: ElementPlanifie[], confirmations: ConfirmationStockee[] = []): DonneesPaie {
  return {
    profil: { frequence: 'deuxSemaines', depart, jours: null },
    salaires: [{ aPartirDu: depart, montant: 210_000 }],
    exceptions: [],
    seuil: null,
    elements: elements.map(versElementStocke),
    ajustements: [],
    confirmations,
    prets: [],
    cartes: [],
    comptes: [],
  };
}

// Aujourd'hui : 10 juin 2027 ; calendrier depuis le 2 janv. 2025.
const JOUR = d('2027-06-10');
const gym = mensuel('Gym', '2025-01-05', 4_000);
const prime = mensuel('Prime', '2025-01-20', 30_000, { nature: 'revenu' });
const base = () => donnees('2025-01-02', [gym, prime]);
const PASSE = /^Attention : des cycles déjà passés changeraient \(.*2025\)\.$/;

describe('H4 — aperçu obligatoire pour une paie passée de plus de 200 jours', () => {
  it('suspension en février 2025 (plus de deux ans) : aperçu, et la paie touchée est nommée', () => {
    const p = proposerSuspension(base(), 'Gym', '2025-02-01', '2025-02-28', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences[0]).toBe('Attention : des cycles déjà passés changeraient (la paie du jeudi 30 janvier 2025).');
  });

  it('fin, montant et certitude datés dans un passé lointain : aperçu', () => {
    expect(proposerFin(base(), 'Gym', '2025-03-05', JOUR).apercu).toBe(true);
    const montant = proposerMontant(base(), 'Gym', '2025-03-01', '45', JOUR);
    expect(montant.apercu).toBe(true);
    expect(montant.consequences[0]).toMatch(PASSE);
    const certitude = proposerCertitude(base(), 'Prime', true, JOUR);
    expect(certitude.apercu).toBe(true);
    expect(certitude.consequences[0]).toMatch(/^Attention : des cycles déjà passés changeraient \(\d+ paies passées, depuis celle du .* 2025\)\.$/);
  });

  it('une modification seulement future reste directe ; le seuil d’attention aussi', () => {
    expect(proposerMontant(base(), 'Gym', '2027-08-01', '45', JOUR).apercu).toBe(false);
    expect(proposerSeuil(base(), '500').apercu).toBe(false);
  });

  it('préparer un aperçu ne modifie rien : abandonner laisse les données identiques', () => {
    const dd = base();
    const avant = JSON.stringify(dd);
    proposerSuspension(dd, 'Gym', '2025-02-01', '2025-02-28', JOUR);
    proposerSuppression(dd, 'Gym', JOUR);
    expect(JSON.stringify(dd)).toBe(avant);
  });

  it('les confirmations et les montants connus sont préservés', () => {
    const conf: ConfirmationStockee = { elementId: 'Gym', origine: '2025-04-05', date: '2025-04-05', montant: 4_200 };
    const dd = donnees('2025-01-02', [gym, prime], [conf]);
    const p = proposerMontant(dd, 'Gym', '2025-03-01', '45', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain('1 opération confirmée garde son montant confirmé.');
    const n = versNoyau(appliquerChangements(dd, p.changements));
    const ligne = planifier({ profil: n.profil!, elements: n.elements, confirmations: n.confirmations }, d('2025-03-27'), d('2025-04-24'))
      .cycles.flatMap((c) => c.lignes)
      .find((l) => l.elementId === 'Gym' && l.origine === '2025-04-05')!;
    expect(ligne.montant).toBe(4_200);
    expect(ligne.montantPrevu).toBe(4_500);
    // Une suspension qui effacerait la confirmation reste refusée.
    expect(() => proposerSuspension(dd, 'Gym', '2025-04-01', '2025-04-30', JOUR)).toThrow(ErreurSaisie);
  });

  it('si les conséquences ne peuvent pas être calculées, l’enregistrement est bloqué', () => {
    const dd = base();
    const casse = { ...dd.elements[0]!, montants: [{ aPartirDu: '2025-01-05', montant: 40.5 }] };
    expect(() =>
      finaliser(dd, { titre: 'Test', lignes: [], changements: [{ type: 'definirElement', element: casse }], journal: [] }, JOUR),
    ).toThrow(CONSEQUENCES_INCONNUES);
  });
});

describe('H4 — calendrier de paie : le redécoupage du passé est chiffré', () => {
  // Aujourd'hui : 10 juin 2026 ; paies aux deux semaines depuis le 1er janv. 2026 ;
  // loyer le 15 de chaque mois, celui de février confirmé.
  const J = d('2026-06-10');
  const loyer = mensuel('Loyer', '2026-01-15', 110_000);
  const dd = () => donnees('2026-01-01', [loyer], [{ elementId: 'Loyer', origine: '2026-02-15', date: '2026-02-16', montant: 110_000 }]);

  it('passer au mensuel : 11 paies passées changent de période, 5 loyers changent de paie, la confirmation est gardée', () => {
    const p = proposerProfil(dd(), { frequence: 'mensuelle', depart: '2026-01-01' }, J);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain(
      'Attention : ce changement redécoupe tes paies passées. 11 paies passées changent de période ; 5 opérations passées changent de paie (dont 1 confirmée : sa confirmation est gardée).',
    );
    const apres = appliquerChangements(dd(), p.changements);
    expect(apres.confirmations).toEqual(dd().confirmations);
  });

  it('le même calendrier : rien ne change dans le passé, et c’est dit', () => {
    const p = proposerProfil(dd(), { frequence: 'deuxSemaines', depart: '2026-01-01' }, J);
    expect(p.consequences).toContain('Les paies passées gardent leurs périodes et leurs opérations.');
    expect(redecoupage(versNoyau(dd()), versNoyau(dd()), J)).toEqual({ periodes: 0, operations: 0, confirmees: 0 });
  });

  it('si le redécoupage ne peut pas être calculé, rien n’est enregistré', () => {
    const casse = dd();
    casse.elements = [{ ...casse.elements[0]!, montants: [{ aPartirDu: '2026-01-15', montant: 0.5 }] }];
    expect(() => proposerProfil(casse, { frequence: 'mensuelle', depart: '2026-01-01' }, J)).toThrow(/n’ont pas pu être calculées : rien n’est enregistré/);
  });
});

describe('H4 — performance', () => {
  it('préparer un aperçu sur cinq ans d’historique et une quarantaine d’éléments reste rapide', () => {
    const elements: ElementPlanifie[] = [];
    for (let i = 0; i < 40; i++) elements.push(mensuel(`Élément ${i}`, `2022-01-${String(1 + (i % 28)).padStart(2, '0')}`, 5_000 + i * 100));
    const dd = donnees('2022-01-06', elements);
    const jour = d('2027-01-14');
    proposerMontant(dd, 'Élément 3', '2023-03-01', '75', jour); // réchauffement
    const debut = performance.now();
    const p = proposerMontant(dd, 'Élément 3', '2023-03-01', '75', jour);
    const duree = performance.now() - debut;
    expect(p.apercu).toBe(true);
    expect(duree).toBeLessThan(800);
    console.info(`H4 : aperçu préparé sur 5 ans en ${duree.toFixed(1)} ms`);
  });
});
