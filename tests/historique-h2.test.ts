// H2 : paies terminées, regroupées par année et par mois. Données fictives.
import { describe, expect, it } from 'vitest';
import { aVerifierAvant, cyclesAffiches, paiesTerminees } from '../src/actions/analyse';
import { anneeParDefaut, anneesHistorique, moisHistorique, texteVerification } from '../src/lib/historique';
import { planifier, type ConfirmationOccurrence, type ElementPlanifie } from '../src/noyau/cycles';
import { dateCivile } from '../src/noyau/dates';
import type { ProfilPaie } from '../src/noyau/paie';

const d = (t: string) => dateCivile(t);
const profil: ProfilPaie = { frequence: { type: 'deuxSemaines', depart: d('2025-11-06') }, montants: [{ aPartirDu: d('2025-11-06'), montant: 210_000 }] };
const loyer: ElementPlanifie = { id: 'Loyer (fictif)', libelle: 'Loyer (fictif)', regle: { frequence: { type: 'mois', n: 1, depart: d('2025-11-01') }, montants: [{ aPartirDu: d('2025-11-01'), montant: 110_000 }] } };
const jour = d('2027-01-14');

describe('H2 — paies terminées', () => {
  const entree = { elements: [loyer] };
  const terminees = paiesTerminees(profil, entree, jour);

  it('une paie est terminée quand toute sa période est passée, vérifiée ou non', () => {
    expect(terminees.length).toBeGreaterThan(0);
    expect(terminees.every((c) => c.fin < jour)).toBe(true);
    // La paie versée aujourd'hui (14 janv. 2027) commence un cycle en cours : pas terminée.
    expect(terminees.some((c) => c.debut <= jour && c.fin >= jour)).toBe(false);
    expect(terminees.at(-1)!.fin).toBe(d('2027-01-13'));
    // Aucune n'est confirmée : terminée ne veut pas dire vérifiée.
    expect(terminees.every((c) => c.aVerifier > 0)).toBe(true);
  });

  it('mêmes chiffres que le plan habituel, et le même total que le rappel H1', () => {
    const plan = planifier({ ...entree, profil, aujourdhui: jour }, d('2025-11-06'), d('2027-01-13'));
    expect(terminees.map((c) => [c.paie.dateOrigine, c.disponible, c.aVerifier])).toEqual(plan.cycles.filter((c) => c.fin < jour).map((c) => [c.paie.dateOrigine, c.disponible, c.aVerifier]));
    const premier = cyclesAffiches(profil, entree, jour).cycles[0]!.debut;
    expect(terminees.reduce((n, c) => n + c.aVerifier, 0)).toBe(aVerifierAvant(profil, entree, jour, premier));
  });

  it('regroupe par année puis par mois, les plus récentes d’abord', () => {
    const annees = anneesHistorique(terminees);
    expect(annees.map((a) => a.annee)).toEqual([2026, 2025]);
    expect(annees.reduce((n, a) => n + a.paies, 0)).toBe(terminees.length);
    const mois = moisHistorique(terminees, 2025);
    expect(mois.map((m) => m.libelle)).toEqual(['Décembre 2025', 'Novembre 2025']);
    expect(mois[0]!.cycles.map((c) => c.paie.date)).toEqual([d('2025-12-18'), d('2025-12-04')]);
  });

  it('le filtre « à vérifier » et l’année proposée suivent les confirmations', () => {
    // Tout 2026 est confirmé (paies et loyers) : il ne reste à vérifier qu'en 2025.
    const confirmations: ConfirmationOccurrence[] = [];
    for (const c of terminees.filter((x) => x.paie.date >= d('2026-01-01'))) {
      confirmations.push({ elementId: null, origine: c.paie.dateOrigine, date: jour, montant: 210_000 });
      for (const l of c.lignes) confirmations.push({ elementId: l.elementId, origine: l.origine, date: jour, montant: 110_000 });
    }
    const apres = paiesTerminees(profil, { ...entree, confirmations }, jour);
    const annees = anneesHistorique(apres);
    expect(annees.find((a) => a.annee === 2026)!.aVerifier).toBe(0);
    expect(anneeParDefaut(annees)).toBe(2026);
    expect(anneeParDefaut(annees, true)).toBe(2025);
    expect(moisHistorique(apres, 2026, true)).toEqual([]);
    expect(moisHistorique(apres, 2026).length).toBe(12);
  });

  it('l’état de vérification se dit à part', () => {
    expect(texteVerification(0)).toBe('Rien à vérifier');
    expect(texteVerification(1)).toBe('1 à vérifier');
    expect(texteVerification(4)).toBe('4 à vérifier');
  });

  it('rien de terminé avant la première paie', () => {
    expect(paiesTerminees(profil, entree, d('2025-11-10'))).toEqual([]);
    expect(anneeParDefaut([])).toBeNull();
  });
});
