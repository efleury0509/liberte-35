// Actions de l'étape 4 : chaque ajout ou changement d'un revenu ou d'une
// dépense passe par un aperçu (anciennes et nouvelles valeurs,
// conséquences sur les cycles), puis par le journal (A10).

import { describe, expect, it } from 'vitest';
import {
  proposerAjout,
  proposerCertitude,
  proposerFin,
  proposerMontant,
  proposerReprise,
  proposerSuppression,
  proposerSuspension,
  versElementNoyau,
  type SaisieElement,
} from '../src/actions/elements';
import { versElementStocke } from '../src/actions/elementsStockes';
import { proposerException, versNoyau } from '../src/actions/paie';
import { ErreurSaisie } from '../src/actions/paie';
import { ELEMENTS_ETAPE4 } from '../src/exemple/scenarioEtape4';
import type { DonneesPaie } from '../src/lib/plateforme';
import { planifier } from '../src/noyau/cycles';
import { dateCivile as d } from '../src/noyau/dates';

const ESP = ' ';
const AUJOURDHUI = d('2027-02-10');

const versStocke = versElementStocke;

function donnees(elements = ELEMENTS_ETAPE4.map(versStocke)): DonneesPaie {
  return {
    profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
    salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
    exceptions: [],
    seuil: null,
    elements,
    ajustements: [],
  confirmations: [], prets: [],
  cartes: [], comptes: [],
};
}

const saisie = (s: Partial<SaisieElement>): SaisieElement => ({
  nature: 'depense',
  libelle: 'Abonnement',
  genre: 'fixe',
  montant: '20',
  estimation: false,
  incertain: false,
  quand: 'mois',
  date: '2027-02-12',
  cyclePaie: '',
  ...s,
});

describe('Conversion stockage ↔ noyau', () => {
  it('un élément stocké redonne exactement l’élément du scénario', () => {
    for (const e of ELEMENTS_ETAPE4) {
      const n = versElementNoyau(versStocke(e));
      expect(n.regle.montants).toEqual(e.regle.montants);
      expect(n.regle.frequence).toEqual(e.regle.frequence);
      expect(n.nature ?? 'depense').toBe(e.nature ?? 'depense');
    }
  });

  it('les cycles calculés à partir du stockage sont ceux du scénario (M1 à M4)', () => {
    const n = versNoyau(donnees());
    const p = planifier({ profil: n.profil!, elements: n.elements }, d('2027-02-01'), d('2027-03-31'));
    expect(p.cycles.map((c) => c.disponible)).toEqual([146_500, 116_000, 155_500, 213_500]);
  });
});

describe('Ajouter', () => {
  it('une dépense mensuelle : aperçu, conséquence sur le premier cycle touché, journal', () => {
    const p = proposerAjout(donnees(), saisie({}), AUJOURDHUI);
    expect(p.titre).toBe('Ajouter une dépense');
    expect(p.lignes).toContainEqual({ libelle: 'Quand', avant: '—', apres: 'Chaque mois, à partir du vendredi 12 février 2027' });
    expect(p.consequences[0]).toBe(`Cycle du 4 févr. : disponible planifié 1${ESP}465,00${ESP}$ → 1${ESP}445,00${ESP}$`);
    expect(p.changements).toHaveLength(1);
    const c = p.changements[0]!;
    expect(c.type).toBe('definirElement');
    if (c.type === 'definirElement') {
      expect(c.element).toMatchObject({
        libelle: 'Abonnement',
        nature: 'depense',
        genre: 'fixe',
        frequence: { type: 'mois', n: 1, depart: '2027-02-12' },
        montants: [{ aPartirDu: '2027-02-12', montant: 2_000 }],
      });
      expect(c.element.id).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(p.journal).toEqual([
      expect.objectContaining({ section: 'Mes paies', objet: 'Dépense « Abonnement »', champ: 'création', ancienneValeur: null }),
    ]);
  });

  it('un revenu incertain : aucun cycle ne change, et l’aperçu dit pourquoi (A3)', () => {
    const p = proposerAjout(donnees(), saisie({ nature: 'revenu', libelle: 'Vente', quand: 'unique', date: '2027-02-26', incertain: true }), AUJOURDHUI);
    expect(p.titre).toBe('Ajouter un revenu');
    expect(p.consequences).toEqual([
      'Revenu incertain : visible dans son cycle, mais hors du disponible planifié tant que sa réception n’est pas confirmée.',
    ]);
  });

  it('un revenu certain sans montant : le disponible du cycle devient « À compléter » (Q15)', () => {
    const p = proposerAjout(donnees(), saisie({ nature: 'revenu', libelle: 'Meuble', montant: '', quand: 'unique', date: '2027-02-26' }), AUJOURDHUI);
    expect(p.consequences).toContain(`Cycle du 18 févr. : disponible planifié 1${ESP}160,00${ESP}$ → À compléter`);
  });

  it('un montant estimé est annoncé comme tel', () => {
    const p = proposerAjout(donnees(), saisie({ estimation: true }), AUJOURDHUI);
    expect(p.lignes).toContainEqual({ libelle: 'Montant', avant: '—', apres: `20,00${ESP}$ (estimation)` });
  });

  it('une dépense ponctuelle rattachée à un cycle choisi ne crée aucune règle (D7, 4.2-d)', () => {
    const p = proposerAjout(donnees(), saisie({ quand: 'cycle', date: '', cyclePaie: '2027-03-18', montant: '45' }), AUJOURDHUI);
    const c = p.changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.frequence).toEqual({ type: 'ponctuelle', date: '2027-03-18' });
    expect(c.element.cyclePaie).toBe('2027-03-18');
    expect(p.lignes).toContainEqual({ libelle: 'Quand', avant: '—', apres: 'Une seule fois, dans le cycle de la paie du 18 mars' });
  });

  it('toutes les fréquences proposées sont acceptées', () => {
    const attendu: Record<string, Record<string, unknown>> = {
      unique: { type: 'ponctuelle', date: '2027-02-12' },
      semaine: { type: 'semaines', n: 1, depart: '2027-02-12' },
      deuxSemaines: { type: 'semaines', n: 2, depart: '2027-02-12' },
      mois: { type: 'mois', n: 1, depart: '2027-02-12' },
      deuxMois: { type: 'mois', n: 2, depart: '2027-02-12' },
      troisMois: { type: 'mois', n: 3, depart: '2027-02-12' },
      sixMois: { type: 'mois', n: 6, depart: '2027-02-12' },
      annee: { type: 'annees', n: 1, depart: '2027-02-12' },
      chaquePaie: { type: 'chaquePaie', depart: '2027-02-12' },
      paie1: { type: 'rangPaie', rang: 1, depart: '2027-02-12' },
      paie2: { type: 'rangPaie', rang: 2, depart: '2027-02-12' },
    };
    for (const [quand, frequence] of Object.entries(attendu)) {
      const c = proposerAjout(donnees(), saisie({ quand: quand as SaisieElement['quand'] }), AUJOURDHUI).changements[0]!;
      if (c.type !== 'definirElement') throw new Error('type');
      expect(c.element.frequence).toEqual(frequence);
    }
  });

  it('Q12 : un revenu suit une date ou « chaque paie », jamais « 1re ou 2e paie »', () => {
    expect(() => proposerAjout(donnees(), saisie({ nature: 'revenu', quand: 'paie1' }), AUJOURDHUI)).toThrow(ErreurSaisie);
    expect(() => proposerAjout(donnees(), saisie({ nature: 'revenu', quand: 'cycle', cyclePaie: '2027-03-04' }), AUJOURDHUI)).toThrow(ErreurSaisie);
    expect(() => proposerAjout(donnees(), saisie({ nature: 'revenu', quand: 'chaquePaie' }), AUJOURDHUI)).not.toThrow();
  });

  it('lié à la paie sans date : à partir du cycle actuel, le passé ne change pas', () => {
    const p = proposerAjout(donnees(), saisie({ quand: 'chaquePaie', date: '' }), AUJOURDHUI);
    const c = p.changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.frequence).toEqual({ type: 'chaquePaie', depart: '2027-02-04' });
    expect(c.element.montants).toEqual([{ aPartirDu: '2027-02-04', montant: 2_000 }]);
    expect(p.apercu).toBe(false);
    expect(p.lignes).toContainEqual({ libelle: 'Quand', avant: '—', apres: 'À chaque paie, à partir du jeudi 4 février 2027' });
  });

  it('une enveloppe est forcément une dépense, et jamais incertaine', () => {
    const c = proposerAjout(donnees(), saisie({ nature: 'revenu', genre: 'enveloppe', incertain: false }), AUJOURDHUI).changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.genre).toBe('fixe');
    const dep = proposerAjout(donnees(), saisie({ incertain: true }), AUJOURDHUI).changements[0]!;
    if (dep.type !== 'definirElement') throw new Error('type');
    expect(dep.element.incertain).toBe(false);
  });

  it('sans salaire, l’aperçu explique pourquoi aucun disponible ne change', () => {
    const sansSalaire = { ...donnees(), salaires: [] };
    expect(proposerAjout(sansSalaire, saisie({}), AUJOURDHUI).consequences).toEqual([
      'Le disponible planifié reste « À compléter » tant que le salaire net n’est pas indiqué.',
    ]);
  });
});

describe('Protections de saisie (V)', () => {
  it('V1 : nom vide refusé', () => {
    expect(() => proposerAjout(donnees(), saisie({ libelle: '  ' }), AUJOURDHUI)).toThrow('Donne un nom');
  });
  it('V2 : montant négatif refusé', () => {
    expect(() => proposerAjout(donnees(), saisie({ montant: '-20' }), AUJOURDHUI)).toThrow('négatif');
  });
  it('V3 : dépense rattachée à un cycle sans cycle choisi refusée', () => {
    expect(() => proposerAjout(donnees(), saisie({ quand: 'cycle', cyclePaie: '' }), AUJOURDHUI)).toThrow(ErreurSaisie);
  });
  it('V3 : date manquante refusée', () => {
    expect(() => proposerAjout(donnees(), saisie({ date: '' }), AUJOURDHUI)).toThrow(ErreurSaisie);
  });
  it('V4 : suspension inversée ou fin avant le début refusées', () => {
    expect(() => proposerSuspension(donnees(), 'loyer', '2027-05-01', '2027-04-01', AUJOURDHUI)).toThrow(ErreurSaisie);
    expect(() => proposerFin(donnees(), 'hydro', '2027-01-01', AUJOURDHUI)).toThrow(ErreurSaisie);
  });
});

describe('Modifier, suspendre, terminer, supprimer (H)', () => {
  it('H1 : épicerie à 350 $ à partir du 1er mars ; seul M3 change, et le passé est gardé', () => {
    const p = proposerMontant(donnees(), 'epicerie', '2027-03-01', '350', AUJOURDHUI);
    expect(p.lignes).toEqual([{ libelle: 'Montant à partir du lundi 1er mars 2027', avant: `300,00${ESP}$`, apres: `350,00${ESP}$` }]);
    expect(p.consequences.slice(0, 3)).toEqual([
      'Les cycles d’avant le lundi 1er mars 2027 ne changent pas.',
      `Cycle du 4 mars : disponible planifié 1${ESP}555,00${ESP}$ → 1${ESP}505,00${ESP}$`,
      // Cycle du 1er avril : 3 paies en avril, la 1re reçoit l'épicerie.
      expect.stringMatching(/^Cycle du 1er avr\. : /),
    ]);
    const c = p.changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.montants).toEqual([
      { aPartirDu: '2027-01-01', montant: 30_000 },
      { aPartirDu: '2027-03-01', montant: 35_000 },
    ]);
    expect(p.journal[0]).toMatchObject({ objet: 'Dépense « Épicerie »', champ: 'montant à partir du 2027-03-01', ancienneValeur: `300,00${ESP}$`, nouvelleValeur: `350,00${ESP}$` });
  });

  it('H2 : suspendre ajoute une suspension et montre les cycles touchés', () => {
    const p = proposerSuspension(donnees(), 'assurances', '2027-03-01', '2027-03-31', AUJOURDHUI);
    const c = p.changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.suspensions).toEqual([{ debut: '2027-03-01', fin: '2027-03-31' }]);
    expect(p.consequences).toContain(`Cycle du 4 mars : disponible planifié 1${ESP}555,00${ESP}$ → 1${ESP}695,00${ESP}$`);
    expect(p.journal[0]).toMatchObject({ champ: 'suspension', nouvelleValeur: 'du 2027-03-01 au 2027-03-31' });
  });

  it('H4 : reprendre plus tôt raccourcit la suspension en cours ; seuls les cycles futurs changent', () => {
    const p = proposerReprise(donnees(), 'gym', '2027-04-01', AUJOURDHUI);
    const c = p.changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.suspensions).toEqual([{ debut: '2027-03-01', fin: '2027-03-31' }]);
    expect(p.lignes).toEqual([{ libelle: 'Suspension', avant: 'du lundi 1er mars 2027 au vendredi 30 avril 2027', apres: 'du lundi 1er mars 2027 au mercredi 31 mars 2027' }]);
  });

  it('H4 : reprendre une règle qui n’est pas suspendue à cette date est refusé', () => {
    expect(() => proposerReprise(donnees(), 'loyer', '2027-04-01', AUJOURDHUI)).toThrow('pas suspendu');
  });

  it('H3 : terminer fixe la dernière date incluse', () => {
    const p = proposerFin(donnees(), 'hydro', '2027-03-31', AUJOURDHUI);
    const c = p.changements[0]!;
    if (c.type !== 'definirElement') throw new Error('type');
    expect(c.element.fin).toBe('2027-03-31');
    expect(p.lignes).toEqual([{ libelle: 'Fin', avant: 'Aucune', apres: 'après le mercredi 31 mars 2027' }]);
  });

  it('H5 : la pige devient incertaine ; le disponible de M2 passe de 1 160 $ à 860 $', () => {
    const p = proposerCertitude(donnees(), 'pige', true, AUJOURDHUI);
    expect(p.lignes).toEqual([{ libelle: 'Certitude', avant: 'Certain', apres: 'Incertain' }]);
    expect(p.consequences).toContain(`Cycle du 18 févr. : disponible planifié 1${ESP}160,00${ESP}$ → 860,00${ESP}$`);
  });

  it('H8 : supprimer une dépense retire ses occurrences, avec aperçu et journal ; rien d’autre ne change', () => {
    const p = proposerSuppression(donnees(), 'cadeau', AUJOURDHUI);
    expect(p.titre).toBe('Supprimer « Cadeau d’anniversaire »');
    expect(p.changements).toEqual([{ type: 'supprimerElement', id: 'cadeau' }]);
    expect(p.consequences).toEqual([
      `Cycle du 18 févr. : disponible planifié 1${ESP}160,00${ESP}$ → 1${ESP}235,00${ESP}$`,
      'Le journal garde la trace de cette suppression.',
    ]);
    expect(p.journal[0]).toMatchObject({ champ: 'suppression', nouvelleValeur: null });
  });

  it('les conséquences se limitent aux quatre premiers cycles touchés', () => {
    const p = proposerMontant(donnees(), 'essence', '2027-01-01', '70', AUJOURDHUI);
    expect(p.consequences.filter((c) => c.startsWith('Cycle du'))).toHaveLength(4);
    expect(p.consequences.at(-1)).toMatch(/^Et \d+ autres cycles\.$/);
  });

  it('un élément introuvable est refusé', () => {
    expect(() => proposerFin(donnees(), 'inconnu', '2027-03-31', AUJOURDHUI)).toThrow(ErreurSaisie);
  });
});

describe('Paie déplacée avec les revenus et dépenses enregistrés (A11, H6)', () => {
  it('l’aperçu signale l’Allocation qui change de cycle', () => {
    const n = versNoyau(donnees());
    const plan = planifier({ profil: n.profil!, elements: n.elements }, d('2027-02-01'), d('2027-03-31'));
    const paie = plan.cycles[1]!.paie;
    const p = proposerException(donnees(), paie, { dateReelle: '2027-02-21', montant: '' }, n.elements);
    expect(p.consequences).toContain('À vérifier : Allocation (20 févr.) passerait de la paie du 18 févr. à celle du 4 févr.');
  });
});
