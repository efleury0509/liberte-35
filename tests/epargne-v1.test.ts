// V1 lot 3 : « Déplacer de l'argent », création de réserve avec première
// affectation, synthèse de l'épargne. Compositions d'opérations existantes :
// aucune règle nouvelle, aucun double comptage. Données fictives.
import { describe, expect, it } from 'vitest';
import { etatReserves, proposerAjoutCompte, valeurDuCompte } from '../src/actions/comptes';
import { proposerAffectation, proposerReserve } from '../src/actions/reserves';
import { proposerDeplacement, proposerReserveAvecAffectation, syntheseEpargne } from '../src/actions/epargneV1';
import { ErreurSaisie, type Proposition } from '../src/actions/paie';
import { appliquerChangements, donneesVides, inverser } from '../src/lib/appliquer';
import type { DonneesPaie } from '../src/lib/plateforme';
import { dateCivile } from '../src/noyau/dates';

const JOUR = dateCivile('2027-01-07');
const ap = (d: DonneesPaie, p: Proposition) => appliquerChangements(d, p.changements);
const VIDE = { sorte: '' as const, typeLibre: '', nom: '', vocation: '', institution: '', solde: '', soldeLe: '' };
const RES = { nom: '', sorte: 'permanente' as const, cible: '', date: '', frequenceMois: '', depenseId: '', note: '' };
const M = (montant: string) => ({ montant, date: '2027-01-02', note: '' });

function monde() {
  let d: DonneesPaie = { ...donneesVides(), profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null }, salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }] };
  d = ap(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'epargne', solde: '1500', soldeLe: '2027-01-01' }, JOUR));
  d = ap(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'celi', solde: '2000', soldeLe: '2027-01-01' }, JOUR));
  d = ap(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'reer' }, JOUR));
  const [ep, celi, reer] = d.comptes.map((k) => k.id) as [string, string, string];
  d = ap(d, proposerReserve(d, ep, { ...RES, nom: 'Fonds d’urgence', cible: '3000' }, JOUR));
  d = ap(d, proposerReserve(d, ep, { ...RES, nom: 'Voyage' }, JOUR));
  const r = (nom: string) => d.comptes[0]!.reserves!.find((x) => x.nom === nom)!.id;
  return { d, ep, celi, reer, fonds: r('Fonds d’urgence'), voyage: r('Voyage') };
}
const etat = (d: DonneesPaie, id: string) => etatReserves(d, d.comptes.find((k) => k.id === id)!);

describe('Déplacer de l’argent : la bonne opération existante, rien de plus', () => {
  it('non réservé → réserve = affecter ; réserve → non réservé = libérer ; réserve → réserve = réaffecter', () => {
    let { d, ep, fonds, voyage } = monde();
    const direct = proposerAffectation(d, ep, fonds, M('500'), JOUR);
    const viaDeplacer = proposerDeplacement(d, ep, 'non-reserve', fonds, M('500'), JOUR);
    expect(viaDeplacer.lignes).toEqual(direct.lignes);
    expect(viaDeplacer.journal).toEqual(direct.journal);
    d = ap(d, viaDeplacer);
    expect([etat(d, ep).soldes.get(fonds), etat(d, ep).nonReserve]).toEqual([50_000, 100_000]);
    d = ap(d, proposerDeplacement(d, ep, fonds, voyage, M('200'), JOUR));
    expect([etat(d, ep).soldes.get(fonds), etat(d, ep).soldes.get(voyage)]).toEqual([30_000, 20_000]);
    d = ap(d, proposerDeplacement(d, ep, voyage, 'non-reserve', M('50'), JOUR));
    expect([etat(d, ep).soldes.get(voyage), etat(d, ep).nonReserve]).toEqual([15_000, 105_000]);
    expect(valeurDuCompte(d, d.comptes[0]!)!.montant).toBe(150_000);
  });

  it('refuse une source et une destination identiques ou manquantes ; les refus existants restent', () => {
    const { d, ep, fonds } = monde();
    expect(() => proposerDeplacement(d, ep, fonds, fonds, M('10'), JOUR)).toThrow('différentes');
    expect(() => proposerDeplacement(d, ep, 'non-reserve', 'non-reserve', M('10'), JOUR)).toThrow(ErreurSaisie);
    expect(() => proposerDeplacement(d, ep, '', fonds, M('10'), JOUR)).toThrow('d’où vient');
    expect(() => proposerDeplacement(d, ep, 'non-reserve', fonds, M('2000'), JOUR)).toThrow('Le non réservé n’a que');
  });
});

describe('Nouvelle réserve avec première affectation facultative', () => {
  it('sans montant : exactement « Nouvelle réserve »', () => {
    const { d, ep } = monde();
    const a = proposerReserveAvecAffectation(d, ep, { ...RES, nom: 'Auto' }, '', JOUR);
    const b = proposerReserve(d, ep, { ...RES, nom: 'Auto' }, JOUR);
    expect(a.titre).toBe(b.titre);
    expect(a.lignes).toEqual(b.lignes);
  });

  it('avec montant : un seul aperçu, un seul enregistrement ; rien sans confirmation', () => {
    const { d, ep } = monde();
    const p = proposerReserveAvecAffectation(d, ep, { ...RES, nom: 'Auto', cible: '1000' }, '300', JOUR);
    expect(p.apercu).toBe(true);
    expect(p.changements).toHaveLength(1);
    expect(p.journal.map((e) => e.champ)).toEqual(['création', 'affectation']);
    expect(d.comptes[0]!.reserves!.some((r) => r.nom === 'Auto')).toBe(false);
    const apres = ap(d, p);
    const auto = apres.comptes[0]!.reserves!.find((r) => r.nom === 'Auto')!;
    expect([etat(apres, ep).soldes.get(auto.id), etat(apres, ep).nonReserve]).toEqual([30_000, 120_000]);
  });

  it('annuler rétablit exactement ; un montant trop grand est refusé et rien n’est créé', () => {
    const { d, ep } = monde();
    const p = proposerReserveAvecAffectation(d, ep, { ...RES, nom: 'Auto' }, '300', JOUR);
    expect(appliquerChangements(ap(d, p), inverser(d, p.changements)).comptes).toEqual(d.comptes);
    expect(() => proposerReserveAvecAffectation(d, ep, { ...RES, nom: 'Auto' }, '5000', JOUR)).toThrow('Le non réservé n’a que');
  });

  it('valeur du compte à compléter : la création reste permise, l’affectation est refusée', () => {
    const { d, reer } = monde();
    expect(proposerReserveAvecAffectation(d, reer, { ...RES, nom: 'Retraite' }, '', JOUR).changements).toHaveLength(1);
    expect(() => proposerReserveAvecAffectation(d, reer, { ...RES, nom: 'Retraite' }, '10', JOUR)).toThrow('Indique d’abord la valeur du compte.');
  });
});

describe('Synthèse de l’épargne : les réserves sont des portions, jamais ajoutées en plus', () => {
  it('total = réservé + non réservé ; un compte à compléter n’est jamais compté comme 0', () => {
    let { d, ep, fonds } = monde();
    d = ap(d, proposerAffectation(d, ep, fonds, M('500'), JOUR));
    expect(syntheseEpargne(d)).toEqual({ total: 350_000, reserve: 50_000, nonReserve: 300_000, comptes: 2, aCompleter: 1 });
  });

  it('aucune valeur connue : tout est à compléter', () => {
    let d: DonneesPaie = donneesVides();
    d = ap(d, proposerAjoutCompte(d, { ...VIDE, sorte: 'reer' }, JOUR));
    expect(syntheseEpargne(d)).toEqual({ total: null, reserve: null, nonReserve: null, comptes: 0, aCompleter: 1 });
  });
});
