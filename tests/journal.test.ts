// Accueil et journal (0.16.0) : mise en mots du journal. Données fictives ;
// l'entrée enregistrée n'est jamais modifiée.
import { describe, expect, it } from 'vitest';
import { datesLisibles, grouperParJour, libelleSection, momentCourt, presenterEntree, titreJour } from '../src/lib/journal';
import type { EntreeJournalLue } from '../src/lib/plateforme';
import { dateCivile } from '../src/noyau/dates';

// Fuseau fixe pour les tests : Montréal en hiver (UTC−5).
const local = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  return { date: dateCivile(d.toISOString().slice(0, 10)), heure: d.getUTCHours(), minute: d.getUTCMinutes() };
};
const J = dateCivile('2026-11-11');

const e = (p: Partial<EntreeJournalLue>): EntreeJournalLue => ({
  id: 1,
  horodatage: '2026-11-12T03:46:00Z',
  section: 'Mes paies',
  objet: 'Dépense « Loyer (fictif) »',
  champ: 'confirmation du 2026-10-15',
  ancienneValeur: null,
  nouvelleValeur: '1 100,00 $ le 2026-10-16',
  motif: null,
  ...p,
});

describe('journal — mise en mots', () => {
  it('dates lisibles, heure locale, rien d’inventé', () => {
    const brute = e({});
    const copie = structuredClone(brute);
    const p = presenterEntree(brute, local);
    expect(p.date).toBe('2026-11-11'); // 03 h 46 UTC = 22 h 46 la veille à Montréal
    expect(p.heure).toBe('22 h 46');
    expect(p.titre).toBe('Dépense « Loyer (fictif) » — confirmation du 15 oct. 2026');
    expect(p.detail).toBe('1 100,00 $ le 16 oct. 2026');
    expect(p.section).toBe('Mes paies');
    expect(p.marque).toBeNull();
    expect(brute).toEqual(copie);
    expect(p.brute).toBe(brute);
  });

  it('avant → après, retiré, et aucun détail sans valeur', () => {
    expect(presenterEntree(e({ ancienneValeur: '2 100,00 $', nouvelleValeur: '2 200,00 $' }), local).detail).toBe('2 100,00 $ → 2 200,00 $');
    expect(presenterEntree(e({ ancienneValeur: 'carte', nouvelleValeur: null }), local).detail).toBe('carte → retiré');
    expect(presenterEntree(e({ nouvelleValeur: null }), local).detail).toBeNull();
  });

  it('annulation et restauration sont repérées', () => {
    const a = presenterEntree(e({ champ: 'annulation — confirmation du 2026-10-12' }), local);
    expect(a.marque).toBe('annulation');
    expect(a.titre).toBe('Dépense « Loyer (fictif) » — confirmation du 12 oct. 2026');
    const r = presenterEntree(e({ section: 'Paramètres', objet: 'Sauvegardes', champ: 'restauration', nouvelleValeur: 'copie du 2026-11-08', motif: 'Gardé dans la copie de précaution.' }), local);
    expect(r.marque).toBe('restauration');
    expect(r.detail).toBe('copie du 8 nov. 2026');
    expect(r.motif).toBe('Gardé dans la copie de précaution.');
  });

  it('sections du menu ; une section inconnue reste telle quelle', () => {
    expect(libelleSection('Mes dettes')).toBe('Dettes');
    expect(libelleSection('Mon épargne')).toBe('Épargne');
    expect(libelleSection('Dépenses à prévoir')).toBe('Dépenses');
    expect(libelleSection('Autre chose')).toBe('Autre chose');
  });

  it('une date impossible n’est pas reformulée', () => {
    expect(datesLisibles('le 2026-02-30 et le 2026-02-28')).toBe('le 2026-02-30 et le 28 févr. 2026');
  });

  it('regroupe par jour local avec des titres clairs', () => {
    const entrees = [
      e({ id: 3, horodatage: '2026-11-12T03:46:00Z' }),
      e({ id: 2, horodatage: '2026-11-11T14:00:00Z' }),
      e({ id: 1, horodatage: '2026-11-10T13:12:00Z' }),
    ].map((x) => presenterEntree(x, local));
    const jours = grouperParJour(entrees, J);
    expect(jours.map((j) => j.titre)).toEqual(['Aujourd’hui — mercredi 11 novembre', 'Hier — mardi 10 novembre']);
    expect(jours[0]!.entrees.map((x) => x.id)).toEqual([3, 2]);
    expect(titreJour(dateCivile('2026-11-09'), J)).toBe('Lundi 9 novembre 2026');
    expect(momentCourt(entrees[0]!, J)).toBe('Aujourd’hui, 22 h 46');
    expect(momentCourt(entrees[2]!, J)).toBe('Hier, 8 h 12');
  });
});

describe('journal — lecture par pages (aperçu en mémoire, mêmes règles que le stockage)', () => {
  it('pages de 50, plus récentes d’abord, filtre par section, rien de modifié', async () => {
    const { creerApercu } = await import('../src/lib/plateforme');
    const apercu = creerApercu();
    for (let i = 0; i < 60; i++) {
      await apercu.appliquerChangementsPaie([{ type: 'definirSeuil', seuil: (i + 1) * 100 }], [
        { section: i % 3 === 0 ? 'Mes dettes' : 'Mes paies', objet: 'Seuil d’attention', champ: `montant ${i}`, ancienneValeur: null, nouvelleValeur: `${i},00 $`, motif: null },
      ]);
    }
    const p1 = await apercu.lireJournal({ limite: 50 });
    expect(p1.entrees).toHaveLength(50);
    expect(p1.entrees[0]!.champ).toBe('montant 59');
    expect(p1.restantes).toBe(10);
    const p2 = await apercu.lireJournal({ limite: 50, avant: p1.entrees.at(-1)!.id });
    expect(p2.entrees.map((x) => x.champ)).toEqual(Array.from({ length: 10 }, (_, k) => `montant ${9 - k}`));
    expect(p2.restantes).toBe(0);
    const dettes = await apercu.lireJournal({ limite: 50, sections: ['Mes dettes'] });
    expect(dettes.entrees).toHaveLength(20);
    expect(dettes.entrees.every((x) => x.section === 'Mes dettes')).toBe(true);
    expect((await apercu.etat()).nombreEntreesJournal).toBe(60);
  });
});
