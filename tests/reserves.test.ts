// Étape A : réserves et dépenses à prévoir — les 58 cas témoins (version 2) et B1 à B3.
// Données fictives. Paies aux deux semaines dès le jeudi 7 janv. 2027, 2 100 $.
// Compte épargne : 1 500 $ au 1er janv., 150 $ à chaque paie. CELI : 2 000 $. REER : à compléter.
import { describe, expect, it } from 'vitest';
import { comptesAdmissibles, etatReserves, proposerAjoutCompte, proposerContribution, proposerFermeture, proposerFluctuation, proposerRetraitCompte, proposerTransfert, valeurDuCompte } from '../src/actions/comptes';
import {
  proposerAffectation,
  proposerAjusterReserves,
  proposerArretReserve,
  proposerLiberation,
  proposerModificationReserve,
  proposerReaffectation,
  proposerRepartition,
  proposerRepriseReserve,
  proposerReserve,
  proposerRetourRepartition,
  proposerSuppressionReserve,
  proposerSuspensionReserve,
  suggestion,
  vueReserves,
  type SaisieReserve,
} from '../src/actions/reserves';
import { douzeMois, proposerAjoutDepense, proposerEstimation, proposerLienReserve, proposerModeOccurrence, proposerSuggestion, proposerSuppressionDepense, vueDepenses, type SaisieDepense } from '../src/actions/depenses';
import { proposerAnnulationConfirmation, proposerConfirmation, proposerCorrection } from '../src/actions/confirmations';
import { raisonsACompleter } from '../src/actions/cartes';
import { totalEpargne } from '../src/actions/comptes';
import { ErreurSaisie, versNoyau, type Proposition } from '../src/actions/paie';
import { appliquerChangements, donneesVides, inverser } from '../src/lib/appliquer';
import type { CompteStocke, DonneesPaie } from '../src/lib/plateforme';
import { planifier, type Cycle } from '../src/noyau/cycles';
import { dateCivile } from '../src/noyau/dates';

const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const J = (t: string) => dateCivile(t);
const JOUR = J('2027-01-07');

const base = (): DonneesPaie => ({
  ...donneesVides(),
  profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
  salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
});
const ap = (d: DonneesPaie, p: Proposition) => appliquerChangements(d, p.changements);
const refus = (f: () => unknown, message: string | RegExp) => {
  expect(f).toThrow(ErreurSaisie);
  expect(f).toThrow(message);
};
const RES: SaisieReserve = { nom: '', sorte: 'permanente', cible: '', date: '', frequenceMois: '', depenseId: '', note: '' };
const DEP: SaisieDepense = { nom: '', montant: '', quand: 'annee', date: '', note: '', reserveDansCompte: '' };
const VIDE = { sorte: '' as const, typeLibre: '', nom: '', vocation: '', institution: '', solde: '', soldeLe: '' };

/** Monde fictif de départ : les trois comptes, la contribution, le Fonds d'urgence et les quatre dépenses. */
function monde() {
  let d = base();
  d = ap(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'epargne', solde: '1500', soldeLe: '2027-01-01' }, JOUR));
  d = ap(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'celi', solde: '2000', soldeLe: '2027-01-01' }, JOUR));
  d = ap(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'reer' }, JOUR));
  const [ep, celi, reer] = d.comptes.map((k) => k.id) as [string, string, string];
  d = ap(d, proposerContribution(d, ep, { montant: '150', quand: 'chaquePaie', date: '2027-01-07' }, JOUR));
  d = ap(d, proposerReserve(d, ep, { ...RES, nom: 'Fonds d’urgence', cible: '3000' }, JOUR));
  d = ap(d, proposerAjoutDepense(d, { ...DEP, nom: 'Pneus', montant: '900', date: '2027-04-15', reserveDansCompte: ep }, JOUR));
  d = ap(d, proposerAjoutDepense(d, { ...DEP, nom: 'Immatriculation', montant: '180', date: '2027-06-30' }, JOUR));
  d = ap(d, proposerAjoutDepense(d, { ...DEP, nom: 'Cadeaux', montant: '600', date: '2027-12-15', reserveDansCompte: ep }, JOUR));
  d = ap(d, proposerAjoutDepense(d, { ...DEP, nom: 'Lunettes', quand: 'unique', date: '2027-05-20' }, JOUR));
  return { d, ep, celi, reer, contrib: d.comptes[0]!.contributions[0]! };
}
const compte = (d: DonneesPaie, id: string) => d.comptes.find((k) => k.id === id)!;
const rid = (d: DonneesPaie, compteId: string, nom: string) => compte(d, compteId).reserves!.find((r) => r.nom === nom && r.arreteeLe === null)!.id;
const did = (d: DonneesPaie, nom: string) => d.elements.find((e) => e.libelle === nom)!.id;
const solde = (d: DonneesPaie, compteId: string, nom: string) => etatReserves(d, compte(d, compteId)).soldes.get(rid(d, compteId, nom))!;
const nonRes = (d: DonneesPaie, compteId: string) => etatReserves(d, compte(d, compteId)).nonReserve;
const valeur = (d: DonneesPaie, compteId: string) => valeurDuCompte(d, compte(d, compteId))?.montant ?? null;
const affecter = (d: DonneesPaie, ep: string, nom: string, montant: string) => ap(d, proposerAffectation(d, ep, rid(d, ep, nom), { montant, date: '2027-01-02', note: '' }, JOUR));
const repartir = (d: DonneesPaie, contrib: string, parts: Record<string, string>, origine: string | null = null) => {
  const ep = d.comptes.find((k) => k.contributions.includes(contrib))!.id;
  const saisie = Object.fromEntries(Object.entries(parts).map(([nom, m]) => [rid(d, ep, nom), m]));
  return ap(d, proposerRepartition(d, contrib, saisie, origine, JOUR));
};
const cycles = (d: DonneesPaie): Cycle[] => {
  const n = versNoyau(d);
  return planifier(
    { aujourdhui: JOUR, profil: n.profil!, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, couvertures: n.couvertures },
    J('2027-01-07'),
    J('2028-01-31'),
  ).cycles;
};
const cycleDe = (d: DonneesPaie, date: string) => cycles(d).find((c) => c.debut <= date && c.fin >= date)!;
const ligneDe = (d: DonneesPaie, elementId: string, date: string) => cycleDe(d, date).lignes.find((l) => l.elementId === elementId)!;
const confirmer = (d: DonneesPaie, elementId: string, origine: string, montant: string, sansReserve = false) =>
  ap(d, proposerConfirmation(d, { elementId, origine }, { montant, date: origine, sansReserve }, JOUR));
/** N2 : réserves + non réservé = valeur suivie, toujours. */
const coherent = (d: DonneesPaie) => {
  for (const k of d.comptes) {
    const e = etatReserves(d, k);
    const v = valeurDuCompte(d, k);
    if (v === null) expect(e.nonReserve).toBeNull();
    else expect(e.totalReserves + (e.nonReserve as number)).toBe(v.montant);
  }
};

describe('R — Réserves', () => {
  it('R1 : le Fonds d’urgence est créé à 0 $ ; non réservé 1 500 $', () => {
    const { d, ep } = monde();
    expect(solde(d, ep, 'Fonds d’urgence')).toBe(0);
    expect(nonRes(d, ep)).toBe(150_000);
    coherent(d);
  });

  it('R2 (B1) : la réserve Pneus suit sa dépense : cible, date, manque', () => {
    const { d, ep } = monde();
    const v = vueReserves(d, ep, JOUR).actives.find((r) => r.nom === 'Pneus')!;
    expect([v.cible, v.date, v.manque, v.depense]).toEqual([$('900,00 $'), '15 avr. 2027', $('900,00 $'), 'Pneus']);
  });

  it('R3 : affecter 1 000 $ : 1 000 / 500, la valeur ne change pas', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Fonds d’urgence', '1000');
    expect([solde(d, ep, 'Fonds d’urgence'), nonRes(d, ep), valeur(d, ep)]).toEqual([100_000, 50_000, 150_000]);
    coherent(d);
  });

  it('R4 : refus clairs', () => {
    let { d, ep } = monde();
    refus(() => proposerReserve(d, ep, { ...RES, nom: ' ' }, JOUR), 'Donne un nom');
    refus(() => proposerReserve(d, ep, { ...RES, nom: 'X', cible: '-5' }, JOUR), /Cible/);
    refus(() => proposerReserve(d, ep, { ...RES, nom: 'X', sorte: 'ponctuelle', cible: '50' }, JOUR), 'besoin d’une date');
    d = affecter(d, ep, 'Fonds d’urgence', '1000');
    refus(() => proposerAffectation(d, ep, rid(d, ep, 'Pneus'), { montant: '600', date: '', note: '' }, JOUR), $('Le non réservé n’a que 500,00 $.'));
  });

  it('R5, R6 : réaffecter 200 $ puis libérer 100 $ : valeur et total inchangés', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Fonds d’urgence', '1000');
    const total = totalEpargne(d).montant;
    d = ap(d, proposerReaffectation(d, ep, rid(d, ep, 'Fonds d’urgence'), rid(d, ep, 'Pneus'), { montant: '200', date: '', note: '' }, JOUR));
    expect([solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([80_000, 20_000]);
    d = ap(d, proposerLiberation(d, ep, rid(d, ep, 'Pneus'), { montant: '100', date: '', note: '' }, JOUR));
    expect([solde(d, ep, 'Pneus'), nonRes(d, ep), valeur(d, ep)]).toEqual([10_000, 60_000, 150_000]);
    expect(totalEpargne(d).montant).toBe(total);
    coherent(d);
  });

  it('R7 : surplus affiché, rien ne bouge seul', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Fonds d’urgence', '1000');
    d = ap(d, proposerModificationReserve(d, ep, rid(d, ep, 'Fonds d’urgence'), { ...RES, nom: 'Fonds d’urgence', cible: '800' }, JOUR));
    expect(vueReserves(d, ep, JOUR).actives.find((r) => r.nom === 'Fonds d’urgence')!.surplus).toBe($('200,00 $'));
    expect(solde(d, ep, 'Fonds d’urgence')).toBe(100_000);
  });

  it('R8 (Q95) : réserve créée sur le REER à compléter, affectation refusée', () => {
    let { d, reer } = monde();
    d = ap(d, proposerReserve(d, reer, { ...RES, nom: 'Retraite', cible: '5000' }, JOUR));
    const v = vueReserves(d, reer, JOUR);
    expect([v.nonReserve, v.actives[0]!.soldeTexte]).toEqual(['À compléter', '—']);
    refus(() => proposerAffectation(d, reer, rid(d, reer, 'Retraite'), { montant: '10', date: '', note: '' }, JOUR), 'Indique d’abord la valeur du compte.');
  });

  it('R9 (Q93) : changer la cible d’une réserve non liée recalcule la suggestion, sans toucher la contribution', () => {
    let { d, ep } = monde();
    d = ap(d, proposerReserve(d, ep, { ...RES, nom: 'Vacances', sorte: 'ponctuelle', cible: '600', date: '2027-04-15', frequenceMois: '12' }, JOUR));
    const k = () => compte(d, ep);
    const r = () => k().reserves!.find((x) => x.nom === 'Vacances')!;
    expect(suggestion(d, k(), r(), JOUR)!.montant).toBe(8_600); // 600 ÷ 7 = 85,71 → 86 $
    const elements = structuredClone(d.elements);
    d = ap(d, proposerModificationReserve(d, ep, r().id, { ...RES, nom: 'Vacances', sorte: 'ponctuelle', cible: '800', date: '2027-04-15', frequenceMois: '12' }, JOUR));
    expect(suggestion(d, k(), r(), JOUR)!.montant).toBe(11_500); // 800 ÷ 7 = 114,29 → 115 $
    expect(d.elements).toEqual(elements);
  });

  it('R10 (B3) : suspendre, ses parts vont au non réservé ; reprendre ; arrêter avec un solde', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    const p = proposerSuspensionReserve(d, ep, rid(d, ep, 'Pneus'), '2027-01-01', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain($('Ses parts de contribution (50,00 $) iront au non réservé jusqu’à la reprise.'));
    d = ap(d, p);
    d = confirmer(d, contrib, '2027-01-07', '150');
    expect([solde(d, ep, 'Pneus'), solde(d, ep, 'Fonds d’urgence'), nonRes(d, ep)]).toEqual([0, 10_000, 155_000]);
    expect(vueReserves(d, ep, JOUR).actives.find((r) => r.nom === 'Pneus')!.suggestion).toBeNull();
    d = ap(d, proposerRepriseReserve(d, ep, rid(d, ep, 'Pneus'), '2027-01-15', JOUR));
    d = confirmer(d, contrib, '2027-01-21', '150');
    expect(solde(d, ep, 'Pneus')).toBe(5_000);
    expect(compte(d, ep).repartitions![0]!.parts).toHaveLength(2);
    const arret = proposerArretReserve(d, ep, rid(d, ep, 'Pneus'), { date: '', versId: '' }, JOUR);
    expect(arret.lignes.at(-1)).toMatchObject({ libelle: 'Solde', apres: 'libéré (non réservé)' });
    d = ap(d, arret);
    expect(compte(d, ep).reserves!.find((r) => r.nom === 'Pneus')!.arreteeLe).toBe('2027-01-07');
    expect(compte(d, ep).repartitions![0]!.parts.map((x) => x.montant)).toEqual([10_000]);
    coherent(d);
  });
});

describe('P — Répartition d’une contribution (A5, Q86)', () => {
  it('P1, P2 : une seule ligne de 150 $ ; confirmée : +150 valeur, +100 et +50', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    expect(cycleDe(d, '2027-01-07').lignes.filter((l) => l.elementId === contrib).map((l) => l.montant)).toEqual([15_000]);
    d = confirmer(d, contrib, '2027-01-07', '150');
    expect([valeur(d, ep), solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([165_000, 10_000, 5_000]);
    coherent(d);
  });

  it('P3 : 100 + 30 (20 au non réservé) ; 120 $ → 80 / 24 / 16 ; 100 $ → 66,66 / 20,00 / 13,34', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '30' });
    const a = confirmer(d, contrib, '2027-01-07', '120');
    expect([solde(a, ep, 'Fonds d’urgence'), solde(a, ep, 'Pneus'), nonRes(a, ep)]).toEqual([8_000, 2_400, 151_600]);
    const b = confirmer(d, contrib, '2027-01-07', '100');
    expect([solde(b, ep, 'Fonds d’urgence'), solde(b, ep, 'Pneus'), nonRes(b, ep)]).toEqual([6_666, 2_000, 151_334]);
    coherent(a);
    coherent(b);
  });

  it('P4 : rien de planifié ne compte ; annuler retire exactement les parts', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    expect(solde(d, ep, 'Fonds d’urgence')).toBe(0);
    const avant = structuredClone(d);
    d = confirmer(d, contrib, '2027-01-07', '150');
    d = ap(d, proposerAnnulationConfirmation(d, { elementId: contrib, origine: '2027-01-07' }, JOUR));
    expect([solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([0, 0]);
    expect(d.comptes).toEqual(avant.comptes);
  });

  it('P5 : une répartition plus grande que la contribution est refusée', () => {
    const { d, contrib, ep } = monde();
    refus(() => proposerRepartition(d, contrib, { [rid(d, ep, 'Fonds d’urgence')]: '100', [rid(d, ep, 'Pneus')]: '60' }, null, JOUR), 'dépasse la contribution');
  });

  it('P6 (Q86) : une répartition pour la seule paie du 21 janv. ; retour à l’habituelle', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    d = repartir(d, contrib, { 'Fonds d’urgence': '150' }, '2027-01-21');
    d = confirmer(d, contrib, '2027-01-21', '150');
    d = confirmer(d, contrib, '2027-02-04', '150');
    expect([solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([25_000, 5_000]);
    refus(() => proposerRetourRepartition(d, contrib, '2027-01-21', JOUR), 'confirmée');
    let e = ap(d, proposerRepartition(d, contrib, {}, null, JOUR));
    expect(e.comptes[0]!.repartitions!.some((r) => r.origine === null)).toBe(false);
    e = repartir(d, contrib, { Pneus: '10' }, '2027-02-18');
    e = ap(e, proposerRetourRepartition(e, contrib, '2027-02-18', JOUR));
    expect(e.comptes[0]!.repartitions!.some((r) => r.origine === '2027-02-18')).toBe(false);
  });

  it('P7 : contribution à compléter ; 200 $ → 100 / 50 / 50 ; 120 $ → 80 / 40', () => {
    let { d, ep } = monde();
    d = ap(d, proposerContribution(d, ep, { montant: '', quand: 'mois', date: '2027-01-25' }, JOUR));
    const c2 = compte(d, ep).contributions[1]!;
    d = repartir(d, c2, { 'Fonds d’urgence': '100', Pneus: '50' });
    const a = confirmer(d, c2, '2027-01-25', '200');
    expect([solde(a, ep, 'Fonds d’urgence'), solde(a, ep, 'Pneus'), nonRes(a, ep)]).toEqual([10_000, 5_000, 155_000]);
    const b = confirmer(d, c2, '2027-01-25', '120');
    expect([solde(b, ep, 'Fonds d’urgence'), solde(b, ep, 'Pneus')]).toEqual([8_000, 4_000]);
  });
});

describe('M — Mouvements du compte (Q87, Q88)', () => {
  const pret = () => {
    const m = monde();
    m.d = affecter(m.d, m.ep, 'Fonds d’urgence', '800');
    m.d = affecter(m.d, m.ep, 'Pneus', '200');
    return m; // non réservé 500
  };

  it('M1 : une fluctuation de +60 $ va au non réservé', () => {
    let { d, ep } = pret();
    d = ap(d, proposerFluctuation(d, ep, { mode: 'montant', montant: '60', valeur: '', date: '2027-01-20', note: '' }, JOUR));
    expect([nonRes(d, ep), solde(d, ep, 'Pneus')]).toEqual([56_000, 20_000]);
    coherent(d);
  });

  it('M2 : un retrait de 100 $ pris sur Pneus', () => {
    let { d, ep } = pret();
    d = ap(d, proposerRetraitCompte(d, ep, { montant: '100', date: '2027-01-20', destination: '', note: '', prisSur: rid(d, ep, 'Pneus') }, JOUR));
    expect([solde(d, ep, 'Pneus'), valeur(d, ep), nonRes(d, ep)]).toEqual([10_000, 140_000, 50_000]);
    coherent(d);
  });

  it('M3 : 600 $ quand le non réservé vaut 500 $ : on propose de choisir une réserve pour le reste', () => {
    let { d, ep } = pret();
    refus(() => proposerRetraitCompte(d, ep, { montant: '600', date: '2027-01-20', destination: '', note: '' }, JOUR), $('choisis une réserve pour les 100,00 $ restants'));
    d = ap(d, proposerRetraitCompte(d, ep, { montant: '600', date: '2027-01-20', destination: '', note: '', complement: rid(d, ep, 'Pneus') }, JOUR));
    expect([nonRes(d, ep), solde(d, ep, 'Pneus')]).toEqual([0, 10_000]);
    coherent(d);
  });

  it('M4 : transfert de 200 $ vers le CELI : il arrive dans son non réservé ; total inchangé', () => {
    let { d, ep, celi } = pret();
    const total = totalEpargne(d).montant;
    d = ap(d, proposerTransfert(d, ep, { vers: celi, montant: '200', date: '2027-01-20', note: '' }, JOUR));
    expect([nonRes(d, ep), nonRes(d, celi)]).toEqual([30_000, 220_000]);
    expect(totalEpargne(d).montant).toBe(total);
    coherent(d);
  });

  it('M5 : prendre sur une réserve plus que son solde est refusé', () => {
    const { d, ep } = pret();
    refus(() => proposerRetraitCompte(d, ep, { montant: '300', date: '2027-01-20', destination: '', note: '', prisSur: rid(d, ep, 'Pneus') }, JOUR), $('n’a que 200,00 $'));
  });
});

describe('O — Dépassement (Q89)', () => {
  const depasse = () => {
    const m = monde();
    m.d = affecter(m.d, m.ep, 'Fonds d’urgence', '800');
    m.d = affecter(m.d, m.ep, 'Pneus', '200');
    m.d = ap(m.d, proposerFluctuation(m.d, m.ep, { mode: 'montant', montant: '-700', valeur: '', date: '2027-01-20', note: '' }, JOUR));
    return m;
  };

  it('O1 : l’écart est affiché', () => {
    const { d, ep } = depasse();
    const v = vueReserves(d, ep, JOUR);
    expect(v.depassement).toBe($('200,00 $'));
    expect(nonRes(d, ep)).toBe(-20_000);
  });

  it('O2 : affecter est refusé ; libérer reste permis', () => {
    let { d, ep } = depasse();
    refus(() => proposerAffectation(d, ep, rid(d, ep, 'Pneus'), { montant: '1', date: '', note: '' }, JOUR), 'dépassent déjà');
    d = ap(d, proposerLiberation(d, ep, rid(d, ep, 'Pneus'), { montant: '50', date: '', note: '' }, JOUR));
    expect(nonRes(d, ep)).toBe(-15_000);
  });

  it('O3 : « Ajuster mes réserves » : une réserve, ou au prorata ; aperçu obligatoire', () => {
    const { d, ep } = depasse();
    const une = proposerAjusterReserves(d, ep, 'une', rid(d, ep, 'Pneus'), JOUR);
    expect(une.apercu).toBe(true);
    const a = ap(d, une);
    expect([solde(a, ep, 'Pneus'), nonRes(a, ep)]).toEqual([0, 0]);
    const b = ap(d, proposerAjusterReserves(d, ep, 'prorata', '', JOUR));
    expect([solde(b, ep, 'Fonds d’urgence'), solde(b, ep, 'Pneus'), nonRes(b, ep)]).toEqual([64_000, 16_000, 0]);
    coherent(a);
    coherent(b);
  });

  it('O4 : un gain ensuite fait disparaître le dépassement sans toucher aux réserves', () => {
    let { d, ep } = depasse();
    d = ap(d, proposerFluctuation(d, ep, { mode: 'montant', montant: '300', valeur: '', date: '2027-01-21', note: '' }, JOUR));
    expect([vueReserves(d, ep, JOUR).depassement, nonRes(d, ep), solde(d, ep, 'Pneus')]).toEqual([null, 10_000, 20_000]);
  });
});

describe('D — Dépenses à prévoir', () => {
  it('D1 : créer « Lunettes » ne réserve rien et ne crée aucune contribution', () => {
    const { d, ep } = monde();
    const dep = vueDepenses(d, JOUR).find((x) => x.nom === 'Lunettes')!;
    expect(dep.estimation).toBe('À compléter');
    expect(compte(d, ep).contributions).toHaveLength(1);
    expect(etatReserves(d, compte(d, ep)).totalReserves).toBe(0);
  });

  it('D2 : chaque dépense apparaît une fois, dans son cycle', () => {
    const { d } = monde();
    for (const [nom, date] of [['Pneus', '2027-04-15'], ['Immatriculation', '2027-06-30'], ['Cadeaux', '2027-12-15'], ['Lunettes', '2027-05-20']] as const) {
      expect(cycles(d).flatMap((c) => c.lignes.filter((l) => l.elementId === did(d, nom)).map(() => c.paie.date))).toHaveLength(1);
      expect(ligneDe(d, did(d, nom), date).echeance).toBe(date);
    }
  });

  it('D3 : Immatriculation, sans réserve : une sortie de 180 $', () => {
    const { d } = monde();
    const l = ligneDe(d, did(d, 'Immatriculation'), '2027-06-30');
    expect([l.montant, l.couvert]).toEqual([18_000, 0]);
    const c = cycleDe(d, '2027-06-30');
    expect(c.sorties).toBe(15_000 + 18_000);
  });

  it('D4 (Q90) : Pneus avec sa réserve, suffisante : le disponible n’est pas touché', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Pneus', '900');
    const l = ligneDe(d, did(d, 'Pneus'), '2027-04-15');
    expect([l.montant, l.couvert]).toEqual([90_000, 90_000]);
    expect(cycleDe(d, '2027-04-15').sorties).toBe(15_000);
    expect(vueDepenses(d, JOUR).find((x) => x.nom === 'Pneus')!.prochaine!.couverture).toBe('couverte par la réserve');
  });

  it('D5 (Q91) : 780 $ en réserve : 780 + 120 ; seuls 120 $ sortent du cycle', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Pneus', '780');
    expect(ligneDe(d, did(d, 'Pneus'), '2027-04-15').couvert).toBe(78_000);
    expect(cycleDe(d, '2027-04-15').sorties).toBe(15_000 + 12_000);
    expect(vueDepenses(d, JOUR).find((x) => x.nom === 'Pneus')!.prochaine!.couverture).toBe($('réserve 780,00 $ + disponible 120,00 $'));
  });

  it('D5 bis : les parts planifiées vers la réserve comptent dans la couverture (aucun double comptage)', () => {
    let { d, contrib } = monde();
    d = repartir(d, contrib, { Pneus: '150' });
    // 7 paies × 150 $ = 1 050 $ d'ici le 15 avr. (la paie du 15 avr. comprise : 8) → couverte.
    expect(ligneDe(d, did(d, 'Pneus'), '2027-04-15').couvert).toBe(90_000);
  });

  it('D6 : Lunettes à compléter : disponible à compléter, avec sa raison ; jamais 0 $', () => {
    const { d } = monde();
    const c = cycleDe(d, '2027-05-20');
    expect(c.disponible).toBeNull();
    expect(raisonsACompleter(d, c)).toContain('Lunettes (20 mai)');
  });

  it('D7 : suggestion 129 $ par paie ; avec 200 $ déjà en réserve, 100 $', () => {
    let { d, ep } = monde();
    expect(vueDepenses(d, JOUR).find((x) => x.nom === 'Pneus')!.suggestion).toBe($('129,00 $ par paie (7 paies)'));
    d = affecter(d, ep, 'Pneus', '200');
    expect(vueDepenses(d, JOUR).find((x) => x.nom === 'Pneus')!.suggestion).toBe($('100,00 $ par paie (7 paies)'));
  });

  it('D8 (Q92) : « Redistribuer » ou « Augmenter », avec leurs effets ; rien sans confirmation', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    const pneus = did(d, 'Pneus');
    const r = proposerSuggestion(d, pneus, 'redistribuer', contrib, JOUR);
    expect(r.lignes.map((l) => [l.libelle, l.avant, l.apres])).toEqual([
      ['Part de « Pneus »', $('50,00 $'), $('129,00 $')],
      ['Part de « Fonds d’urgence »', $('100,00 $'), $('21,00 $')],
    ]);
    expect(r.consequences).toContain('Le disponible des cycles ne change pas.');
    const a = proposerSuggestion(d, pneus, 'augmenter', contrib, JOUR);
    expect(a.lignes[1]).toMatchObject({ libelle: 'Contribution', avant: $('150,00 $'), apres: $('229,00 $ à partir du 7 janv. 2027') });
    expect(a.consequences.some((c) => c.includes('disponible planifié'))).toBe(true);
    const apres = ap(d, a);
    expect(compte(apres, ep).repartitions![0]!.parts.find((p) => p.reserveId === rid(d, ep, 'Pneus'))!.montant).toBe(12_900);
  });

  it('D9 : « Créer une contribution » de 129 $ à chaque paie, toute vers Pneus', () => {
    const { d, ep } = monde();
    const p = proposerSuggestion(d, did(d, 'Pneus'), 'creer', '', JOUR);
    const apres = ap(d, p);
    expect(compte(apres, ep).contributions).toHaveLength(2);
    const nouvelle = compte(apres, ep).contributions[1]!;
    expect(compte(apres, ep).repartitions!.find((r) => r.elementId === nouvelle)!.parts).toEqual([{ reserveId: rid(d, ep, 'Pneus'), montant: 12_900 }]);
  });

  it('D10 : changer le mode d’une seule occurrence', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Pneus', '900');
    d = ap(d, proposerModeOccurrence(d, did(d, 'Pneus'), '2027-04-15', 'disponible', JOUR));
    expect(ligneDe(d, did(d, 'Pneus'), '2027-04-15').couvert).toBe(0);
    const occs = vueDepenses(d, J('2027-04-16')).find((x) => x.nom === 'Pneus')!.occurrences;
    expect(occs[0]!.mode).toBe('reserve');
  });

  it('D11 (B1) : changer l’estimation : la réserve suit, la contribution ne change pas', () => {
    let { d, ep } = monde();
    const elements = d.elements.filter((e) => compte(d, ep).contributions.includes(e.id));
    d = ap(d, proposerEstimation(d, did(d, 'Pneus'), '2027-01-01', '1000', JOUR));
    expect(vueReserves(d, ep, JOUR).actives.find((r) => r.nom === 'Pneus')!.cible).toBe($('1 000,00 $'));
    expect(vueDepenses(d, JOUR).find((x) => x.nom === 'Pneus')!.suggestion).toBe($('143,00 $ par paie (7 paies)'));
    expect(d.elements.filter((e) => compte(d, ep).contributions.includes(e.id))).toEqual(elements);
  });
});

describe('U — Payer avec une réserve', () => {
  const avec = (montant = '900') => {
    const m = monde();
    m.d = affecter(m.d, m.ep, 'Pneus', montant);
    return m;
  };

  it('U1 : un seul aperçu : utilisation + retrait ; le disponible n’est pas touché', () => {
    const { d, ep } = avec();
    const pneus = did(d, 'Pneus');
    const p = proposerConfirmation(d, { elementId: pneus, origine: '2027-04-15' }, { montant: '900', date: '2027-04-15' }, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.lignes.map((l) => l.libelle)).toEqual(['Confirmation', 'Réserve « Pneus »', 'Retrait de « Compte épargne »']);
    const sorties = cycleDe(d, '2027-04-15').sorties;
    const apres = ap(d, p);
    expect([solde(apres, ep, 'Pneus'), valeur(apres, ep)]).toEqual([0, 60_000]);
    expect(cycleDe(apres, '2027-04-15').sorties).toBe(sorties);
    coherent(apres);
  });

  it('U2 : 950 $ réels : réserve 900 $ + disponible 50 $', () => {
    const { d } = avec();
    const pneus = did(d, 'Pneus');
    const p = proposerConfirmation(d, { elementId: pneus, origine: '2027-04-15' }, { montant: '950', date: '2027-04-15' }, JOUR);
    expect(p.consequences).toContain($('Payé avec la réserve : 900,00 $ + depuis le disponible du cycle : 50,00 $.'));
    expect(cycleDe(ap(d, p), '2027-04-15').sorties).toBe(15_000 + 5_000);
  });

  it('U3 : 850 $ réels : 50 $ restent dans la réserve', () => {
    let { d, ep } = avec();
    d = confirmer(d, did(d, 'Pneus'), '2027-04-15', '850');
    expect(solde(d, ep, 'Pneus')).toBe(5_000);
  });

  it('U4 : confirmer sans utiliser la réserve : 900 $ sortent du cycle, réserve intacte', () => {
    let { d, ep } = avec();
    d = confirmer(d, did(d, 'Pneus'), '2027-04-15', '900', true);
    expect(solde(d, ep, 'Pneus')).toBe(90_000);
    expect(cycleDe(d, '2027-04-15').sorties).toBe(15_000 + 90_000);
  });

  it('U5 : annuler défait l’utilisation et le retrait : tout revient exactement', () => {
    let { d } = avec();
    const avant = structuredClone(d);
    const pneus = did(d, 'Pneus');
    d = confirmer(d, pneus, '2027-04-15', '900');
    const p = proposerAnnulationConfirmation(d, { elementId: pneus, origine: '2027-04-15' }, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.lignes.map((l) => l.libelle)).toEqual(['Confirmation', 'Réserve « Pneus »', 'Retrait de « Compte épargne »']);
    d = ap(d, p);
    expect(d.comptes).toEqual(avant.comptes);
    expect(d.confirmations).toEqual(avant.confirmations);
    // « Annuler » du bandeau (inverse) aussi.
    let e = confirmer(avant, pneus, '2027-04-15', '900');
    const c = proposerConfirmation(avant, { elementId: pneus, origine: '2027-04-15' }, { montant: '900', date: '2027-04-15' }, JOUR);
    e = appliquerChangements(e, inverser(avant, c.changements));
    expect(e.comptes).toEqual(avant.comptes);
  });

  it('U6 : après la dépense, la réserve vise le 15 avr. 2028 ; la contribution ne change pas', () => {
    let { d, ep } = avec();
    const contribs = structuredClone(d.elements.filter((e) => compte(d, ep).contributions.includes(e.id)));
    d = confirmer(d, did(d, 'Pneus'), '2027-04-15', '900');
    const v = vueReserves(d, ep, J('2027-04-16')).actives.find((r) => r.nom === 'Pneus')!;
    expect([v.date, v.cible]).toEqual(['15 avr. 2028', $('900,00 $')]);
    expect(v.suggestion).not.toBeNull();
    expect(d.elements.filter((e) => compte(d, ep).contributions.includes(e.id))).toEqual(contribs);
  });

  it('U7 : 500 $ pris sur le Fonds d’urgence : « à reconstituer : 500,00 $ »', () => {
    let { d, ep } = monde();
    d = ap(d, proposerModificationReserve(d, ep, rid(d, ep, 'Fonds d’urgence'), { ...RES, nom: 'Fonds d’urgence', cible: '1000' }, JOUR));
    d = affecter(d, ep, 'Fonds d’urgence', '1000');
    d = ap(d, proposerRetraitCompte(d, ep, { montant: '500', date: '2027-01-20', destination: '', note: '', prisSur: rid(d, ep, 'Fonds d’urgence') }, JOUR));
    expect(vueReserves(d, ep, JOUR).actives.find((r) => r.nom === 'Fonds d’urgence')!.aReconstituer).toBe($('500,00 $'));
  });
});

describe('F — Fermeture assistée (Q94, B2)', () => {
  const pret = () => {
    const m = monde();
    m.d = affecter(m.d, m.ep, 'Fonds d’urgence', '1000');
    m.d = affecter(m.d, m.ep, 'Pneus', '200');
    return m;
  };

  it('F1, F2 : transfert vers le CELI en un seul aperçu ; réserves recréées ; historique gardé', () => {
    let { d, ep, celi } = pret();
    refus(() => proposerFermeture(d, ep, '2027-03-01', JOUR), 'Choisis quoi faire de la réserve');
    const choix = { [rid(d, ep, 'Fonds d’urgence')]: `vers:${celi}`, [rid(d, ep, 'Pneus')]: `vers:${celi}` };
    const p = proposerFermeture(d, ep, '2027-03-01', JOUR, choix);
    expect(p.apercu).toBe(true);
    d = ap(d, p);
    expect(compte(d, ep).fermeLe).toBe('2027-03-01');
    expect(compte(d, ep).reserves!.filter((r) => r.nom !== 'Cadeaux').map((r) => [r.nom, r.arreteeLe, r.transfereeVers])).toEqual([
      ['Fonds d’urgence', '2027-03-01', 'CELI'],
      ['Pneus', '2027-03-01', 'CELI'],
    ]);
    expect([solde(d, celi, 'Fonds d’urgence'), solde(d, celi, 'Pneus'), valeur(d, celi), nonRes(d, celi)]).toEqual([100_000, 20_000, 320_000, 200_000]);
    // B1 : la dépense Pneus suit sa nouvelle réserve.
    expect(vueDepenses(d, JOUR).find((x) => x.nom === 'Pneus')!.reserve!.compte).toBe('CELI');
    coherent(d);
  });

  it('F3 : sans compte admissible, seulement libérer ou annuler', () => {
    let { d, ep, celi, reer } = pret();
    d = ap(d, proposerFermeture(d, celi, '2027-01-02', JOUR));
    expect(comptesAdmissibles(d, ep).map((k) => k.id)).toEqual([]);
    refus(() => proposerFermeture(d, ep, '2027-03-01', JOUR, { [rid(d, ep, 'Fonds d’urgence')]: `vers:${reer}`, [rid(d, ep, 'Pneus')]: 'liberer' }), 'valeur connue');
    const lib = ap(d, proposerFermeture(d, ep, '2027-03-01', JOUR, { [rid(d, ep, 'Fonds d’urgence')]: 'liberer', [rid(d, ep, 'Pneus')]: 'liberer' }));
    expect(compte(lib, ep).fermeLe).toBe('2027-03-01');
  });

  it('F4 : annuler la fermeture ne change rien', () => {
    const { d, ep } = pret();
    expect(() => proposerFermeture(d, ep, '2027-03-01', JOUR)).toThrow();
    expect(compte(d, ep).fermeLe).toBeNull();
  });
});

describe('H — Historique et l’année', () => {
  it('H1 : le montant réel est gardé ; l’estimation ne change pas seule', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Pneus', '900');
    d = confirmer(d, did(d, 'Pneus'), '2027-04-15', '950');
    const v = vueDepenses(d, J('2027-04-16')).find((x) => x.nom === 'Pneus')!;
    expect(v.historique).toEqual([{ date: '15 avr. 2027', montant: $('950,00 $') }]);
    expect(v.ecartHistorique).toBe($('La dernière fois : 950,00 $ (estimation : 900,00 $).'));
    expect(v.estimation).toBe($('900,00 $'));
  });

  it('H2, H3 : les 12 prochains mois et leur couverture ; « dont à compléter »', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Pneus', '780');
    const a = douzeMois(d, JOUR);
    const lignes = a.mois.flatMap((m) => m.lignes.map((l) => `${m.mois} — ${l.nom} — ${l.couverture}`));
    expect(lignes).toEqual([
      $('avril 2027 — Pneus — réserve 780,00 $ + disponible 120,00 $'),
      'mai 2027 — Lunettes — À compléter',
      'juin 2027 — Immatriculation — depuis le disponible',
      $('décembre 2027 — Cadeaux — non couverte : 600,00 $ depuis le disponible'),
    ]);
    expect(a.aCompleter).toEqual(['Lunettes']);
    expect(a.total).toBe($('1 680,00 $'));
  });
});

describe('X — Supprimer et terminer', () => {
  it('X1 : une réserve vide se supprime ; avec un solde, il faut d’abord le libérer', () => {
    let { d, ep } = monde();
    const p = proposerSuppressionReserve(d, ep, rid(d, ep, 'Fonds d’urgence'), JOUR);
    expect(p.apercu).toBe(true);
    expect(compte(ap(d, p), ep).reserves!.some((r) => r.nom === 'Fonds d’urgence')).toBe(false);
    d = affecter(d, ep, 'Fonds d’urgence', '10');
    refus(() => proposerSuppressionReserve(d, ep, rid(d, ep, 'Fonds d’urgence'), JOUR), 'libère ou réaffecte d’abord');
  });

  it('X2 : une dépense sans confirmation se supprime ; avec un historique, on la termine', () => {
    let { d } = monde();
    const imm = did(d, 'Immatriculation');
    expect(ap(d, proposerSuppressionDepense(d, imm, JOUR)).depenses!.some((x) => x.id === imm)).toBe(false);
    d = confirmer(d, imm, '2027-06-30', '180');
    refus(() => proposerSuppressionDepense(d, imm, JOUR), 'termine-la plutôt');
  });

  it('X3 : arrêter la réserve liée : la dépense repasse depuis le disponible', () => {
    let { d, ep } = monde();
    d = affecter(d, ep, 'Pneus', '900');
    const p = proposerArretReserve(d, ep, rid(d, ep, 'Pneus'), { date: '', versId: '' }, JOUR);
    expect(p.consequences).toContain('La dépense « Pneus » sera payée depuis le disponible à partir de sa prochaine occurrence.');
    d = ap(d, p);
    expect(ligneDe(d, did(d, 'Pneus'), '2027-04-15').couvert).toBe(0);
  });
});

describe('N, J — Aucun double comptage et journal', () => {
  it('N1 : contribution confirmée, puis Pneus payés avec la réserve : chaque montant compté une fois', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { Pneus: '150' });
    const pneus = did(d, 'Pneus');
    for (const o of ['2027-01-07', '2027-01-21', '2027-02-04', '2027-02-18', '2027-03-04', '2027-03-18']) d = confirmer(d, contrib, o, '150');
    expect([valeur(d, ep), solde(d, ep, 'Pneus')]).toEqual([240_000, 90_000]);
    const sorties = cycleDe(d, '2027-04-15').sorties;
    d = confirmer(d, pneus, '2027-04-15', '900');
    expect([valeur(d, ep), solde(d, ep, 'Pneus')]).toEqual([150_000, 0]);
    expect(cycleDe(d, '2027-04-15').sorties).toBe(sorties);
    expect(cycleDe(d, '2027-04-15').sorties).toBe(15_000);
    expect(totalEpargne(d).montant).toBe($('3 500,00 $'));
    coherent(d);
  });

  it('J1 : journal sous « Réserve « … » » ou « Dépense à prévoir « … » » ; la répartition reste au compte', () => {
    const { d, ep, contrib } = monde();
    expect(proposerAffectation(d, ep, rid(d, ep, 'Pneus'), { montant: '10', date: '', note: '' }, JOUR).journal[0]!.objet).toBe('Réserve « Pneus »');
    expect(proposerModeOccurrence(affecter(d, ep, 'Pneus', '1'), did(d, 'Pneus'), '2027-04-15', 'disponible', JOUR).journal[0]!.objet).toBe('Dépense à prévoir « Pneus »');
    expect(proposerEstimation(d, did(d, 'Pneus'), '2027-01-01', '950', JOUR).journal[0]!.objet).toBe('Dépense à prévoir « Pneus »');
    expect(proposerRepartition(d, contrib, { [rid(d, ep, 'Pneus')]: '50' }, null, JOUR).journal[0]!.objet).toBe('Compte « Compte épargne »');
    expect(proposerConfirmation(d, { elementId: did(d, 'Immatriculation'), origine: '2027-06-30' }, null, JOUR).journal[0]!.objet).toBe('Dépense à prévoir « Immatriculation »');
  });

  it('N2 : la cohérence tient après une suite de gestes mêlés', () => {
    let { d, ep, celi, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    d = confirmer(d, contrib, '2027-01-07', '120');
    d = affecter(d, ep, 'Pneus', '300');
    d = ap(d, proposerTransfert(d, ep, { vers: celi, montant: '200', date: '2027-01-20', note: '', prisSur: rid(d, ep, 'Pneus') }, JOUR));
    d = ap(d, proposerFluctuation(d, ep, { mode: 'montant', montant: '-50', valeur: '', date: '2027-01-21', note: '' }, JOUR));
    d = confirmer(d, did(d, 'Pneus'), '2027-04-15', '900');
    coherent(d);
  });
});


describe('Validation du rapport : jamais de rétroactivité, date d’effet affichée', () => {
  it('R-1 : changer la répartition habituelle ne touche pas une paie déjà confirmée', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    d = confirmer(d, contrib, '2027-01-07', '150');
    const p = proposerRepartition(d, contrib, { [rid(d, ep, 'Pneus')]: '150' }, null, JOUR);
    expect(p.consequences).toContain('Date d’effet : 7 janv. 2027. Les paies déjà confirmées gardent leurs parts.');
    d = ap(d, p);
    expect([solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([10_000, 5_000]);
    d = confirmer(d, contrib, '2027-01-21', '150');
    expect([solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([10_000, 20_000]);
    coherent(d);
  });

  it('R-2 : une répartition créée après coup ne touche pas une paie confirmée sans répartition', () => {
    let { d, ep, contrib } = monde();
    d = confirmer(d, contrib, '2027-01-07', '150');
    d = repartir(d, contrib, { 'Fonds d’urgence': '150' });
    expect([solde(d, ep, 'Fonds d’urgence'), nonRes(d, ep)]).toEqual([0, 165_000]);
  });

  it('R-3 : arrêter une réserve ou fermer le compte ne change pas les parts déjà reçues', () => {
    let { d, ep, celi, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    d = confirmer(d, contrib, '2027-01-07', '150');
    d = ap(d, proposerArretReserve(d, ep, rid(d, ep, 'Pneus'), { date: '', versId: '' }, JOUR));
    const pneus = compte(d, ep).reserves!.find((r) => r.nom === 'Pneus')!;
    expect(etatReserves(d, compte(d, ep)).soldes.get(pneus.id)).toBe(0);
    expect(solde(d, ep, 'Fonds d’urgence')).toBe(10_000);
    const fonds = rid(d, ep, 'Fonds d’urgence');
    d = ap(d, proposerFermeture(d, ep, '2027-01-08', JOUR, { [fonds]: `vers:${celi}` }));
    expect(etatReserves(d, compte(d, ep)).soldes.get(fonds)).toBe(0);
    expect(solde(d, celi, 'Fonds d’urgence')).toBe(10_000);
    coherent(d);
  });

  it('R-4 : corriger une contribution confirmée recalcule ses parts au prorata ; annuler les retire', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '30' });
    d = confirmer(d, contrib, '2027-01-07', '150');
    d = repartir(d, contrib, {}); // la répartition change ensuite : sans effet sur la correction
    d = ap(d, proposerCorrection(d, { elementId: contrib, origine: '2027-01-07' }, { montant: '120', date: '2027-01-07' }, JOUR));
    expect([solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([8_000, 2_400]);
    d = ap(d, proposerAnnulationConfirmation(d, { elementId: contrib, origine: '2027-01-07' }, JOUR));
    expect([solde(d, ep, 'Fonds d’urgence'), solde(d, ep, 'Pneus')]).toEqual([0, 0]);
    coherent(d);
  });

  it('R-5 : « Redistribuer », « Augmenter » et « Créer » affichent leur date d’effet ; le passé confirmé ne bouge pas', () => {
    let { d, ep, contrib } = monde();
    d = repartir(d, contrib, { 'Fonds d’urgence': '100', Pneus: '50' });
    d = confirmer(d, contrib, '2027-01-07', '150');
    const pneus = did(d, 'Pneus');
    for (const choix of ['redistribuer', 'augmenter', 'creer'] as const) {
      const p = proposerSuggestion(d, pneus, choix, contrib, JOUR);
      expect(p.consequences.some((c) => c.startsWith('Date d’effet : 7 janv. 2027.'))).toBe(true);
      const apres = ap(d, p);
      expect([solde(apres, ep, 'Fonds d’urgence'), solde(apres, ep, 'Pneus')]).toEqual([10_000, 5_000]);
      expect(apres.confirmations).toEqual(d.confirmations);
    }
  });

  it('L-1 : créer une réserve liée depuis une dépense existante, en un geste ; annuler la retire', () => {
    let { d, celi } = monde();
    const imm = did(d, 'Immatriculation');
    const p = proposerLienReserve(d, imm, `nouvelle:${celi}`, JOUR);
    expect(p.lignes[0]).toMatchObject({ libelle: 'Réserve liée', avant: 'aucune', apres: $('« Immatriculation » (CELI), nouvelle, 0,00 $') });
    const avant = structuredClone(d);
    d = ap(d, p);
    const v = vueReserves(d, celi, JOUR).actives.find((r) => r.nom === 'Immatriculation')!;
    expect([v.depense, v.cible, v.date]).toEqual(['Immatriculation', $('180,00 $'), '30 juin 2027']);
    expect(vueDepenses(d, JOUR).find((x) => x.nom === 'Immatriculation')!.reserve!.compte).toBe('CELI');
    const e = ap(d, proposerReserve(d, celi, { ...RES, nom: 'Lunettes' }, JOUR));
    refus(() => proposerLienReserve(e, did(e, 'Lunettes'), `nouvelle:${celi}`, JOUR), 'existe déjà dans ce compte');
    expect(appliquerChangements(d, inverser(avant, p.changements)).comptes).toEqual(avant.comptes);
  });
});

/** Utile au rapport : la seule différence de format entre CompteStocke lu et écrit. */
export type _ = CompteStocke;
