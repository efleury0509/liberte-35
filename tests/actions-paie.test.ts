// Actions de « Mes paies » : aperçu avant/après (14.2) et journal (A10).

import { describe, expect, it } from 'vitest';
import {
  ErreurSaisie,
  proposerException,
  proposerProfil,
  proposerSalaire,
  proposerSeuil,
  versNoyau,
} from '../src/actions/paie';
import { ELEMENTS_FICTIFS } from '../src/exemple/scenarioFictif';
import { dateCivile as d } from '../src/noyau/dates';
import { paiesEntre } from '../src/noyau/paie';
import { creerApercu, type DonneesPaie } from '../src/lib/plateforme';

const ESP = ' ';
const VIDE: DonneesPaie = { profil: null, salaires: [], exceptions: [], seuil: null, elements: [], ajustements: [], confirmations: [], prets: [] };
const BASE: DonneesPaie = {
  profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
  salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
  exceptions: [],
  seuil: null,
  elements: [],
  ajustements: [],
  confirmations: [], prets: [],
};
const paieDu = (donnees: DonneesPaie, date: string) => {
  const { profil, exceptions } = versNoyau(donnees);
  if (!profil) throw new Error('profil');
  const p = paiesEntre(profil, exceptions, d(date), d(date))[0];
  if (!p) throw new Error('paie');
  return p;
};

describe('Profil de paie', () => {
  it('création avec montant : profil et salaire enregistrés ensemble, deux entrées de journal', () => {
    const p = proposerProfil(VIDE, { frequence: 'deuxSemaines', depart: '2027-01-07', montant: '2 100,00' });
    expect(p.changements.map((c) => c.type)).toEqual(['definirProfil', 'definirSalaire']);
    expect(p.journal).toHaveLength(2);
    expect(p.lignes[1]).toEqual({ libelle: 'Montant net habituel', avant: 'À compléter', apres: `2${ESP}100,00${ESP}$` });
  });

  it('création sans montant : le salaire reste « À compléter », rien n’est inventé', () => {
    const p = proposerProfil(VIDE, { frequence: 'mensuelle', depart: '2027-01-25', montant: '' });
    expect(p.changements.map((c) => c.type)).toEqual(['definirProfil']);
    expect(p.consequences.join(' ')).toContain('À compléter');
  });

  it('deux fois par mois : décrit en clair, jours validés', () => {
    const p = proposerProfil(VIDE, { frequence: 'deuxFoisParMois', depart: '2027-01-01', jours: [15, 31] });
    expect(p.lignes[0]?.apres).toBe('Deux fois par mois, le 15 et le dernier jour, à partir du vendredi 1er janvier 2027');
    expect(() => proposerProfil(VIDE, { frequence: 'deuxFoisParMois', depart: '2027-01-01', jours: [28, 31] })).toThrow(ErreurSaisie);
  });

  it('refuse une date ou un montant invalide', () => {
    expect(() => proposerProfil(VIDE, { frequence: 'deuxSemaines', depart: '7 janvier', montant: '' })).toThrow(ErreurSaisie);
    expect(() => proposerProfil(VIDE, { frequence: 'deuxSemaines', depart: '2027-01-07', montant: '-5' })).toThrow(/négatif/);
  });
});

describe('Changement de salaire', () => {
  it('S1 : aperçu des anciennes et nouvelles valeurs, première paie concernée', () => {
    const p = proposerSalaire(BASE, '2027-06-10', '2 180');
    expect(p.lignes).toEqual([
      { libelle: 'Salaire net à partir du jeudi 10 juin 2027', avant: `2${ESP}100,00${ESP}$`, apres: `2${ESP}180,00${ESP}$` },
    ]);
    expect(p.consequences).toContain('Les paies d’avant le jeudi 10 juin 2027 ne changent pas.');
    expect(p.consequences).toContain('Première paie concernée : jeudi 10 juin 2027.');
    expect(p.journal[0]?.ancienneValeur).toBe(`2${ESP}100,00${ESP}$`);
  });

  it('S3 : l’aperçu annonce que les exceptions de montant sont conservées', () => {
    const avecException = { ...BASE, exceptions: [{ dateOrigine: '2027-06-24', dateReelle: null, montant: 230_000 }] };
    const p = proposerSalaire(avecException, '2027-06-10', '2 180');
    expect(p.consequences.join(' ')).toContain('1 paie(s) au montant particulier gardent leur montant');
  });
});

describe('Exceptions de paie', () => {
  it('X1–X3 : déplacer la paie du 15 avril au 16 : rattachement signalé et disponible recalculé', () => {
    const p = proposerException(BASE, paieDu(BASE, '2027-04-15'), { dateReelle: '2027-04-16', montant: '' }, ELEMENTS_FICTIFS);
    expect(p.changements).toEqual([
      { type: 'definirException', exception: { dateOrigine: '2027-04-15', dateReelle: '2027-04-16', montant: null } },
    ]);
    expect(p.consequences).toContain('À vérifier : Assurances (15 avr.) passerait de la paie du 15 avr. à celle du 1er avr.');
    expect(p.consequences.join(' ')).not.toMatch(/\.\./);
    expect(p.journal).toEqual([
      expect.objectContaining({ objet: 'Paie du 2027-04-15', champ: 'date de versement', ancienneValeur: '2027-04-15', nouvelleValeur: '2027-04-16' }),
    ]);
  });

  it('X6 : un déplacement au-delà de la paie suivante est refusé avec une explication', () => {
    expect(() => proposerException(BASE, paieDu(BASE, '2027-04-15'), { dateReelle: '2027-04-30', montant: '' })).toThrow(
      /entre la paie précédente et la suivante/,
    );
  });

  it('X12 : ramener une paie à sa date d’origine retire simplement l’exception', () => {
    const deplacee = { ...BASE, exceptions: [{ dateOrigine: '2027-04-01', dateReelle: '2027-03-31', montant: null }] };
    const p = proposerException(deplacee, paieDu(deplacee, '2027-03-31'), { dateReelle: '2027-04-01', montant: '' });
    expect(p.changements).toEqual([{ type: 'retirerException', dateOrigine: '2027-04-01' }]);
  });

  it('S4 : réduire une paie à 1 500 $ montre le nouveau disponible', () => {
    const p = proposerException(BASE, paieDu(BASE, '2027-04-01'), { dateReelle: '', montant: '1500' }, ELEMENTS_FICTIFS);
    expect(p.consequences).toContain(`Disponible planifié de ce cycle : 540,00${ESP}$ → −60,00${ESP}$.`);
  });

  it('rien ne change : refusé', () => {
    expect(() => proposerException(BASE, paieDu(BASE, '2027-04-01'), { dateReelle: '', montant: '' })).toThrow(/Rien ne change/);
  });
});

describe('Seuil d’attention', () => {
  it('fixer puis retirer le seuil', () => {
    const p = proposerSeuil(BASE, '750');
    expect(p.changements).toEqual([{ type: 'definirSeuil', seuil: 75_000 }]);
    const retrait = proposerSeuil({ ...BASE, seuil: 75_000 }, '');
    expect(retrait.changements).toEqual([{ type: 'definirSeuil', seuil: null }]);
    expect(retrait.consequences[0]).toContain('négatif');
  });
});

describe('Aperçu en mémoire', () => {
  it('applique les mêmes règles : tout ou rien, journal obligatoire', async () => {
    const apercu = creerApercu();
    await expect(apercu.appliquerChangementsPaie([{ type: 'definirSeuil', seuil: 1 }], [])).rejects.toMatch(/journal/);
    const p = proposerProfil(VIDE, { frequence: 'deuxSemaines', depart: '2027-01-07', montant: '2100' });
    const apres = await apercu.appliquerChangementsPaie(p.changements, p.journal);
    expect(apres.profil?.depart).toBe('2027-01-07');
    expect(apres.salaires).toEqual([{ aPartirDu: '2027-01-07', montant: 210_000 }]);
    expect((await apercu.etat()).nombreEntreesJournal).toBe(2);
  });
});
