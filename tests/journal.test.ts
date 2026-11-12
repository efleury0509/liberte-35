// Accueil et journal (0.16.0) : mise en mots du journal. Données fictives ;
// l'entrée enregistrée n'est jamais modifiée.
import { describe, expect, it } from 'vitest';
import { anneesCandidates, bornesPeriode, datesLisibles, grouperParJour, libelleSection, momentCourt, nombrePages, presenterEntree, texteCompte, titreJour } from '../src/lib/journal';
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

describe('journal — pages de 50 (aperçu en mémoire, mêmes règles que le stockage)', () => {
  it('pages numérotées, filtres avant la pagination, rien de modifié', async () => {
    const { creerApercu } = await import('../src/lib/plateforme');
    const apercu = creerApercu();
    for (let i = 0; i < 94; i++) {
      await apercu.appliquerChangementsPaie([{ type: 'definirSeuil', seuil: (i + 1) * 100 }], [
        { section: i % 3 === 0 ? 'Mes dettes' : 'Mes paies', objet: 'Seuil d’attention', champ: `montant ${i}`, ancienneValeur: null, nouvelleValeur: `${i},00 $`, motif: null },
      ]);
    }
    const p1 = await apercu.lireJournal({ decalage: 0, limite: 50 });
    expect(p1.entrees).toHaveLength(50);
    expect(p1.entrees[0]!.champ).toBe('montant 93');
    expect(p1.total).toBe(94);
    const p2 = await apercu.lireJournal({ decalage: 50, limite: 50 });
    expect(p2.entrees).toHaveLength(44);
    // Aucune entrée en double ni oubliée entre les deux pages.
    const ids = [...p1.entrees, ...p2.entrees].map((e) => e.id);
    expect(new Set(ids).size).toBe(94);
    const dettes = await apercu.lireJournal({ decalage: 0, limite: 50, filtre: { sections: ['Mes dettes'] } });
    expect(dettes.total).toBe(32);
    expect(dettes.entrees.every((x) => x.section === 'Mes dettes')).toBe(true);
    const rien = await apercu.lireJournal({ decalage: 0, limite: 50, filtre: { debut: '2000-01-01T05:00:00Z', fin: '2001-01-01T05:00:00Z' } });
    expect(rien.total).toBe(0);
    expect(rien.plusAncien).toBe(p1.plusAncien);
    expect(await apercu.compterJournal([{ debut: '2000-01-01T05:00:00Z', fin: '2001-01-01T05:00:00Z' }])).toEqual([0]);
    expect((await apercu.etat()).nombreEntreesJournal).toBe(94);
  });
});

// Montréal / Toronto : minuit du 1er du mois, heure d'été d'avril à novembre
// (le 1er nov. à minuit est encore à l'heure d'été : le changement se fait à 2 h).
const minuitMontreal = (a: number, m0: number, j: number) => {
  const mois = ((m0 % 12) + 12) % 12;
  const annee = a + Math.floor(m0 / 12);
  return Date.UTC(annee, mois, j) + (mois >= 3 && mois <= 10 ? 4 : 5) * 3600_000;
};

describe('journal — périodes en heure locale', () => {
  it('novembre local : du 1er nov. 04:00Z au 1er déc. 05:00Z (heure d’été puis d’hiver)', () => {
    expect(bornesPeriode(2026, 11, minuitMontreal)).toEqual({ debut: '2026-11-01T04:00:00Z', fin: '2026-12-01T05:00:00Z' });
    // Un changement du 30 nov. à 21 h (1er déc. 02:00Z) est bien en novembre.
    const { debut, fin } = bornesPeriode(2026, 11, minuitMontreal);
    expect('2026-12-01T02:00:00Z' >= debut && '2026-12-01T02:00:00Z' < fin).toBe(true);
  });
  it('décembre et l’année entière passent au 1er janvier suivant', () => {
    expect(bornesPeriode(2026, 12, minuitMontreal)).toEqual({ debut: '2026-12-01T05:00:00Z', fin: '2027-01-01T05:00:00Z' });
    expect(bornesPeriode(2026, null, minuitMontreal)).toEqual({ debut: '2026-01-01T05:00:00Z', fin: '2027-01-01T05:00:00Z' });
    // Le 31 déc. à 23 h locale (1er janv. 04:00Z) appartient encore à 2026.
    expect('2027-01-01T04:00:00Z' < bornesPeriode(2026, null, minuitMontreal).fin).toBe(true);
  });
  it('mars : passage à l’heure d’été pendant le mois', () => {
    expect(bornesPeriode(2027, 3, minuitMontreal)).toEqual({ debut: '2027-03-01T05:00:00Z', fin: '2027-04-01T04:00:00Z' });
  });
  it('années candidates : de l’année locale la plus ancienne à aujourd’hui', () => {
    expect(anneesCandidates(null, J)).toEqual([]);
    expect(anneesCandidates('2025-01-01T03:00:00Z', J, local)).toEqual([2026, 2025, 2024]); // 31 déc. 2024 à 22 h
    expect(anneesCandidates('2026-06-01T12:00:00Z', J, local)).toEqual([2026]);
  });
  it('indicateur de page', () => {
    expect(texteCompte(0, 94)).toBe('Page 1 sur 2 · changements 1 à 50 sur 94');
    expect(texteCompte(1, 94)).toBe('Page 2 sur 2 · changements 51 à 94 sur 94');
    expect(texteCompte(1, 51)).toBe('Page 2 sur 2 · changement 51 sur 51');
    expect(texteCompte(0, 1)).toBe('Page 1 sur 1 · 1 changement');
    expect(texteCompte(0, 0)).toBe('Aucun changement');
    expect(nombrePages(0)).toBe(1);
    expect(nombrePages(100)).toBe(2);
  });
  it('un jour coupé entre deux pages porte « (suite) »', () => {
    const entrees = [e({ id: 2, horodatage: '2026-11-11T14:00:00Z' })].map((x) => presenterEntree(x, local));
    expect(grouperParJour(entrees, J, dateCivile('2026-11-11'))[0]!.titre).toBe('Aujourd’hui — mercredi 11 novembre (suite)');
    expect(grouperParJour(entrees, J, dateCivile('2026-11-12'))[0]!.titre).toBe('Aujourd’hui — mercredi 11 novembre');
  });
});
