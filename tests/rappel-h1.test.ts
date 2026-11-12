// H1 : le rappel des éléments à vérifier couvre tout l'historique, quelle
// que soit son ancienneté, et reste rapide sur plusieurs années.
// Données fictives seulement.
import { describe, expect, it } from 'vitest';
import { aVerifierAvant, cyclesAffiches } from '../src/actions/analyse';
import { planifier, type ConfirmationOccurrence, type ElementPlanifie } from '../src/noyau/cycles';
import { dateCivile, type DateCivile } from '../src/noyau/dates';
import type { ProfilPaie } from '../src/noyau/paie';

const d = (t: string) => dateCivile(t);
const profil = (depart: string): ProfilPaie => ({ frequence: { type: 'deuxSemaines', depart: d(depart) }, montants: [{ aPartirDu: d(depart), montant: 210_000 }] });
const element = (id: string, frequence: ElementPlanifie['regle']['frequence'], montant: number, extra: Partial<ElementPlanifie> = {}): ElementPlanifie => ({
  id,
  libelle: id,
  regle: { frequence, montants: [{ aPartirDu: d('2020-01-01'), montant }] },
  ...extra,
});

/** Total exact attendu : chaque cycle d'avant `avant`, depuis le début du calendrier. */
function attendu(p: ProfilPaie, entree: Parameters<typeof aVerifierAvant>[1], jour: DateCivile, avant: DateCivile) {
  const plan = planifier({ ...entree, profil: p, aujourdhui: jour }, p.frequence.depart, d('2099-12-31'));
  return plan.cycles.filter((c) => c.paie.date < avant).reduce((n, c) => n + c.aVerifier, 0);
}

describe('H1 — rappel complet des éléments à vérifier', () => {
  const p = profil('2025-01-02');
  const jour = d('2027-06-10');
  const vieux = element('Cadeau (fictif)', { type: 'ponctuelle', date: d('2025-03-15') }, 7_500);
  const loyer = element('Loyer (fictif)', { type: 'mois', n: 1, depart: d('2025-01-01') }, 110_000);
  const epicerie = element('Épicerie (fictive)', { type: 'chaquePaie' }, 20_000, { genre: 'enveloppe' });
  const entree = { elements: [vieux, loyer, epicerie] };
  const premier = () => cyclesAffiches(p, entree, jour).cycles[0]!.debut;

  it('compte un élément non confirmé de plus de deux ans (l’ancienne limite était d’environ 200 jours)', () => {
    const avant = premier();
    const n = aVerifierAvant(p, entree, jour, avant);
    expect(n).toBe(attendu(p, entree, jour, avant));
    // Le cadeau de mars 2025 est bien dedans : le confirmer retire exactement un élément.
    const confirmations: ConfirmationOccurrence[] = [{ elementId: vieux.id, origine: d('2025-03-15'), date: jour, montant: 7_500 }];
    expect(aVerifierAvant(p, { ...entree, confirmations }, jour, avant)).toBe(n - 1);
  });

  it('une date passée ne vaut jamais paiement ; les enveloppes et les occurrences retirées ne sont pas à vérifier', () => {
    const avant = premier();
    const sansEnveloppe = aVerifierAvant(p, { elements: [vieux, loyer] }, jour, avant);
    expect(aVerifierAvant(p, entree, jour, avant)).toBe(sansEnveloppe);
    const retire = aVerifierAvant(p, { elements: [vieux, loyer], ajustements: [{ elementId: vieux.id, origine: d('2025-03-15'), retire: true }] }, jour, avant);
    expect(retire).toBe(sansEnveloppe - 1);
    // Paies et loyers de deux ans et demi : tous « À vérifier », aucun considéré comme payé.
    expect(sansEnveloppe).toBeGreaterThan(60);
  });

  it('rien avant le début du calendrier, et zéro quand le premier cycle affiché est le premier du calendrier', () => {
    expect(aVerifierAvant(p, entree, jour, d('2025-01-02'))).toBe(0);
  });
});

describe('H1 — performance sur plusieurs années', () => {
  it('cinq ans d’historique et une quarantaine d’éléments : calcul rapide', () => {
    const p = profil('2022-01-06');
    const jour = d('2027-01-14');
    const elements: ElementPlanifie[] = [];
    for (let i = 0; i < 15; i++) elements.push(element(`Fixe ${i}`, { type: 'mois', n: 1, depart: d(`2022-01-${String(1 + i).padStart(2, '0')}`) }, 5_000 + i * 100));
    for (let i = 0; i < 10; i++) elements.push(element(`Paie ${i}`, { type: 'chaquePaie' }, 2_000 + i * 100));
    for (let i = 0; i < 5; i++) elements.push(element(`Enveloppe ${i}`, { type: 'chaquePaie' }, 3_000, { genre: 'enveloppe' }));
    for (let i = 0; i < 10; i++) elements.push(element(`Ponctuelle ${i}`, { type: 'ponctuelle', date: d(`${2022 + (i % 5)}-0${1 + (i % 9)}-15`) }, 9_000));
    const confirmations: ConfirmationOccurrence[] = [];
    const entree = { elements, confirmations };
    const avant = cyclesAffiches(p, entree, jour).cycles[0]!.debut;
    aVerifierAvant(p, entree, jour, avant); // réchauffement
    const debut = performance.now();
    const n = aVerifierAvant(p, entree, jour, avant);
    const duree = performance.now() - debut;
    expect(n).toBe(attendu(p, entree, jour, avant));
    // Seuil généreux pour une machine lente ; mesuré bien en dessous.
    expect(duree).toBeLessThan(400);
    console.info(`H1 : ${n} éléments à vérifier sur 5 ans, calculés en ${duree.toFixed(1)} ms`);
  });
});
