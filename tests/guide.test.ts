// Configuration guidée (0.22.0) : quand le guide s'ouvre, de quelle paie
// partir, et ce que le récapitulatif compte. Données fictives.
import { describe, expect, it } from 'vitest';
import {
  choixDepart,
  depensesRegulieres,
  etapeAccessible,
  invitationAccueil,
  installationVierge,
  ouvrirAuDemarrage,
  paiesAnterieures,
  recapitulatif,
  SUGGESTIONS_DEPENSES,
  type SaisieRythme,
} from '../src/actions/guide';
import { proposerAjoutCarte } from '../src/actions/cartes';
import { proposerAjoutCompte } from '../src/actions/comptes';
import { proposerAjout, type SaisieElement } from '../src/actions/elements';
import { proposerProfil, type Proposition } from '../src/actions/paie';
import { proposerAjoutPret } from '../src/actions/prets';
import { appliquerChangements, donneesVides } from '../src/lib/appliquer';
import { creerApercu, type DonneesPaie } from '../src/lib/plateforme';
import { dateCivile } from '../src/noyau/dates';
import { formaterMontant } from '../src/noyau/montants';

const J = (t: string) => dateCivile(t);
const JOUR = J('2026-11-12');
const appliquer = (d: DonneesPaie, p: Proposition) => appliquerChangements(d, p.changements);
const rythme = (s: Partial<SaisieRythme>): SaisieRythme => ({ frequence: 'deuxSemaines', reference: '2026-11-06', jours: [15, 31], ...s });
const element = (s: Partial<SaisieElement>): SaisieElement => ({
  nature: 'depense',
  libelle: 'Loyer (fictif)',
  genre: 'fixe',
  montant: '1150',
  estimation: false,
  incertain: false,
  quand: 'mois',
  date: '2026-12-01',
  cyclePaie: '',
  ...s,
});
const avecPaie = (): DonneesPaie => appliquer(donneesVides(), proposerProfil(donneesVides(), { frequence: 'deuxSemaines', depart: '2026-11-06', montant: '' }, JOUR));

describe('déclenchement du guide', () => {
  it('s’ouvre seul uniquement sur une installation vierge jamais guidée', () => {
    const vide = donneesVides();
    expect(installationVierge(vide, 0)).toBe(true);
    expect(ouvrirAuDemarrage(null, vide, 0)).toBe(true);
    // Un journal non vide : quelque chose a déjà été enregistré (même retiré).
    expect(ouvrirAuDemarrage(null, vide, 1)).toBe(false);
    // Un état déjà enregistré, quel qu'il soit : plus jamais d'ouverture seule.
    for (const statut of ['enCours', 'terminee', 'masquee'] as const) {
      expect(ouvrirAuDemarrage({ statut, etape: 1 }, vide, 0)).toBe(false);
    }
  });

  it('ne s’ouvre jamais sur une installation déjà configurée', () => {
    const configurees: DonneesPaie[] = [
      avecPaie(),
      { ...donneesVides(), seuil: 5000 },
      { ...donneesVides(), salaires: [{ aPartirDu: '2026-11-06', montant: 180000 }] },
      { ...donneesVides(), comptes: [{ id: 'c', sorte: 'celi', typeLibre: null, nom: null, vocation: null, institution: null, fermeLe: null, references: [], mouvements: [], contributions: [] }] },
    ];
    for (const d of configurees) {
      expect(installationVierge(d, 0)).toBe(false);
      expect(ouvrirAuDemarrage(null, d, 0)).toBe(false);
    }
  });

  it('invite à reprendre seulement un guide en cours', () => {
    expect(invitationAccueil(null)).toBeNull();
    expect(invitationAccueil({ statut: 'terminee', etape: 6 })).toBeNull();
    expect(invitationAccueil({ statut: 'masquee', etape: 3 })).toBeNull();
    expect(invitationAccueil({ statut: 'enCours', etape: 3 })).toEqual({ etape: 3, libelle: 'Dépenses et revenus' });
  });

  it('verrouille les étapes 3 à 6 tant que le calendrier n’existe pas', () => {
    const vide = donneesVides();
    expect([1, 2, 3, 4, 5, 6].map((e) => etapeAccessible(e, vide))).toEqual([true, true, false, false, false, false]);
    expect([1, 2, 3, 4, 5, 6].every((e) => etapeAccessible(e, avecPaie()))).toBe(true);
  });

  it('l’aperçu en mémoire garde l’état du guide sans toucher aux données ni au journal', async () => {
    const p = creerApercu();
    expect(await p.lireConfigurationGuidee()).toEqual({ statut: 'terminee', etape: 6 });
    await p.definirConfigurationGuidee({ statut: 'enCours', etape: 4 });
    expect(await p.lireConfigurationGuidee()).toEqual({ statut: 'enCours', etape: 4 });
    await expect(p.definirConfigurationGuidee({ statut: 'enCours', etape: 7 })).rejects.toBeTruthy();
    expect((await p.etat()).nombreEntreesJournal).toBe(0);
    expect(await p.lirePaie()).toEqual(donneesVides());
  });
});

describe('Ma paie : de quelle paie partir', () => {
  it('aux deux semaines : paie en cours, prochaine et paies plus anciennes', () => {
    const c = choixDepart(rythme({}), JOUR);
    expect(c.enCours).toBe('2026-11-06');
    expect(c.prochaine).toBe('2026-11-20');
    expect(c.anciennes.slice(0, 3)).toEqual(['2026-10-23', '2026-10-09', '2026-09-25']);
    expect(c.anciennes.every((d) => d >= '2025-11-11')).toBe(true);
  });

  it('une date de référence future ou ancienne donne le même rythme', () => {
    expect(choixDepart(rythme({ reference: '2026-12-04' }), JOUR)).toEqual(choixDepart(rythme({}), JOUR));
    expect(choixDepart(rythme({ reference: '2026-01-02' }), JOUR)).toEqual(choixDepart(rythme({}), JOUR));
  });

  it('chaque semaine, une fois par mois et deux fois par mois', () => {
    expect(choixDepart(rythme({ frequence: 'hebdomadaire', reference: '2026-11-13' }), JOUR)).toMatchObject({ enCours: '2026-11-06', prochaine: '2026-11-13' });
    expect(choixDepart(rythme({ frequence: 'mensuelle', reference: '2026-10-25' }), JOUR)).toMatchObject({ enCours: '2026-10-25', prochaine: '2026-11-25' });
    expect(choixDepart(rythme({ frequence: 'deuxFoisParMois', reference: '' }), JOUR)).toMatchObject({ enCours: '2026-10-31', prochaine: '2026-11-15' });
  });

  it('une fois par mois le 31 : jamais un départ qui ferait glisser le jour', () => {
    const c = choixDepart(rythme({ frequence: 'mensuelle', reference: '2026-10-31' }), JOUR);
    expect(c.enCours).toBe('2026-10-31');
    // Le 30 novembre est bien une paie, mais un départ ce jour-là glisserait au 30.
    expect(c.prochaine).toBeNull();
    expect(c.anciennes.every((d) => d.endsWith('-31'))).toBe(true);
  });

  it('compte les paies antérieures qui seront « à vérifier »', () => {
    expect(paiesAnterieures(rythme({}), J('2026-11-06'), JOUR)).toEqual([]);
    expect(paiesAnterieures(rythme({}), J('2026-11-20'), JOUR)).toEqual([]);
    expect(paiesAnterieures(rythme({}), J('2026-09-11'), JOUR)).toEqual(['2026-09-11', '2026-09-25', '2026-10-09', '2026-10-23']);
  });

  it('refuse une saisie incomplète ou trop lointaine, sans rien deviner', () => {
    expect(() => choixDepart(rythme({ reference: '' }), JOUR)).toThrow(/date d’une de tes paies/);
    expect(() => choixDepart(rythme({ reference: '2024-01-05' }), JOUR)).toThrow(/dernière année/);
    expect(() => choixDepart(rythme({ frequence: 'deuxFoisParMois', jours: [20, 10] }), JOUR)).toThrow(/Deux fois par mois/);
  });
});

describe('récapitulatif', () => {
  it('suggestions : la liste approuvée, des noms seulement', () => {
    expect(SUGGESTIONS_DEPENSES).toEqual(['Loyer', 'Hypothèque', 'Électricité', 'Internet', 'Cellulaire', 'Assurance auto', 'Assurance habitation', 'Transport en commun', 'Abonnements', 'Garderie']);
  });

  it('les sections laissées vides sont neutres, jamais « à compléter »', () => {
    const r = recapitulatif(avecPaie());
    expect(r.enregistres).toBe(1);
    // Seul le montant net manque vraiment.
    expect(r.aCompleter).toBe(1);
    const neutres = r.sections.flatMap((s) => s.lignes.filter((l) => l.etat === 'aucun').map((l) => l.libelle));
    expect(neutres).toEqual(['Dépenses régulières', 'Autres revenus', 'Prêts et carte de crédit', 'Comptes d’épargne']);
  });

  it('distingue l’enregistré des renseignements qui manquent vraiment', () => {
    let d = avecPaie();
    d = appliquer(d, proposerAjout(d, element({}), JOUR));
    d = appliquer(d, proposerAjout(d, element({ libelle: 'Internet (fictif)', montant: '' }), JOUR));
    d = appliquer(d, proposerAjout(d, element({ nature: 'revenu', libelle: 'Allocation (fictive)', montant: '300', quand: 'mois' }), JOUR));
    d = appliquer(d, proposerAjoutPret(d, { nom: 'Prêt auto (fictif)', versement: '205', quand: 'deuxSemaines', prochaine: '2026-11-20', minimum: '', echeanceFinale: '', solde: '', soldeLe: '', taux: '' }, JOUR));
    d = appliquer(d, proposerAjoutCarte(d, { nom: 'Visa (fictive)', prochaine: '2026-12-02', limite: '', taux: '' }, JOUR));
    d = appliquer(d, proposerAjoutCompte(d, { sorte: 'celi', typeLibre: '', nom: 'Fonds d’urgence', vocation: '', institution: '', solde: '', soldeLe: '' }, JOUR));
    d = appliquer(d, proposerAjoutCompte(d, { sorte: 'reer', typeLibre: '', nom: '', vocation: '', institution: '', solde: '0', soldeLe: '2026-11-12' }, JOUR));

    // Le versement du prêt et l'échéance de la carte ne sont pas des dépenses régulières.
    expect(depensesRegulieres(d).map((e) => e.libelle)).toEqual(['Loyer (fictif)', 'Internet (fictif)']);
    const r = recapitulatif(d);
    const lignes = Object.fromEntries(r.sections.flatMap((s) => s.lignes.map((l) => [l.libelle, l.etat])));
    expect(lignes).toMatchObject({
      'Montant net habituel': 'aCompleter',
      [`Loyer (fictif) · ${formaterMontant(115000)}`]: 'enregistre',
      'Internet (fictif) — montant': 'aCompleter',
      [`Revenu « Allocation (fictive) » · ${formaterMontant(30000)}`]: 'enregistre',
      'Prêt auto (fictif) — versement': 'enregistre',
      'Prêt auto (fictif) — solde': 'aCompleter',
      'Visa (fictive) — prochaine échéance': 'enregistre',
      'Visa (fictive) — solde (premier relevé)': 'aCompleter',
      'Fonds d’urgence — solde': 'aCompleter',
      // 0 $ est un vrai solde : rien ne manque.
      REER: 'enregistre',
    });
    expect(r.sections.some((s) => s.lignes.some((l) => l.etat === 'aucun'))).toBe(false);
    // Calendrier, Loyer, Internet, revenu, prêt, carte, deux comptes.
    expect(r.enregistres).toBe(8);
    expect(r.aCompleter).toBe(5);
  });
});
