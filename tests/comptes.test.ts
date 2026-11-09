// Étape 9 : les comptes d'épargne — les 46 cas témoins approuvés.
// Données fictives. Profil : aux deux semaines dès le jeudi 7 janv. 2027, 2 100,00 $.
// CELI « CELI — Fonds d'urgence » (2 000 $ au 1er janv., 100 $ à chaque paie),
// Compte épargne sans nom (0 $ au 1er janv., 50 $ le 15 du mois), REER sans solde.
import { describe, expect, it } from 'vitest';
import {
  EXPLICATION_CORRECTION,
  EXPLICATION_FLUCTUATION,
  PHRASE_RETRAIT,
  PHRASE_TOTAL,
  proposerAjoutCompte,
  proposerArretContribution,
  proposerContribution,
  proposerContributionPonctuelle,
  proposerFermeture,
  proposerFluctuation,
  proposerReference,
  proposerReouverture,
  proposerRetraitCompte,
  proposerRetraitMouvement,
  proposerSuppressionCompte,
  proposerSuppressionContribution,
  proposerTransfert,
  totalEpargne,
  vueCompte,
  type SaisieCompte,
  type SaisieFluctuation,
} from '../src/actions/comptes';
import { libelleLigne, objetJournal, raisonsACompleter } from '../src/actions/cartes';
import { proposerAnnulationConfirmation, proposerConfirmation, proposerToutConfirmer } from '../src/actions/confirmations';
import { proposerAjustement, proposerRetourRegle } from '../src/actions/occurrences';
import { proposerSuppression } from '../src/actions/elements';
import { ErreurSaisie, versNoyau, type Proposition } from '../src/actions/paie';
import { appliquerChangements, donneesVides, inverser } from '../src/lib/appliquer';
import type { DonneesPaie } from '../src/lib/plateforme';
import { planifier, type Cycle } from '../src/noyau/cycles';
import { dateCivile } from '../src/noyau/dates';

const ESP = ' ';
const $ = (t: string) => t.replace(/(\d) (?=\d{3}\b)/g, `$1${ESP}`).replace(/ \$/g, `${ESP}$`);
const J = (t: string) => dateCivile(t);
const JOUR = J('2026-11-09');
const CELI = 'CELI — Fonds d’urgence';

const base = (): DonneesPaie => ({
  ...donneesVides(),
  profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
  salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
});
const appliquer = (d: DonneesPaie, p: Proposition) => appliquerChangements(d, p.changements);
const VIDE: SaisieCompte = { sorte: '', typeLibre: '', nom: '', vocation: '', institution: '', solde: '', soldeLe: '' };
const ajouterCompte = (d: DonneesPaie, s: Partial<SaisieCompte>) => appliquer(d, proposerAjoutCompte(d, { ...VIDE, ...s }, JOUR));
const id = (d: DonneesPaie, i: number) => d.comptes[i]!.id;

/** Les trois comptes fictifs et leurs contributions. */
function trois() {
  let d = base();
  d = ajouterCompte(d, { sorte: 'celi', nom: CELI, vocation: 'Fonds d’urgence', solde: '2000', soldeLe: '2027-01-01' });
  d = ajouterCompte(d, { sorte: 'epargne', vocation: 'Réserve', solde: '0', soldeLe: '2027-01-01' });
  d = ajouterCompte(d, { sorte: 'reer' });
  const [celi, ep, reer] = [id(d, 0), id(d, 1), id(d, 2)];
  d = appliquer(d, proposerContribution(d, celi, { montant: '100', quand: 'chaquePaie', date: '2027-01-07' }, JOUR));
  d = appliquer(d, proposerContribution(d, ep, { montant: '50', quand: 'mois', date: '2027-01-15' }, JOUR));
  return { d, celi, ep, reer, c1: d.comptes[0]!.contributions[0]!, c2: d.comptes[1]!.contributions[0]! };
}

const cycles = (d: DonneesPaie): Cycle[] => {
  const n = versNoyau(d);
  return planifier({ aujourdhui: JOUR, profil: n.profil!, exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations }, J('2027-01-07'), J('2027-04-28')).cycles;
};
const cycle = (d: DonneesPaie, paie: string) => cycles(d).find((c) => c.paie.date === paie)!;
const lignesCompte = (d: DonneesPaie, c: Cycle, compte: string) => c.lignes.filter((l) => d.comptes.find((k) => k.id === compte)!.contributions.includes(l.elementId));
const origine = (d: DonneesPaie, elementId: string, paie: string) => cycle(d, paie).lignes.find((l) => l.elementId === elementId)!.origine;
const confirmer = (d: DonneesPaie, elementId: string, paie: string, montant = '', date = '') => {
  const o = origine(d, elementId, paie);
  return appliquer(d, proposerConfirmation(d, { elementId, origine: o }, montant === '' ? null : { montant, date: date || o }, JOUR));
};
const vue = (d: DonneesPaie, compte: string) => vueCompte(d, compte, JOUR);
const refus = (f: () => unknown, message: string | RegExp) => {
  expect(f).toThrow(ErreurSaisie);
  expect(f).toThrow(message);
};
const FL: SaisieFluctuation = { mode: 'montant', montant: '', valeur: '', date: '', note: '' };
const fluctuation = (d: DonneesPaie, compte: string, s: Partial<SaisieFluctuation>) => appliquer(d, proposerFluctuation(d, compte, { ...FL, ...s }, JOUR));

describe('T — Fiche', () => {
  it('T1 : le type seul ; valeur « À compléter », jamais 0 $', () => {
    const { d, reer } = trois();
    expect(vue(d, reer)).toMatchObject({ nom: 'REER', type: 'REER', valeur: 'À compléter', valeurCents: null, detail: null });
  });

  it('T2 : un deuxième CELI sans nom s’affiche « CELI 2 »', () => {
    const d = ajouterCompte(trois().d, { sorte: 'celi' });
    expect(vue(d, id(d, 3)).nom).toBe('CELI 2');
  });

  it('T3 : « Autre… » avec un nom libre', () => {
    const d = ajouterCompte(base(), { sorte: 'autre', typeLibre: 'CRI' });
    expect(vue(d, id(d, 0))).toMatchObject({ nom: 'CRI', type: 'CRI' });
  });

  it('T4 : 0 $ au 1er janv. est un vrai solde', () => {
    const { d, ep } = trois();
    expect(vue(d, ep)).toMatchObject({ nom: 'Compte épargne', valeur: $('0,00 $'), valeurCents: 0 });
  });

  it('T5 : refus clairs', () => {
    refus(() => proposerAjoutCompte(base(), VIDE, JOUR), 'Choisis le type');
    refus(() => proposerAjoutCompte(base(), { ...VIDE, sorte: 'autre' }, JOUR), 'Donne un nom au type « Autre »');
    refus(() => proposerAjoutCompte(base(), { ...VIDE, sorte: 'celi', solde: '-5', soldeLe: '2027-01-01' }, JOUR), 'ne peut pas être négatif');
    refus(() => proposerAjoutCompte(base(), { ...VIDE, sorte: 'celi', solde: '5' }, JOUR), 'Indique la date du solde');
  });
});

describe('C — Contributions dans Mes paies', () => {
  it('C1 : 100 $ à chaque paie, une fois par cycle, réduit le disponible ; se gère depuis Mon épargne', () => {
    const { d, celi, c1 } = trois();
    const parCycle = cycles(d).map((c) => lignesCompte(d, c, celi).map((l) => l.montant));
    expect(parCycle).toHaveLength(8);
    expect(parCycle.every((m) => m.length === 1 && m[0] === 10_000)).toBe(true);
    const l = lignesCompte(d, cycle(d, '2027-01-21'), celi)[0]!;
    expect(libelleLigne(d, l)).toBe(`Contribution — ${CELI}`);
    expect(cycle(d, '2027-01-21').disponible).toBe(200_000);
    refus(() => proposerSuppression(d, c1, JOUR), 'gère-la depuis Mon épargne');
  });

  it('C2 : 50 $ le 15 du mois, dans les cycles du 7 janv., du 4 févr. et du 4 mars', () => {
    const { d, ep } = trois();
    const ou = cycles(d).filter((c) => lignesCompte(d, c, ep).length > 0).map((c) => [c.paie.date, lignesCompte(d, c, ep)[0]!.echeance]);
    expect(ou.slice(0, 3)).toEqual([
      ['2027-01-07', '2027-01-15'],
      ['2027-02-04', '2027-02-15'],
      ['2027-03-04', '2027-03-15'],
    ]);
  });

  it('C3 : contribution ponctuelle de 250 $ le 28 janv., une seule fois ; bandeau avec montant et date', () => {
    const { d, celi } = trois();
    const p = proposerContributionPonctuelle(d, { compteId: celi, montant: '250', date: '2027-01-28' }, JOUR);
    expect(p.titre).toBe($(`Contribution ponctuelle — ${CELI} : 250,00 $ le 28 janv. 2027`));
    const apres = appliquer(d, p);
    const montants = cycles(apres).map((c) => lignesCompte(apres, c, celi).map((l) => l.montant));
    expect(montants[1]).toEqual([10_000, 25_000]);
    expect(montants.filter((m) => m.includes(25_000))).toHaveLength(1);
    refus(() => proposerContributionPonctuelle(d, { compteId: celi, montant: '', date: '' }, JOUR), 'Indique le montant');
  });

  it('C4 : une contribution « À compléter » rend le disponible « À compléter », avec sa raison', () => {
    let { d, reer } = trois();
    d = appliquer(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'celiapp', solde: '0', soldeLe: '2027-01-01' }, JOUR));
    d = appliquer(d, proposerContribution(d, id(d, 3), { montant: '', quand: 'mois', date: '2027-01-25' }, JOUR));
    const c = cycle(d, '2027-01-21');
    expect(c.disponible).toBeNull();
    expect(raisonsACompleter(d, c)).toBe('Il manque : Contribution — CELIAPP (25 janv.).');
    expect(reer).toBeTruthy();
  });

  it('C5 : ajuster, revenir à la règle, confirmer, confirmer autrement, tout confirmer', () => {
    let { d, celi, c1 } = trois();
    const o = origine(d, c1, '2027-01-21');
    d = appliquer(d, proposerAjustement(d, { elementId: c1, origine: J(o) }, { montant: '120', date: '', paie: '' }, JOUR));
    expect(lignesCompte(d, cycle(d, '2027-01-21'), celi)[0]!.montant).toBe(12_000);
    d = appliquer(d, proposerRetourRegle(d, { elementId: c1, origine: J(o) }, JOUR));
    expect(lignesCompte(d, cycle(d, '2027-01-21'), celi)[0]!.montant).toBe(10_000);
    d = confirmer(d, c1, '2027-01-07');
    d = confirmer(d, c1, '2027-01-21', '120');
    expect(d.confirmations.map((f) => f.montant)).toEqual([10_000, 12_000]);
    const tout = proposerToutConfirmer(d, '2027-02-04', JOUR);
    expect(tout.changements.some((c) => c.type === 'definirConfirmation' && c.confirmation.elementId === c1)).toBe(true);
  });
});

describe('V — Valeur suivie (A4, Q72)', () => {
  it('V1 : sans confirmation, 2 000 $ ; les contributions planifiées à part, jamais ajoutées', () => {
    const { d, celi } = trois();
    const v = vue(d, celi);
    expect(v.valeur).toBe($('2 000,00 $'));
    expect(v.aVenir[0]).toBe($('100,00 $ le 7 janv. 2027'));
  });

  it('V2 : 7 et 21 janv. confirmées : 2 200 $ avec son détail', () => {
    let { d, celi, c1 } = trois();
    d = confirmer(d, c1, '2027-01-07');
    d = confirmer(d, c1, '2027-01-21');
    expect(vue(d, celi).detail).toBe($('2 200,00 $ = référence du 1er janv. 2027 (2 000,00 $) + contributions confirmées (200,00 $)'));
  });

  it('V3 : confirmée à 120 $ : c’est 120 $ qui compte', () => {
    let { d, celi, c1 } = trois();
    d = confirmer(d, c1, '2027-01-21', '120');
    expect(vue(d, celi).valeur).toBe($('2 120,00 $'));
  });

  it('V4 : annuler une confirmation fait baisser la valeur d’autant', () => {
    let { d, celi, c1 } = trois();
    d = confirmer(d, c1, '2027-01-07');
    d = appliquer(d, proposerAnnulationConfirmation(d, { elementId: c1, origine: origine(d, c1, '2027-01-07') }, JOUR));
    expect(vue(d, celi).valeur).toBe($('2 000,00 $'));
  });

  it('V5 : une contribution datée le jour de la référence ou avant ne s’ajoute pas', () => {
    let { d, celi, c1 } = trois();
    d = confirmer(d, c1, '2027-01-07');
    d = appliquer(d, proposerReference(d, celi, { montant: '2100', date: '2027-01-07', note: '' }, JOUR));
    expect(vue(d, celi).valeur).toBe($('2 100,00 $'));
  });

  it('V6 : REER sans référence : « À compléter », contributions confirmées à part', () => {
    let { d, reer } = trois();
    d = appliquer(d, proposerContribution(d, reer, { montant: '300', quand: 'mois', date: '2027-01-12' }, JOUR));
    d = confirmer(d, d.comptes[2]!.contributions[0]!, '2027-01-07');
    expect(vue(d, reer)).toMatchObject({ valeur: 'À compléter', confirmeesSansReference: $('Contributions confirmées : 300,00 $') });
  });
});

describe('F — Fluctuations (Q73)', () => {
  it('F1 : +50 $ au 20 janv., sans note ; aperçu obligatoire ; historique', () => {
    const { d, celi } = trois();
    const p = proposerFluctuation(d, celi, { ...FL, montant: '50', date: '2027-01-20' }, JOUR);
    expect(p.apercu).toBe(true);
    const apres = appliquer(d, p);
    expect(vue(apres, celi).valeur).toBe($('2 050,00 $'));
    expect(vue(apres, celi).historique[0]).toMatchObject({ date: '20 janv. 2027', texte: $('Fluctuation +50,00 $') });
    expect(EXPLICATION_FLUCTUATION).toBe('Ajouter un gain ou une perte à la valeur suivie.');
  });

  it('F2 : −80 $ fait baisser la valeur ; rien dans Mes paies', () => {
    const { d, celi } = trois();
    const apres = fluctuation(d, celi, { montant: '-80', date: '2027-01-20' });
    expect(vue(apres, celi).valeur).toBe($('1 920,00 $'));
    expect(cycles(apres)).toEqual(cycles(d));
    expect(vue(fluctuation(d, celi, { montant: '−80', date: '2027-01-20' }), celi).valeur).toBe($('1 920,00 $'));
  });

  it('F3 : valeur en ligne 2 410 $ au 25 janv. pour 2 350 $ suivis : +60 $ proposé, rien avant confirmation', () => {
    let { d, celi, c1 } = trois();
    d = confirmer(d, c1, '2027-01-07');
    d = confirmer(d, c1, '2027-01-21');
    d = fluctuation(d, celi, { montant: '150', date: '2027-01-24' });
    const p = proposerFluctuation(d, celi, { ...FL, mode: 'valeur', valeur: '2410', date: '2027-01-25' }, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.lignes.map((l) => [l.libelle, l.apres])).toEqual([
      ['Valeur suivie au 25 janv. 2027', $('2 350,00 $')],
      ['Valeur en ligne', $('2 410,00 $')],
      ['Fluctuation proposée', $('+60,00 $')],
    ]);
    expect(d.comptes[0]!.mouvements).toHaveLength(1);
    expect(vue(appliquer(d, p), celi).valeur).toBe($('2 410,00 $'));
    refus(() => proposerFluctuation(d, celi, { ...FL, mode: 'valeur', valeur: '2350', date: '2027-01-25' }, JOUR), 'Aucun écart : rien à enregistrer.');
  });

  it('F4 : une contribution prévue non confirmée : avertissement, rien de bloqué', () => {
    const { d, celi } = trois();
    const p = proposerFluctuation(d, celi, { ...FL, mode: 'valeur', valeur: '2100', date: '2027-01-10' }, JOUR);
    expect(p.consequences).toContain(
      $('1 contribution prévue d’ici le 10 janv. n’est pas confirmée (100,00 $, 7 janv.). Si elle est déjà dans ta valeur en ligne, confirme-la d’abord.'),
    );
    expect(p.lignes.at(-1)!.apres).toBe($('+100,00 $'));
  });

  it('F5 : retirer une fluctuation : aperçu, journal, valeur recalculée', () => {
    let { d, celi } = trois();
    d = fluctuation(d, celi, { montant: '50', date: '2027-01-20' });
    const p = proposerRetraitMouvement(d, celi, d.comptes[0]!.mouvements[0]!.id, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.journal[0]).toMatchObject({ objet: `Compte « ${CELI} »`, champ: 'mouvement retiré' });
    expect(vue(appliquer(d, p), celi).valeur).toBe($('2 000,00 $'));
  });

  it('F6 : sur un compte « À compléter », refus ; la valeur en ligne peut devenir la référence', () => {
    const { d, reer } = trois();
    refus(() => proposerFluctuation(d, reer, { ...FL, montant: '50' }, JOUR), 'Indique d’abord un solde de référence.');
    refus(() => proposerFluctuation(d, reer, { ...FL, mode: 'valeur', valeur: '500' }, JOUR), 'peut devenir ta première référence');
  });
});

describe('R — Corriger le solde', () => {
  it('R1 : 2 500 $ au 1er févr. : la valeur repart, l’historique reste, aperçu', () => {
    let { d, celi } = trois();
    d = fluctuation(d, celi, { montant: '50', date: '2027-01-20' });
    const p = proposerReference(d, celi, { montant: '2500', date: '2027-02-01', note: 'relevé annuel' }, JOUR);
    expect(p.apercu).toBe(true);
    expect(p.titre).toBe(`Corriger le solde de « ${CELI} »`);
    d = appliquer(d, p);
    const v = vue(d, celi);
    expect(v.valeur).toBe($('2 500,00 $'));
    expect(v.historique.map((h) => h.texte)).toEqual([$('Solde de référence 2 500,00 $ — relevé annuel'), $('Fluctuation +50,00 $'), $('Solde de référence 2 000,00 $')]);
    expect(EXPLICATION_CORRECTION).toBe('Repartir d’une nouvelle valeur à la date choisie.');
  });

  it('R2 : après R1, la contribution du 4 févr. s’ajoute ; celle du 21 janv. non', () => {
    let { d, celi, c1 } = trois();
    d = appliquer(d, proposerReference(d, celi, { montant: '2500', date: '2027-02-01', note: '' }, JOUR));
    d = confirmer(d, c1, '2027-01-21');
    d = confirmer(d, c1, '2027-02-04');
    expect(vue(d, celi).valeur).toBe($('2 600,00 $'));
  });
});

describe('M — Retraits et transferts (Q74)', () => {
  it('M1 : retrait de 300 $ vers le compte courant, sans note : la valeur baisse, Mes paies ne change pas', () => {
    const { d, celi } = trois();
    const p = proposerRetraitCompte(d, celi, { montant: '300', date: '2027-02-10', destination: 'compte courant', note: '' }, JOUR);
    expect(p.apercu).toBe(false);
    expect(p.titre).toBe($(`Retrait — ${CELI} : 300,00 $ le 10 févr. 2027 vers compte courant`));
    expect(p.consequences).toContain(PHRASE_RETRAIT);
    const apres = appliquer(d, p);
    expect(vue(apres, celi).valeur).toBe($('1 700,00 $'));
    expect(cycles(apres)).toEqual(cycles(d));
  });

  it('M2 : transfert de 500 $ du CELI vers le compte épargne : une ligne de chaque côté, total inchangé', () => {
    const { d, celi, ep } = trois();
    const avant = totalEpargne(d).montant;
    const apres = appliquer(d, proposerTransfert(d, celi, { vers: ep, montant: '500', date: '2027-02-12', note: '' }, JOUR));
    expect([vue(apres, celi).valeur, vue(apres, ep).valeur]).toEqual([$('1 500,00 $'), $('500,00 $')]);
    expect(vue(apres, celi).historique[0]!.texte).toBe($('Transfert vers Compte épargne 500,00 $'));
    expect(vue(apres, ep).historique[0]!.texte).toBe($(`Transfert depuis ${CELI} 500,00 $`));
    expect(totalEpargne(apres).montant).toBe(avant);
    expect(apres.elements).toEqual(d.elements);
  });

  it('M3 : refus clairs (même compte, montant vide ou nul, compte fermé)', () => {
    let { d, celi, ep } = trois();
    refus(() => proposerTransfert(d, celi, { vers: celi, montant: '5', date: '2027-02-12', note: '' }, JOUR), 'vers un autre compte');
    refus(() => proposerTransfert(d, celi, { vers: ep, montant: '', date: '2027-02-12', note: '' }, JOUR), 'Indique le montant');
    refus(() => proposerRetraitCompte(d, celi, { montant: '0', date: '', destination: '', note: '' }, JOUR), 'Indique le montant');
    d = appliquer(d, proposerFermeture(d, ep, '2027-03-01', JOUR));
    refus(() => proposerTransfert(d, celi, { vers: ep, montant: '5', date: '2027-03-12', note: '' }, JOUR), 'Ce compte est fermé : rouvre-le d’abord.');
  });

  it('M4 : transfert vers le REER « À compléter » : le CELI baisse, le REER reste à compléter, le total le signale', () => {
    const { d, celi, reer } = trois();
    const apres = appliquer(d, proposerTransfert(d, celi, { vers: reer, montant: '200', date: '2027-02-12', note: '' }, JOUR));
    expect([vue(apres, celi).valeur, vue(apres, reer).valeur]).toEqual([$('1 800,00 $'), 'À compléter']);
    expect(totalEpargne(apres).exclus).toEqual(['REER (à compléter)']);
  });

  it('M5 : retirer un transfert erroné : les deux comptes reviennent', () => {
    let { d, celi, ep } = trois();
    d = appliquer(d, proposerTransfert(d, celi, { vers: ep, montant: '500', date: '2027-02-12', note: '' }, JOUR));
    const p = proposerRetraitMouvement(d, celi, d.comptes[0]!.mouvements[0]!.id, JOUR);
    expect(p.apercu).toBe(true);
    d = appliquer(d, p);
    expect([vue(d, celi).valeur, vue(d, ep).valeur]).toEqual([$('2 000,00 $'), $('0,00 $')]);
  });

  it('Un mouvement daté avant la référence (ou le même jour) est refusé : il y est déjà compris', () => {
    const { d, celi } = trois();
    refus(() => proposerRetraitCompte(d, celi, { montant: '10', date: '2027-01-01', destination: '', note: '' }, JOUR), 'déjà compris');
  });
});

describe('X — Supprimer, fermer, rouvrir (Q76, Q78)', () => {
  it('X1 : le REER sans historique se supprime avec un aperçu, et ses contributions avec lui', () => {
    let { d, reer } = trois();
    d = appliquer(d, proposerContribution(d, reer, { montant: '300', quand: 'mois', date: '2027-01-12' }, JOUR));
    const p = proposerSuppressionCompte(d, reer, JOUR);
    expect(p.apercu).toBe(true);
    const apres = appliquer(d, p);
    expect(apres.comptes.map((k) => k.id)).not.toContain(reer);
    expect(apres.elements).toHaveLength(2);
  });

  it('X2 : avec des confirmations, refus : « ferme-le plutôt »', () => {
    let { d, celi, c1 } = trois();
    d = confirmer(d, c1, '2027-01-07');
    refus(() => proposerSuppressionCompte(d, celi, JOUR), 'Ce compte a un historique : ferme-le plutôt.');
  });

  it('X3 : fermer le compte épargne au 1er mars : avertissement, plus de contribution à partir du 1er mars, hors du total', () => {
    let { d, ep } = trois();
    d = appliquer(d, proposerTransfert(d, id(d, 0), { vers: ep, montant: '500', date: '2027-02-12', note: '' }, JOUR));
    const p = proposerFermeture(d, ep, '2027-03-01', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.consequences).toContain($('Valeur suivie : 500,00 $ ; tu peux d’abord la transférer ou la retirer.'));
    d = appliquer(d, p);
    expect(lignesCompte(d, cycle(d, '2027-02-04'), ep)).toHaveLength(1);
    expect(lignesCompte(d, cycle(d, '2027-03-04'), ep)).toHaveLength(0);
    expect(vue(d, ep).fermeLe).toBe('1er mars 2027');
    expect(vue(d, ep).historique.length).toBeGreaterThan(0);
    expect(totalEpargne(d).montant).toBe($('1 500,00 $'));
  });

  it('X4 : rouvrir au 1er avril : rien ne reprend seul ; reprise choisie, rien entre les deux', () => {
    let { d, ep, c2 } = trois();
    d = appliquer(d, proposerFermeture(d, ep, '2027-03-01', JOUR));
    const sans = appliquer(d, proposerReouverture(d, ep, '2027-04-01', [], JOUR));
    expect(cycles(sans).flatMap((c) => lignesCompte(sans, c, ep)).filter((l) => (l.echeance ?? '') >= '2027-03-01')).toHaveLength(0);
    const p = proposerReouverture(d, ep, '2027-04-01', [c2], JOUR);
    expect(p.apercu).toBe(true);
    const avec = appliquer(d, p);
    expect(cycles(avec).flatMap((c) => lignesCompte(avec, c, ep)).map((l) => l.echeance)).toEqual(['2027-01-15', '2027-02-15', '2027-04-15']);
  });

  it('X5 : sur un compte fermé, tout mouvement est refusé', () => {
    let { d, ep } = trois();
    d = appliquer(d, proposerFermeture(d, ep, '2027-03-01', JOUR));
    const ferme = 'Ce compte est fermé : rouvre-le d’abord.';
    refus(() => proposerContributionPonctuelle(d, { compteId: ep, montant: '5', date: '2027-03-10' }, JOUR), ferme);
    refus(() => proposerFluctuation(d, ep, { ...FL, montant: '5', date: '2027-03-10' }, JOUR), ferme);
    refus(() => proposerRetraitCompte(d, ep, { montant: '5', date: '2027-03-10', destination: '', note: '' }, JOUR), ferme);
    refus(() => proposerTransfert(d, ep, { vers: id(d, 0), montant: '5', date: '2027-03-10', note: '' }, JOUR), ferme);
  });
});

describe('S — Total (Q77)', () => {
  it('S1, S2, S5 : valeurs connues des comptes ouverts, dates, comptes exclus nommés, phrase', () => {
    let { d, celi } = trois();
    d = appliquer(d, proposerReference(d, celi, { montant: '2500', date: '2027-02-01', note: '' }, JOUR));
    expect(totalEpargne(d)).toEqual({
      montant: $('2 500,00 $'),
      nombre: 2,
      dates: 'références du 1er janv. au 1er févr. 2027',
      exclus: ['REER (à compléter)'],
      phrase: PHRASE_TOTAL,
    });
    expect(PHRASE_TOTAL).toBe('Ce total n’est pas de l’argent disponible dans tes cycles de paie.');
  });

  it('S3, S4 : transfert sans effet sur le total ; comptes fermés exclus', () => {
    let { d, celi, ep } = trois();
    d = appliquer(d, proposerTransfert(d, celi, { vers: ep, montant: '500', date: '2027-02-12', note: '' }, JOUR));
    expect(totalEpargne(d).montant).toBe($('2 000,00 $'));
    d = appliquer(d, proposerFermeture(d, ep, '2027-03-01', JOUR));
    expect(totalEpargne(d)).toMatchObject({ montant: $('1 500,00 $'), nombre: 1 });
  });
});

describe('J, N — Journal et non-régression', () => {
  it('J1 : tout s’inscrit sous « Compte « CELI — Fonds d’urgence » »', () => {
    let { d, celi, ep, c1 } = trois();
    const objet = `Compte « ${CELI} »`;
    const o = origine(d, c1, '2027-01-21');
    const props: Proposition[] = [
      proposerContributionPonctuelle(d, { compteId: celi, montant: '250', date: '2027-01-28' }, JOUR),
      proposerAjustement(d, { elementId: c1, origine: J(o) }, { montant: '120', date: '', paie: '' }, JOUR),
      proposerConfirmation(d, { elementId: c1, origine: o }, null, JOUR),
      proposerFluctuation(d, celi, { ...FL, montant: '50', date: '2027-01-20' }, JOUR),
      proposerRetraitCompte(d, celi, { montant: '5', date: '2027-01-20', destination: '', note: '' }, JOUR),
      proposerReference(d, celi, { montant: '2500', date: '2027-02-01', note: '' }, JOUR),
      proposerFermeture(d, celi, '2027-03-01', JOUR),
      proposerArretContribution(d, c1, '2027-03-01', JOUR),
    ];
    for (const p of props) expect(p.journal.map((e) => e.objet)).toEqual([objet]);
    expect(proposerTransfert(d, celi, { vers: ep, montant: '5', date: '2027-01-20', note: '' }, JOUR).journal.map((e) => e.objet)).toEqual([objet, 'Compte « Compte épargne »']);
    expect(objetJournal(d, d.elements.find((e) => e.id === c1)!)).toBe(objet);
    d = appliquer(d, proposerFermeture(d, celi, '2027-03-01', JOUR));
    expect(proposerReouverture(d, celi, '2027-04-01', [], JOUR).journal[0]!.objet).toBe(objet);
  });

  it('N1 : prêts et carte non touchés ; une contribution sans confirmation se supprime ; « Annuler » rétablit tout', () => {
    let { d, c2 } = trois();
    const avant = structuredClone(d);
    const p = proposerSuppressionContribution(d, c2, JOUR);
    const apres = appliquer(d, p);
    expect(apres.comptes[1]!.contributions).toEqual([]);
    const retabli = appliquerChangements(apres, inverser(d, p.changements));
    expect(retabli.elements).toEqual(avant.elements);
    expect(retabli.comptes).toEqual(avant.comptes);
    expect(apres.prets).toEqual([]);
    expect(apres.cartes).toEqual([]);
  });
});
