// Accueil (0.16.0) : l'écran d'accueil reprend tels quels les chiffres de
// Mes paies et ne fait que choisir quoi montrer. Données fictives.
import { describe, expect, it } from 'vitest';
import { comptesPaie, vueAccueil, MAX_BIENTOT } from '../src/actions/accueil';
import { cyclesAffiches } from '../src/actions/analyse';
import { proposerAjoutCarte } from '../src/actions/cartes';
import { proposerConfirmation } from '../src/actions/confirmations';
import { proposerAjout, type SaisieElement } from '../src/actions/elements';
import { proposerSeuil, versNoyau, type Proposition } from '../src/actions/paie';
import { appliquerChangements, donneesVides } from '../src/lib/appliquer';
import type { DonneesPaie } from '../src/lib/plateforme';
import { dateCivile } from '../src/noyau/dates';

const J = (t: string) => dateCivile(t);
const appliquer = (d: DonneesPaie, p: Proposition) => appliquerChangements(d, p.changements);
const base = (): DonneesPaie => ({
  ...donneesVides(),
  profil: { frequence: 'deuxSemaines', depart: '2027-01-07', jours: null },
  salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }],
});
const element = (s: Partial<SaisieElement>): SaisieElement => ({
  nature: 'depense',
  libelle: 'Loyer (fictif)',
  genre: 'fixe',
  montant: '1100',
  estimation: false,
  incertain: false,
  quand: 'mois',
  date: '2027-01-15',
  cyclePaie: '',
  ...s,
});
function avec(d: DonneesPaie, s: Partial<SaisieElement>, jour = J('2026-12-01')): DonneesPaie {
  return appliquer(d, proposerAjout(d, element(s), jour));
}
const exemple = () => {
  let d = base();
  d = avec(d, {});
  d = avec(d, { libelle: 'Cellulaire (fictif)', montant: '55', date: '2027-01-12' });
  d = avec(d, { libelle: 'Assurance (fictive)', montant: '640', date: '2027-01-26' });
  d = avec(d, { libelle: 'Épicerie (fictive)', montant: '300', genre: 'enveloppe', quand: 'chaquePaie', date: '' });
  return d;
};
const sansPoints = (j: string) => vueAccueil(exemple(), J(j));

describe('Accueil — mêmes chiffres que Mes paies', () => {
  it('sans paie configurée : rien d’inventé', () => {
    const v = vueAccueil(donneesVides(), J('2027-01-02'));
    expect(v.paies).toEqual([]);
    expect(v.surveiller).toEqual([]);
    expect(v.phrase).toBe('Configure ta paie pour voir où tu en es.');
    expect([v.jourSemaine, v.jourMois]).toEqual(['Samedi', '2 janvier']);
  });

  it('avant la première paie : « Première paie à venir » et phrase apaisante', () => {
    const v = sansPoints('2027-01-02');
    expect(v.paies.map((p) => p.titre)).toEqual(['Première paie à venir', 'Prochaine paie']);
    expect(v.phrase).toBe('Ta première paie arrive le 7 janvier. Tout est en ordre : rien ne t’attend pour l’instant.');
    expect(v.surveiller).toEqual([]);
  });

  it('les deux cartes sont exactement les deux premiers cycles de Mes paies', () => {
    const d = exemple();
    const jour = J('2027-01-10');
    const n = versNoyau(d);
    const mesPaies = cyclesAffiches(n.profil!, { exceptions: n.exceptions, elements: n.elements, ajustements: n.ajustements, confirmations: n.confirmations, seuil: n.seuil, couvertures: n.couvertures }, jour);
    const v = vueAccueil(d, jour);
    expect(v.paies.map((p) => p.cycle)).toEqual(mesPaies.cycles.slice(0, 2));
    expect(v.paies[0]!.titre).toBe('Paie actuelle');
    expect(v.paies[0]!.cycle.disponible).toBe(mesPaies.cycles[0]!.disponible);
    expect(v.phrase.startsWith('Ta paie actuelle va du 7 au 20 janvier.')).toBe(true);
  });

  it('à vérifier dans la paie actuelle et dans les paies précédentes, avec leurs liens', () => {
    const v = vueAccueil(exemple(), J('2027-02-10'));
    const textes = v.surveiller.map((p) => p.texte);
    // La paie du 4 févr. est passée sans être confirmée : 1 élément.
    expect(textes).toContain('1 élément à vérifier dans ta paie actuelle');
    expect(v.surveiller.find((p) => p.cle === 'a-verifier-actuelle')!.action).toBe('Le voir');
    const passees = v.surveiller.find((p) => p.cle === 'a-verifier-passees')!;
    expect(passees.cible).toEqual({ type: 'aVerifierPassees' });
    // Janvier : 2 paies, 2 loyers et 1 cellulaire, rien de confirmé.
    expect(passees.texte).toBe('5 éléments à vérifier dans des paies précédentes');
    expect(passees.action).toBe('Les retrouver');
    const actuelle = v.surveiller.find((p) => p.cle === 'a-verifier-actuelle')!;
    expect(actuelle.cible).toEqual({ type: 'paie', date: v.paies[0]!.cycle.paie.dateOrigine });
    expect(v.phrase).toBe('Ta paie actuelle va du 4 au 17 février. 2 points méritent un coup d’œil, juste en dessous.');
    expect(v.phrase).not.toMatch(/retard|oubli|attention !/i);
  });

  it('comptes : confirmées, à venir, à vérifier, à compléter — la paie comprise', () => {
    const v = vueAccueil(exemple(), J('2027-01-10'));
    const c = v.paies[0]!.cycle;
    // Le 10 janv. : la paie du 7 est à vérifier ; loyer et cellulaire à venir ;
    // l'enveloppe d'épicerie n'est ni prévue ni confirmée une à une.
    expect(comptesPaie(c)).toEqual({ confirmees: 0, aVenir: 2, aVerifier: 1, aCompleter: 0 });
    expect(c.aVerifier).toBe(1);
  });

  it('une confirmation compte comme confirmée, jamais comme à venir', () => {
    let d = exemple();
    const loyer = d.elements.find((e) => e.libelle === 'Loyer (fictif)')!.id;
    d = appliquer(d, proposerConfirmation(d, { elementId: loyer, origine: '2027-01-15' }, { montant: '1100', date: '2027-01-15' }, J('2027-01-16')));
    const v = vueAccueil(d, J('2027-01-16'));
    expect(comptesPaie(v.paies[0]!.cycle)).toEqual({ confirmees: 1, aVenir: 0, aVerifier: 2, aCompleter: 0 });
    expect(v.bientot.flatMap((g) => g.lignes).map((l) => l.libelle)).toEqual(['Assurance (fictive)']);
  });

  it('Bientôt : dépenses à venir des deux paies, par date, au plus six', () => {
    const v = vueAccueil(exemple(), J('2027-01-10'));
    const lignes = v.bientot.flatMap((g) => g.lignes);
    expect(lignes.length).toBeLessThanOrEqual(MAX_BIENTOT);
    expect(lignes.map((l) => l.libelle)).toEqual(['Cellulaire (fictif)', 'Loyer (fictif)', 'Assurance (fictive)']);
    expect(lignes.every((l) => l.statut === 'À venir' && l.etat === 'prevu')).toBe(true);
    expect(v.bientot[0]!.titre).toBe('Paie actuelle · jusqu’au 20 janv.');
    expect(v.autresBientot).toBe(0);
  });

  it('Bientôt ne montre rien de daté d’avant aujourd’hui', () => {
    const d = avec(exemple(), { libelle: 'Transport (fictif)', montant: '40', quand: 'chaquePaie', date: '' });
    const v = vueAccueil(d, J('2027-01-10'));
    const transport = v.bientot.flatMap((g) => g.lignes).filter((l) => l.libelle === 'Transport (fictif)');
    // Celui de la paie du 7 janv. (passée) n'y est pas ; celui du 21 janv., oui.
    expect(transport.map((l) => l.date)).toEqual(['2027-01-21']);
    expect(v.bientot.flatMap((g) => g.lignes).every((l) => l.date >= '2027-01-10')).toBe(true);
  });

  it('carte : l’échéance sans montant est « à choisir », jamais 0 $', () => {
    let d = exemple();
    d = appliquer(d, proposerAjoutCarte(d, { nom: 'Visa (fictive)', prochaine: '2027-01-25', limite: '', taux: '' }, J('2026-12-01')));
    const v = vueAccueil(d, J('2027-01-10'));
    const point = v.surveiller.find((p) => p.cle.startsWith('carte-'))!;
    expect(point.texte).toBe('Montant de l’échéance « Visa (fictive) » à choisir pour le 25 janv.');
    expect(point.action).toBe('Le choisir');
    expect(point.cible).toMatchObject({ type: 'paie', ligne: { origine: '2027-01-25' } });
    const visa = v.bientot.flatMap((g) => g.lignes).find((l) => l.libelle.includes('Visa'))!;
    expect(visa.montant).toBeNull();
    expect([visa.etat, visa.statut]).toEqual(['a-completer', 'Montant à choisir']);
    expect(v.paies[1]!.manque).toMatch(/^Il manque : /);
    expect(v.surveiller.some((p) => p.cle.startsWith('manque-'))).toBe(false); // seule la carte manque
  });

  it('seuil d’attention et montant de paie inconnu', () => {
    let d = exemple();
    d = appliquer(d, proposerSeuil(d, '2000'));
    const v = vueAccueil(d, J('2027-01-10'));
    expect(v.surveiller[0]!.texte).toMatch(/^La paie du .+ passe sous ton seuil d’attention$/);
    const inconnu = vueAccueil({ ...exemple(), salaires: [] }, J('2027-01-10'));
    expect(inconnu.paies[0]!.cycle.disponible).toBeNull();
    expect(inconnu.surveiller.some((p) => p.texte === 'Un montant manque pour la paie du 7 janv.')).toBe(true);
    expect(inconnu.paies[0]!.comptes.aCompleter).toBeGreaterThan(0);
  });

  it('au plus quatre points à surveiller', () => {
    let d = exemple();
    d = appliquer(d, proposerSeuil(d, '5000'));
    d = appliquer(d, proposerAjoutCarte(d, { nom: 'Visa (fictive)', prochaine: '2027-02-25', limite: '', taux: '' }, J('2026-12-01')));
    const v = vueAccueil({ ...d, salaires: [{ aPartirDu: '2027-01-07', montant: 210_000 }] }, J('2027-03-10'));
    expect(v.surveiller.length).toBeLessThanOrEqual(4);
  });
});
