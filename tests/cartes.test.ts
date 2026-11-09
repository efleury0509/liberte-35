// Étape 8 : la carte Visa — les 41 cas témoins approuvés (analyse, sections 6 et 8).
// Données fictives. Profil : aux deux semaines dès le jeudi 7 janv. 2027, 2 100,00 $.
// Carte « Visa (fictive) » : échéance le 11 de chaque mois dès le 11 janv. 2027, sans montant.
import { describe, expect, it } from 'vitest';
import {
  PHRASE_ECHEANCE,
  choixRapides,
  libelleLigne,
  objetJournal,
  proposerAjoutCarte,
  proposerFrais,
  proposerObjectif,
  proposerReleve,
  proposerRenseignementsCarte,
  proposerRetraitFrais,
  proposerRetraitReleve,
  proposerSoldeActuel,
  proposerSuppressionCarte,
  proposerSuppressionSupplement,
  proposerSupplement,
  raisonsACompleter,
  vueCarte,
  type SaisieCarte,
} from '../src/actions/cartes';
import { proposerConfirmation, proposerToutConfirmer } from '../src/actions/confirmations';
import { proposerAjustement, proposerRetourRegle } from '../src/actions/occurrences';
import { proposerSuppression } from '../src/actions/elements';
import { ErreurSaisie, versNoyau, type Proposition } from '../src/actions/paie';
import { proposerAjoutPret, type SaisiePret } from '../src/actions/prets';
import { appliquerChangements, donneesVides, inverser } from '../src/lib/appliquer';
import type { DonneesPaie } from '../src/lib/plateforme';
import { planifier, type Cycle } from '../src/noyau/cycles';
import { dateCivile } from '../src/noyau/dates';

const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const J = (t: string) => dateCivile(t);
const JOUR = J('2026-11-08');
const NOM = 'Visa (fictive)';

const base = (): DonneesPaie => ({
  ...donneesVides(),
  profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
  salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
});
const appliquer = (d: DonneesPaie, p: Proposition) => appliquerChangements(d, p.changements);
const SAISIE: SaisieCarte = { nom: NOM, prochaine: '2027-01-11', limite: '', taux: '' };
const avecCarte = (s: Partial<SaisieCarte> = {}) => {
  const d = appliquer(base(), proposerAjoutCarte(base(), { ...SAISIE, ...s }, JOUR));
  return { d, id: d.cartes[0]!.id };
};
const R1 = { date: '2027-01-20', solde: '1240', minimum: '35', echeance: '2027-02-11' };
const releve = (d: DonneesPaie, r: Partial<typeof R1> = {}) => appliquer(d, proposerReleve(d, { ...R1, ...r }, JOUR));
const supplement = (d: DonneesPaie, montant = '300', date = '2027-01-27') => appliquer(d, proposerSupplement(d, { montant, date }, JOUR));
const ajuster = (d: DonneesPaie, id: string, origine: string, montant: string, date = '') =>
  appliquer(d, proposerAjustement(d, { elementId: id, origine: J(origine) }, { montant, date, paie: '' }, JOUR));
const confirmer = (d: DonneesPaie, elementId: string, origine: string, montant: string, date = origine) =>
  appliquer(d, proposerConfirmation(d, { elementId, origine }, { montant, date }, JOUR));
const cycles = (d: DonneesPaie): Cycle[] => {
  const n = versNoyau(d);
  return planifier({ aujourdhui: JOUR, profil: n.profil!, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations }, J('2027-01-07'), J('2027-03-17')).cycles;
};
const cycle = (d: DonneesPaie, paie: string) => cycles(d).find((c) => c.paie.date === paie)!;
const lignesCarte = (d: DonneesPaie, c: Cycle) => c.lignes.filter((l) => l.elementId === d.cartes[0]!.id || d.cartes[0]!.supplements.includes(l.elementId));
const vue = (d: DonneesPaie) => vueCarte(d, JOUR)!;
const suivi = (d: DonneesPaie, date: string) => vue(d).releves.find((r) => r.date === date)!;
const refus = (f: () => unknown, message: string | RegExp) => {
  expect(f).toThrow(ErreurSaisie);
  expect(f).toThrow(message);
};
const supplementId = (d: DonneesPaie) => d.cartes[0]!.supplements[0]!;

describe('F — Fiche (Mes dettes)', () => {
  it('F1 : création minimale, montant à choisir à chaque relevé, le reste à compléter', () => {
    const { d, id } = avecCarte();
    const e = d.elements.find((x) => x.id === id)!;
    expect(e).toMatchObject({ libelle: NOM, nature: 'depense', genre: 'fixe', montants: [], frequence: { type: 'mois', n: 1, depart: '2027-01-11' } });
    const v = vue(d);
    expect(v.echeance).toBe('chaque mois, le 11');
    expect(v.montantEcheance).toBe('à choisir à chaque relevé');
    expect([v.limite, v.taux, v.soldeActuel, v.utilisation]).toEqual(['À compléter', 'À compléter', 'À compléter', 'À compléter']);
    expect(v.frais).toEqual([]);
    // Même quand la première échéance est loin (ici, deux mois après aujourd’hui).
    expect(v.aChoisir).toEqual(['Échéance du 11 janv. 2027 : montant à choisir dans Mes paies.']);
  });

  it('F2 : compléter plus tard (limite, taux, frais) ne change rien dans Mes paies', () => {
    let { d } = avecCarte();
    const avant = cycles(d);
    d = appliquer(d, proposerRenseignementsCarte(d, { limite: '5000', taux: '20,99' }, JOUR));
    d = appliquer(d, proposerFrais(d, { libelle: 'Frais annuels', montant: '120', frequence: 'annee' }, JOUR));
    const v = vue(d);
    expect(v.limite).toBe($('5 000,00 $'));
    expect(v.taux).toBe('20,99 %');
    expect(v.frais.map((f) => f.texte)).toEqual([$('Frais annuels — 120,00 $ par année')]);
    expect(cycles(d)).toEqual(avant);
    d = appliquer(d, proposerRetraitFrais(d, 'Frais annuels', JOUR));
    expect(vue(d).frais).toEqual([]);
  });

  it('F3 : refus clairs (sans nom, sans échéance, montant négatif, deuxième carte)', () => {
    refus(() => proposerAjoutCarte(base(), { ...SAISIE, nom: '  ' }, JOUR), 'Donne un nom');
    refus(() => proposerAjoutCarte(base(), { ...SAISIE, prochaine: '' }, JOUR), 'prochaine échéance');
    refus(() => proposerAjoutCarte(base(), { ...SAISIE, limite: '-5' }, JOUR), /Limite/);
    const { d } = avecCarte();
    refus(() => proposerAjoutCarte(d, { ...SAISIE, nom: 'Autre' }, JOUR), 'Une seule carte pour l’instant.');
  });
});

describe('C — Échéances dans Mes paies', () => {
  it('C1 : 11 janv., 11 févr., 11 mars, une fois chacune, dans leur cycle, « À compléter »', () => {
    const { d } = avecCarte();
    const parCycle = cycles(d).map((c) => [c.paie.date, lignesCarte(d, c).map((l) => [l.echeance, l.montant])]);
    expect(parCycle).toEqual([
      ['2027-01-07', [['2027-01-11', null]]],
      ['2027-01-21', []],
      ['2027-02-04', [['2027-02-11', null]]],
      ['2027-02-18', []],
      ['2027-03-04', [['2027-03-11', null]]],
    ]);
    expect(libelleLigne(d, lignesCarte(d, cycle(d, '2027-02-04'))[0]!)).toBe(`Paiement — ${NOM}`);
  });

  it('C2 : disponible « À compléter » avec sa raison, jamais 0 $', () => {
    const { d } = avecCarte();
    const c = cycle(d, '2027-02-04');
    expect(c.sorties).toBeNull();
    expect(c.disponible).toBeNull();
    expect(raisonsACompleter(d, c)).toBe(`Il manque : Paiement — ${NOM} (11 févr.).`);
    expect(raisonsACompleter(d, cycle(d, '2027-01-21'))).toBeNull();
  });

  it('C3 : aucun frais dans Mes paies', () => {
    let { d } = avecCarte();
    d = appliquer(d, proposerFrais(d, { libelle: 'Frais annuels', montant: '120', frequence: 'annee' }, JOUR));
    expect(cycles(d).flatMap((c) => c.lignes).every((l) => !l.libelle.includes('Frais'))).toBe(true);
  });

  it('C4 : la carte se gère depuis Mes dettes (pas de suppression comme une dépense ordinaire)', () => {
    const { d, id } = avecCarte();
    refus(() => proposerSuppression(d, id, JOUR), 'Ce paiement appartient à la carte');
  });
});

describe('A — Choisir le montant d’une échéance', () => {
  it('A1 : choix rapides du relevé ; 940 $ libre ; seule cette échéance change', () => {
    let { d, id } = avecCarte();
    d = releve(d);
    expect(choixRapides(d, id, '2027-02-11')).toEqual([
      { libelle: 'Minimum', montant: 3_500 },
      { libelle: 'Solde du relevé', montant: 124_000 },
    ]);
    d = ajuster(d, id, '2027-02-11', '940');
    const c = cycle(d, '2027-02-04');
    expect(c.disponible).not.toBeNull();
    expect(lignesCarte(d, c)[0]!.montant).toBe(94_000);
    expect(lignesCarte(d, cycle(d, '2027-03-04'))[0]!.montant).toBeNull();
  });

  it('A2 : sans relevé, aucun choix rapide (le montant libre fonctionne)', () => {
    let { d, id } = avecCarte();
    expect(choixRapides(d, id, '2027-02-11')).toEqual([]);
    d = ajuster(d, id, '2027-02-11', '50');
    expect(lignesCarte(d, cycle(d, '2027-02-04'))[0]!.montant).toBe(5_000);
  });

  it('A3 : « Revenir à la règle » : l’échéance redevient « À compléter »', () => {
    let { d, id } = avecCarte();
    d = ajuster(d, id, '2027-02-11', '940');
    d = appliquer(d, proposerRetourRegle(d, { elementId: id, origine: J('2027-02-11') }, JOUR));
    expect(lignesCarte(d, cycle(d, '2027-02-04'))[0]!.montant).toBeNull();
  });

  it('A4 : « Tout confirmer » exclut une échéance « À compléter », avec la raison', () => {
    const { d } = avecCarte();
    const p = proposerToutConfirmer(d, '2027-02-04', JOUR);
    expect(p.consequences).toContain(`Exclu : ${NOM} (montant à compléter).`);
    expect(p.changements.some((c) => c.type === 'definirConfirmation' && c.confirmation.elementId === d.cartes[0]!.id)).toBe(false);
  });

  it('A5 : confirmer une échéance « À compléter » demande le montant payé', () => {
    const { d, id } = avecCarte();
    refus(() => proposerConfirmation(d, { elementId: id, origine: '2027-02-11' }, null, JOUR), 'indique le montant confirmé');
    const apres = confirmer(d, id, '2027-02-11', '940');
    expect(lignesCarte(apres, cycle(apres, '2027-02-04'))[0]!).toMatchObject({ statut: 'confirme', montant: 94_000 });
  });
});

describe('X — Paiements supplémentaires', () => {
  it('X1 : 300 $ le 27 janv., une seule fois, dans le cycle du 21 janv.', () => {
    let { d } = avecCarte();
    d = supplement(d);
    const ou = cycles(d).map((c) => lignesCarte(d, c).filter((l) => l.elementId === supplementId(d)).length);
    expect(ou).toEqual([0, 1, 0, 0, 0]);
    const l = lignesCarte(d, cycle(d, '2027-01-21'))[0]!;
    expect(l).toMatchObject({ echeance: '2027-01-27', montant: 30_000 });
    expect(libelleLigne(d, l)).toBe(`Paiement supplémentaire — ${NOM}`);
  });

  it('X2 : les échéances du 11 févr. et du 11 mars ne changent pas', () => {
    const { d } = avecCarte();
    const avec = supplement(d);
    for (const p of ['2027-02-04', '2027-03-04']) {
      expect(lignesCarte(avec, cycle(avec, p))).toEqual(lignesCarte(d, cycle(d, p)));
    }
  });

  it('X3 : se confirme, s’ajuste, se supprime tant qu’il n’est pas confirmé', () => {
    let { d } = avecCarte();
    d = supplement(d);
    const sid = supplementId(d);
    const ajuste = ajuster(d, sid, '2027-01-27', '350');
    expect(lignesCarte(ajuste, cycle(ajuste, '2027-01-21'))[0]!.montant).toBe(35_000);
    const supprime = appliquer(d, proposerSuppressionSupplement(d, sid, JOUR));
    expect(supprime.cartes[0]!.supplements).toEqual([]);
    expect(supprime.elements.some((e) => e.id === sid)).toBe(false);
    d = confirmer(d, sid, '2027-01-27', '300');
    refus(() => proposerSuppressionSupplement(d, sid, JOUR), 'Ce paiement est confirmé');
    refus(() => proposerSuppression(d, sid, JOUR), 'Ce paiement appartient à la carte');
  });

  it('V6 (0.8.1) : le bandeau montre le montant et la date prévue', () => {
    const { d } = avecCarte({ nom: 'Visa test' });
    expect(proposerSupplement(d, { montant: '300', date: '2027-01-21' }, JOUR).titre).toBe($('Paiement supplémentaire — Visa test : 300,00 $ le 21 janv. 2027'));
  });

  it('V7, V8 (0.8.1) : supprimer un supplément non confirmé, rétablir avec « Annuler » ; refusé une fois confirmé', () => {
    let { d } = avecCarte();
    d = releve(d);
    d = supplement(d);
    const sid = supplementId(d);
    d = ajuster(d, sid, '2027-01-27', '350');
    const avant = structuredClone(d);
    const p = proposerSuppressionSupplement(d, sid, JOUR);
    expect(p.apercu).toBe(false); // direct, avec « Annuler »
    expect(p.journal.map((e) => e.objet)).toEqual([`Carte « ${NOM} »`]);
    const apres = appliquer(d, p);
    expect(cycles(apres).flatMap((c) => lignesCarte(apres, c)).some((l) => l.elementId === sid)).toBe(false);
    expect(suivi(apres, '20 janv. 2027').planifies.join()).not.toContain('27 janv.');
    for (const c of ['2027-02-04', '2027-03-04']) expect(lignesCarte(apres, cycle(apres, c))).toEqual(lignesCarte(d, cycle(d, c)));
    // « Annuler » : l'inverse rétablit l'élément, son ajustement et son lien à la carte.
    const retabli = appliquerChangements(apres, inverser(d, p.changements));
    expect(retabli.elements).toEqual(avant.elements);
    expect(retabli.ajustements).toEqual(avant.ajustements);
    expect(retabli.cartes).toEqual(avant.cartes);
    const confirme = confirmer(d, sid, '2027-01-27', '350');
    refus(() => proposerSuppressionSupplement(confirme, sid, JOUR), 'Ce paiement est confirmé : il ne peut plus être supprimé. Corrige ou annule d’abord la confirmation.');
  });

  it('X4 : refus d’un montant vide ou nul', () => {
    const { d } = avecCarte();
    refus(() => proposerSupplement(d, { montant: '', date: '2027-01-27' }, JOUR), 'Indique le montant');
    refus(() => proposerSupplement(d, { montant: '0', date: '2027-01-27' }, JOUR), 'Indique le montant');
  });
});

describe('R — Relevés', () => {
  it('R1 : relevé complet accepté ; sans minimum ni échéance aussi', () => {
    let { d } = avecCarte();
    d = releve(d);
    expect(d.cartes[0]!.releves).toEqual([{ date: '2027-01-20', solde: 124_000, minimum: 3_500, echeance: '2027-02-11' }]);
    const sans = releve(avecCarte().d, { minimum: '', echeance: '' });
    expect(sans.cartes[0]!.releves[0]).toEqual({ date: '2027-01-20', solde: 124_000, minimum: null, echeance: null });
    const s = suivi(sans, '20 janv. 2027');
    expect([s.minimum, s.echeance, s.constatMinimum]).toEqual(['À compléter', 'À compléter', null]);
  });

  it('R2 : un relevé de plus devient le dernier ; R1 inchangé ; doublon refusé ; retrait avec aperçu', () => {
    let { d } = avecCarte();
    d = releve(d);
    const r1 = structuredClone(d.cartes[0]!.releves[0]);
    d = releve(d, { date: '2027-02-20', solde: '800', minimum: '25', echeance: '2027-03-11' });
    expect(vue(d).releves.map((r) => r.date)).toEqual(['20 févr. 2027', '20 janv. 2027']);
    expect(d.cartes[0]!.releves.find((r) => r.date === '2027-01-20')).toEqual(r1);
    refus(() => proposerReleve(d, R1, JOUR), 'Un relevé existe déjà');
    const p = proposerRetraitReleve(d, '2027-02-20', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.journal[0]).toMatchObject({ objet: `Carte « ${NOM} »`, champ: 'relevé retiré' });
    expect(appliquer(d, p).cartes[0]!.releves).toEqual([r1]);
  });

  it('R3, V3 (0.8.1) : échéance du relevé au 12 févr., paiement prévu le 11 : une phrase, paiement compté, rien déplacé', () => {
    let { d, id } = avecCarte();
    d = releve(d, { echeance: '2027-02-12' });
    d = ajuster(d, id, '2027-02-11', '940');
    const s = suivi(d, '20 janv. 2027');
    expect(s.notesEcheance).toEqual(['Échéance du relevé : 12 févr. 2027 — paiement prévu le 11 févr. 2027.']);
    expect(s.totalPlanifies).toBe($('940,00 $'));
    expect(lignesCarte(d, cycle(d, '2027-02-04'))[0]).toMatchObject({ elementId: id, echeance: '2027-02-11' });
  });
});

describe('O — Suivi des relevés (Q60, Q67)', () => {
  /** R1, supplément 300 $ confirmé le 27 janv., échéance du 11 févr. ajustée à 940 $. */
  const exemple = () => {
    let { d, id } = avecCarte();
    d = releve(d);
    d = supplement(d);
    d = confirmer(d, supplementId(d), '2027-01-27', '300');
    d = ajuster(d, id, '2027-02-11', '940');
    return { d, id };
  };

  it('O1 : le supplément du 27 janv. est rattaché à R1 par sa date prévue', () => {
    const { d } = exemple();
    expect(suivi(d, '20 janv. 2027').confirmes).toEqual([$('27 janv. 2027 — 300,00 $ (supplémentaire)')]);
  });

  it('O2 : 1 240 · 300 · 940 · il resterait 0,00 $ ; minimum atteint', () => {
    const s = suivi(exemple().d, '20 janv. 2027');
    expect([s.nouveauSolde, s.totalConfirmes, s.totalPlanifies]).toEqual([$('1 240,00 $'), $('300,00 $'), $('940,00 $')]);
    expect(s.planifies).toEqual([$('11 févr. 2027 — 940,00 $')]);
    expect(s.constatMinimum).toBe('Minimum : atteint par les paiements confirmés.');
    expect(s.constatSolde).toBe($('Nouveau solde : à la date d’échéance du relevé (11 févr. 2027), après les paiements confirmés et planifiés d’ici là, il resterait 0,00 $.'));
  });

  it('O3 : confirmée le 14 févr., l’échéance passe aux confirmés, une seule fois, deux dates côte à côte', () => {
    let { d, id } = exemple();
    d = confirmer(d, id, '2027-02-11', '940', '2027-02-14');
    const s = suivi(d, '20 janv. 2027');
    expect(s.totalConfirmes).toBe($('1 240,00 $'));
    expect(s.planifies).toEqual([]);
    expect(s.totalPlanifies).toBe($('0,00 $'));
    expect(s.confirmes).toContain($('11 févr. 2027 (prévu) · confirmé le 14 févr. 2027 — 940,00 $'));
    expect(s.constatSolde).toBe('Nouveau solde : atteint par les paiements confirmés.');
    expect(vue(d).phraseEcheance).toBe(PHRASE_ECHEANCE);
    expect(JSON.stringify(vue(d))).not.toMatch(/à temps(?! :)|en retard|avant l’échéance|payé 1/);
  });

  it('O4 : échéance encore « À compléter » : planifiés et resterait « À compléter »', () => {
    let { d } = avecCarte();
    d = releve(d);
    const s = suivi(d, '20 janv. 2027');
    expect(s.totalPlanifies).toBe('À compléter');
    expect(s.planifies).toEqual(['11 févr. 2027 — À compléter']);
    expect(s.constatSolde).toBe('Nouveau solde : ce qui resterait est à compléter (un paiement planifié est à compléter).');
    expect(s.constatMinimum).toMatch(/^Minimum : pas encore atteint/);
    expect(s.totalConfirmes).toBe($('0,00 $')); // vrai fait : rien n’est encore confirmé
    expect(`${s.totalPlanifies} ${s.constatSolde} ${s.constatMinimum}`).not.toMatch(/\d,\d\d/);
  });

  it('O5 : le paiement du 11 janv. (avant R1) n’est pas dans son suivi ; le solde recopié reste 1 240 $', () => {
    let { d, id } = avecCarte();
    d = confirmer(d, id, '2027-01-11', '200');
    d = releve(d);
    const s = suivi(d, '20 janv. 2027');
    expect(s.confirmes).toEqual([]);
    expect(s.nouveauSolde).toBe($('1 240,00 $'));
  });

  it('O6 : un paiement du 25 févr. passe de R1 à R2 dès que R2 existe ; R1 original inchangé', () => {
    let { d } = avecCarte();
    d = releve(d, { echeance: '2027-03-01' });
    d = supplement(d, '100', '2027-02-25');
    expect(suivi(d, '20 janv. 2027').planifies).toContain($('25 févr. 2027 — 100,00 $ (supplémentaire)'));
    d = releve(d, { date: '2027-02-20', solde: '800', minimum: '25', echeance: '2027-03-11' });
    expect(suivi(d, '20 janv. 2027').planifies.join()).not.toContain('25 févr.');
    expect(suivi(d, '20 févr. 2027').planifies).toContain($('25 févr. 2027 — 100,00 $ (supplémentaire)'));
    expect(d.cartes[0]!.releves.find((r) => r.date === '2027-01-20')).toEqual({ date: '2027-01-20', solde: 124_000, minimum: 3_500, echeance: '2027-03-01' });
  });

  it('O7 : les trois constats du minimum', () => {
    let { d, id } = avecCarte();
    d = releve(d);
    d = ajuster(d, id, '2027-02-11', '50');
    expect(suivi(d, '20 janv. 2027').constatMinimum).toBe('Minimum : serait atteint si les paiements planifiés sont faits.');
    const peu = ajuster(d, id, '2027-02-11', '0');
    expect(suivi(peu, '20 janv. 2027').constatMinimum).toBe($('Minimum : il manque 35,00 $.'));
    const fait = confirmer(d, id, '2027-02-11', '50');
    expect(suivi(fait, '20 janv. 2027').constatMinimum).toBe('Minimum : atteint par les paiements confirmés.');
  });

  it('O8 : rien ne change automatiquement, quel que soit l’écart', () => {
    let { d } = avecCarte();
    const avant = cycles(d);
    d = releve(d);
    d = appliquer(d, proposerSoldeActuel(d, { date: '2027-01-25', montant: '0', note: '' }, JOUR));
    expect(cycles(d)).toEqual(avant);
    expect(d.ajustements).toEqual([]);
  });

  it('O9, V1, V4 (0.8.1) : paiement prévu après l’échéance du relevé : une seule phrase avec son montant, exclu des planifiés, rien déplacé', () => {
    let { d, id } = avecCarte();
    d = releve(d, { echeance: '2027-02-09' });
    d = ajuster(d, id, '2027-02-11', '940');
    const s = suivi(d, '20 janv. 2027');
    expect(s.planifies).toEqual([]);
    expect(s.totalPlanifies).toBe($('0,00 $'));
    expect(s.notesEcheance).toEqual([$('Échéance du relevé : 9 févr. 2027 — paiement prévu le 11 févr. 2027 (940,00 $).')]);
    expect(JSON.stringify(s)).not.toContain('prévu après');
    expect(s.constatSolde).toBe($('Nouveau solde : à la date d’échéance du relevé (9 févr. 2027), après les paiements confirmés et planifiés d’ici là, il resterait 1 240,00 $.'));
    expect(lignesCarte(d, cycle(d, '2027-02-04'))[0]!.echeance).toBe('2027-02-11');
  });

  it('V2 (0.8.1) : un supplément prévu après l’échéance du relevé : même phrase, mention « supplémentaire »', () => {
    let { d, id } = avecCarte();
    d = releve(d, { echeance: '2027-02-09' });
    d = ajuster(d, id, '2027-02-11', '940');
    d = supplement(d, '50', '2027-02-10');
    expect(suivi(d, '20 janv. 2027').notesEcheance).toEqual([
      $('Échéance du relevé : 9 févr. 2027 — paiement prévu le 10 févr. 2027 (50,00 $, supplémentaire).'),
      $('Échéance du relevé : 9 févr. 2027 — paiement prévu le 11 févr. 2027 (940,00 $).'),
    ]);
  });

  it('V5 (0.8.1) : les autres phrases ne changent pas', () => {
    let { d } = avecCarte();
    d = releve(d, { echeance: '' });
    expect(suivi(d, '20 janv. 2027').constatSolde).toBe('Nouveau solde : ce qui resterait est à compléter (échéance du relevé non indiquée).');
  });
});

describe('S, U — Solde actuel et utilisation', () => {
  const avecSolde = () => {
    let { d } = avecCarte({ limite: '5000' });
    d = releve(d);
    d = appliquer(d, proposerSoldeActuel(d, { date: '2027-01-25', montant: '1410', note: 'app de la banque' }, JOUR));
    return d;
  };

  it('S1 : solde actuel daté et annoté, distinct du relevé ; il ne baisse pas tout seul', () => {
    let d = avecSolde();
    d = supplement(d);
    d = confirmer(d, supplementId(d), '2027-01-27', '300');
    const v = vue(d);
    expect(v.soldeActuel).toBe($('1 410,00 $ (ta mise à jour du 25 janv. 2027 — app de la banque)'));
    expect(v.payesDepuisSolde).toBe($('Paiements confirmés depuis cette mise à jour : 300,00 $'));
    expect(suivi(d, '20 janv. 2027').nouveauSolde).toBe($('1 240,00 $'));
    refus(() => proposerSoldeActuel(d, { date: '2027-01-25', montant: '1', note: '' }, JOUR), 'Un solde existe déjà');
  });

  it('U1 : 1 410 ÷ 5 000 = 28 %, selon la mise à jour (plus récente que le relevé)', () => {
    expect(vue(avecSolde()).utilisation).toBe('28 % — selon ta mise à jour du 25 janv. 2027');
  });

  it('U2 : après le relevé du 20 févr., l’utilisation se base sur ce relevé', () => {
    const d = releve(avecSolde(), { date: '2027-02-20', solde: '800', minimum: '25', echeance: '2027-03-11' });
    expect(vue(d).utilisation).toBe('16 % — selon le relevé du 20 févr. 2027');
  });

  it('U3 : sans limite ou sans aucun solde : « À compléter »', () => {
    expect(vue(releve(avecCarte().d)).utilisation).toBe('À compléter');
    expect(vue(avecCarte({ limite: '5000' }).d).utilisation).toBe('À compléter');
  });
});

describe('G — Mon objectif (informatif)', () => {
  it('G1 : « Aucun objectif choisi » par défaut ; choix à la main, au journal ; Mes paies inchangé', () => {
    let { d } = avecCarte();
    expect(vue(d).objectifLibelle).toBe('Aucun objectif choisi');
    expect(vue(d).enTete).toBeNull();
    const avant = cycles(d);
    const p = proposerObjectif(d, 'reduireSolde', JOUR);
    expect(p.journal[0]).toMatchObject({ objet: `Carte « ${NOM} »`, champ: 'objectif', ancienneValeur: 'Aucun objectif choisi', nouvelleValeur: 'Réduire mon solde actuel' });
    d = appliquer(d, p);
    expect(vue(d).objectifLibelle).toBe('Réduire mon solde actuel');
    expect(cycles(d)).toEqual(avant);
    refus(() => proposerObjectif(d, 'reduireSolde', JOUR), 'Rien ne change');
  });

  it('G2 : « Réduire mon solde actuel » : 1 410 $ en tête, 300 $ à part, jamais 1 110 $', () => {
    let { d } = avecCarte();
    expect(vue(appliquer(d, proposerObjectif(d, 'reduireSolde', JOUR))).enTete).toBe('Solde actuel : À compléter');
    d = releve(d);
    d = appliquer(d, proposerSoldeActuel(d, { date: '2027-01-25', montant: '1410', note: '' }, JOUR));
    d = supplement(d);
    d = confirmer(d, supplementId(d), '2027-01-27', '300');
    d = appliquer(d, proposerObjectif(d, 'reduireSolde', JOUR));
    const v = vue(d);
    expect(v.enTete).toBe($('Solde actuel : 1 410,00 $ (ta mise à jour du 25 janv. 2027)'));
    expect(v.payesDepuisSolde).toBe($('Paiements confirmés depuis cette mise à jour : 300,00 $'));
    expect(JSON.stringify(v)).not.toContain('1 110');
    expect(JSON.stringify(v)).not.toContain(`1${ESP}110`);
    expect(v.releves[0]!.constatMinimum).not.toBeNull();
  });

  it('G3 : « Payer mes relevés en entier » : constat du dernier relevé en tête ; aucune bascule', () => {
    let { d, id } = avecCarte();
    d = releve(d);
    d = ajuster(d, id, '2027-02-11', '1240');
    d = appliquer(d, proposerObjectif(d, 'payerReleves', JOUR));
    expect(vue(d).enTete).toBe($('Nouveau solde : à la date d’échéance du relevé (11 févr. 2027), après les paiements confirmés et planifiés d’ici là, il resterait 0,00 $.'));
    d = appliquer(d, proposerSoldeActuel(d, { date: '2027-02-15', montant: '0', note: '' }, JOUR));
    expect(vue(d).objectif).toBe('payerReleves');
  });
});

describe('D, J, N — Suppression, journal, non-régression', () => {
  it('D1 : sans paiement confirmé : la carte et ses suppléments disparaissent, avec un aperçu', () => {
    let { d } = avecCarte();
    d = supplement(d);
    const p = proposerSuppressionCarte(d, JOUR);
    expect(p.apercu).toBe(true);
    const apres = appliquer(d, p);
    expect(apres.cartes).toEqual([]);
    expect(apres.elements).toEqual([]);
    expect(cycles(apres).flatMap((c) => c.lignes)).toEqual([]);
  });

  it('D2 : avec un paiement confirmé : refus', () => {
    let { d } = avecCarte();
    d = supplement(d);
    d = confirmer(d, supplementId(d), '2027-01-27', '300');
    refus(() => proposerSuppressionCarte(d, JOUR), 'paiements confirmés');
  });

  it('J1 : tout ce qui touche la carte s’inscrit sous « Carte « Visa (fictive) » »', () => {
    let { d, id } = avecCarte();
    const objet = `Carte « ${NOM} »`;
    const journaux: Proposition[] = [
      proposerAjoutCarte(base(), SAISIE, JOUR),
      proposerReleve(d, R1, JOUR),
      proposerSupplement(d, { montant: '300', date: '2027-01-27' }, JOUR),
      proposerAjustement(d, { elementId: id, origine: J('2027-02-11') }, { montant: '940', date: '', paie: '' }, JOUR),
      proposerConfirmation(d, { elementId: id, origine: '2027-02-11' }, { montant: '940', date: '2027-02-11' }, JOUR),
    ];
    for (const p of journaux) expect(p.journal.map((e) => e.objet)).toEqual([objet]);
    d = supplement(d);
    expect(objetJournal(d, d.elements.find((e) => e.id === supplementId(d))!)).toBe(objet);
  });

  it('N1 : un prêt cohabite avec la carte et garde son propre nom', () => {
    const pret: SaisiePret = { nom: 'Prêt auto (fictif)', versement: '205', quand: 'deuxSemaines', prochaine: '2027-01-14', minimum: '', echeanceFinale: '', solde: '', soldeLe: '', taux: '' };
    let { d } = avecCarte();
    d = appliquer(d, proposerAjoutPret(d, pret, JOUR));
    const e = d.elements.find((x) => x.libelle === 'Prêt auto (fictif)')!;
    expect(objetJournal(d, e)).toBe('Prêt « Prêt auto (fictif) »');
    expect(vue(d).nom).toBe(NOM);
  });
});
